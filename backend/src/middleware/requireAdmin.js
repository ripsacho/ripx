/**
 * Require Admin Middleware
 *
 * Protects /api/admin/* routes. Allows access if:
 * 0. (Optional) Client IP is in ADMIN_IP_ALLOWLIST when set.
 * 1. X-Admin-API-Key header matches ADMIN_API_KEY env, or
 * 2. (Local) req.shopDomain is in RIPX_ADMIN_SHOP_DOMAINS (comma-separated), or
 * 3. Authenticated user has users.role in ['admin','superadmin'] and status active.
 * Sets req.adminId for audit (shop_domain or 'admin-key').
 */

const { authenticate } = require('./auth');
const { getRoleAndStatus } = require('../models/user');
const { sendUnauthorized } = require('../utils/response');

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
    return next();
  }

  return authenticate(req, res, async err => {
    if (err) {
      return next(err);
    }

    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendUnauthorized(res, 'Admin access requires shop or admin API key');
    }

    if (req.authType === 'email' && req.email) {
      const adminEmails = getEnvAdminEmails();
      if (adminEmails.length > 0 && adminEmails.includes(req.email.trim().toLowerCase())) {
        req.adminId = req.email;
        return next();
      }
    }

    const normalizedShop = shopDomain.toLowerCase().trim();

    // Local / dev: env list of admin shop domains (no DB role required)
    const envAdmins = getEnvAdminDomains();
    if (envAdmins.length > 0 && envAdmins.includes(normalizedShop)) {
      req.adminId = shopDomain;
      return next();
    }

    try {
      const user = await getRoleAndStatus(shopDomain);
      if (!user || !['admin', 'superadmin'].includes(user.role)) {
        if (process.env.NODE_ENV === 'development') {
          req.adminId = shopDomain;
          return next();
        }
        return res.status(403).json({ success: false, error: 'Admin access required' });
      }
      if (user.status !== 'active') {
        return res.status(403).json({ success: false, error: 'Account is locked or suspended' });
      }
      req.adminId = shopDomain;
      next();
    } catch (e) {
      next(e);
    }
  });
}

module.exports = { requireAdmin, getEnvAdminDomains };
