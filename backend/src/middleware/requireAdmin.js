/**
 * Require Admin Middleware
 *
 * Protects /api/admin/* routes. Allows access if:
 * 0. (Optional) Client IP is in ADMIN_IP_ALLOWLIST when set.
 * 1. X-Admin-API-Key header matches ADMIN_API_KEY env (treated as superadmin), or
 * 2. (Local) req.shopDomain is in RIPX_ADMIN_SHOP_DOMAINS (comma-separated), or
 * 3. Authenticated user has users.role in ['admin','superadmin'] (resolved by shop domain or email)
 *    and status active/accepted.
 * Sets req.adminId for audit and req.adminRole for permission checks (admin | superadmin).
 * Dev bypass: only when ALLOW_DEV_ADMIN_BYPASS=true (no DB role required in development).
 */

const { authenticate } = require('./auth');
const { getRoleAndStatus } = require('../models/user');
const { normalizeDomain } = require('../models/tenant');
const { sendUnauthorized } = require('../utils/response');
const { isPlatformAdmin, PLATFORM_ROLES } = require('../constants');
const { getPermissionsForRole, hasPermission, isValidPermission } = require('../permissions');
const auditLogService = require('../services/auditLogService');
const logger = require('../utils/logger');

function getEnvAdminDomains() {
  const raw = process.env.RIPX_ADMIN_SHOP_DOMAINS;
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  return raw
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
}

function getEnvAdminEmails() {
  const raw = process.env.RIPX_ADMIN_EMAIL;
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  return raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

function getAdminIpAllowlist() {
  const raw = process.env.ADMIN_IP_ALLOWLIST;
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const list = raw
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

function getRequestedStore(req) {
  const raw =
    req.query?.shop ||
    req.query?.store ||
    req.query?.domain ||
    req.headers['x-ripx-store'] ||
    req.headers['x-shopify-shop-domain'];
  return normalizeDomain(raw !== undefined && raw !== null ? String(raw) : '');
}

function requireAdmin(req, res, next) {
  const allowlist = getAdminIpAllowlist();
  if (allowlist) {
    const clientIp = getClientIp(req);
    if (!clientIp || !allowlist.includes(clientIp)) {
      return res
        .status(403)
        .json({ success: false, error: 'Admin access not allowed from this IP' });
    }
  }

  const adminKey = req.headers['x-admin-api-key'];

  if (process.env.ADMIN_API_KEY && adminKey && adminKey === process.env.ADMIN_API_KEY) {
    req.adminId = 'admin-key';
    req.adminRole = PLATFORM_ROLES.SUPERADMIN; // API key has full access
    return next();
  }

  return authenticate(req, res, async err => {
    if (err) {
      return next(err);
    }

    if (req.authType === 'email' && req.email) {
      const adminEmails = getEnvAdminEmails();
      if (adminEmails.length > 0 && adminEmails.includes(req.email.trim().toLowerCase())) {
        req.adminId = req.email;
        req.adminRole = PLATFORM_ROLES.ADMIN; // env list grants admin; use DB if you need superadmin
        return next();
      }
    }

    const shopDomain = req.shopDomain;
    const email = req.email ? String(req.email).trim().toLowerCase() : null;
    const normalizedShop = shopDomain ? shopDomain.toLowerCase().trim() : null;
    const requestedStore = getRequestedStore(req);
    const allowShopIdentity =
      !!normalizedShop && (!email || (requestedStore && requestedStore === normalizedShop));

    // Local / dev: env list of admin shop domains (no DB role required)
    if (allowShopIdentity) {
      const envAdmins = getEnvAdminDomains();
      if (envAdmins.length > 0 && envAdmins.includes(normalizedShop)) {
        req.adminId = shopDomain;
        req.adminRole = PLATFORM_ROLES.ADMIN;
        return next();
      }
    }

    const adminIdentityCandidates = [];
    if (email) {
      adminIdentityCandidates.push(email);
    }
    if (allowShopIdentity && !adminIdentityCandidates.includes(normalizedShop)) {
      adminIdentityCandidates.push(normalizedShop);
    }

    if (adminIdentityCandidates.length === 0) {
      return sendUnauthorized(res, 'Admin access requires shop/email identity or admin API key');
    }

    try {
      let matchedIdentity = null;
      let matchedUser = null;
      for (const candidate of adminIdentityCandidates) {
        const user = await getRoleAndStatus(candidate);
        if (user && isPlatformAdmin(user.role)) {
          matchedIdentity = candidate;
          matchedUser = user;
          break;
        }
      }

      if (!matchedUser) {
        const allowDevBypass =
          process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_ADMIN_BYPASS === 'true';
        if (allowDevBypass) {
          req.adminId = adminIdentityCandidates[0];
          req.adminRole = PLATFORM_ROLES.ADMIN;
          return next();
        }
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }
      // Shopify users use status 'active'; email/standalone users use 'accepted'. Both are allowed for admin.
      const allowedStatuses = ['active', 'accepted'];
      if (!matchedUser.status || !allowedStatuses.includes(matchedUser.status)) {
        return res.status(403).json({ success: false, error: 'Account is locked or suspended' });
      }
      req.adminId = matchedIdentity || adminIdentityCandidates[0];
      req.adminRole = (matchedUser.role || PLATFORM_ROLES.ADMIN).toLowerCase();
      next();
    } catch (e) {
      next(e);
    }
  });
}

/**
 * Require superadmin for sensitive actions (e.g. set user role, impersonate).
 * Must be used after requireAdmin. ADMIN_API_KEY is treated as superadmin.
 * @deprecated Prefer requirePermission(permission) for explicit, auditable checks.
 */
function requireSuperadmin(req, res, next) {
  const role = (req.adminRole || '').toLowerCase();
  if (role === PLATFORM_ROLES.SUPERADMIN) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: 'This action requires superadmin role',
  });
}

/**
 * Require a specific admin permission. Use after requireAdmin.
 * On deny: logs permission_denied to audit_log (actor, permission, path) then returns 403.
 * Logs a warning if permission is not in the registry (typo guard).
 * @param {string} permission - e.g. PERMISSIONS.USERS_SET_ROLE, PERMISSIONS.IMPERSONATE
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!isValidPermission(permission)) {
      logger.warn('requirePermission called with unknown permission', {
        permission,
        path: req.path,
      });
    }
    const role = (req.adminRole || '').toLowerCase();
    if (hasPermission(role, permission)) {
      return next();
    }
    auditLogService
      .logAdminAction(req, {
        entityType: 'admin',
        entityId: null,
        action: 'permission_denied',
        changes: {
          requiredPermission: permission,
          path: req.path,
          method: req.method,
          role: role || null,
        },
      })
      .catch(err => logger.error('Audit log permission_denied failed', { error: err.message }));
    return res.status(403).json({
      success: false,
      error: 'Insufficient permission',
      requiredPermission: permission,
    });
  };
}

module.exports = {
  requireAdmin,
  requireSuperadmin,
  requirePermission,
  getEnvAdminDomains,
  getPermissionsForRole,
};
