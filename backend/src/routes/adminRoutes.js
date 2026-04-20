/**
 * Admin Routes
 *
 * Platform admin panel API. All routes require admin role or ADMIN_API_KEY.
 * Prefix: /api/admin
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { query } = require('../utils/database');
const { authenticate } = require('../middleware/auth');
const {
  requireAdmin,
  requirePermission,
  getEnvAdminDomains,
  getPermissionsForRole,
} = require('../middleware/requireAdmin');
const { sensitiveAdminLimiter } = require('../middleware/sensitiveAdminLimiter');
const { PERMISSIONS } = require('../permissions');
const { asyncHandler } = require('../middleware/asyncHandler');
const { sendSuccess } = require('../utils/response');
const {
  HTTP_STATUS,
  PLATFORM_ROLE_VALUES,
  PLATFORM_ROLES,
  KV_KEYS,
  PAGINATION,
  KV_VALUE_MAX_BYTES,
  SETTINGS_BOUNDS,
} = require('../constants');
const {
  getByDomain,
  getByEmail,
  getByAccountId,
  getRoleAndStatus,
  setStatus: setUserStatus,
  setRole: setUserRole,
} = require('../models/user');
const {
  listTenants,
  getTenantByDomain,
  setTenantStatus,
  normalizeDomain,
  isShopifyDomain,
} = require('../models/tenant');
const { getTestByIdForAdmin } = require('../models/test');
const {
  listAccounts,
  getAccountById,
  regenerateApiKey,
  createAccount,
} = require('../models/account');
const crypto = require('crypto');
const abTestEngine = require('../services/abTestEngine');
const auditLogService = require('../services/auditLogService');
const timeSeriesService = require('../services/timeSeriesService');
const validators = require('../utils/validators');
const standaloneUser = require('../models/standaloneUser');
const emailService = require('../services/emailService');
const mailProcessService = require('../services/mailProcessService');
const userDomainAccess = require('../models/userDomainAccess');
const {
  getSupportInboxIntegrationConfig,
  upsertSupportInboxIntegrationConfig,
} = require('../services/supportInboxIntegrationService');
const {
  SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH,
  listSupportTicketThreadMessages,
  createSupportTicketThreadMessage,
  subscribeSupportTicketThread,
} = require('../services/supportTicketThreadService');
const {
  getGlobalHoldoutPercent,
  setGlobalHoldoutPercent,
  normalizeGlobalHoldoutPercent,
} = require('../services/experimentationPolicyService');

/**
 * GET /api/admin/me - Current user identity (any authenticated shop).
 * Does not require admin role; returns role so UI can show/hide admin features.
 * Role: users.role (resolved by shop domain or email), or RIPX_ADMIN_SHOP_DOMAINS, or env admin email.
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    let role = null;
    let status = 'active';
    const normalizedEmail = req.email ? String(req.email).trim().toLowerCase() : null;
    const adminIdentity = req.shopDomain || normalizedEmail;
    if (req.authType === 'email' && req.email) {
      const adminEmails = (process.env.RIPX_ADMIN_EMAIL || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      if (normalizedEmail && adminEmails.includes(normalizedEmail)) {
        role = 'admin';
      }
    }
    if (!role && adminIdentity) {
      const user = await getRoleAndStatus(adminIdentity);
      status = user?.status ?? 'active';
      role = user?.role ?? null;
      if (!role && req.shopDomain) {
        const envAdmins = getEnvAdminDomains();
        const normalized = (req.shopDomain || '').toLowerCase().trim();
        if (envAdmins.length > 0 && envAdmins.includes(normalized)) {
          role = 'admin';
        }
      }
    }
    const permissions = getPermissionsForRole(role);
    return sendSuccess(res, HTTP_STATUS.OK, {
      adminId: req.shopDomain || normalizedEmail,
      shopDomain: req.shopDomain || null,
      role,
      status,
      permissions: role ? permissions : [],
    });
  })
);

router.use(requireAdmin);

const IMPERSONATION_TOKEN_EXPIRY_SEC = 15 * 60; // 15 minutes

/**
 * POST /api/admin/impersonate
 * Issue a short-lived JWT to act as another shop (support debugging). Body: { shop_domain }. Audited.
 * Requires permission admin:impersonate (superadmin or ADMIN_API_KEY). Stricter rate limit applies.
 */
router.post(
  '/impersonate',
  sensitiveAdminLimiter,
  requirePermission(PERMISSIONS.IMPERSONATE),
  asyncHandler(async (req, res) => {
    const shopDomain =
      normalizeDomain(req.body?.shop_domain) ||
      (req.body?.shop_domain && String(req.body.shop_domain).trim().toLowerCase());
    if (!shopDomain) {
      return res.status(400).json({ success: false, error: 'shop_domain is required' });
    }
    const tenant = await getTenantByDomain(shopDomain);
    const user = await getByDomain(shopDomain);
    if (!tenant && !user) {
      return res.status(404).json({ success: false, error: 'Domain or user not found' });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, error: 'JWT_SECRET not configured' });
    }
    const payload = {
      ripxtype: 'impersonation',
      impersonated_shop: shopDomain,
      admin_id: req.adminId || 'unknown',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + IMPERSONATION_TOKEN_EXPIRY_SEC,
    };
    const token = jwt.sign(payload, secret, { algorithm: 'HS256' });
    await auditLogService.logAdminAction(req, {
      entityType: 'impersonation',
      entityId: shopDomain,
      action: 'create',
      changes: { impersonated_shop: shopDomain, expiresIn: IMPERSONATION_TOKEN_EXPIRY_SEC },
    });
    return sendSuccess(res, HTTP_STATUS.OK, {
      token,
      expiresIn: IMPERSONATION_TOKEN_EXPIRY_SEC,
      impersonated_shop: shopDomain,
    });
  })
);

/**
 * GET /api/admin/pending-users
 * List standalone users pending approval.
 */
router.get(
  '/pending-users',
  asyncHandler(async (req, res) => {
    const pending = await standaloneUser.getPending();
    return sendSuccess(res, HTTP_STATUS.OK, { users: pending });
  })
);

/**
 * GET /api/admin/standalone-users
 * List all standalone (email) users with optional status filter and pagination.
 * Query: status=pending|accepted|rejected, limit, offset, q (search email).
 */
router.get(
  '/standalone-users',
  asyncHandler(async (req, res) => {
    const { status, limit, offset, q } = req.query;
    const result = await standaloneUser.listAll({
      status: status || undefined,
      limit,
      offset,
      q,
    });
    return sendSuccess(res, HTTP_STATUS.OK, result);
  })
);

/**
 * POST /api/admin/accept-user/:id
 * Accept a pending registration (standalone_users.id). Sends acceptance email and audits.
 */
router.post(
  '/accept-user/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !validators.isValidUUID(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }
    const userBefore = await standaloneUser.getById(id);
    const accepted = await standaloneUser.accept(id, req.adminId);
    if (!accepted) {
      return res.status(404).json({ success: false, error: 'User not found or not pending' });
    }
    await standaloneUser.ensureAccountForUser(id);
    if (userBefore?.email) {
      const logger = require('../utils/logger');
      emailService.sendAcceptanceEmail(userBefore.email).catch(err => {
        logger.error('Acceptance email failed', { error: err.message });
      });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'auth',
      entityId: id,
      action: 'accept_user',
      changes: { email: userBefore?.email ? `${userBefore.email.substring(0, 3)}***` : null },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { message: 'User accepted' });
  })
);

/**
 * POST /api/admin/reject-user/:id
 * Reject a pending registration. Audited.
 */
router.post(
  '/reject-user/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !validators.isValidUUID(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }
    const userBefore = await standaloneUser.getById(id);
    const rejected = await standaloneUser.reject(id, req.adminId);
    if (!rejected) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'auth',
      entityId: id,
      action: 'reject_user',
      changes: { email: userBefore?.email ? `${userBefore.email.substring(0, 3)}***` : null },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { message: 'User rejected' });
  })
);

/**
 * POST /api/admin/resend-acceptance-email/:id
 * Resend the account-approval email to an accepted standalone user (e.g. first send failed or inbox issues).
 */
router.post(
  '/resend-acceptance-email/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !validators.isValidUUID(id)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }
    const user = await standaloneUser.getById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    if (user.status !== 'accepted') {
      return res.status(400).json({
        success: false,
        error: 'Approval email applies only to accepted accounts',
      });
    }
    if (!user.email) {
      return res.status(400).json({ success: false, error: 'User has no email address' });
    }
    const sent = await emailService.sendAcceptanceEmail(user.email);
    if (!sent) {
      return res.status(503).json({
        success: false,
        error:
          'Could not send email. Check SMTP settings, mail process toggles, and the acceptance template.',
      });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'auth',
      entityId: id,
      action: 'resend_acceptance_email',
      changes: { email: `${user.email.substring(0, 3)}***` },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { message: 'Approval email sent' });
  })
);

/**
 * POST /api/admin/revoke-email-sessions
 * Revoke all active email-session JWTs for a user by incrementing token_version.
 * Body: { user_id? , email? }. Audited.
 */
router.post(
  '/revoke-email-sessions',
  asyncHandler(async (req, res) => {
    const rawEmail = req.body?.email;
    const userId = req.body?.user_id;
    let user = null;
    if (userId) {
      user = await standaloneUser.getById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
    } else {
      const normalizedEmail =
        rawEmail !== null && rawEmail !== undefined ? String(rawEmail).trim().toLowerCase() : '';
      if (!normalizedEmail || !validators.isValidEmail(normalizedEmail)) {
        return res
          .status(400)
          .json({ success: false, error: 'Valid email or user_id is required' });
      }
      user = await standaloneUser.getByEmail(normalizedEmail);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }
    }
    const revoked = await standaloneUser.incrementTokenVersion(user.id);
    await auditLogService.logAdminAction(req, {
      entityType: 'auth',
      entityId: user.id,
      action: 'revoke_sessions',
      changes: {
        email: user.email ? `${user.email.substring(0, 3)}***` : null,
      },
    });
    return sendSuccess(res, HTTP_STATUS.OK, {
      revoked: Boolean(revoked),
      user_id: user.id,
      email: user.email || null,
    });
  })
);

/** Max lengths for send-announcement (align with mailProcessService). */
const ANNOUNCEMENT_MAX_SUBJECT_LENGTH = 500;
const ANNOUNCEMENT_MAX_BODY_BYTES = 200 * 1024;

/**
 * POST /api/admin/send-announcement
 * Send announcement email to all accepted standalone users. Body: { subject, bodyHtml, bodyText }.
 */
router.post(
  '/send-announcement',
  asyncHandler(async (req, res) => {
    let subject =
      req.body?.subject !== undefined && req.body?.subject !== null
        ? String(req.body.subject)
        : 'Announcement from RipX';
    const bodyHtml =
      req.body?.bodyHtml !== undefined && req.body?.bodyHtml !== null
        ? String(req.body.bodyHtml)
        : req.body?.body !== undefined && req.body?.body !== null
          ? String(req.body.body)
          : '';
    const bodyText =
      req.body?.bodyText !== undefined && req.body?.bodyText !== null
        ? String(req.body.bodyText)
        : '';
    subject = subject.trim();
    if (subject.length > ANNOUNCEMENT_MAX_SUBJECT_LENGTH) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: `Subject must be at most ${ANNOUNCEMENT_MAX_SUBJECT_LENGTH} characters`,
      });
    }
    const bodyHtmlBytes = Buffer.byteLength(bodyHtml, 'utf8');
    const bodyTextBytes = Buffer.byteLength(bodyText, 'utf8');
    if (bodyHtmlBytes > ANNOUNCEMENT_MAX_BODY_BYTES) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: `HTML body must be at most ${Math.round(ANNOUNCEMENT_MAX_BODY_BYTES / 1024)}KB`,
      });
    }
    if (bodyTextBytes > ANNOUNCEMENT_MAX_BODY_BYTES) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: `Plain text body must be at most ${Math.round(ANNOUNCEMENT_MAX_BODY_BYTES / 1024)}KB`,
      });
    }
    const emails = await standaloneUser.listAcceptedEmails();
    if (emails.length === 0) {
      return sendSuccess(res, HTTP_STATUS.OK, { sent: 0, message: 'No users to email' });
    }
    let sent = 0;
    for (const to of emails) {
      const ok = await emailService.sendAnnouncement(to, subject, bodyHtml, bodyText);
      if (ok) {
        sent++;
      }
    }
    return sendSuccess(res, HTTP_STATUS.OK, { sent, total: emails.length });
  })
);

/**
 * GET /api/admin/stats
 * Platform-wide stats for admin dashboard
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [usersRes, tenantsRes, testsRes, eventsRes] = await Promise.all([
      query('SELECT COUNT(*)::int AS c FROM users'),
      query('SELECT COUNT(*)::int AS c FROM tenants'),
      query(
        "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'running')::int AS running FROM tests"
      ),
      query(
        "SELECT COUNT(*)::bigint AS c, COALESCE(SUM(event_value), 0)::float AS revenue FROM events WHERE event_type = 'conversion'"
      ),
    ]);

    return sendSuccess(res, HTTP_STATUS.OK, {
      totalUsers: usersRes.rows[0]?.c ?? 0,
      totalDomains: tenantsRes.rows[0]?.c ?? 0,
      totalTests: testsRes.rows[0]?.total ?? 0,
      activeTests: testsRes.rows[0]?.running ?? 0,
      totalConversions: parseInt(eventsRes.rows[0]?.c, 10) || 0,
      totalRevenue: parseFloat(eventsRes.rows[0]?.revenue) || 0,
    });
  })
);

/**
 * GET /api/admin/user-detail-by-email?email=...
 * User detail by email (for email/standalone list). Returns same shape as /users/:shopDomain including domains.
 * Separate path to avoid any conflict with /users/:shopDomain.
 */
router.get(
  '/user-detail-by-email',
  asyncHandler(async (req, res) => {
    const raw = (req.query.email || '').trim();
    const email = raw.toLowerCase();
    if (!email || !validators.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Valid email required' });
    }
    const user = await getByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const tenantIds = await userDomainAccess.getTenantIdsForUser(user.id, user.account_id);
    let domains = [];
    if (tenantIds.length > 0) {
      const placeholders = tenantIds.map((_, i) => `$${i + 1}`).join(',');
      const domainsRes = await query(
        `SELECT id, domain, platform, domain_verified_at, created_at
         FROM tenants WHERE id IN (${placeholders}) ORDER BY domain ASC`,
        tenantIds
      );
      domains = domainsRes.rows.map(r => ({
        id: r.id,
        domain: r.domain,
        platform: r.platform || 'standalone',
        domainType: r.platform === 'shopify' ? 'Shopify' : 'Standalone',
        verifiedAt: r.domain_verified_at,
        createdAt: r.created_at,
      }));
    }
    return sendSuccess(res, HTTP_STATUS.OK, {
      id: email,
      recordId: user.id,
      shopDomain: null,
      email: user.email,
      profile: user.profile || {},
      account: user.account || {},
      preferences: user.preferences || {},
      role: user.role,
      status: user.status || 'active',
      domains,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  })
);

/**
 * GET /api/admin/users
 * List all users (paginated, optional status and search)
 */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const {
      limit = PAGINATION.ADMIN_DEFAULT_LIMIT,
      offset = 0,
      status: statusFilter,
      q: search,
    } = req.query;
    const limitNum = Math.min(
      parseInt(limit, 10) || PAGINATION.ADMIN_DEFAULT_LIMIT,
      PAGINATION.ADMIN_MAX_LIMIT
    );
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const conditions = ["t.platform = 'shopify'", 't.account_id = u.account_id'];
    const params = [];
    let idx = 1;
    if (statusFilter) {
      conditions.push(`COALESCE(u.status, 'active') = $${idx}`);
      params.push(statusFilter);
      idx++;
    }
    if (search && String(search).trim()) {
      const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
      conditions.push(
        `(LOWER(u.email) LIKE LOWER($${idx}) OR LOWER(t.domain) LIKE LOWER($${idx}) OR LOWER(u.profile->>'firstName') LIKE LOWER($${idx}) OR LOWER(u.profile->>'lastName') LIKE LOWER($${idx}))`
      );
      params.push(term);
      idx++;
    }
    const where = ` WHERE ${conditions.join(' AND ')}`;
    const countSql = `SELECT COUNT(DISTINCT u.id)::int AS c FROM users u INNER JOIN tenants t ON t.account_id = u.account_id ${where}`;
    const countRes = await query(countSql, params);
    const total = countRes.rows[0]?.c ?? 0;

    const sql = `
      SELECT DISTINCT ON (u.id) u.id, u.email, u.role, COALESCE(u.status, 'active') AS status,
             u.created_at, u.updated_at, t.domain AS shop_domain,
             u.profile->>'firstName' AS first_name, u.profile->>'lastName' AS last_name,
             (SELECT COUNT(*)::int FROM tenants t2 WHERE t2.account_id = u.account_id) AS domain_count,
             (
               SELECT MAX(al.created_at)
               FROM audit_log al
               WHERE al.entity_type = 'auth'
                 AND al.action = 'login_success'
                 AND LOWER(COALESCE(al.actor_id, '')) = LOWER(COALESCE(u.email, ''))
             ) AS last_login_at
      FROM users u
      INNER JOIN tenants t ON t.account_id = u.account_id ${where}
      ORDER BY u.id, t.created_at ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limitNum, offsetNum);
    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      id: r.shop_domain,
      shopDomain: r.shop_domain,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      role: r.role,
      status: r.status,
      domainCount: r.domain_count ?? 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastLoginAt: r.last_login_at,
    }));

    return sendSuccess(res, HTTP_STATUS.OK, {
      users: list,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  })
);

/**
 * GET /api/admin/users/export
 * Export users list as CSV (must be before /users/:shopDomain).
 * Requires permission admin:users:export.
 */
router.get(
  '/users/export',
  requirePermission(PERMISSIONS.USERS_EXPORT),
  asyncHandler(async (req, res) => {
    const { status: statusFilter, q: search } = req.query;
    const conditions = ["t.platform = 'shopify'", 't.account_id = u.account_id'];
    const params = [];
    let idx = 1;
    if (statusFilter) {
      conditions.push(`COALESCE(u.status, 'active') = $${idx}`);
      params.push(statusFilter);
      idx++;
    }
    if (search && String(search).trim()) {
      const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
      conditions.push(
        `(LOWER(u.email) LIKE LOWER($${idx}) OR LOWER(t.domain) LIKE LOWER($${idx}) OR LOWER(u.profile->>'firstName') LIKE LOWER($${idx}) OR LOWER(u.profile->>'lastName') LIKE LOWER($${idx}))`
      );
      params.push(term);
      idx++;
    }
    const where = ` WHERE ${conditions.join(' AND ')}`;
    const sql = `
      SELECT DISTINCT ON (u.id) t.domain AS shop_domain, u.email, u.profile->>'firstName' AS first_name, u.profile->>'lastName' AS last_name,
             u.role, COALESCE(u.status, 'active') AS status, u.created_at, u.updated_at
      FROM users u
      INNER JOIN tenants t ON t.account_id = u.account_id ${where}
      ORDER BY u.id, t.created_at ASC
      LIMIT 10000
    `;
    const result = await query(sql, params);
    const headers = [
      'shop_domain',
      'email',
      'first_name',
      'last_name',
      'role',
      'status',
      'created_at',
      'updated_at',
    ];
    const rows = result.rows.map(r =>
      headers.map(h => {
        const v = r[h];
        if (v === null || v === undefined) {
          return '';
        }
        return String(v).replace(/"/g, '""');
      })
    );
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=ripx-admin-users.csv');
    res.send('\uFEFF' + csv);
  })
);

/**
 * GET /api/admin/users/:shopDomain
 * User detail including all domains (tenants) for this user's account.
 */
router.get(
  '/users/:shopDomain',
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    const user = await getByDomain(shopDomain);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const tenantIds = await userDomainAccess.getTenantIdsForUser(user.id, user.account_id);
    let domains = [];
    if (tenantIds.length > 0) {
      const placeholders = tenantIds.map((_, i) => `$${i + 1}`).join(',');
      const domainsRes = await query(
        `SELECT id, domain, platform, domain_verified_at, created_at
         FROM tenants WHERE id IN (${placeholders}) ORDER BY domain ASC`,
        tenantIds
      );
      domains = domainsRes.rows.map(r => ({
        id: r.id,
        domain: r.domain,
        platform: r.platform || 'standalone',
        domainType: r.platform === 'shopify' ? 'Shopify' : 'Standalone',
        verifiedAt: r.domain_verified_at,
        createdAt: r.created_at,
      }));
    }

    return sendSuccess(res, HTTP_STATUS.OK, {
      id: shopDomain,
      shopDomain,
      email: user.email,
      profile: user.profile || {},
      account: user.account || {},
      preferences: user.preferences || {},
      role: user.role,
      status: user.status || 'active',
      domains,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  })
);

/**
 * GET /api/admin/users/:shopDomain/export
 * Phase 3: GDPR-style data export for the user (profile, domains, tests metadata). JSON only.
 * Requires permission admin:users:export.
 */
router.get(
  '/users/:shopDomain/export',
  requirePermission(PERMISSIONS.USERS_EXPORT),
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    const u = await getByDomain(shopDomain);
    if (!u) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    let domains = [];
    if (u.account_id) {
      const domainsRes = await query(
        'SELECT domain, platform, domain_verified_at, created_at FROM tenants WHERE account_id = $1 ORDER BY created_at ASC',
        [u.account_id]
      );
      domains = domainsRes.rows.map(r => ({
        domain: r.domain,
        platform: r.platform,
        domainType: r.platform === 'shopify' ? 'Shopify' : 'Standalone',
        verifiedAt: r.domain_verified_at,
        createdAt: r.created_at,
      }));
    }
    let testsRes = { rows: [] };
    if (u.account_id) {
      testsRes = await query(
        'SELECT id, name, type, status, created_at, updated_at, started_at, stopped_at FROM tests t WHERE t.shop_domain IN (SELECT domain FROM tenants WHERE account_id = $1) ORDER BY t.updated_at DESC',
        [u.account_id]
      );
    } else {
      testsRes = await query(
        'SELECT id, name, type, status, created_at, updated_at, started_at, stopped_at FROM tests WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1)) ORDER BY updated_at DESC',
        [shopDomain]
      );
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      shopDomain,
      email: u.email,
      profile: u.profile || {},
      account: u.account || {},
      preferences: u.preferences || {},
      role: u.role,
      status: u.status,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      domains,
      tests: testsRes.rows.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        status: t.status,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        startedAt: t.started_at,
        stoppedAt: t.stopped_at,
      })),
    };
    await auditLogService.logAdminAction(req, {
      entityType: 'user',
      entityId: shopDomain,
      action: 'gdpr_export',
      changes: { exportedAt: payload.exportedAt },
    });
    return sendSuccess(res, HTTP_STATUS.OK, payload);
  })
);

/**
 * PUT /api/admin/users/:shopDomain/lock
 * Requires permission admin:users:lock.
 */
router.put(
  '/users/:shopDomain/lock',
  requirePermission(PERMISSIONS.USERS_LOCK),
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    const ok = await setUserStatus(shopDomain, 'locked');
    if (!ok) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'user',
      entityId: shopDomain,
      action: 'lock',
      changes: { status: 'locked' },
    });

    return sendSuccess(res, HTTP_STATUS.OK, { success: true });
  })
);

/**
 * PUT /api/admin/users/:shopDomain/unlock
 * Requires permission admin:users:lock.
 */
router.put(
  '/users/:shopDomain/unlock',
  requirePermission(PERMISSIONS.USERS_LOCK),
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    const ok = await setUserStatus(shopDomain, 'active');
    if (!ok) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'user',
      entityId: shopDomain,
      action: 'unlock',
      changes: { status: 'active' },
    });

    return sendSuccess(res, HTTP_STATUS.OK, { success: true });
  })
);

/**
 * PUT /api/admin/users/:shopDomain/role
 * Body: { role: 'collaborator' | 'admin' | 'superadmin' | null }
 * Requires permission admin:users:set_role (superadmin or ADMIN_API_KEY). Stricter rate limit applies.
 */
router.put(
  '/users/:shopDomain/role',
  sensitiveAdminLimiter,
  requirePermission(PERMISSIONS.USERS_SET_ROLE),
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    const { role } = req.body || {};
    const newRole = role === null || role === '' ? null : role;
    if (newRole !== null && !PLATFORM_ROLE_VALUES.includes(newRole)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }
    // Users cannot change their own role
    const currentId = (req.adminId || req.email || req.shopDomain || '')
      .toString()
      .trim()
      .toLowerCase();
    const targetId = (shopDomain || '').toString().trim().toLowerCase();
    if (currentId && targetId && currentId === targetId) {
      return res.status(403).json({ success: false, error: 'You cannot change your own role' });
    }
    // Only superadmin can assign or change to superadmin
    const isSuperadmin = (req.adminRole || '').toLowerCase() === PLATFORM_ROLES.SUPERADMIN;
    if (newRole === PLATFORM_ROLES.SUPERADMIN && !isSuperadmin) {
      return res
        .status(403)
        .json({ success: false, error: 'Only a superadmin can assign the superadmin role' });
    }

    const updated = await setUserRole(shopDomain, newRole);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'user',
      entityId: shopDomain,
      action: 'set_role',
      changes: { role: newRole },
    });

    return sendSuccess(res, HTTP_STATUS.OK, { success: true, role: newRole });
  })
);

/**
 * GET /api/admin/accounts
 * List accounts (multi-store) with domain count. Query: limit, offset.
 */
router.get(
  '/accounts',
  asyncHandler(async (req, res) => {
    const { limit = 100, offset = 0 } = req.query;
    const data = await listAccounts(limit, offset);
    return sendSuccess(res, HTTP_STATUS.OK, data);
  })
);

/**
 * GET /api/admin/accounts/:id
 * Account detail with domain list.
 */
router.get(
  '/accounts/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id || !validators.isValidUUID(id)) {
      return res.status(400).json({ success: false, error: 'Invalid account ID' });
    }
    const account = await getAccountById(id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    return sendSuccess(res, HTTP_STATUS.OK, account);
  })
);

/**
 * GET /api/admin/domains
 * List all tenants with test counts
 */
router.get(
  '/domains',
  asyncHandler(async (req, res) => {
    const tenants = await listTenants();

    const domainList = await Promise.all(
      tenants.map(async t => {
        const countResult = await query(
          'SELECT COUNT(*)::int AS c FROM tests WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))',
          [t.domain]
        );
        return {
          id: t.id,
          domain: t.domain,
          platform: t.platform,
          status: t.status || 'active',
          accountId: t.account_id,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          testsCount: countResult.rows[0]?.c ?? 0,
        };
      })
    );

    return sendSuccess(res, HTTP_STATUS.OK, { domains: domainList });
  })
);

/**
 * GET /api/admin/domains/:domain
 */
router.get(
  '/domains/:domain',
  asyncHandler(async (req, res) => {
    const domain = normalizeDomain(req.params.domain) || req.params.domain;
    const tenant = await getTenantByDomain(domain);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }

    const [testsRes, eventsRes, permittedUsers] = await Promise.all([
      query(
        'SELECT id, name, type, status, created_at FROM tests WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1)) ORDER BY updated_at DESC LIMIT 20',
        [domain]
      ),
      query(
        'SELECT COUNT(*)::bigint AS c, COALESCE(SUM(event_value), 0)::float AS revenue FROM events WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))',
        [domain]
      ),
      userDomainAccess.getUsersForTenant(tenant.id),
    ]);

    return sendSuccess(res, HTTP_STATUS.OK, {
      ...tenant,
      status: tenant.status || 'active',
      recentTests: testsRes.rows,
      totalEvents: parseInt(eventsRes.rows[0]?.c, 10) || 0,
      totalRevenue: parseFloat(eventsRes.rows[0]?.revenue) || 0,
      permittedUsers: permittedUsers || [],
    });
  })
);

/**
 * GET /api/admin/domains/:domain/users
 * List users with access to this domain (permitted users).
 */
router.get(
  '/domains/:domain/users',
  asyncHandler(async (req, res) => {
    const domain = normalizeDomain(req.params.domain) || req.params.domain;
    const tenant = await getTenantByDomain(domain);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }
    const users = await userDomainAccess.getUsersForTenant(tenant.id);
    return sendSuccess(res, HTTP_STATUS.OK, { users });
  })
);

/**
 * POST /api/admin/domains/:domain/users
 * Add a user to this domain by email. Body: { email, role?: 'owner'|'member'|'viewer' }
 */
router.post(
  '/domains/:domain/users',
  asyncHandler(async (req, res) => {
    const domain = normalizeDomain(req.params.domain) || req.params.domain;
    const tenant = await getTenantByDomain(domain);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    const role = userDomainAccess.ROLES.includes(req.body?.role) ? req.body.role : 'member';
    const user = await getByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found with that email' });
    }
    if (user.status && !['active', 'accepted'].includes(user.status)) {
      return res.status(400).json({
        success: false,
        error: 'User must be accepted or active to be added to a domain',
      });
    }
    const added = await userDomainAccess.addAccess(user.id, tenant.id, role);
    if (!added) {
      return res.status(500).json({ success: false, error: 'Failed to add user' });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'tenant',
      entityId: domain,
      action: 'add_domain_user',
      changes: { email, role },
    });
    return sendSuccess(res, HTTP_STATUS.CREATED, {
      success: true,
      message: 'User added to domain',
      user: { email, role },
    });
  })
);

/**
 * DELETE /api/admin/domains/:domain/users
 * Remove a user from this domain. Body: { email } or query: email=
 */
router.delete(
  '/domains/:domain/users',
  asyncHandler(async (req, res) => {
    const domain = normalizeDomain(req.params.domain) || req.params.domain;
    const tenant = await getTenantByDomain(domain);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }
    const email = (req.body?.email || req.query?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    const user = await getByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const removed = await userDomainAccess.removeAccess(user.id, tenant.id);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'User was not linked to this domain' });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'tenant',
      entityId: domain,
      action: 'remove_domain_user',
      changes: { email },
    });
    return sendSuccess(res, HTTP_STATUS.OK, {
      success: true,
      message: 'User removed from domain',
    });
  })
);

/**
 * PUT /api/admin/domains/:domain/suspend
 */
router.put(
  '/domains/:domain/suspend',
  asyncHandler(async (req, res) => {
    const domain = normalizeDomain(req.params.domain) || req.params.domain;
    const ok = await setTenantStatus(domain, 'suspended');
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'tenant',
      entityId: domain,
      action: 'suspend',
      changes: { status: 'suspended' },
    });

    return sendSuccess(res, HTTP_STATUS.OK, { success: true });
  })
);

/**
 * PUT /api/admin/domains/:domain/unsuspend
 */
router.put(
  '/domains/:domain/unsuspend',
  asyncHandler(async (req, res) => {
    const domain = normalizeDomain(req.params.domain) || req.params.domain;
    const ok = await setTenantStatus(domain, 'active');
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'tenant',
      entityId: domain,
      action: 'unsuspend',
      changes: { status: 'active' },
    });

    return sendSuccess(res, HTTP_STATUS.OK, { success: true });
  })
);

/**
 * DELETE /api/admin/domains/:domain
 * Permanently remove a domain (tenant). Unlinks from account, removes user_domain_access, then deletes the tenant.
 * Cascades: tests for this tenant are deleted; events/assignments/audit tenant_id set to null.
 */
router.delete(
  '/domains/:domain',
  asyncHandler(async (req, res) => {
    const domain = normalizeDomain(req.params.domain) || req.params.domain;
    const tenant = await getTenantByDomain(domain);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }

    const tenantId = tenant.id;
    await query('DELETE FROM user_domain_access WHERE tenant_id = $1', [tenantId]);
    await query('DELETE FROM tenants WHERE id = $1', [tenantId]);

    await auditLogService.logAdminAction(req, {
      entityType: 'tenant',
      entityId: domain,
      action: 'delete_domain',
      changes: { domain, tenantId },
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      success: true,
      message: 'Domain removed permanently.',
    });
  })
);

/**
 * POST /api/admin/domains/:domain/connect-link
 * Create a one-time link that opens the app with API key pre-set (no paste required).
 * Rotates the account API key and returns a URL; when opened, the app exchanges the token for the key and redirects to dashboard.
 */
router.post(
  '/domains/:domain/connect-link',
  asyncHandler(async (req, res) => {
    const domain = normalizeDomain(req.params.domain) || req.params.domain;
    const tenant = await getTenantByDomain(domain);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Domain not found' });
    }
    if ((tenant.status || 'active') === 'suspended') {
      return res.status(400).json({
        success: false,
        error: 'Domain is suspended. Unsuspend the domain first to open the app.',
      });
    }

    const baseUrl = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '');
    if (!baseUrl || !baseUrl.startsWith('http')) {
      return res.status(500).json({
        success: false,
        error:
          'Server misconfiguration: set FRONTEND_URL or APP_URL to the app base URL (e.g. https://app.example.com).',
      });
    }

    // Shopify domain: return Shopify OAuth URL so the user authenticates with the store
    const isShopify = tenant.platform === 'shopify' || isShopifyDomain(tenant.domain || '');
    if (isShopify) {
      const url = `${baseUrl}/api/auth?shop=${encodeURIComponent(tenant.domain)}`;
      await auditLogService.logAdminAction(req, {
        entityType: 'tenant',
        entityId: domain,
        action: 'admin_connect_link',
        changes: { domain: tenant.domain, type: 'shopify_auth' },
      });
      return sendSuccess(res, HTTP_STATUS.OK, { url, expiresIn: null, type: 'shopify_auth' });
    }

    let apiKey;

    if (tenant.account_id) {
      apiKey = await regenerateApiKey(tenant.account_id);
    } else {
      // Tenant has no account (e.g. legacy Shopify tenant): create account and link tenant
      const { account: newAccount, apiKey: newKey } = await createAccount(
        `Account for ${tenant.domain}`
      );
      if (!newAccount?.id || !newKey) {
        return res
          .status(500)
          .json({ success: false, error: 'Could not create account for domain' });
      }
      const updateResult = await query(
        'UPDATE tenants SET account_id = $1, updated_at = NOW() WHERE id = $2 RETURNING id',
        [newAccount.id, tenant.id]
      );
      if (updateResult.rowCount === 0) {
        return res.status(500).json({ success: false, error: 'Could not link domain to account' });
      }
      apiKey = newKey;
    }

    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'Could not generate connect link' });
    }
    const token = crypto.randomUUID();
    const payload = {
      apiKey,
      domain: tenant.domain,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    const kvKey = `connect_${token}`;
    await query(
      `INSERT INTO key_value_store (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [kvKey, JSON.stringify(payload)]
    );
    const url = `${baseUrl}/?connect_token=${encodeURIComponent(token)}`;

    // Send API key to the user's email when key is generated (account owner or first user with domain access)
    let toEmail = null;
    const accountOwner = await getByAccountId(tenant.account_id);
    if (accountOwner?.email) {
      toEmail = accountOwner.email.trim().toLowerCase();
    }
    if (!toEmail) {
      const permitted = await userDomainAccess.getUsersForTenant(tenant.id);
      toEmail =
        permitted.length > 0 && permitted[0].email ? permitted[0].email.trim().toLowerCase() : null;
    }
    if (toEmail) {
      try {
        await emailService.sendDomainApiKeyEmail(toEmail, {
          domain: tenant.domain,
          apiKey,
          reason: 'api_key_regenerated',
        });
      } catch (err) {
        const logger = require('../utils/logger');
        logger.error('Admin connect-link: failed to send API key email', {
          error: err.message,
          to: toEmail.substring(0, 6) + '…',
          domain: tenant.domain,
        });
      }
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'tenant',
      entityId: domain,
      action: 'admin_connect_link',
      changes: { domain: tenant.domain },
    });

    return sendSuccess(res, HTTP_STATUS.OK, { url, expiresIn: 300 });
  })
);

/**
 * GET /api/admin/tests
 * List all tests (paginated, filterable)
 */
router.get(
  '/tests',
  asyncHandler(async (req, res) => {
    const { domain, status, type: typeFilter, limit = 50, offset = 0 } = req.query;
    let sql = `
      SELECT id, shop_domain, name, type, status, goal, variants,
             created_at, updated_at, started_at, stopped_at
      FROM tests
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (domain) {
      sql += ` AND LOWER(TRIM(shop_domain)) = LOWER(TRIM($${idx}))`;
      params.push(domain);
      idx++;
    }
    if (status) {
      sql += ` AND status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (typeFilter && String(typeFilter).trim()) {
      sql += ` AND type = $${idx}`;
      params.push(String(typeFilter).trim());
      idx++;
    }
    sql += ` ORDER BY updated_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit, 10) || 50, parseInt(offset, 10) || 0);

    const result = await query(sql, params);
    const tests = result.rows.map(r => ({
      id: r.id,
      shopDomain: r.shop_domain,
      name: r.name,
      type: r.type,
      status: r.status,
      variantCount: Array.isArray(r.variants) ? r.variants.length : 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      startedAt: r.started_at,
      stoppedAt: r.stopped_at,
    }));

    let total = tests.length;
    if (domain || status || (typeFilter && String(typeFilter).trim())) {
      let countSql = 'SELECT COUNT(*)::int AS c FROM tests WHERE 1=1';
      const countParams = [];
      let ci = 1;
      if (domain) {
        countSql += ` AND LOWER(TRIM(shop_domain)) = LOWER(TRIM($${ci}))`;
        countParams.push(domain);
        ci++;
      }
      if (status) {
        countSql += ` AND status = $${ci}`;
        countParams.push(status);
        ci++;
      }
      if (typeFilter && String(typeFilter).trim()) {
        countSql += ` AND type = $${ci}`;
        countParams.push(String(typeFilter).trim());
        ci++;
      }
      const countRes = await query(countSql, countParams);
      total = countRes.rows[0]?.c ?? 0;
    } else {
      const countRes = await query('SELECT COUNT(*)::int AS c FROM tests');
      total = countRes.rows[0]?.c ?? 0;
    }

    return sendSuccess(res, HTTP_STATUS.OK, {
      tests,
      total,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
    });
  })
);

/**
 * PUT /api/admin/tests/:id/stop
 * Admin override to stop a test
 */
router.put(
  '/tests/:id/stop',
  asyncHandler(async (req, res) => {
    const testId = req.params.id;
    if (!validators.isValidUUID(testId)) {
      return res.status(400).json({ success: false, error: 'Invalid test ID' });
    }

    const test = await getTestByIdForAdmin(testId);
    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    const stopped = await abTestEngine.stopTest(testId, test.shop_domain);
    if (!stopped) {
      return res.status(500).json({ success: false, error: 'Failed to stop test' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'test',
      entityId: testId,
      action: 'stop',
      changes: { previousStatus: test.status },
    });

    return sendSuccess(res, HTTP_STATUS.OK, { success: true });
  })
);

/**
 * GET /api/admin/audit-log/export
 * Export audit log as CSV (must be before /audit-log to match)
 */
router.get(
  '/audit-log/export',
  asyncHandler(async (req, res) => {
    const {
      actor_id: actorId,
      shop_domain: shopDomain,
      tenant_id: tenantId,
      limit = 5000,
    } = req.query;
    if (tenantId && !validators.isValidUUID(tenantId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid tenant_id (must be a valid UUID)' });
    }
    let sql = `
      SELECT id, shop_domain, tenant_id, entity_type, entity_id, action, user_id,
             actor_type, actor_id, ip_address, changes, created_at
      FROM audit_log
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (actorId) {
      sql += ` AND (actor_id = $${idx} OR user_id = $${idx})`;
      params.push(actorId);
      idx++;
    }
    if (shopDomain) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(shopDomain);
      idx++;
    }
    if (tenantId) {
      sql += ` AND tenant_id = $${idx}`;
      params.push(tenantId);
      idx++;
    }
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(Math.min(parseInt(limit, 10) || 5000, 10000));

    const result = await query(sql, params);
    const headers = [
      'created_at',
      'shop_domain',
      'tenant_id',
      'entity_type',
      'entity_id',
      'action',
      'actor_id',
      'ip_address',
      'changes',
    ];
    const rows = result.rows.map(r =>
      headers.map(h => {
        const v = r[h === 'created_at' ? 'created_at' : h];
        if (v === null || v === undefined) {
          return '';
        }
        if (h === 'changes' && typeof v === 'object') {
          return JSON.stringify(v);
        }
        return String(v).replace(/"/g, '""');
      })
    );
    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=ripx-audit-log.csv');
    res.send('\uFEFF' + csv);
  })
);

/**
 * GET /api/admin/audit-log
 * List admin and tenant audit entries (optional filters: entity_type, shop_domain, tenant_id, actor_id)
 */
router.get(
  '/audit-log',
  asyncHandler(async (req, res) => {
    const {
      actor_id: actorId,
      shop_domain: shopDomain,
      tenant_id: tenantId,
      entity_type: entityType,
      limit = 100,
      offset = 0,
    } = req.query;
    if (tenantId && !validators.isValidUUID(tenantId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid tenant_id (must be a valid UUID)' });
    }
    let sql = `
      SELECT id, shop_domain, tenant_id, entity_type, entity_id, action, user_id,
             actor_type, actor_id, ip_address, changes, created_at
      FROM audit_log
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (actorId) {
      sql += ` AND (actor_id = $${idx} OR user_id = $${idx})`;
      params.push(actorId);
      idx++;
    }
    if (shopDomain) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(shopDomain);
      idx++;
    }
    if (tenantId) {
      sql += ` AND tenant_id = $${idx}`;
      params.push(tenantId);
      idx++;
    }
    if (entityType && String(entityType).trim()) {
      sql += ` AND entity_type = $${idx}`;
      params.push(String(entityType).trim());
      idx++;
    }
    const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limitNum, offsetNum);

    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      id: r.id,
      shopDomain: r.shop_domain,
      tenantId: r.tenant_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      action: r.action,
      userId: r.user_id,
      actorType: r.actor_type,
      actorId: r.actor_id,
      ipAddress: r.ip_address,
      changes: r.changes,
      createdAt: r.created_at,
    }));

    let countSql = 'SELECT COUNT(*)::int AS c FROM audit_log WHERE 1=1';
    const countParams = [];
    let ci = 1;
    if (actorId) {
      countSql += ` AND (actor_id = $${ci} OR user_id = $${ci})`;
      countParams.push(actorId);
      ci++;
    }
    if (shopDomain) {
      countSql += ` AND shop_domain = $${ci}`;
      countParams.push(shopDomain);
      ci++;
    }
    if (tenantId) {
      countSql += ` AND tenant_id = $${ci}`;
      countParams.push(tenantId);
      ci++;
    }
    if (entityType && String(entityType).trim()) {
      countSql += ` AND entity_type = $${ci}`;
      countParams.push(String(entityType).trim());
    }
    const countRes = await query(countSql, countParams);
    const total = countRes.rows[0]?.c ?? 0;

    return sendSuccess(res, HTTP_STATUS.OK, {
      entries: list,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  })
);

/**
 * GET /api/admin/notifications
 * List notifications (system-wide and per-shop). Filters: scope (all|shop), shop_domain, limit.
 */
router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const { scope, shop_domain: shopDomain, limit = 50 } = req.query;
    let sql = `
      SELECT id, shop_domain, type, title, message, read, scope, created_at
      FROM notifications
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (scope === 'all') {
      sql += " AND shop_domain = '*' AND (scope = 'all' OR scope IS NULL)";
    } else if (scope === 'shop') {
      sql += " AND (shop_domain != '*' OR shop_domain IS NULL)";
    }
    if (shopDomain && String(shopDomain).trim()) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(String(shopDomain).trim().toLowerCase());
      idx++;
    }
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limitNum);
    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      id: r.id,
      shopDomain: r.shop_domain,
      type: r.type,
      title: r.title,
      message: r.message,
      read: r.read,
      scope: r.scope || 'shop',
      createdAt: r.created_at,
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { notifications: list, total: list.length });
  })
);

/**
 * POST /api/admin/notifications
 * Create system-wide or per-domain announcement. Body: { title, message, scope: 'all' | 'shop', shop_domain? }
 */
router.post(
  '/notifications',
  asyncHandler(async (req, res) => {
    const { title, message, scope = 'all', shop_domain: shopDomain } = req.body || {};
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    const notifScope = scope === 'shop' ? 'shop' : 'all';
    const domain = notifScope === 'all' ? '*' : normalizeDomain(shopDomain) || shopDomain || '*';
    if (notifScope === 'shop' && (!domain || domain === '*')) {
      return res.status(400).json({ success: false, error: 'shop_domain required for scope shop' });
    }
    const notificationService = require('../services/notificationService');
    await notificationService.createInAppNotification(domain, {
      type: 'announcement',
      title: title.trim(),
      message: message !== null && message !== undefined ? String(message).trim() : '',
      scope: notifScope,
    });
    await auditLogService.logAdminAction(req, {
      entityType: 'notification',
      entityId: domain,
      action: 'create',
      changes: { scope: notifScope, title: title.trim() },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { created: true });
  })
);

/**
 * DELETE /api/admin/notifications/:id
 * Delete a notification. Audited.
 */
router.delete(
  '/notifications/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !validators.isValidUUID(id)) {
      return res.status(400).json({ success: false, error: 'Invalid notification ID' });
    }
    const getRow = await query('SELECT id, shop_domain, title FROM notifications WHERE id = $1', [
      id,
    ]);
    const row = getRow.rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    await query('DELETE FROM notifications WHERE id = $1', [id]);
    await auditLogService.logAdminAction(req, {
      entityType: 'notification',
      entityId: id,
      action: 'delete',
      changes: { shopDomain: row.shop_domain, title: row.title },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { deleted: true });
  })
);

/**
 * GET /api/admin/webhook-events
 * List incoming webhook events (filters: shop_domain, topic, limit)
 */
router.get(
  '/webhook-events',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain, topic, limit = 50 } = req.query;
    let sql = `
      SELECT id, shop_domain, webhook_id, topic, payload_hash, received_at
      FROM webhook_events
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shopDomain && String(shopDomain).trim()) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(String(shopDomain).trim().toLowerCase());
      idx++;
    }
    if (topic && String(topic).trim()) {
      sql += ` AND topic = $${idx}`;
      params.push(String(topic).trim());
      idx++;
    }
    const limitNum = Math.min(parseInt(limit, 10) || 50, 500);
    sql += ` ORDER BY received_at DESC LIMIT $${idx}`;
    params.push(limitNum);

    const result = await query(sql, params);
    const events = result.rows.map(r => ({
      id: r.id,
      shopDomain: r.shop_domain,
      webhookId: r.webhook_id,
      topic: r.topic,
      payloadHash: r.payload_hash,
      receivedAt: r.received_at,
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { events, total: events.length });
  })
);

/**
 * GET /api/admin/webhooks
 * List outbound webhook config per shop (URL masked). Optional shop_domain filter.
 */
router.get(
  '/webhooks',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain } = req.query;
    let sql = `
      SELECT shop_domain, outbound_webhook_url, outbound_webhook_events, updated_at
      FROM shop_settings
      WHERE outbound_webhook_url IS NOT NULL AND outbound_webhook_url != ''
    `;
    const params = [];
    if (shopDomain && String(shopDomain).trim()) {
      sql += ' AND shop_domain = $1';
      params.push(String(shopDomain).trim().toLowerCase());
    }
    sql += ' ORDER BY shop_domain';
    const result = await query(sql, params);
    const list = result.rows.map(r => {
      const url = r.outbound_webhook_url || '';
      const masked = url.length > 20 ? url.slice(0, 8) + '…' + url.slice(-8) : url ? '***' : '';
      let events = r.outbound_webhook_events;
      if (typeof events === 'string') {
        try {
          events = JSON.parse(events);
        } catch {
          events = [];
        }
      }
      return {
        shopDomain: r.shop_domain,
        webhookUrlMasked: masked,
        webhookEvents: Array.isArray(events) ? events : [],
        updatedAt: r.updated_at,
      };
    });
    return sendSuccess(res, HTTP_STATUS.OK, { webhooks: list, total: list.length });
  })
);

/**
 * PUT /api/admin/webhooks/:shopDomain
 * Override outbound webhook URL/events for a shop. Audited.
 */
router.put(
  '/webhooks/:shopDomain',
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    if (!shopDomain) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }
    const { outbound_webhook_url: url, outbound_webhook_events: events } = req.body || {};
    const webhookUrl = url !== undefined && url !== null ? String(url).trim() : null;
    const webhookEvents =
      events !== undefined && Array.isArray(events) && events.length > 0
        ? events
        : ['test_complete', 'significance'];
    if (webhookUrl) {
      try {
        new URL(webhookUrl);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid webhook URL' });
      }
    }
    await query(
      `INSERT INTO shop_settings (shop_domain, outbound_webhook_url, outbound_webhook_events, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (shop_domain)
       DO UPDATE SET
         outbound_webhook_url = EXCLUDED.outbound_webhook_url,
         outbound_webhook_events = EXCLUDED.outbound_webhook_events,
         updated_at = NOW()`,
      [shopDomain, webhookUrl || null, JSON.stringify(webhookEvents)]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'webhook_config',
      entityId: shopDomain,
      action: 'override',
      changes: { urlSet: !!webhookUrl, events: webhookEvents },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { updated: true });
  })
);

/**
 * GET /api/admin/shop-settings-overrides
 * List shop domains that have at least one admin override set. Optional shop_domain filter.
 */
router.get(
  '/shop-settings-overrides',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain } = req.query;
    let sql = `
      SELECT shop_domain,
             overridden_by_admin_min_sample_size, overridden_by_admin_confidence_level,
             overridden_by_admin_auto_stop_enabled, overridden_by_admin_webhook_url,
             overridden_by_admin_webhook_events, updated_at
      FROM shop_settings
      WHERE (overridden_by_admin_min_sample_size IS NOT NULL
         OR overridden_by_admin_confidence_level IS NOT NULL
         OR overridden_by_admin_auto_stop_enabled IS NOT NULL
         OR overridden_by_admin_webhook_url IS NOT NULL
         OR overridden_by_admin_webhook_events IS NOT NULL)
    `;
    const params = [];
    if (shopDomain && String(shopDomain).trim()) {
      sql += ' AND shop_domain = $1';
      params.push(String(shopDomain).trim().toLowerCase());
    }
    sql += ' ORDER BY shop_domain';
    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      shopDomain: r.shop_domain,
      overrides: {
        minSampleSize: r.overridden_by_admin_min_sample_size,
        confidenceLevel:
          r.overridden_by_admin_confidence_level !== null &&
          r.overridden_by_admin_confidence_level !== undefined
            ? parseFloat(r.overridden_by_admin_confidence_level)
            : null,
        autoStopEnabled: r.overridden_by_admin_auto_stop_enabled,
        outboundWebhookUrl: r.overridden_by_admin_webhook_url,
        outboundWebhookEvents: r.overridden_by_admin_webhook_events,
      },
      updatedAt: r.updated_at,
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { overrides: list, total: list.length });
  })
);

/**
 * PUT /api/admin/shop-settings-overrides/:shopDomain
 * Set or clear admin overrides for a shop. Body: min_sample_size?, confidence_level?, auto_stop_enabled?, outbound_webhook_url?, outbound_webhook_events?. Omit or null = clear that override.
 */
router.put(
  '/shop-settings-overrides/:shopDomain',
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    if (!shopDomain) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }
    const body = req.body || {};
    const minSampleSize =
      body.min_sample_size !== undefined && body.min_sample_size !== null
        ? Math.max(
            SETTINGS_BOUNDS.MIN_SAMPLE_SIZE,
            Math.min(
              SETTINGS_BOUNDS.MAX_SAMPLE_SIZE,
              parseInt(body.min_sample_size, 10) || SETTINGS_BOUNDS.DEFAULT_MIN_SAMPLE_SIZE
            )
          )
        : null;
    const confidenceLevel =
      body.confidence_level !== undefined && body.confidence_level !== null
        ? Math.max(
            SETTINGS_BOUNDS.CONFIDENCE_LEVEL_MIN,
            Math.min(
              SETTINGS_BOUNDS.CONFIDENCE_LEVEL_MAX,
              parseFloat(body.confidence_level) || SETTINGS_BOUNDS.DEFAULT_CONFIDENCE_LEVEL
            )
          )
        : null;
    const autoStopEnabled =
      body.auto_stop_enabled !== undefined
        ? body.auto_stop_enabled === true || body.auto_stop_enabled === 'true'
        : null;
    const webhookUrl =
      body.outbound_webhook_url !== undefined
        ? body.outbound_webhook_url === null ||
          body.outbound_webhook_url === undefined ||
          body.outbound_webhook_url === ''
          ? null
          : String(body.outbound_webhook_url).trim()
        : null;
    const webhookEvents =
      body.outbound_webhook_events !== undefined
        ? Array.isArray(body.outbound_webhook_events) && body.outbound_webhook_events.length > 0
          ? body.outbound_webhook_events
          : null
        : null;
    if (webhookUrl !== null && webhookUrl !== '') {
      try {
        new URL(webhookUrl);
      } catch {
        return res.status(400).json({ success: false, error: 'Invalid webhook URL' });
      }
    }
    await query(
      `INSERT INTO shop_settings (shop_domain, overridden_by_admin_min_sample_size,
        overridden_by_admin_confidence_level, overridden_by_admin_auto_stop_enabled,
        overridden_by_admin_webhook_url, overridden_by_admin_webhook_events, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (shop_domain) DO UPDATE SET
         overridden_by_admin_min_sample_size = EXCLUDED.overridden_by_admin_min_sample_size,
         overridden_by_admin_confidence_level = EXCLUDED.overridden_by_admin_confidence_level,
         overridden_by_admin_auto_stop_enabled = EXCLUDED.overridden_by_admin_auto_stop_enabled,
         overridden_by_admin_webhook_url = EXCLUDED.overridden_by_admin_webhook_url,
         overridden_by_admin_webhook_events = EXCLUDED.overridden_by_admin_webhook_events,
         updated_at = NOW()`,
      [
        shopDomain,
        minSampleSize,
        confidenceLevel,
        autoStopEnabled,
        webhookUrl,
        webhookEvents ? JSON.stringify(webhookEvents) : null,
      ]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'shop_settings_override',
      entityId: shopDomain,
      action: 'set',
      changes: {
        minSampleSize: minSampleSize !== null && minSampleSize !== undefined,
        confidenceLevel: confidenceLevel !== null && confidenceLevel !== undefined,
        autoStopEnabled: autoStopEnabled !== null && autoStopEnabled !== undefined,
        webhookUrl: webhookUrl !== null && webhookUrl !== undefined,
        webhookEvents: webhookEvents !== null && webhookEvents !== undefined,
      },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { updated: true });
  })
);

/**
 * GET /api/admin/rate-limit-overrides
 * List rate limit overrides (key_value_store keys with prefix rate_limit.)
 */
router.get(
  '/rate-limit-overrides',
  asyncHandler(async (req, res) => {
    const result = await query(
      'SELECT key, value, updated_at FROM key_value_store WHERE key LIKE $1 ORDER BY key',
      ['rate_limit.%']
    );
    const list = result.rows.map(r => {
      const domain = r.key.replace(/^rate_limit\./, '');
      let payload = {};
      if (r.value) {
        try {
          payload = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
        } catch {
          payload = {};
        }
      }
      return {
        shopDomain: domain,
        trackMax:
          payload.track_max !== null && payload.track_max !== undefined ? payload.track_max : null,
        apiMax: payload.api_max !== null && payload.api_max !== undefined ? payload.api_max : null,
        updatedAt: r.updated_at,
      };
    });
    return sendSuccess(res, HTTP_STATUS.OK, { overrides: list, total: list.length });
  })
);

/**
 * PUT /api/admin/rate-limit-overrides/:shopDomain
 * Set rate limit overrides for a domain. Body: { track_max?, api_max? }. Null or omit = use default.
 */
router.put(
  '/rate-limit-overrides/:shopDomain',
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    if (!shopDomain) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }
    const key = `rate_limit.${shopDomain}`;
    const body = req.body || {};
    const trackMax =
      body.track_max !== undefined && body.track_max !== null
        ? Math.max(1, parseInt(body.track_max, 10) || 2000)
        : null;
    const apiMax =
      body.api_max !== undefined && body.api_max !== null
        ? Math.max(1, parseInt(body.api_max, 10) || 100)
        : null;
    const value = JSON.stringify({
      ...(trackMax !== null && trackMax !== undefined && { track_max: trackMax }),
      ...(apiMax !== null && apiMax !== undefined && { api_max: apiMax }),
    });
    await query(
      `INSERT INTO key_value_store (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'rate_limit_override',
      entityId: shopDomain,
      action: 'set',
      changes: {
        trackMax: trackMax !== null && trackMax !== undefined,
        apiMax: apiMax !== null && apiMax !== undefined,
      },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { updated: true });
  })
);

/**
 * GET /api/admin/shop-sessions
 * List Shopify shop sessions (shop_domain, installed_at, scope). Optional shop_domain filter.
 */
router.get(
  '/shop-sessions',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain } = req.query;
    let sql = `
      SELECT shop_domain, scope, installed_at, updated_at
      FROM shop_sessions
      WHERE 1=1
    `;
    const params = [];
    if (shopDomain && String(shopDomain).trim()) {
      sql += ' AND shop_domain = $1';
      params.push(String(shopDomain).trim().toLowerCase());
    }
    sql += ' ORDER BY updated_at DESC';
    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      shopDomain: r.shop_domain,
      scope: r.scope || null,
      installedAt: r.installed_at,
      updatedAt: r.updated_at,
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { sessions: list, total: list.length });
  })
);

/**
 * DELETE /api/admin/shop-sessions/:shopDomain
 * Revoke shop session (force re-auth on next request). Audited.
 */
router.delete(
  '/shop-sessions/:shopDomain',
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    if (!shopDomain) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }
    const { deleteShopSession } = require('../models/shopSession');
    const deleted = await deleteShopSession(shopDomain);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'shop_session',
      entityId: shopDomain,
      action: 'revoke',
      changes: {},
    });
    return sendSuccess(res, HTTP_STATUS.OK, { deleted: true });
  })
);

/**
 * GET /api/admin/conflicts
 * Per-domain overlapping running tests (same target). Optional shop_domain filter.
 */
router.get(
  '/conflicts',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain } = req.query;
    const conflictDetectionService = require('../services/conflictDetectionService');
    const { getTestsByShop } = require('../models/test');
    const domains =
      shopDomain && String(shopDomain).trim()
        ? [String(shopDomain).trim().toLowerCase()]
        : (
            await query('SELECT DISTINCT shop_domain FROM tests WHERE status = $1', ['running'])
          ).rows.map(r => r.shop_domain);
    const conflicts = [];
    for (const domain of domains) {
      const running = await getTestsByShop(domain, 'running');
      for (let i = 0; i < running.length; i++) {
        for (let j = i + 1; j < running.length; j++) {
          const t1 = running[i];
          const t2 = running[j];
          if (conflictDetectionService.targetsOverlap(t1, t2)) {
            conflicts.push({
              shopDomain: domain,
              testId1: t1.id,
              testName1: t1.name,
              testId2: t2.id,
              testName2: t2.name,
              targetType: t1.target_type || 'any',
              targetId: t1.target_id || '',
            });
          }
        }
      }
    }
    return sendSuccess(res, HTTP_STATUS.OK, { conflicts, total: conflicts.length });
  })
);

/**
 * GET /api/admin/test-health
 * List tests with health score. Filters: shop_domain, status, health_level (poor|fair|good|excellent).
 */
router.get(
  '/test-health',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain, status, health_level: healthLevel, limit = 100 } = req.query;
    let sql = `
      SELECT id, shop_domain, name, status, started_at, variants, target_type, target_id
      FROM tests
      WHERE status IN ('running', 'stopped', 'completed')
      AND 1=1
    `;
    const params = [];
    let idx = 1;
    if (shopDomain && String(shopDomain).trim()) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(String(shopDomain).trim().toLowerCase());
      idx++;
    }
    if (status && String(status).trim()) {
      sql += ` AND status = $${idx}`;
      params.push(String(status).trim());
      idx++;
    }
    sql += ` ORDER BY updated_at DESC LIMIT $${idx}`;
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    params.push(limitNum);
    const result = await query(sql, params);
    const testHealthService = require('../services/testHealthService');
    const list = [];
    for (const r of result.rows) {
      const test = {
        id: r.id,
        shop_domain: r.shop_domain,
        name: r.name,
        status: r.status,
        started_at: r.started_at,
        variants: r.variants,
        target_type: r.target_type,
        target_id: r.target_id,
      };
      const health = testHealthService.calculateHealthScore(test);
      if (healthLevel && String(healthLevel).trim()) {
        if (health.healthLevel !== String(healthLevel).trim().toLowerCase()) {
          continue;
        }
      }
      list.push({
        id: test.id,
        shopDomain: test.shop_domain,
        name: test.name,
        status: test.status,
        startedAt: test.started_at,
        healthScore: health.score,
        healthLevel: health.healthLevel,
        healthColor: health.healthColor,
        issues: health.issues,
        totalVisitors: health.totalVisitors,
      });
    }
    return sendSuccess(res, HTTP_STATUS.OK, { tests: list, total: list.length });
  })
);

/**
 * GET /api/admin/significance-alerts
 * List significance alerts. Optional shop_domain filter.
 */
router.get(
  '/significance-alerts',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain, limit = 100 } = req.query;
    let sql = `
      SELECT test_id, shop_domain, winner_variant_id, winner_variant_name, lift, p_value, alerted_at
      FROM significance_alerts
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shopDomain && String(shopDomain).trim()) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(String(shopDomain).trim().toLowerCase());
      idx++;
    }
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    sql += ` ORDER BY alerted_at DESC LIMIT $${idx}`;
    params.push(limitNum);
    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      testId: r.test_id,
      shopDomain: r.shop_domain,
      winnerVariantId: r.winner_variant_id,
      winnerVariantName: r.winner_variant_name,
      lift: r.lift !== null && r.lift !== undefined ? parseFloat(r.lift) : null,
      pValue: r.p_value !== null && r.p_value !== undefined ? parseFloat(r.p_value) : null,
      alertedAt: r.alerted_at,
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { alerts: list, total: list.length });
  })
);

/**
 * DELETE /api/admin/significance-alerts
 * Reset alert for a test (delete row so notification can re-trigger). Body: { test_id, shop_domain }.
 */
router.delete(
  '/significance-alerts',
  asyncHandler(async (req, res) => {
    const { test_id: testId, shop_domain: shopDomain } = req.body || req.query;
    if (!testId || !validators.isValidUUID(testId)) {
      return res.status(400).json({ success: false, error: 'Valid test_id required' });
    }
    const domain =
      shopDomain && String(shopDomain).trim() ? String(shopDomain).trim().toLowerCase() : null;
    if (!domain) {
      return res.status(400).json({ success: false, error: 'shop_domain required' });
    }
    const result = await query(
      'DELETE FROM significance_alerts WHERE test_id = $1 AND shop_domain = $2 RETURNING test_id',
      [testId, domain]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'significance_alert',
      entityId: testId,
      action: 'reset',
      changes: { shopDomain: domain },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { reset: true });
  })
);

/**
 * GET /api/admin/event-catalog
 * Per-domain distinct event_type/event_name with counts (data discovery).
 */
router.get(
  '/event-catalog',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain, limit = 200 } = req.query;
    let sql = `
      SELECT shop_domain, event_type, COALESCE(event_name, '(none)') AS event_name, COUNT(*)::bigint AS count
      FROM events
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shopDomain && String(shopDomain).trim()) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(String(shopDomain).trim().toLowerCase());
      idx++;
    }
    const limitNum = Math.min(parseInt(limit, 10) || 200, 1000);
    sql += ` GROUP BY shop_domain, event_type, event_name ORDER BY count DESC LIMIT $${idx}`;
    params.push(limitNum);
    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      shopDomain: r.shop_domain,
      eventType: r.event_type,
      eventName: r.event_name === '(none)' ? null : r.event_name,
      count: parseInt(r.count, 10),
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { events: list, total: list.length });
  })
);

/**
 * GET /api/admin/client-errors
 * List last N storefront client errors (from POST /api/track/client-error). Optional: shop_domain, limit.
 */
router.get(
  '/client-errors',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain, limit = 100 } = req.query;
    let sql = `
      SELECT id, shop_domain, error_message, stack, component_stack, url, metadata, created_at
      FROM client_errors
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shopDomain && String(shopDomain).trim()) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(String(shopDomain).trim().toLowerCase());
      idx++;
    }
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limitNum);
    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      id: r.id,
      shopDomain: r.shop_domain,
      errorMessage: r.error_message,
      stack: r.stack,
      componentStack: r.component_stack,
      url: r.url,
      metadata: r.metadata,
      createdAt: r.created_at,
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { clientErrors: list, total: list.length });
  })
);

/**
 * DELETE /api/admin/client-errors/:id
 * Dismiss/acknowledge a client error. Audited.
 */
router.delete(
  '/client-errors/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !validators.isValidUUID(id)) {
      return res.status(400).json({ success: false, error: 'Invalid client error ID' });
    }
    const result = await query(
      'DELETE FROM client_errors WHERE id = $1 RETURNING id, shop_domain',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client error not found' });
    }
    const row = result.rows[0];
    await auditLogService.logAdminAction(req, {
      entityType: 'client_error',
      entityId: id,
      action: 'dismiss',
      changes: { shopDomain: row.shop_domain },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { deleted: true, id });
  })
);

/**
 * GET /api/admin/config/legal
 * Terms and Privacy URLs from key_value_store (config.terms_url, config.privacy_url). Public-ish for app footer.
 */
router.get(
  '/config/legal',
  asyncHandler(async (_req, res) => {
    const kv = await query('SELECT key, value FROM key_value_store WHERE key IN ($1, $2)', [
      KV_KEYS.TERMS_URL,
      KV_KEYS.PRIVACY_URL,
    ]);
    const termsUrl = kv.rows.find(r => r.key === KV_KEYS.TERMS_URL)?.value || null;
    const privacyUrl = kv.rows.find(r => r.key === KV_KEYS.PRIVACY_URL)?.value || null;
    return sendSuccess(res, HTTP_STATUS.OK, {
      termsUrl:
        termsUrl !== null && termsUrl !== undefined && String(termsUrl).trim() !== ''
          ? String(termsUrl).trim()
          : null,
      privacyUrl:
        privacyUrl !== null && privacyUrl !== undefined && String(privacyUrl).trim() !== ''
          ? String(privacyUrl).trim()
          : null,
    });
  })
);

/**
 * PUT /api/admin/config/legal
 * Set Terms and Privacy URLs (key_value_store). Body: { terms_url?, privacy_url? }.
 */
router.put(
  '/config/legal',
  asyncHandler(async (req, res) => {
    const { terms_url: termsUrl, privacy_url: privacyUrl } = req.body || {};
    if (termsUrl !== undefined) {
      const val = termsUrl === null || termsUrl === '' ? '' : String(termsUrl).trim();
      await query(
        `INSERT INTO key_value_store (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [KV_KEYS.TERMS_URL, val]
      );
    }
    if (privacyUrl !== undefined) {
      const val = privacyUrl === null || privacyUrl === '' ? '' : String(privacyUrl).trim();
      await query(
        `INSERT INTO key_value_store (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [KV_KEYS.PRIVACY_URL, val]
      );
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'config',
      entityId: 'legal',
      action: 'set',
      changes: { terms_url: termsUrl !== undefined, privacy_url: privacyUrl !== undefined },
    });
    const kv = await query('SELECT key, value FROM key_value_store WHERE key IN ($1, $2)', [
      KV_KEYS.TERMS_URL,
      KV_KEYS.PRIVACY_URL,
    ]);
    const t = kv.rows.find(r => r.key === KV_KEYS.TERMS_URL)?.value || null;
    const p = kv.rows.find(r => r.key === KV_KEYS.PRIVACY_URL)?.value || null;
    return sendSuccess(res, HTTP_STATUS.OK, {
      termsUrl: t !== null && t !== undefined && String(t).trim() !== '' ? String(t).trim() : null,
      privacyUrl:
        p !== null && p !== undefined && String(p).trim() !== '' ? String(p).trim() : null,
    });
  })
);

/**
 * GET /api/admin/consent-script
 * Read consent_required and script_version from key_value_store (global or per-domain).
 * Keys: consent_script.consent_required, consent_script.script_version (global);
 *       consent_script.<domain>.consent_required, consent_script.<domain>.script_version.
 */
router.get(
  '/consent-script',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain } = req.query;
    const kv = await query(
      "SELECT key, value FROM key_value_store WHERE key LIKE 'consent_script%' ORDER BY key"
    );
    const out = {};
    for (const r of kv.rows) {
      const key = r.key;
      const scope =
        key === 'consent_script.consent_required' || key === 'consent_script.script_version'
          ? 'global'
          : key
              .replace(/^consent_script\./, '')
              .replace(/\.(consent_required|script_version)$/, '') || 'global';
      if (!out[scope]) {
        out[scope] = { consentRequired: null, scriptVersion: null };
      }
      if (key.endsWith('consent_required')) {
        out[scope].consentRequired = r.value;
      } else if (key.endsWith('script_version')) {
        out[scope].scriptVersion = r.value;
      }
    }
    if (shopDomain && String(shopDomain).trim()) {
      const domain = String(shopDomain).trim().toLowerCase();
      return sendSuccess(res, HTTP_STATUS.OK, {
        config: out[domain] || { consentRequired: null, scriptVersion: null },
        scope: domain,
      });
    }
    return sendSuccess(res, HTTP_STATUS.OK, { config: out });
  })
);

/**
 * PUT /api/admin/consent-script
 * Set consent_required or script_version (global key or per-domain). Body: { consent_required?, script_version?, shop_domain? }.
 */
router.put(
  '/consent-script',
  asyncHandler(async (req, res) => {
    const {
      consent_required: consentRequired,
      script_version: scriptVersion,
      shop_domain: shopDomain,
    } = req.body || {};
    const baseKey =
      shopDomain && String(shopDomain).trim()
        ? `consent_script.${String(shopDomain).trim().toLowerCase()}`
        : 'consent_script';
    const updates = [];
    if (consentRequired !== undefined) {
      await query(
        `INSERT INTO key_value_store (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [`${baseKey}.consent_required`, String(consentRequired)]
      );
      updates.push('consent_required');
    }
    if (scriptVersion !== undefined) {
      await query(
        `INSERT INTO key_value_store (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [`${baseKey}.script_version`, String(scriptVersion)]
      );
      updates.push('script_version');
    }
    if (updates.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'Provide consent_required and/or script_version' });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'consent_script',
      entityId: baseKey,
      action: 'set',
      changes: { updates },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { updated: true });
  })
);

/**
 * GET /api/admin/aggregation
 * Last run of daily analytics aggregation (key: analytics_aggregation.last_run).
 */
router.get(
  '/aggregation',
  asyncHandler(async (_req, res) => {
    const kv = await query(
      "SELECT key, value FROM key_value_store WHERE key = 'analytics_aggregation.last_run'"
    );
    const lastRun = kv.rows[0]?.value || null;
    return sendSuccess(res, HTTP_STATUS.OK, {
      lastRun: lastRun ? new Date(lastRun).toISOString() : null,
    });
  })
);

/**
 * POST /api/admin/aggregation/trigger
 * Run daily analytics aggregation (default: yesterday). Body: { date? } (YYYY-MM-DD).
 */
router.post(
  '/aggregation/trigger',
  asyncHandler(async (req, res) => {
    const { date: dateStr } = req.body || {};
    let targetDate = null;
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      targetDate = new Date(dateStr + 'T12:00:00Z');
    }
    await timeSeriesService.aggregateDailyAnalytics(targetDate);
    const now = new Date().toISOString();
    await query(
      `INSERT INTO key_value_store (key, value, updated_at) VALUES ('analytics_aggregation.last_run', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [now]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'aggregation',
      entityId: 'daily',
      action: 'trigger',
      changes: { date: targetDate ? dateStr : 'yesterday' },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { triggered: true, lastRun: now });
  })
);

/**
 * GET /api/admin/targeting-presets
 * List targeting presets (optional shop_domain filter)
 */
router.get(
  '/targeting-presets',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain, limit = 100 } = req.query;
    let sql = `
      SELECT id, shop_domain, name, segments, goal, variants, created_at
      FROM targeting_presets
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shopDomain && String(shopDomain).trim()) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(String(shopDomain).trim().toLowerCase());
      idx++;
    }
    const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limitNum);

    const result = await query(sql, params);
    const presets = result.rows.map(r => ({
      id: r.id,
      shopDomain: r.shop_domain,
      name: r.name,
      segments: r.segments,
      goal: r.goal,
      variants: r.variants,
      createdAt: r.created_at,
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { presets, total: presets.length });
  })
);

/**
 * DELETE /api/admin/targeting-presets/:id
 * Delete a targeting preset by id. Audited.
 */
router.delete(
  '/targeting-presets/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id || !validators.isValidUUID(id)) {
      return res.status(400).json({ success: false, error: 'Invalid preset ID' });
    }
    const getRow = await query(
      'SELECT id, shop_domain, name FROM targeting_presets WHERE id = $1',
      [id]
    );
    const row = getRow.rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: 'Preset not found' });
    }
    await query('DELETE FROM targeting_presets WHERE id = $1', [id]);
    await auditLogService.logAdminAction(req, {
      entityType: 'targeting_preset',
      entityId: id,
      action: 'delete',
      changes: { shopDomain: row.shop_domain, name: row.name },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { deleted: true });
  })
);

/**
 * GET /api/admin/kv
 * List key-value store keys (optional prefix, e.g. prefix=flag.)
 */
router.get(
  '/kv',
  asyncHandler(async (req, res) => {
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix.trim() : '';
    const result = await query('SELECT key, value, updated_at FROM key_value_store ORDER BY key');
    let rows = result.rows;
    if (prefix) {
      rows = rows.filter(r => r.key.startsWith(prefix));
    }
    const keys = rows.map(r => ({
      key: r.key,
      valuePreview:
        r.value !== null && r.value !== undefined && String(r.value).length > 100
          ? String(r.value).substring(0, 100) + '…'
          : r.value,
      updatedAt: r.updated_at,
    }));
    return sendSuccess(res, HTTP_STATUS.OK, { keys, total: keys.length });
  })
);

/**
 * GET /api/admin/kv/:key
 * Get one key-value store entry (key is raw, use encodeURIComponent for keys with special chars)
 */
router.get(
  '/kv/:key',
  asyncHandler(async (req, res) => {
    const key = decodeURIComponent(req.params.key);
    if (!key || key.length > 255) {
      return res.status(400).json({ success: false, error: 'Invalid key' });
    }
    const result = await query(
      'SELECT key, value, updated_at FROM key_value_store WHERE key = $1',
      [key]
    );
    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }
    return sendSuccess(res, HTTP_STATUS.OK, {
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
    });
  })
);

/**
 * PUT /api/admin/kv/:key
 * Set key-value store entry (body: { value }). Audited.
 */
router.put(
  '/kv/:key',
  asyncHandler(async (req, res) => {
    let key = decodeURIComponent(req.params.key);
    if (!key || key.length > 255) {
      return res.status(400).json({ success: false, error: 'Invalid key' });
    }
    const { BLOCK_LIST_PREFIX, normalizeDomainForBlockList } = require('../utils/maintenanceMode');
    if (key.startsWith(BLOCK_LIST_PREFIX)) {
      const suffix = key.slice(BLOCK_LIST_PREFIX.length);
      const normalized = normalizeDomainForBlockList(suffix) || suffix;
      key = BLOCK_LIST_PREFIX + normalized;
    }
    const value =
      req.body?.value !== null && req.body?.value !== undefined ? String(req.body.value) : '';
    if (Buffer.byteLength(value, 'utf8') > KV_VALUE_MAX_BYTES) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: `Value must be at most ${Math.round(KV_VALUE_MAX_BYTES / 1024)}KB`,
      });
    }
    await query(
      `INSERT INTO key_value_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'key_value',
      entityId: key,
      action: 'set',
      changes: { key, valueLength: value.length },
    });
    const result = await query(
      'SELECT key, value, updated_at FROM key_value_store WHERE key = $1',
      [key]
    );
    const row = result.rows[0];
    return sendSuccess(res, HTTP_STATUS.OK, {
      key: row.key,
      value: row.value,
      updatedAt: row.updated_at,
    });
  })
);

/**
 * DELETE /api/admin/kv/:key
 * Delete key-value store entry. Audited.
 */
router.delete(
  '/kv/:key',
  asyncHandler(async (req, res) => {
    const key = decodeURIComponent(req.params.key);
    if (!key || key.length > 255) {
      return res.status(400).json({ success: false, error: 'Invalid key' });
    }
    const result = await query('DELETE FROM key_value_store WHERE key = $1 RETURNING key', [key]);
    if (result.rowCount > 0) {
      await auditLogService.logAdminAction(req, {
        entityType: 'key_value',
        entityId: key,
        action: 'delete',
        changes: { key },
      });
    }
    return sendSuccess(res, HTTP_STATUS.OK, { deleted: result.rowCount > 0, key });
  })
);

/**
 * GET /api/admin/mail-processes
 * List all email sending processes with enabled state and optional template overrides.
 */
router.get(
  '/mail-processes',
  asyncHandler(async (req, res) => {
    const list = await mailProcessService.listProcesses();
    return sendSuccess(res, HTTP_STATUS.OK, { processes: list });
  })
);

/**
 * GET /api/admin/mail-processes/:key/default
 * Get default template (subject, bodyHtml, bodyText) for "Load default" in editor.
 */
router.get(
  '/mail-processes/:key/default',
  asyncHandler((req, res) => {
    const key = req.params.key;
    if (!mailProcessService.getDefinitions()[key]) {
      return res.status(404).json({ success: false, error: 'Unknown mail process' });
    }
    const defaultTemplate = mailProcessService.getDefaultTemplate(key);
    return sendSuccess(res, HTTP_STATUS.OK, { defaultTemplate });
  })
);

/**
 * GET /api/admin/mail-processes/:key
 * Get one mail process config (for editing templates).
 */
router.get(
  '/mail-processes/:key',
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!mailProcessService.getDefinitions()[key]) {
      return res.status(404).json({ success: false, error: 'Unknown mail process' });
    }
    const config = await mailProcessService.getConfig(key);
    return sendSuccess(res, HTTP_STATUS.OK, { process: config });
  })
);

/**
 * PUT /api/admin/mail-processes/:key
 * Update mail process: enabled and/or template (subject, bodyHtml, bodyText). Body: { enabled?, subject?, bodyHtml?, bodyText? }. Audited.
 */
router.put(
  '/mail-processes/:key',
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    if (!mailProcessService.getDefinitions()[key]) {
      return res.status(404).json({ success: false, error: 'Unknown mail process' });
    }
    const { enabled, subject, bodyHtml, bodyText } = req.body || {};
    const updates = {};
    if (enabled !== undefined) {
      updates.enabled = Boolean(enabled);
    }
    if (subject !== undefined) {
      updates.subject = String(subject);
    }
    if (bodyHtml !== undefined) {
      updates.bodyHtml = String(bodyHtml);
    }
    if (bodyText !== undefined) {
      updates.bodyText = String(bodyText);
    }
    let updated;
    try {
      updated = await mailProcessService.setConfig(key, updates);
    } catch (err) {
      if (
        err.message &&
        (err.message.includes('must be at most') || err.message.includes('at most'))
      ) {
        return res.status(400).json({ success: false, error: err.message });
      }
      throw err;
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'mail_process',
      entityId: key,
      action: 'update',
      changes: { key, enabled: updated.enabled },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { process: updated });
  })
);

const { getMaintenanceMode, MAINTENANCE_KEY } = require('../utils/maintenanceMode');
const MAINTENANCE_MESSAGE_KEY = KV_KEYS.MAINTENANCE_MESSAGE;
const ANNOUNCEMENT_BANNER_KEY = KV_KEYS.ANNOUNCEMENT_BANNER;

/**
 * GET /api/admin/maintenance
 * Current maintenance mode (value: "" | "global" | domain) and optional message.
 */
router.get(
  '/maintenance',
  asyncHandler(async (req, res) => {
    const value = await getMaintenanceMode();
    const msgResult = await query('SELECT value FROM key_value_store WHERE key = $1', [
      MAINTENANCE_MESSAGE_KEY,
    ]);
    const message =
      msgResult.rows[0]?.value !== null && msgResult.rows[0]?.value !== undefined
        ? String(msgResult.rows[0].value).trim()
        : '';
    return sendSuccess(res, HTTP_STATUS.OK, {
      value: value || '',
      message: message || '',
    });
  })
);

/**
 * PUT /api/admin/maintenance
 * Set maintenance mode and optional message. Body: { value: "" | "global" | domain, message?: string }. Audited.
 */
router.put(
  '/maintenance',
  asyncHandler(async (req, res) => {
    let value = req.body?.value;
    if (value !== null && value !== undefined) {
      value = String(value).trim();
    } else {
      value = '';
    }
    let message = req.body?.message;
    if (message !== null && message !== undefined) {
      message = String(message).trim();
    } else {
      message = '';
    }
    await query(
      `INSERT INTO key_value_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [MAINTENANCE_KEY, value]
    );
    await query(
      `INSERT INTO key_value_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [MAINTENANCE_MESSAGE_KEY, message]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'maintenance',
      entityId: 'config',
      action: 'set',
      changes: { value: value || '(off)', messageLength: message.length },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { value: value || '', message: message || '' });
  })
);

/**
 * GET /api/admin/announcement-banner
 * Current announcement banner text (shown in app when set; dismissible).
 */
router.get(
  '/announcement-banner',
  asyncHandler(async (req, res) => {
    const result = await query('SELECT value FROM key_value_store WHERE key = $1', [
      ANNOUNCEMENT_BANNER_KEY,
    ]);
    const value =
      result.rows[0]?.value !== null && result.rows[0]?.value !== undefined
        ? String(result.rows[0].value).trim()
        : '';
    return sendSuccess(res, HTTP_STATUS.OK, { value });
  })
);

/**
 * PUT /api/admin/announcement-banner
 * Set announcement banner. Body: { value: string }. Audited.
 */
router.put(
  '/announcement-banner',
  asyncHandler(async (req, res) => {
    const value =
      req.body?.value !== null && req.body?.value !== undefined
        ? String(req.body.value).trim()
        : '';
    await query(
      `INSERT INTO key_value_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [ANNOUNCEMENT_BANNER_KEY, value]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'announcement_banner',
      entityId: 'config',
      action: 'set',
      changes: { valueLength: value.length },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { value });
  })
);

/**
 * GET /api/admin/experimentation-settings
 * Read experimentation policy knobs.
 * Query: shop_domain (optional) for per-domain override lookup.
 */
router.get(
  '/experimentation-settings',
  asyncHandler(async (req, res) => {
    const rawDomain =
      req.query?.shop_domain !== null && req.query?.shop_domain !== undefined
        ? String(req.query.shop_domain)
        : '';
    const normalizedDomain = normalizeDomain(rawDomain);
    const globalHoldoutPercent = await getGlobalHoldoutPercent(normalizedDomain || null);
    return sendSuccess(res, HTTP_STATUS.OK, {
      shop_domain: normalizedDomain || null,
      global_holdout_percent: globalHoldoutPercent,
    });
  })
);

/**
 * PUT /api/admin/experimentation-settings
 * Update experimentation policy knobs.
 * Body: { global_holdout_percent, shop_domain? }
 */
router.put(
  '/experimentation-settings',
  asyncHandler(async (req, res) => {
    const rawPercent = req.body?.global_holdout_percent;
    if (rawPercent === undefined) {
      return res.status(400).json({
        success: false,
        error: 'global_holdout_percent is required',
      });
    }
    let normalizedPercent = 0;
    try {
      normalizedPercent = normalizeGlobalHoldoutPercent(rawPercent);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: err?.message || 'Invalid global_holdout_percent',
      });
    }
    const rawDomain =
      req.body?.shop_domain !== null && req.body?.shop_domain !== undefined
        ? String(req.body.shop_domain)
        : '';
    const normalizedDomain = normalizeDomain(rawDomain);
    const savedPercent = await setGlobalHoldoutPercent(normalizedPercent, normalizedDomain || null);
    await auditLogService.logAdminAction(req, {
      entityType: 'experimentation_settings',
      entityId: normalizedDomain || 'global',
      action: 'update',
      changes: {
        global_holdout_percent: savedPercent,
      },
    });
    return sendSuccess(res, HTTP_STATUS.OK, {
      shop_domain: normalizedDomain || null,
      global_holdout_percent: savedPercent,
    });
  })
);

const QUEUE_NAMES = ['scheduled-tests', 'archive-old-tests', 'product-sync'];

function getQueueByName(name) {
  const { scheduledTestsQueue, archiveQueue, productSyncQueue } = require('../jobs/queue');
  const map = {
    'scheduled-tests': scheduledTestsQueue,
    'archive-old-tests': archiveQueue,
    'product-sync': productSyncQueue,
  };
  return map[name] || null;
}

/**
 * GET /api/admin/jobs
 * List Bull queue counts (pending, active, completed, failed) per queue. Read-only.
 */
router.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    const queues = QUEUE_NAMES.map(name => ({ name, queue: getQueueByName(name) }));
    const jobs = [];
    for (const { name, queue } of queues) {
      if (!queue) {
        jobs.push({
          name,
          status: 'unavailable',
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
        });
        continue;
      }
      try {
        const counts = await queue.getJobCounts();
        jobs.push({
          name,
          status: 'ok',
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
        });
      } catch (err) {
        jobs.push({
          name,
          status: 'error',
          error: err?.message || 'Unknown error',
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
        });
      }
    }
    return sendSuccess(res, HTTP_STATUS.OK, { jobs });
  })
);

/**
 * POST /api/admin/jobs/:queueName/retry-failed
 * Retry up to N failed jobs in the queue. Body: { limit } (default 50).
 */
router.post(
  '/jobs/:queueName/retry-failed',
  asyncHandler(async (req, res) => {
    const queueName = req.params.queueName;
    if (!QUEUE_NAMES.includes(queueName)) {
      return res.status(400).json({ success: false, error: 'Invalid queue name' });
    }
    const queue = getQueueByName(queueName);
    if (!queue) {
      return res.status(503).json({ success: false, error: 'Queue unavailable (Redis?)' });
    }
    const limit = Math.min(parseInt(req.body?.limit, 10) || 50, 100);
    const failed = await queue.getFailed(0, limit - 1);
    let retried = 0;
    for (const job of failed) {
      try {
        await job.retry();
        retried++;
      } catch (err) {
        // continue with others
      }
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'job_queue',
      entityId: queueName,
      action: 'retry_failed',
      changes: { retried, totalFailed: failed.length },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { retried, totalFailed: failed.length });
  })
);

/**
 * POST /api/admin/jobs/:queueName/trigger
 * Manually add one job to the queue. Supported: archive-old-tests (runs archive now).
 */
router.post(
  '/jobs/:queueName/trigger',
  asyncHandler(async (req, res) => {
    const queueName = req.params.queueName;
    if (!QUEUE_NAMES.includes(queueName)) {
      return res.status(400).json({ success: false, error: 'Invalid queue name' });
    }
    const queue = getQueueByName(queueName);
    if (!queue) {
      return res.status(503).json({ success: false, error: 'Queue unavailable (Redis?)' });
    }
    if (queueName === 'archive-old-tests') {
      await queue.add({});
      await auditLogService.logAdminAction(req, {
        entityType: 'job_queue',
        entityId: queueName,
        action: 'trigger',
        changes: {},
      });
      return sendSuccess(res, HTTP_STATUS.OK, { triggered: true, message: 'Archive job added' });
    }
    if (queueName === 'scheduled-tests' || queueName === 'product-sync') {
      return res.status(400).json({
        success: false,
        error:
          'Manual trigger not supported for this queue (jobs are test-specific or sync-specific)',
      });
    }
    return res.status(400).json({ success: false, error: 'Trigger not supported' });
  })
);

/**
 * GET /api/admin/promo-links
 * List promo links (optional filters: shop_domain, test_id, limit, offset)
 */
router.get(
  '/promo-links',
  asyncHandler(async (req, res) => {
    const { shop_domain: shopDomain, test_id: testId, limit = 50, offset = 0 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
    let sql = `
      SELECT id, test_id, variant_id, shop_domain, token, name, discount_type, discount_value,
             expires_at, max_uses, uses_count, last_used_at, created_at
      FROM promo_links
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    if (shopDomain && String(shopDomain).trim()) {
      sql += ` AND shop_domain = $${idx}`;
      params.push(String(shopDomain).trim());
      idx++;
    }
    if (testId && validators.isValidUUID(testId)) {
      sql += ` AND test_id = $${idx}`;
      params.push(testId);
      idx++;
    }
    sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(limitNum, offsetNum);
    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      id: r.id,
      testId: r.test_id,
      variantId: r.variant_id,
      shopDomain: r.shop_domain,
      token: r.token,
      name: r.name,
      discountType: r.discount_type,
      discountValue: r.discount_value,
      expiresAt: r.expires_at,
      maxUses: r.max_uses,
      usesCount: r.uses_count,
      lastUsedAt: r.last_used_at,
      createdAt: r.created_at,
    }));
    let countSql = 'SELECT COUNT(*)::int AS c FROM promo_links WHERE 1=1';
    const countParams = [];
    let ci = 1;
    if (shopDomain && String(shopDomain).trim()) {
      countSql += ` AND shop_domain = $${ci}`;
      countParams.push(String(shopDomain).trim());
      ci++;
    }
    if (testId && validators.isValidUUID(testId)) {
      countSql += ` AND test_id = $${ci}`;
      countParams.push(testId);
    }
    const countRes = await query(countSql, countParams);
    const total = countRes.rows[0]?.c ?? 0;
    return sendSuccess(res, HTTP_STATUS.OK, {
      promoLinks: list,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  })
);

/**
 * POST /api/admin/promo-links/revoke
 * Revoke promo links by test_id or shop_domain (body: { test_id } or { shop_domain }). Audited.
 */
router.post(
  '/promo-links/revoke',
  asyncHandler(async (req, res) => {
    const { test_id: testId, shop_domain: shopDomain } = req.body || {};
    if (!testId && !shopDomain) {
      return res.status(400).json({ success: false, error: 'Provide test_id or shop_domain' });
    }
    let sql = 'DELETE FROM promo_links WHERE ';
    const conditions = [];
    const params = [];
    let idx = 1;
    if (testId && validators.isValidUUID(testId)) {
      conditions.push(`test_id = $${idx}`);
      params.push(testId);
      idx++;
    }
    if (shopDomain && String(shopDomain).trim()) {
      conditions.push(`shop_domain = $${idx}`);
      params.push(String(shopDomain).trim());
    }
    if (conditions.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid test_id or shop_domain' });
    }
    sql += conditions.join(' OR ');
    const result = await query(sql, params);
    const deleted = result.rowCount;
    await auditLogService.logAdminAction(req, {
      entityType: 'promo_links',
      entityId: testId || shopDomain || 'bulk',
      action: 'revoke',
      changes: { testId: testId || null, shopDomain: shopDomain || null, deleted },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { revoked: deleted });
  })
);

/**
 * GET /api/admin/usage-export
 * Phase 3: Usage export by domain (visitors, events, conversions, revenue, test count) for date range.
 * Query: start_date (YYYY-MM-DD), end_date (YYYY-MM-DD), format=csv|json (default json).
 */
router.get(
  '/usage-export',
  asyncHandler(async (req, res) => {
    const { start_date: startDate, end_date: endDate, format = 'json' } = req.query;
    let startTs = null;
    let endTs = null;
    if (startDate && String(startDate).trim()) {
      startTs = new Date(String(startDate).trim() + 'T00:00:00Z');
      if (Number.isNaN(startTs.getTime())) {
        startTs = null;
      }
    }
    if (endDate && String(endDate).trim()) {
      endTs = new Date(String(endDate).trim() + 'T23:59:59.999Z');
      if (Number.isNaN(endTs.getTime())) {
        endTs = null;
      }
    }

    const sql = `
      WITH ta_agg AS (
        SELECT shop_domain,
          COUNT(DISTINCT user_id) AS visitors
        FROM test_assignments
        WHERE ($1::timestamp IS NULL OR assigned_at >= $1) AND ($2::timestamp IS NULL OR assigned_at <= $2)
        GROUP BY shop_domain
      ),
      ev_agg AS (
        SELECT shop_domain,
          COUNT(*)::bigint AS events,
          COUNT(*) FILTER (WHERE event_type = 'conversion')::bigint AS conversions,
          COALESCE(SUM(event_value) FILTER (WHERE event_type = 'conversion'), 0)::float AS revenue
        FROM events
        WHERE ($1::timestamp IS NULL OR created_at >= $1) AND ($2::timestamp IS NULL OR created_at <= $2)
        GROUP BY shop_domain
      ),
      t_agg AS (
        SELECT shop_domain, COUNT(*)::int AS test_count FROM tests GROUP BY shop_domain
      ),
      domains AS (
        SELECT domain AS shop_domain FROM tenants
        UNION
        SELECT shop_domain FROM ta_agg
        UNION
        SELECT shop_domain FROM ev_agg
        UNION
        SELECT shop_domain FROM tests
      )
      SELECT d.shop_domain,
        COALESCE(ta.visitors, 0)::bigint AS visitors,
        COALESCE(ev.events, 0)::bigint AS events,
        COALESCE(ev.conversions, 0)::bigint AS conversions,
        COALESCE(ev.revenue, 0)::float AS revenue,
        COALESCE(t.test_count, 0)::int AS test_count
      FROM domains d
      LEFT JOIN ta_agg ta ON ta.shop_domain = d.shop_domain
      LEFT JOIN ev_agg ev ON ev.shop_domain = d.shop_domain
      LEFT JOIN t_agg t ON t.shop_domain = d.shop_domain
      ORDER BY d.shop_domain
    `;
    const result = await query(sql, [startTs, endTs]);
    const rows = result.rows.map(r => ({
      shop_domain: r.shop_domain,
      visitors: parseInt(r.visitors, 10) || 0,
      events: parseInt(r.events, 10) || 0,
      conversions: parseInt(r.conversions, 10) || 0,
      revenue: parseFloat(r.revenue) || 0,
      test_count: parseInt(r.test_count, 10) || 0,
    }));

    if (format === 'csv') {
      const headers = ['shop_domain', 'visitors', 'events', 'conversions', 'revenue', 'test_count'];
      const csv = [
        headers.join(','),
        ...rows.map(row =>
          headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ripx-usage-export.csv"');
      return res.send('\uFEFF' + csv);
    }

    return sendSuccess(res, HTTP_STATUS.OK, {
      usage: rows,
      start_date: startDate || null,
      end_date: endDate || null,
    });
  })
);

// --- Admin support tickets (list, update status, bulk) ---
const SUPPORT_TICKET_STATUSES = ['open', 'closed', 'resolved'];
const SUPPORT_TICKETS_LIST_LIMIT = 200;
const SUPPORT_ANALYTICS_DEFAULT_DAYS = 30;
const SUPPORT_ANALYTICS_MAX_DAYS = 365;
const SUPPORT_ANALYTICS_DEFAULT_TOP = 5;
const SUPPORT_ANALYTICS_MAX_TOP = 10;
const SUPPORT_ANALYTICS_DEFAULT_FIRST_RESPONSE_SLA_HOURS = 24;
const SUPPORT_ANALYTICS_DEFAULT_RESOLUTION_SLA_HOURS = 72;
const SUPPORT_SUGGEST_REPLY_TOP_K = 4;
const SUPPORT_SUGGEST_REPLY_MAX_TOKENS = 450;
const SUPPORT_SUGGEST_REPLY_MAX_INPUT_CHARS = 8000;
const SUPPORT_TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const SUPPORT_ROUTE_REASON_MAX_LENGTH = 500;
const SUPPORT_ASSIGNED_TO_MAX_LENGTH = 255;
const SUPPORT_ESCALATION_DEFAULT_HIGH_HOURS = 24;
const SUPPORT_ESCALATION_DEFAULT_URGENT_HOURS = 72;
const SUPPORT_ESCALATION_MAX_HOURS = 720;
const SUPPORT_ESCALATION_SWEEP_DEFAULT_LIMIT = 30;
const SUPPORT_ESCALATION_SWEEP_MAX_LIMIT = 200;
const SUPPORT_ROUTING_KV_PREFIX = 'support.routing.rr.';
const SUPPORT_MACRO_KV_PREFIX = 'support.macro.';
const SUPPORT_MACRO_TITLE_MAX_LENGTH = 120;
const SUPPORT_MACRO_BODY_MAX_LENGTH = 10000;
const SUPPORT_MACRO_MAX_ITEMS = 100;
const SUPPORT_STATUS_KV_KEY = 'support.status.current';
const SUPPORT_STATUS_VALUES = ['operational', 'degraded', 'outage', 'maintenance'];
const SUPPORT_STATUS_MESSAGE_MAX_LENGTH = 500;
const SUPPORT_CHANGELOG_LEVELS = [
  'release',
  'improvement',
  'fix',
  'incident',
  'maintenance',
  'info',
];
const SUPPORT_CHANGELOG_VISIBILITIES = ['draft', 'published'];
const SUPPORT_CHANGELOG_TITLE_MAX_LENGTH = 180;
const SUPPORT_CHANGELOG_SUMMARY_MAX_LENGTH = 500;
const SUPPORT_CHANGELOG_BODY_MAX_LENGTH = 10000;
const SUPPORT_CHANGELOG_MAX_ITEMS = 200;
const SUPPORT_UNIFIED_INBOX_SOURCES = ['all', 'ticket', 'feature_request', 'chat_feedback'];
const SUPPORT_UNIFIED_INBOX_DEFAULT_LIMIT = 50;
const SUPPORT_UNIFIED_INBOX_MAX_LIMIT = 200;
const SUPPORT_PROACTIVE_DEFAULT_WINDOW_DAYS = 14;
const SUPPORT_PROACTIVE_MAX_WINDOW_DAYS = 90;
const SUPPORT_PROACTIVE_DEFAULT_DROP_PERCENT = 40;
const SUPPORT_PROACTIVE_MIN_DROP_PERCENT = 5;
const SUPPORT_PROACTIVE_MAX_DROP_PERCENT = 95;
const SUPPORT_PROACTIVE_DEFAULT_MIN_PREV_EVENTS = 20;
const SUPPORT_PROACTIVE_MAX_MIN_PREV_EVENTS = 5000;
const SUPPORT_PROACTIVE_DEFAULT_OPEN_TICKETS_THRESHOLD = 3;
const SUPPORT_PROACTIVE_MAX_OPEN_TICKETS_THRESHOLD = 100;
const SUPPORT_PROACTIVE_OUTREACH_EMAIL = 'proactive@ripx.internal';
const SUPPORT_PROACTIVE_NOTE_MAX_LENGTH = 2000;

async function getSupportKbContextForAdmin(queryText, apiKey) {
  if (!queryText || !apiKey) {
    return { context: '', sources: [] };
  }
  try {
    const OpenAI = require('openai').default;
    const openai = new OpenAI({ apiKey });
    const embRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: String(queryText).slice(0, SUPPORT_SUGGEST_REPLY_MAX_INPUT_CHARS),
    });
    const embedding = embRes?.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1536) {
      return { context: '', sources: [] };
    }
    const vecStr = `[${embedding.join(',')}]`;
    const result = await query(
      `SELECT content, source FROM support_kb_chunks
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vecStr, SUPPORT_SUGGEST_REPLY_TOP_K]
    );
    if (!result.rows?.length) {
      return { context: '', sources: [] };
    }
    return {
      context: result.rows
        .map((row, idx) => `[${idx + 1}] ${String(row.content || '').trim()}`)
        .filter(Boolean)
        .join('\n\n'),
      sources: [...new Set(result.rows.map(row => row.source).filter(Boolean))],
    };
  } catch (_err) {
    return { context: '', sources: [] };
  }
}

function buildSupportFallbackReply(ticket) {
  const subject = String(ticket?.subject || 'your request').trim();
  const category = String(ticket?.category || 'general').trim();
  return [
    'Hi there,',
    '',
    `Thanks for reaching out about "${subject}".`,
    `We reviewed your request under the ${category} category and we are happy to help.`,
    '',
    'Could you please share one or two quick details so we can provide the most accurate next step?',
    '- The exact behavior you are seeing now',
    '- The expected behavior or outcome you want',
    '',
    'As soon as you share that, we will follow up with a concrete resolution plan.',
    '',
    'Best,',
    'RipX Support',
  ].join('\n');
}

function parseSupportAgentsCsv(raw) {
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .slice(0, 200);
}

function normalizeSupportMacroKey(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function parseSupportMacroValue(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return { title: '', body: '' };
  }
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { title: '', body: '' };
    }
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      body: typeof parsed.body === 'string' ? parsed.body : '',
    };
  } catch (_err) {
    return { title: '', body: '' };
  }
}

function normalizeSupportStatusValue(rawValue) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase();
  if (SUPPORT_STATUS_VALUES.includes(normalized)) {
    return normalized;
  }
  return 'operational';
}

function normalizeSupportChangelogLevel(rawValue) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase();
  if (SUPPORT_CHANGELOG_LEVELS.includes(normalized)) {
    return normalized;
  }
  return 'info';
}

function normalizeSupportChangelogVisibility(rawValue) {
  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase();
  if (SUPPORT_CHANGELOG_VISIBILITIES.includes(normalized)) {
    return normalized;
  }
  return 'draft';
}

function parseSupportStatusPayload(rawValue) {
  const fallback = {
    status: 'operational',
    message: 'All systems operational',
    updated_at: null,
  };
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(rawValue);
    const message = typeof parsed?.message === 'string' ? parsed.message.trim() : '';
    return {
      status: normalizeSupportStatusValue(parsed?.status),
      message: message || fallback.message,
      updated_at: parsed?.updated_at || null,
    };
  } catch (_err) {
    return fallback;
  }
}

function parseJsonObjectSafe(value) {
  if (value && typeof value === 'object') {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_err) {
    return null;
  }
}

function normalizeSupportProactiveSeverity(value) {
  const severity = String(value || '')
    .trim()
    .toLowerCase();
  if (severity === 'critical' || severity === 'warning' || severity === 'info') {
    return severity;
  }
  return 'info';
}

function supportProactiveSeverityWeight(value) {
  const severity = normalizeSupportProactiveSeverity(value);
  if (severity === 'critical') {
    return 3;
  }
  if (severity === 'warning') {
    return 2;
  }
  return 1;
}

function normalizeSupportProactiveSignalType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'usage_drop' ||
    normalized === 'running_test_inactive' ||
    normalized === 'open_ticket_backlog' ||
    normalized === 'billing_event'
  ) {
    return normalized;
  }
  return 'generic';
}

function getSupportRoutingPool(category) {
  const normalized = String(category || '')
    .trim()
    .toLowerCase();
  if (normalized === 'billing') {
    return 'billing';
  }
  if (normalized === 'technical' || normalized === 'script_install') {
    return 'technical';
  }
  return 'general';
}

function getSupportRoutingAgentsByPool(pool) {
  if (pool === 'billing') {
    return parseSupportAgentsCsv(process.env.SUPPORT_ROUTING_BILLING_AGENTS);
  }
  if (pool === 'technical') {
    return parseSupportAgentsCsv(process.env.SUPPORT_ROUTING_TECHNICAL_AGENTS);
  }
  return parseSupportAgentsCsv(process.env.SUPPORT_ROUTING_GENERAL_AGENTS);
}

function normalizeSupportPriority(value, fallback = 'normal') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (SUPPORT_TICKET_PRIORITIES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function getSupportPriorityRank(priority) {
  return SUPPORT_TICKET_PRIORITIES.indexOf(normalizeSupportPriority(priority));
}

function getEscalatedSupportPriority(currentPriority) {
  const current = normalizeSupportPriority(currentPriority);
  const rank = getSupportPriorityRank(current);
  const nextRank = Math.min(rank + 1, SUPPORT_TICKET_PRIORITIES.length - 1);
  return SUPPORT_TICKET_PRIORITIES[nextRank];
}

function getSupportEscalationConfig(highHoursRaw, urgentHoursRaw) {
  const envHigh = parseInt(process.env.SUPPORT_ESCALATION_HIGH_HOURS, 10);
  const envUrgent = parseInt(process.env.SUPPORT_ESCALATION_URGENT_HOURS, 10);
  const parsedHigh = Number.isFinite(highHoursRaw) ? highHoursRaw : envHigh;
  const parsedUrgent = Number.isFinite(urgentHoursRaw) ? urgentHoursRaw : envUrgent;
  const highHours = Number.isFinite(parsedHigh)
    ? Math.min(Math.max(parsedHigh, 1), SUPPORT_ESCALATION_MAX_HOURS)
    : SUPPORT_ESCALATION_DEFAULT_HIGH_HOURS;
  const urgentHours = Number.isFinite(parsedUrgent)
    ? Math.min(Math.max(parsedUrgent, highHours), SUPPORT_ESCALATION_MAX_HOURS)
    : Math.max(SUPPORT_ESCALATION_DEFAULT_URGENT_HOURS, highHours);
  return { highHours, urgentHours };
}

function getSupportEscalationState(ticket, escalationConfig) {
  const createdAtMs = ticket?.created_at ? new Date(ticket.created_at).getTime() : NaN;
  const isOpen =
    String(ticket?.status || '')
      .trim()
      .toLowerCase() === 'open';
  if (!isOpen || !Number.isFinite(createdAtMs)) {
    return {
      due: false,
      hoursOpen: 0,
      targetPriority: null,
    };
  }
  const hoursOpen = Math.max(0, (Date.now() - createdAtMs) / 3600000);
  if (hoursOpen >= escalationConfig.urgentHours) {
    return { due: true, hoursOpen, targetPriority: 'urgent' };
  }
  if (hoursOpen >= escalationConfig.highHours) {
    return { due: true, hoursOpen, targetPriority: 'high' };
  }
  return { due: false, hoursOpen, targetPriority: null };
}

async function pickSupportRoundRobinAssignee(pool, agents) {
  if (!Array.isArray(agents) || agents.length === 0) {
    return null;
  }
  const kvKey = `${SUPPORT_ROUTING_KV_PREFIX}${pool}`;
  let index = 0;
  try {
    const readResult = await query('SELECT value FROM key_value_store WHERE key = $1', [kvKey]);
    const parsed = parseInt(readResult.rows?.[0]?.value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      index = parsed;
    }
  } catch (_readErr) {
    index = 0;
  }
  const normalizedIndex = index % agents.length;
  const assignee = agents[normalizedIndex] || null;
  const nextIndex = (normalizedIndex + 1) % agents.length;
  try {
    await query(
      `INSERT INTO key_value_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [kvKey, String(nextIndex)]
    );
  } catch (_writeErr) {
    // Non-fatal for assignment selection.
  }
  return assignee;
}

async function getSupportTicketById(ticketId) {
  const withDeletedSql = `
    SELECT id, email, subject, category, message, status, priority, assigned_to, metadata,
           shop_domain, tenant_id, created_at, updated_at
    FROM support_tickets
    WHERE id = $1::uuid
      AND (deleted_at IS NULL)
    LIMIT 1
  `;
  const noDeletedSql = `
    SELECT id, email, subject, category, message, status, priority, assigned_to, metadata,
           shop_domain, tenant_id, created_at, updated_at
    FROM support_tickets
    WHERE id = $1::uuid
    LIMIT 1
  `;
  try {
    return await query(withDeletedSql, [ticketId]);
  } catch (err) {
    if (err.message && /deleted_at|column.*does not exist/i.test(err.message)) {
      return query(noDeletedSql, [ticketId]);
    }
    throw err;
  }
}

async function persistSupportTicketRoutingUpdate({
  ticketId,
  status,
  priority,
  assignedTo,
  metadataJson,
}) {
  const withDeletedSql = `
    UPDATE support_tickets
    SET status = $1, priority = $2, assigned_to = $3, metadata = $4::jsonb, updated_at = NOW()
    WHERE id = $5::uuid
      AND (deleted_at IS NULL)
    RETURNING id, status, priority, assigned_to, updated_at
  `;
  const noDeletedSql = `
    UPDATE support_tickets
    SET status = $1, priority = $2, assigned_to = $3, metadata = $4::jsonb, updated_at = NOW()
    WHERE id = $5::uuid
    RETURNING id, status, priority, assigned_to, updated_at
  `;
  try {
    return await query(withDeletedSql, [status, priority, assignedTo, metadataJson, ticketId]);
  } catch (err) {
    if (err.message && /deleted_at|column.*does not exist/i.test(err.message)) {
      return query(noDeletedSql, [status, priority, assignedTo, metadataJson, ticketId]);
    }
    throw err;
  }
}

/**
 * GET /api/admin/support-tickets
 * List support tickets for admin triage. Query: status, sort=created_at|updated_at|status, order=asc|desc, limit, offset.
 */
router.get(
  '/support-tickets',
  asyncHandler(async (req, res) => {
    const rawStatus =
      typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : null;
    const status = rawStatus && SUPPORT_TICKET_STATUSES.includes(rawStatus) ? rawStatus : null;
    const sort = (req.query.sort || 'created_at').toLowerCase();
    const order = (req.query.order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, SUPPORT_TICKETS_LIST_LIMIT);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const escalationConfig = getSupportEscalationConfig();

    const validSort = ['created_at', 'updated_at', 'status', 'email'].includes(sort)
      ? sort
      : 'created_at';
    const orderBy = `ORDER BY st.${validSort} ${order}`;
    const whereDeleted = ' WHERE (st.deleted_at IS NULL)';
    const sql = `
      SELECT st.id, st.email, st.subject, st.category, st.status, st.priority, st.assigned_to,
             st.metadata,
             st.created_at, st.updated_at, st.shop_domain, st.tenant_id
      FROM support_tickets st
      ${whereDeleted}${status ? ' AND st.status = $3' : ''}
      ${orderBy}
      LIMIT $1 OFFSET $2
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total FROM support_tickets st
      ${whereDeleted}${status ? ' AND st.status = $1' : ''}
    `;
    const queryParams = status ? [limit, offset, status] : [limit, offset];
    let result;
    let countResult;
    try {
      result = await query(sql, queryParams);
      countResult = await query(countSql, status ? [status] : []);
    } catch (err) {
      if (err.message && /deleted_at|metadata|column.*does not exist/i.test(err.message)) {
        const sqlNoDeleted = `
          SELECT st.id, st.email, st.subject, st.category, st.status, st.priority, st.assigned_to,
                 st.created_at, st.updated_at, st.shop_domain, st.tenant_id
          FROM support_tickets st
          ${status ? ' WHERE st.status = $3' : ''}
          ${orderBy}
          LIMIT $1 OFFSET $2
        `;
        const countNoDeleted = `SELECT COUNT(*)::int AS total FROM support_tickets st ${status ? ' WHERE st.status = $1' : ''}`;
        result = await query(sqlNoDeleted, queryParams);
        countResult = await query(countNoDeleted, status ? [status] : []);
      } else {
        throw err;
      }
    }

    const total = countResult?.rows?.[0]?.total ?? 0;
    return sendSuccess(res, HTTP_STATUS.OK, {
      tickets: result.rows.map(r => {
        const metadata = parseJsonObjectSafe(r.metadata);
        const escalationState = getSupportEscalationState(r, escalationConfig);
        return {
          id: r.id,
          email: r.email,
          subject: r.subject,
          category: r.category,
          category_source:
            typeof metadata?.category_source === 'string' ? metadata.category_source : 'manual',
          status: r.status,
          priority: normalizeSupportPriority(r.priority, 'normal'),
          assigned_to: r.assigned_to || null,
          escalation_due: escalationState.due,
          escalation_target_priority: escalationState.targetPriority,
          hours_open:
            escalationState.hoursOpen && Number.isFinite(escalationState.hoursOpen)
              ? Number(escalationState.hoursOpen.toFixed(1))
              : 0,
          created_at: r.created_at,
          updated_at: r.updated_at,
          shop_domain: r.shop_domain,
          tenant_id: r.tenant_id,
        };
      }),
      total,
      limit,
      offset,
      routing_defaults: {
        escalation_high_hours: escalationConfig.highHours,
        escalation_urgent_hours: escalationConfig.urgentHours,
      },
    });
  })
);

/**
 * GET /api/admin/support-tickets/:id/thread
 * Read one support ticket thread as admin.
 */
router.get(
  '/support-tickets/:id/thread',
  asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    if (!ticketId || !validators.isValidUUID(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    }
    const ticketResult = await getSupportTicketById(ticketId);
    const ticket = ticketResult.rows?.[0];
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    const messages = await listSupportTicketThreadMessages(ticket, {
      limit: parseInt(req.query.limit, 10) || 300,
    });
    return sendSuccess(res, HTTP_STATUS.OK, {
      ticket: {
        id: ticket.id,
        email: ticket.email,
        subject: ticket.subject,
        status: ticket.status,
        category: ticket.category,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
      },
      messages,
    });
  })
);

/**
 * POST /api/admin/support-tickets/:id/reply
 * Add an admin reply to the support ticket thread.
 */
router.post(
  '/support-tickets/:id/reply',
  asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    if (!ticketId || !validators.isValidUUID(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    }
    const ticketResult = await getSupportTicketById(ticketId);
    const ticket = ticketResult.rows?.[0];
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    if (message.length > SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `message must be ${SUPPORT_TICKET_THREAD_MESSAGE_MAX_LENGTH} characters or less`,
      });
    }
    const senderLabel =
      (typeof req.adminId === 'string' && req.adminId.trim()) ||
      (typeof req.email === 'string' && req.email.trim()) ||
      'Support Agent';
    const created = await createSupportTicketThreadMessage({
      ticketId: ticket.id,
      senderType: 'admin',
      senderLabel,
      message,
      metadata: {
        source: 'admin_dashboard',
        admin_id: req.adminId || null,
      },
    });
    if (!created.ok) {
      return res
        .status(400)
        .json({ success: false, error: created.error || 'Could not add reply' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'support_ticket',
      entityId: String(ticket.id),
      action: 'reply',
      changes: {
        message_length: message.length,
      },
    });

    return sendSuccess(res, HTTP_STATUS.CREATED, {
      ticket_id: ticket.id,
      message: created.message,
    });
  })
);

/**
 * GET /api/admin/support-tickets/:id/thread/stream
 * Server-sent events stream for real-time support ticket thread updates.
 */
router.get(
  '/support-tickets/:id/thread/stream',
  asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    if (!ticketId || !validators.isValidUUID(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket ID' });
    }
    const ticketResult = await getSupportTicketById(ticketId);
    const ticket = ticketResult.rows?.[0];
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
    const writeEvent = payload => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (_err) {
        // Ignore write errors; close handler cleans up.
      }
    };
    writeEvent({
      type: 'connected',
      ticket_id: ticket.id,
      timestamp: new Date().toISOString(),
    });

    const unsubscribe = subscribeSupportTicketThread(ticket.id, messagePayload => {
      writeEvent({
        type: 'message',
        ticket_id: ticket.id,
        message: messagePayload,
      });
    });
    const heartbeat = setInterval(() => {
      writeEvent({ type: 'heartbeat', timestamp: new Date().toISOString() });
    }, 20000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        res.end();
      } catch (_err) {
        // Ignore stream close issues.
      }
    });
  })
);

/**
 * GET /api/admin/support-unified-inbox
 * Single stream of support signals across tickets, feature requests, and negative chat feedback.
 */
router.get(
  '/support-unified-inbox',
  asyncHandler(async (req, res) => {
    const sourceRaw = String(req.query.source || 'all')
      .trim()
      .toLowerCase();
    const source = SUPPORT_UNIFIED_INBOX_SOURCES.includes(sourceRaw) ? sourceRaw : 'all';
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || SUPPORT_UNIFIED_INBOX_DEFAULT_LIMIT, 1),
      SUPPORT_UNIFIED_INBOX_MAX_LIMIT
    );

    const includeTickets = source === 'all' || source === 'ticket';
    const includeFeatureRequests = source === 'all' || source === 'feature_request';
    const includeChatFeedback = source === 'all' || source === 'chat_feedback';

    let ticketRows = [];
    let featureRequestRows = [];
    let chatFeedbackRows = [];

    if (includeTickets) {
      const ticketsSql = `
        SELECT id, email, subject, category, status, priority, metadata, shop_domain, created_at, updated_at
        FROM support_tickets
        WHERE (deleted_at IS NULL)
        ORDER BY created_at DESC
        LIMIT $1
      `;
      const ticketsFallbackSql = `
        SELECT id, email, subject, category, status, priority, shop_domain, created_at, updated_at
        FROM support_tickets
        ORDER BY created_at DESC
        LIMIT $1
      `;
      try {
        const result = await query(ticketsSql, [limit]);
        ticketRows = result.rows || [];
      } catch (err) {
        if (err.message && /deleted_at|metadata|column.*does not exist/i.test(err.message)) {
          const result = await query(ticketsFallbackSql, [limit]).catch(() => ({ rows: [] }));
          ticketRows = result.rows || [];
        } else {
          throw err;
        }
      }
    }

    if (includeFeatureRequests) {
      const featureSql = `
        SELECT id, title, details, status, vote_count, email, shop_domain, created_at, updated_at
        FROM support_feature_requests
        WHERE (deleted_at IS NULL)
        ORDER BY created_at DESC
        LIMIT $1
      `;
      const featureFallbackSql = `
        SELECT id, title, details, status, vote_count, email, shop_domain, created_at, updated_at
        FROM support_feature_requests
        ORDER BY created_at DESC
        LIMIT $1
      `;
      try {
        const result = await query(featureSql, [limit]);
        featureRequestRows = result.rows || [];
      } catch (err) {
        if (
          err.message &&
          (/support_feature_requests|relation .* does not exist/i.test(err.message) ||
            /deleted_at|column.*does not exist/i.test(err.message))
        ) {
          const result = await query(featureFallbackSql, [limit]).catch(() => ({ rows: [] }));
          featureRequestRows = result.rows || [];
        } else {
          throw err;
        }
      }
    }

    if (includeChatFeedback) {
      const feedbackSql = `
        SELECT id, conversation_id, content, metadata, created_at
        FROM support_chat_messages
        WHERE role = 'feedback'
        ORDER BY created_at DESC
        LIMIT $1
      `;
      try {
        const result = await query(feedbackSql, [
          Math.min(limit * 2, SUPPORT_UNIFIED_INBOX_MAX_LIMIT),
        ]);
        chatFeedbackRows = result.rows || [];
      } catch (err) {
        if (/support_chat_messages|relation .* does not exist/i.test(err.message || '')) {
          chatFeedbackRows = [];
        } else {
          throw err;
        }
      }
    }

    const ticketItems = ticketRows.map(row => {
      const metadata = parseJsonObjectSafe(row.metadata);
      return {
        source: 'ticket',
        source_label: 'Ticket',
        item_id: row.id,
        title: row.subject || '(No subject)',
        summary: `${row.email || 'Unknown requester'} · ${row.category || 'other'}`,
        status: row.status || 'open',
        priority: normalizeSupportPriority(row.priority, 'normal'),
        category: row.category || 'other',
        category_source:
          typeof metadata?.category_source === 'string' ? metadata.category_source : 'manual',
        email: row.email || null,
        shop_domain: row.shop_domain || null,
        created_at: row.created_at,
        updated_at: row.updated_at || row.created_at,
      };
    });

    const featureRequestItems = featureRequestRows.map(row => ({
      source: 'feature_request',
      source_label: 'Feature request',
      item_id: row.id,
      title: row.title || '(Untitled request)',
      summary:
        (typeof row.details === 'string' && row.details.trim()
          ? row.details.trim().slice(0, 180)
          : 'No details provided') + ` · ${Number(row.vote_count) || 0} votes`,
      status: row.status || 'open',
      priority: 'normal',
      vote_count: Number(row.vote_count) || 0,
      email: row.email || null,
      shop_domain: row.shop_domain || null,
      created_at: row.created_at,
      updated_at: row.updated_at || row.created_at,
    }));

    const chatFeedbackItems = chatFeedbackRows
      .map(row => {
        const metadata = parseJsonObjectSafe(row.metadata);
        const helpful = metadata?.helpful;
        const content = String(row.content || '')
          .trim()
          .toLowerCase();
        const negative =
          content === 'not_helpful' ||
          helpful === false ||
          (typeof helpful === 'string' &&
            ['false', '0', 'no', 'not_helpful'].includes(helpful.trim().toLowerCase()));
        if (!negative) {
          return null;
        }
        const reason =
          typeof metadata?.reason === 'string' && metadata.reason.trim()
            ? metadata.reason.trim().slice(0, 220)
            : 'User marked an AI answer as not helpful.';
        return {
          source: 'chat_feedback',
          source_label: 'Chat feedback',
          item_id: row.id,
          title: 'Negative AI feedback',
          summary: reason,
          status: 'needs_review',
          priority: 'normal',
          conversation_id: row.conversation_id || null,
          created_at: row.created_at,
          updated_at: row.created_at,
        };
      })
      .filter(Boolean);

    const merged = [...ticketItems, ...featureRequestItems, ...chatFeedbackItems]
      .sort((a, b) => {
        const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, limit);

    return sendSuccess(res, HTTP_STATUS.OK, {
      source,
      limit,
      total: merged.length,
      counts: {
        ticket: ticketItems.length,
        feature_request: featureRequestItems.length,
        chat_feedback: chatFeedbackItems.length,
      },
      items: merged,
    });
  })
);

/**
 * GET /api/admin/support-macros
 * List reusable support response templates/macros.
 */
router.get(
  '/support-macros',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT key, value, updated_at
       FROM key_value_store
       WHERE key LIKE $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [`${SUPPORT_MACRO_KV_PREFIX}%`, SUPPORT_MACRO_MAX_ITEMS]
    ).catch(() => ({ rows: [] }));
    const macros = (rows.rows || [])
      .map(row => {
        const key = String(row.key || '');
        const macroKey = key.startsWith(SUPPORT_MACRO_KV_PREFIX)
          ? key.slice(SUPPORT_MACRO_KV_PREFIX.length)
          : '';
        const parsed = parseSupportMacroValue(row.value);
        if (!macroKey || !parsed.title || !parsed.body) {
          return null;
        }
        return {
          key: macroKey,
          title: parsed.title,
          body: parsed.body,
          updated_at: row.updated_at,
        };
      })
      .filter(Boolean);
    return sendSuccess(res, HTTP_STATUS.OK, { macros });
  })
);

/**
 * PUT /api/admin/support-macros/:key
 * Create/update one support macro.
 */
router.put(
  '/support-macros/:key',
  asyncHandler(async (req, res) => {
    const rawKey = req.params.key;
    const macroKey = normalizeSupportMacroKey(rawKey);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';

    if (!macroKey) {
      return res.status(400).json({ success: false, error: 'Invalid macro key' });
    }
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (!body) {
      return res.status(400).json({ success: false, error: 'body is required' });
    }
    if (title.length > SUPPORT_MACRO_TITLE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `title must be ${SUPPORT_MACRO_TITLE_MAX_LENGTH} characters or less`,
      });
    }
    if (body.length > SUPPORT_MACRO_BODY_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `body must be ${SUPPORT_MACRO_BODY_MAX_LENGTH} characters or less`,
      });
    }

    const kvKey = `${SUPPORT_MACRO_KV_PREFIX}${macroKey}`;
    const storedValue = JSON.stringify({
      title,
      body,
      updated_by: req.adminId || null,
    });
    await query(
      `INSERT INTO key_value_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [kvKey, storedValue]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'support_macro',
      entityId: macroKey,
      action: 'upsert',
      changes: { title_length: title.length, body_length: body.length },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { key: macroKey, title, body });
  })
);

/**
 * DELETE /api/admin/support-macros/:key
 * Remove one support macro.
 */
router.delete(
  '/support-macros/:key',
  asyncHandler(async (req, res) => {
    const macroKey = normalizeSupportMacroKey(req.params.key || '');
    if (!macroKey) {
      return res.status(400).json({ success: false, error: 'Invalid macro key' });
    }
    const kvKey = `${SUPPORT_MACRO_KV_PREFIX}${macroKey}`;
    const result = await query('DELETE FROM key_value_store WHERE key = $1 RETURNING key', [
      kvKey,
    ]).catch(() => ({ rows: [] }));
    if (!result.rows?.length) {
      return res.status(404).json({ success: false, error: 'Macro not found' });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'support_macro',
      entityId: macroKey,
      action: 'delete',
      changes: {},
    });
    return sendSuccess(res, HTTP_STATUS.OK, { deleted: true, key: macroKey });
  })
);

/**
 * GET /api/admin/support-inbox-integration
 * Read Zendesk/Help Scout sync configuration.
 */
router.get(
  '/support-inbox-integration',
  asyncHandler(async (_req, res) => {
    const config = await getSupportInboxIntegrationConfig({ includeSecrets: false });
    return sendSuccess(res, HTTP_STATUS.OK, { config });
  })
);

/**
 * PUT /api/admin/support-inbox-integration
 * Update Zendesk/Help Scout sync configuration.
 */
router.put(
  '/support-inbox-integration',
  asyncHandler(async (req, res) => {
    const result = await upsertSupportInboxIntegrationConfig(req.body || {}, req.adminId || null);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.error || 'Invalid config' });
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'support_inbox_integration',
      entityId: 'support.inbox.integration',
      action: 'upsert',
      changes: {
        provider: result.config?.provider || 'none',
        enabled: Boolean(result.config?.enabled),
      },
    });
    return sendSuccess(res, HTTP_STATUS.OK, { config: result.config });
  })
);

/**
 * GET /api/admin/support-status
 * Read current public support status payload.
 */
router.get(
  '/support-status',
  asyncHandler(async (_req, res) => {
    const result = await query('SELECT value, updated_at FROM key_value_store WHERE key = $1', [
      SUPPORT_STATUS_KV_KEY,
    ]).catch(() => ({ rows: [] }));
    const row = result.rows?.[0];
    const payload = parseSupportStatusPayload(row?.value || '');
    return sendSuccess(res, HTTP_STATUS.OK, {
      ...payload,
      updated_at: payload.updated_at || row?.updated_at || null,
    });
  })
);

/**
 * PUT /api/admin/support-status
 * Update public support status payload.
 */
router.put(
  '/support-status',
  asyncHandler(async (req, res) => {
    const status = normalizeSupportStatusValue(req.body?.status);
    const message =
      typeof req.body?.message === 'string' ? req.body.message.trim() : 'All systems operational';
    if (message.length > SUPPORT_STATUS_MESSAGE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `message must be ${SUPPORT_STATUS_MESSAGE_MAX_LENGTH} characters or less`,
      });
    }
    const payload = {
      status,
      message: message || 'All systems operational',
      updated_at: new Date().toISOString(),
      updated_by: req.adminId || null,
    };
    await query(
      `INSERT INTO key_value_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [SUPPORT_STATUS_KV_KEY, JSON.stringify(payload)]
    );
    await auditLogService.logAdminAction(req, {
      entityType: 'support_status',
      entityId: SUPPORT_STATUS_KV_KEY,
      action: 'upsert',
      changes: { status, has_message: Boolean(payload.message) },
    });
    return sendSuccess(res, HTTP_STATUS.OK, payload);
  })
);

/**
 * GET /api/admin/support-changelog
 * List changelog entries for admin.
 */
router.get(
  '/support-changelog',
  asyncHandler(async (req, res) => {
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 50, 1),
      SUPPORT_CHANGELOG_MAX_ITEMS
    );
    const withDeletedSql = `
      SELECT id, title, summary, body, level, visibility, created_by, published_at, created_at, updated_at
      FROM support_changelog_entries
      WHERE (deleted_at IS NULL)
      ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
      LIMIT $1
    `;
    const noDeletedSql = `
      SELECT id, title, summary, body, level, visibility, created_by, published_at, created_at, updated_at
      FROM support_changelog_entries
      ORDER BY COALESCE(published_at, created_at) DESC, created_at DESC
      LIMIT $1
    `;
    let rows = [];
    try {
      const result = await query(withDeletedSql, [limit]);
      rows = result.rows || [];
    } catch (err) {
      if (
        err.message &&
        (/deleted_at|column.*does not exist/i.test(err.message) ||
          /support_changelog_entries|relation .* does not exist/i.test(err.message))
      ) {
        const result = await query(noDeletedSql, [limit]).catch(() => ({ rows: [] }));
        rows = result.rows || [];
      } else {
        throw err;
      }
    }
    return sendSuccess(res, HTTP_STATUS.OK, {
      entries: rows.map(row => ({
        id: row.id,
        title: row.title,
        summary: row.summary || '',
        body: row.body || '',
        level: row.level || 'info',
        visibility: row.visibility || 'draft',
        created_by: row.created_by || null,
        published_at: row.published_at || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    });
  })
);

/**
 * POST /api/admin/support-changelog
 * Create changelog entry.
 */
router.post(
  '/support-changelog',
  asyncHandler(async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const summary = typeof req.body?.summary === 'string' ? req.body.summary.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const level = normalizeSupportChangelogLevel(req.body?.level);
    const visibility = normalizeSupportChangelogVisibility(req.body?.visibility);

    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (title.length > SUPPORT_CHANGELOG_TITLE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `title must be ${SUPPORT_CHANGELOG_TITLE_MAX_LENGTH} characters or less`,
      });
    }
    if (summary.length > SUPPORT_CHANGELOG_SUMMARY_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `summary must be ${SUPPORT_CHANGELOG_SUMMARY_MAX_LENGTH} characters or less`,
      });
    }
    if (body.length > SUPPORT_CHANGELOG_BODY_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `body must be ${SUPPORT_CHANGELOG_BODY_MAX_LENGTH} characters or less`,
      });
    }

    const insertSql = `
      INSERT INTO support_changelog_entries
        (title, summary, body, level, visibility, created_by, published_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'published' THEN NOW() ELSE NULL END)
      RETURNING id, title, summary, body, level, visibility, created_by, published_at, created_at, updated_at
    `;
    let row = null;
    try {
      const result = await query(insertSql, [
        title,
        summary || null,
        body || null,
        level,
        visibility,
        req.adminId || null,
      ]);
      row = result.rows?.[0] || null;
    } catch (err) {
      if (/support_changelog_entries|relation .* does not exist/i.test(err.message || '')) {
        return res.status(503).json({
          success: false,
          error: 'Support changelog table not initialized yet (missing migration).',
        });
      }
      throw err;
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'support_changelog',
      entityId: String(row?.id || ''),
      action: 'create',
      changes: { visibility, level },
    });

    return sendSuccess(res, HTTP_STATUS.CREATED, {
      entry: {
        id: row.id,
        title: row.title,
        summary: row.summary || '',
        body: row.body || '',
        level: row.level || 'info',
        visibility: row.visibility || 'draft',
        created_by: row.created_by || null,
        published_at: row.published_at || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  })
);

/**
 * PATCH /api/admin/support-changelog/:id
 * Update changelog entry visibility/content.
 */
router.patch(
  '/support-changelog/:id',
  asyncHandler(async (req, res) => {
    const entryId = req.params.id;
    if (!entryId || !validators.isValidUUID(entryId)) {
      return res.status(400).json({ success: false, error: 'Invalid changelog id' });
    }

    const selectWithDeletedSql = `
      SELECT id, title, summary, body, level, visibility, published_at
      FROM support_changelog_entries
      WHERE id = $1::uuid
        AND (deleted_at IS NULL)
      LIMIT 1
    `;
    const selectNoDeletedSql = `
      SELECT id, title, summary, body, level, visibility, published_at
      FROM support_changelog_entries
      WHERE id = $1::uuid
      LIMIT 1
    `;
    let existingResult;
    try {
      existingResult = await query(selectWithDeletedSql, [entryId]);
    } catch (err) {
      if (
        err.message &&
        (/deleted_at|column.*does not exist/i.test(err.message) ||
          /support_changelog_entries|relation .* does not exist/i.test(err.message))
      ) {
        existingResult = await query(selectNoDeletedSql, [entryId]).catch(() => ({ rows: [] }));
      } else {
        throw err;
      }
    }
    const existing = existingResult.rows?.[0];
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Changelog entry not found' });
    }

    const nextTitle =
      typeof req.body?.title === 'string' ? req.body.title.trim() : String(existing.title || '');
    const nextSummary =
      typeof req.body?.summary === 'string'
        ? req.body.summary.trim()
        : String(existing.summary || '');
    const nextBody =
      typeof req.body?.body === 'string' ? req.body.body.trim() : String(existing.body || '');
    const nextLevel =
      typeof req.body?.level === 'string'
        ? normalizeSupportChangelogLevel(req.body.level)
        : normalizeSupportChangelogLevel(existing.level);
    const nextVisibility =
      typeof req.body?.visibility === 'string'
        ? normalizeSupportChangelogVisibility(req.body.visibility)
        : normalizeSupportChangelogVisibility(existing.visibility);

    if (!nextTitle) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (nextTitle.length > SUPPORT_CHANGELOG_TITLE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `title must be ${SUPPORT_CHANGELOG_TITLE_MAX_LENGTH} characters or less`,
      });
    }
    if (nextSummary.length > SUPPORT_CHANGELOG_SUMMARY_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `summary must be ${SUPPORT_CHANGELOG_SUMMARY_MAX_LENGTH} characters or less`,
      });
    }
    if (nextBody.length > SUPPORT_CHANGELOG_BODY_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `body must be ${SUPPORT_CHANGELOG_BODY_MAX_LENGTH} characters or less`,
      });
    }

    const publishNow = req.body?.publish_now === true;
    const nextPublishedAt =
      publishNow || (nextVisibility === 'published' && !existing.published_at)
        ? new Date().toISOString()
        : nextVisibility !== 'published'
          ? null
          : existing.published_at;

    const updateWithDeletedSql = `
      UPDATE support_changelog_entries
      SET title = $2,
          summary = $3,
          body = $4,
          level = $5,
          visibility = $6,
          published_at = $7,
          updated_at = NOW()
      WHERE id = $1::uuid
        AND (deleted_at IS NULL)
      RETURNING id, title, summary, body, level, visibility, published_at, created_at, updated_at
    `;
    const updateNoDeletedSql = `
      UPDATE support_changelog_entries
      SET title = $2,
          summary = $3,
          body = $4,
          level = $5,
          visibility = $6,
          published_at = $7,
          updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING id, title, summary, body, level, visibility, published_at, created_at, updated_at
    `;
    let updatedResult;
    try {
      updatedResult = await query(updateWithDeletedSql, [
        entryId,
        nextTitle,
        nextSummary || null,
        nextBody || null,
        nextLevel,
        nextVisibility,
        nextPublishedAt,
      ]);
    } catch (err) {
      if (
        err.message &&
        (/deleted_at|column.*does not exist/i.test(err.message) ||
          /support_changelog_entries|relation .* does not exist/i.test(err.message))
      ) {
        updatedResult = await query(updateNoDeletedSql, [
          entryId,
          nextTitle,
          nextSummary || null,
          nextBody || null,
          nextLevel,
          nextVisibility,
          nextPublishedAt,
        ]).catch(() => ({ rows: [] }));
      } else {
        throw err;
      }
    }
    const updated = updatedResult.rows?.[0];
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Changelog entry not found' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'support_changelog',
      entityId: String(updated.id),
      action: 'update',
      changes: { visibility: updated.visibility, level: updated.level },
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      entry: {
        id: updated.id,
        title: updated.title,
        summary: updated.summary || '',
        body: updated.body || '',
        level: updated.level || 'info',
        visibility: updated.visibility || 'draft',
        published_at: updated.published_at || null,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      },
    });
  })
);

/**
 * GET /api/admin/support-tickets/analytics
 * Lightweight support analytics for triage dashboards.
 * Query: days=1..365 (default 30), top=1..10 (top AI questions, default 5).
 */
router.get(
  '/support-tickets/analytics',
  asyncHandler(async (req, res) => {
    const parsedDays = parseInt(req.query.days, 10);
    const parsedTop = parseInt(req.query.top, 10);
    const parsedFirstResponseSlaHours = parseInt(req.query.first_response_sla_hours, 10);
    const parsedResolutionSlaHours = parseInt(req.query.resolution_sla_hours, 10);
    const windowDays = Number.isFinite(parsedDays)
      ? Math.min(Math.max(parsedDays, 1), SUPPORT_ANALYTICS_MAX_DAYS)
      : SUPPORT_ANALYTICS_DEFAULT_DAYS;
    const topQuestionsLimit = Number.isFinite(parsedTop)
      ? Math.min(Math.max(parsedTop, 1), SUPPORT_ANALYTICS_MAX_TOP)
      : SUPPORT_ANALYTICS_DEFAULT_TOP;
    const firstResponseSlaHours = Number.isFinite(parsedFirstResponseSlaHours)
      ? Math.min(Math.max(parsedFirstResponseSlaHours, 1), 168)
      : SUPPORT_ANALYTICS_DEFAULT_FIRST_RESPONSE_SLA_HOURS;
    const resolutionSlaHours = Number.isFinite(parsedResolutionSlaHours)
      ? Math.min(Math.max(parsedResolutionSlaHours, 1), 720)
      : SUPPORT_ANALYTICS_DEFAULT_RESOLUTION_SLA_HOURS;

    const summarySqlWithDeleted = `
      SELECT
        COUNT(*)::int AS tickets_total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(st.status, '')) = 'open')::int AS tickets_open,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(st.status, '')) = 'resolved')::int AS tickets_resolved,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(st.status, '')) = 'closed')::int AS tickets_closed,
        ROUND(
          AVG(
            CASE
              WHEN LOWER(COALESCE(st.status, '')) <> 'open'
                THEN GREATEST(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0, 0)
              ELSE NULL
            END
          )::numeric,
          1
        ) AS avg_first_response_minutes,
        ROUND(
          AVG(
            CASE
              WHEN LOWER(COALESCE(st.status, '')) IN ('resolved', 'closed')
                THEN GREATEST(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0, 0)
              ELSE NULL
            END
          )::numeric,
          1
        ) AS avg_resolution_minutes,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(st.status, '')) <> 'open'
            AND (st.updated_at - st.created_at) <= ($2::numeric * INTERVAL '1 hour')
        )::int AS frt_sla_met_count,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(st.status, '')) <> 'open'
            AND (st.updated_at - st.created_at) > ($2::numeric * INTERVAL '1 hour')
        )::int AS frt_sla_breached_count,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(st.status, '')) IN ('resolved', 'closed')
            AND (st.updated_at - st.created_at) <= ($3::numeric * INTERVAL '1 hour')
        )::int AS resolution_sla_met_count,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(st.status, '')) IN ('resolved', 'closed')
            AND (st.updated_at - st.created_at) > ($3::numeric * INTERVAL '1 hour')
        )::int AS resolution_sla_breached_count
      FROM support_tickets st
      WHERE (st.deleted_at IS NULL)
        AND st.created_at >= NOW() - make_interval(days => $1::int)
    `;
    const summarySqlNoDeleted = `
      SELECT
        COUNT(*)::int AS tickets_total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(st.status, '')) = 'open')::int AS tickets_open,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(st.status, '')) = 'resolved')::int AS tickets_resolved,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(st.status, '')) = 'closed')::int AS tickets_closed,
        ROUND(
          AVG(
            CASE
              WHEN LOWER(COALESCE(st.status, '')) <> 'open'
                THEN GREATEST(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0, 0)
              ELSE NULL
            END
          )::numeric,
          1
        ) AS avg_first_response_minutes,
        ROUND(
          AVG(
            CASE
              WHEN LOWER(COALESCE(st.status, '')) IN ('resolved', 'closed')
                THEN GREATEST(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0, 0)
              ELSE NULL
            END
          )::numeric,
          1
        ) AS avg_resolution_minutes,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(st.status, '')) <> 'open'
            AND (st.updated_at - st.created_at) <= ($2::numeric * INTERVAL '1 hour')
        )::int AS frt_sla_met_count,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(st.status, '')) <> 'open'
            AND (st.updated_at - st.created_at) > ($2::numeric * INTERVAL '1 hour')
        )::int AS frt_sla_breached_count,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(st.status, '')) IN ('resolved', 'closed')
            AND (st.updated_at - st.created_at) <= ($3::numeric * INTERVAL '1 hour')
        )::int AS resolution_sla_met_count,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(st.status, '')) IN ('resolved', 'closed')
            AND (st.updated_at - st.created_at) > ($3::numeric * INTERVAL '1 hour')
        )::int AS resolution_sla_breached_count
      FROM support_tickets st
      WHERE st.created_at >= NOW() - make_interval(days => $1::int)
    `;

    const categoriesSqlWithDeleted = `
      SELECT COALESCE(NULLIF(TRIM(st.category), ''), 'other') AS category, COUNT(*)::int AS count
      FROM support_tickets st
      WHERE (st.deleted_at IS NULL)
        AND st.created_at >= NOW() - make_interval(days => $1::int)
      GROUP BY 1
      ORDER BY count DESC, category ASC
      LIMIT 8
    `;
    const categoriesSqlNoDeleted = `
      SELECT COALESCE(NULLIF(TRIM(st.category), ''), 'other') AS category, COUNT(*)::int AS count
      FROM support_tickets st
      WHERE st.created_at >= NOW() - make_interval(days => $1::int)
      GROUP BY 1
      ORDER BY count DESC, category ASC
      LIMIT 8
    `;
    const trendsSqlWithDeleted = `
      SELECT
        to_char(date_trunc('day', st.created_at), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS tickets_total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(st.status, '')) = 'open')::int AS tickets_open,
        ROUND(
          AVG(
            CASE
              WHEN LOWER(COALESCE(st.status, '')) <> 'open'
                THEN GREATEST(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0, 0)
              ELSE NULL
            END
          )::numeric,
          1
        ) AS avg_first_response_minutes,
        ROUND(
          AVG(
            CASE
              WHEN LOWER(COALESCE(st.status, '')) IN ('resolved', 'closed')
                THEN GREATEST(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0, 0)
              ELSE NULL
            END
          )::numeric,
          1
        ) AS avg_resolution_minutes
      FROM support_tickets st
      WHERE (st.deleted_at IS NULL)
        AND st.created_at >= NOW() - make_interval(days => $1::int)
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    const trendsSqlNoDeleted = `
      SELECT
        to_char(date_trunc('day', st.created_at), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS tickets_total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(st.status, '')) = 'open')::int AS tickets_open,
        ROUND(
          AVG(
            CASE
              WHEN LOWER(COALESCE(st.status, '')) <> 'open'
                THEN GREATEST(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0, 0)
              ELSE NULL
            END
          )::numeric,
          1
        ) AS avg_first_response_minutes,
        ROUND(
          AVG(
            CASE
              WHEN LOWER(COALESCE(st.status, '')) IN ('resolved', 'closed')
                THEN GREATEST(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 60.0, 0)
              ELSE NULL
            END
          )::numeric,
          1
        ) AS avg_resolution_minutes
      FROM support_tickets st
      WHERE st.created_at >= NOW() - make_interval(days => $1::int)
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    let summaryRows = [];
    let categoryRows = [];
    let trendRows = [];
    try {
      const [summaryResult, categoriesResult, trendsResult] = await Promise.all([
        query(summarySqlWithDeleted, [windowDays, firstResponseSlaHours, resolutionSlaHours]),
        query(categoriesSqlWithDeleted, [windowDays]),
        query(trendsSqlWithDeleted, [windowDays]),
      ]);
      summaryRows = summaryResult.rows || [];
      categoryRows = categoriesResult.rows || [];
      trendRows = trendsResult.rows || [];
    } catch (err) {
      if (err.message && /deleted_at|column.*does not exist/i.test(err.message)) {
        const [summaryResult, categoriesResult, trendsResult] = await Promise.all([
          query(summarySqlNoDeleted, [windowDays, firstResponseSlaHours, resolutionSlaHours]),
          query(categoriesSqlNoDeleted, [windowDays]),
          query(trendsSqlNoDeleted, [windowDays]),
        ]);
        summaryRows = summaryResult.rows || [];
        categoryRows = categoriesResult.rows || [];
        trendRows = trendsResult.rows || [];
      } else {
        throw err;
      }
    }

    let chatSummary = { user_messages_total: 0, conversations_total: 0 };
    let topAiQuestions = [];
    try {
      const chatSummaryResult = await query(
        `
          SELECT
            COUNT(*)::int AS user_messages_total,
            COUNT(DISTINCT conversation_id)::int AS conversations_total
          FROM support_chat_messages
          WHERE role = 'user'
            AND created_at >= NOW() - make_interval(days => $1::int)
        `,
        [windowDays]
      );
      chatSummary = chatSummaryResult.rows?.[0] || chatSummary;

      const topQuestionsResult = await query(
        `
          SELECT
            LEFT(REGEXP_REPLACE(TRIM(content), '\\s+', ' ', 'g'), 140) AS question,
            COUNT(*)::int AS count,
            MAX(created_at) AS last_seen_at
          FROM support_chat_messages
          WHERE role = 'user'
            AND created_at >= NOW() - make_interval(days => $1::int)
            AND COALESCE(TRIM(content), '') <> ''
          GROUP BY 1
          ORDER BY count DESC, last_seen_at DESC
          LIMIT $2
        `,
        [windowDays, topQuestionsLimit]
      );
      topAiQuestions = (topQuestionsResult.rows || []).map(row => ({
        question: row.question,
        count: Number(row.count) || 0,
        last_seen_at: row.last_seen_at,
      }));
    } catch (_chatErr) {
      chatSummary = { user_messages_total: 0, conversations_total: 0 };
      topAiQuestions = [];
    }

    let feedbackSummary = {
      csat_avg: null,
      nps_avg: null,
      responses_total: 0,
      tracked: false,
    };
    try {
      const feedbackResult = await query(
        `
          SELECT
            ROUND(AVG(csat_score)::numeric, 2) AS csat_avg,
            ROUND(AVG(nps_score)::numeric, 2) AS nps_avg,
            COUNT(*)::int AS responses_total
          FROM support_ticket_feedback
          WHERE created_at >= NOW() - make_interval(days => $1::int)
        `,
        [windowDays]
      );
      const row = feedbackResult.rows?.[0] || {};
      feedbackSummary = {
        csat_avg: row.csat_avg !== null && row.csat_avg !== undefined ? Number(row.csat_avg) : null,
        nps_avg: row.nps_avg !== null && row.nps_avg !== undefined ? Number(row.nps_avg) : null,
        responses_total: Number(row.responses_total) || 0,
        tracked: true,
      };
    } catch (_feedbackErr) {
      feedbackSummary = {
        csat_avg: null,
        nps_avg: null,
        responses_total: 0,
        tracked: false,
      };
    }

    const summary = summaryRows[0] || {};
    return sendSuccess(res, HTTP_STATUS.OK, {
      window_days: windowDays,
      sla_targets_hours: {
        first_response: firstResponseSlaHours,
        resolution: resolutionSlaHours,
      },
      summary: {
        tickets_total: Number(summary.tickets_total) || 0,
        tickets_open: Number(summary.tickets_open) || 0,
        tickets_resolved: Number(summary.tickets_resolved) || 0,
        tickets_closed: Number(summary.tickets_closed) || 0,
        avg_first_response_minutes:
          summary.avg_first_response_minutes !== null &&
          summary.avg_first_response_minutes !== undefined
            ? Number(summary.avg_first_response_minutes)
            : null,
        avg_resolution_minutes:
          summary.avg_resolution_minutes !== null && summary.avg_resolution_minutes !== undefined
            ? Number(summary.avg_resolution_minutes)
            : null,
        frt_sla_met_count: Number(summary.frt_sla_met_count) || 0,
        frt_sla_breached_count: Number(summary.frt_sla_breached_count) || 0,
        resolution_sla_met_count: Number(summary.resolution_sla_met_count) || 0,
        resolution_sla_breached_count: Number(summary.resolution_sla_breached_count) || 0,
        ai_user_messages_total: Number(chatSummary.user_messages_total) || 0,
        ai_conversations_total: Number(chatSummary.conversations_total) || 0,
        csat_avg: feedbackSummary.csat_avg,
        nps_avg: feedbackSummary.nps_avg,
        feedback_responses_total: feedbackSummary.responses_total,
        feedback_tracked: feedbackSummary.tracked,
      },
      ticket_categories: categoryRows.map(row => ({
        category: row.category,
        count: Number(row.count) || 0,
      })),
      top_ai_questions: topAiQuestions,
      sla_trends: trendRows.map(row => ({
        day: row.day,
        tickets_total: Number(row.tickets_total) || 0,
        tickets_open: Number(row.tickets_open) || 0,
        avg_first_response_minutes:
          row.avg_first_response_minutes !== null && row.avg_first_response_minutes !== undefined
            ? Number(row.avg_first_response_minutes)
            : null,
        avg_resolution_minutes:
          row.avg_resolution_minutes !== null && row.avg_resolution_minutes !== undefined
            ? Number(row.avg_resolution_minutes)
            : null,
      })),
    });
  })
);

/**
 * GET /api/admin/support/proactive-signals
 * Detect proactive outreach triggers (usage drop, inactivity, support load, billing-like webhook events).
 */
router.get(
  '/support/proactive-signals',
  asyncHandler(async (req, res) => {
    const parsedWindowDays = Number.parseInt(req.query.window_days, 10);
    const parsedDropThreshold = Number.parseFloat(req.query.drop_threshold_percent);
    const parsedMinPrevEvents = Number.parseInt(req.query.min_previous_events, 10);
    const parsedOpenTicketsThreshold = Number.parseInt(req.query.open_tickets_threshold, 10);

    const windowDays = Number.isFinite(parsedWindowDays)
      ? Math.min(Math.max(parsedWindowDays, 1), SUPPORT_PROACTIVE_MAX_WINDOW_DAYS)
      : SUPPORT_PROACTIVE_DEFAULT_WINDOW_DAYS;
    const dropThresholdPercent = Number.isFinite(parsedDropThreshold)
      ? Math.min(
          Math.max(parsedDropThreshold, SUPPORT_PROACTIVE_MIN_DROP_PERCENT),
          SUPPORT_PROACTIVE_MAX_DROP_PERCENT
        )
      : SUPPORT_PROACTIVE_DEFAULT_DROP_PERCENT;
    const minPreviousEvents = Number.isFinite(parsedMinPrevEvents)
      ? Math.min(Math.max(parsedMinPrevEvents, 1), SUPPORT_PROACTIVE_MAX_MIN_PREV_EVENTS)
      : SUPPORT_PROACTIVE_DEFAULT_MIN_PREV_EVENTS;
    const openTicketsThreshold = Number.isFinite(parsedOpenTicketsThreshold)
      ? Math.min(
          Math.max(parsedOpenTicketsThreshold, 1),
          SUPPORT_PROACTIVE_MAX_OPEN_TICKETS_THRESHOLD
        )
      : SUPPORT_PROACTIVE_DEFAULT_OPEN_TICKETS_THRESHOLD;

    /** @type {Array<Record<string, unknown>>} */
    const signals = [];

    // 1) Usage drop across rolling windows.
    try {
      const usageRows = await query(
        `
          SELECT
            LOWER(TRIM(shop_domain)) AS shop_domain,
            COUNT(*) FILTER (
              WHERE created_at >= NOW() - make_interval(days => $1::int)
            )::int AS current_events,
            COUNT(*) FILTER (
              WHERE created_at < NOW() - make_interval(days => $1::int)
                AND created_at >= NOW() - (($1::int * 2) * INTERVAL '1 day')
            )::int AS previous_events,
            MAX(created_at) AS last_event_at
          FROM events
          WHERE shop_domain IS NOT NULL
            AND COALESCE(TRIM(shop_domain), '') <> ''
            AND created_at >= NOW() - (($1::int * 2) * INTERVAL '1 day')
          GROUP BY 1
        `,
        [windowDays]
      ).catch(() => ({ rows: [] }));
      for (const row of usageRows.rows || []) {
        const shopDomain = String(row.shop_domain || '')
          .trim()
          .toLowerCase();
        const currentEvents = Number(row.current_events) || 0;
        const previousEvents = Number(row.previous_events) || 0;
        if (!shopDomain || previousEvents < minPreviousEvents) {
          continue;
        }
        const dropPercent =
          previousEvents > 0 ? ((previousEvents - currentEvents) / previousEvents) * 100 : 0;
        if (!(dropPercent >= dropThresholdPercent)) {
          continue;
        }
        signals.push({
          id: `usage_drop:${shopDomain}`,
          type: 'usage_drop',
          severity: currentEvents === 0 ? 'critical' : 'warning',
          shop_domain: shopDomain,
          title: 'Usage drop detected',
          details: `Events dropped from ${previousEvents} to ${currentEvents} in the last ${windowDays} days.`,
          recommended_action:
            'Reach out to confirm app health, script installation, and recent store/theme changes.',
          metric_current: currentEvents,
          metric_previous: previousEvents,
          metric_drop_percent: Number(dropPercent.toFixed(1)),
          detected_at: row.last_event_at || new Date().toISOString(),
        });
      }
    } catch (_usageErr) {
      // Non-blocking: proactive endpoint should still return other signal groups.
    }

    // 2) Running tests with no recent events.
    try {
      const inactivityRows = await query(
        `
          SELECT
            LOWER(TRIM(t.shop_domain)) AS shop_domain,
            COUNT(*)::int AS running_tests,
            COALESCE(ev.events_last_window, 0)::int AS events_last_window,
            MAX(t.updated_at) AS latest_test_update
          FROM tests t
          LEFT JOIN (
            SELECT LOWER(TRIM(shop_domain)) AS shop_domain, COUNT(*)::int AS events_last_window
            FROM events
            WHERE created_at >= NOW() - make_interval(days => $1::int)
            GROUP BY 1
          ) ev
            ON ev.shop_domain = LOWER(TRIM(t.shop_domain))
          WHERE LOWER(TRIM(COALESCE(t.status, ''))) = 'running'
            AND COALESCE(TRIM(t.shop_domain), '') <> ''
          GROUP BY 1, ev.events_last_window
        `,
        [windowDays]
      ).catch(() => ({ rows: [] }));
      for (const row of inactivityRows.rows || []) {
        const shopDomain = String(row.shop_domain || '')
          .trim()
          .toLowerCase();
        const runningTests = Number(row.running_tests) || 0;
        const eventsLastWindow = Number(row.events_last_window) || 0;
        if (!shopDomain || runningTests <= 0 || eventsLastWindow > 0) {
          continue;
        }
        signals.push({
          id: `running_test_inactive:${shopDomain}`,
          type: 'running_test_inactive',
          severity: 'critical',
          shop_domain: shopDomain,
          title: 'Running tests with no traffic events',
          details: `${runningTests} running test(s), but no events received in the last ${windowDays} days.`,
          recommended_action:
            'Contact merchant to verify storefront script loading, domain connection, and traffic source.',
          metric_current: eventsLastWindow,
          metric_previous: runningTests,
          detected_at: row.latest_test_update || new Date().toISOString(),
        });
      }
    } catch (_inactivityErr) {
      // Non-blocking.
    }

    // 3) Open support backlog per shop.
    try {
      const backlogWithDeletedSql = `
        SELECT
          LOWER(TRIM(COALESCE(shop_domain, ''))) AS shop_domain,
          COUNT(*)::int AS open_tickets,
          MIN(created_at) AS oldest_open_at,
          MAX(created_at) AS latest_open_at
        FROM support_tickets
        WHERE LOWER(TRIM(COALESCE(status, ''))) = 'open'
          AND (deleted_at IS NULL)
        GROUP BY 1
      `;
      const backlogNoDeletedSql = `
        SELECT
          LOWER(TRIM(COALESCE(shop_domain, ''))) AS shop_domain,
          COUNT(*)::int AS open_tickets,
          MIN(created_at) AS oldest_open_at,
          MAX(created_at) AS latest_open_at
        FROM support_tickets
        WHERE LOWER(TRIM(COALESCE(status, ''))) = 'open'
        GROUP BY 1
      `;
      let backlogRows;
      try {
        backlogRows = await query(backlogWithDeletedSql).catch(() => ({ rows: [] }));
      } catch (err) {
        if (err.message && /deleted_at|column.*does not exist/i.test(err.message)) {
          backlogRows = await query(backlogNoDeletedSql).catch(() => ({ rows: [] }));
        } else {
          throw err;
        }
      }
      for (const row of backlogRows.rows || []) {
        const shopDomain = String(row.shop_domain || '')
          .trim()
          .toLowerCase();
        const openTickets = Number(row.open_tickets) || 0;
        if (!shopDomain || openTickets < openTicketsThreshold) {
          continue;
        }
        signals.push({
          id: `open_ticket_backlog:${shopDomain}`,
          type: 'open_ticket_backlog',
          severity: openTickets >= openTicketsThreshold * 2 ? 'critical' : 'warning',
          shop_domain: shopDomain,
          title: 'Open support backlog',
          details: `${openTickets} open support ticket(s) for this shop.`,
          recommended_action:
            'Prioritize outreach and route tickets to reduce SLA risk and churn signals.',
          metric_current: openTickets,
          metric_previous: null,
          detected_at: row.latest_open_at || row.oldest_open_at || new Date().toISOString(),
        });
      }
    } catch (_backlogErr) {
      // Non-blocking.
    }

    // 4) Payment/renewal-like webhook signals (when available).
    try {
      const billingEventRows = await query(
        `
          SELECT
            LOWER(TRIM(COALESCE(shop_domain, ''))) AS shop_domain,
            topic,
            received_at
          FROM webhook_events
          WHERE received_at >= NOW() - make_interval(days => $1::int)
            AND (
              LOWER(COALESCE(topic, '')) LIKE '%billing%'
              OR LOWER(COALESCE(topic, '')) LIKE '%payment%'
              OR LOWER(COALESCE(topic, '')) LIKE '%subscription%'
              OR LOWER(COALESCE(topic, '')) LIKE '%app_subscriptions%'
            )
          ORDER BY received_at DESC
          LIMIT 300
        `,
        [windowDays]
      ).catch(() => ({ rows: [] }));
      const byShop = new Map();
      for (const row of billingEventRows.rows || []) {
        const shopDomain = String(row.shop_domain || '')
          .trim()
          .toLowerCase();
        if (!shopDomain || byShop.has(shopDomain)) {
          continue;
        }
        byShop.set(shopDomain, row);
      }
      for (const [shopDomain, row] of byShop.entries()) {
        const topic = String(row.topic || '').trim();
        const topicLower = topic.toLowerCase();
        const isFailureTopic =
          topicLower.includes('fail') ||
          topicLower.includes('declin') ||
          topicLower.includes('cancel') ||
          topicLower.includes('expired');
        signals.push({
          id: `billing_event:${shopDomain}`,
          type: 'billing_event',
          severity: isFailureTopic ? 'critical' : 'info',
          shop_domain: shopDomain,
          title: isFailureTopic ? 'Billing/payment risk signal' : 'Billing lifecycle signal',
          details: `Recent webhook topic: ${topic || 'unknown'}.`,
          recommended_action: isFailureTopic
            ? 'Initiate outreach to confirm subscription/payment status and prevent interruption.'
            : 'Review billing lifecycle event and confirm customer health.',
          metric_current: null,
          metric_previous: null,
          detected_at: row.received_at || new Date().toISOString(),
        });
      }
    } catch (_billingErr) {
      // Non-blocking.
    }

    const sortedSignals = signals.sort((a, b) => {
      const severityDelta =
        supportProactiveSeverityWeight(b.severity) - supportProactiveSeverityWeight(a.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }
      const aTime = a?.detected_at ? new Date(a.detected_at).getTime() : 0;
      const bTime = b?.detected_at ? new Date(b.detected_at).getTime() : 0;
      return bTime - aTime;
    });
    const summary = {
      total_signals: sortedSignals.length,
      critical: sortedSignals.filter(
        item => normalizeSupportProactiveSeverity(item.severity) === 'critical'
      ).length,
      warning: sortedSignals.filter(
        item => normalizeSupportProactiveSeverity(item.severity) === 'warning'
      ).length,
      info: sortedSignals.filter(
        item => normalizeSupportProactiveSeverity(item.severity) === 'info'
      ).length,
    };

    return sendSuccess(res, HTTP_STATUS.OK, {
      window_days: windowDays,
      drop_threshold_percent: dropThresholdPercent,
      min_previous_events: minPreviousEvents,
      open_tickets_threshold: openTicketsThreshold,
      summary,
      signals: sortedSignals,
    });
  })
);

/**
 * POST /api/admin/support/proactive-signals/outreach
 * Create a proactive outreach support ticket for a detected signal.
 */
router.post(
  '/support/proactive-signals/outreach',
  asyncHandler(async (req, res) => {
    const shopDomain = String(req.body?.shop_domain || '')
      .trim()
      .toLowerCase();
    const signalType = normalizeSupportProactiveSignalType(req.body?.signal_type);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!shopDomain) {
      return res.status(400).json({ success: false, error: 'shop_domain is required' });
    }
    if (note.length > SUPPORT_PROACTIVE_NOTE_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `note must be ${SUPPORT_PROACTIVE_NOTE_MAX_LENGTH} characters or less`,
      });
    }

    const tenantLookup = await query(
      'SELECT id FROM tenants WHERE LOWER(TRIM(domain)) = LOWER(TRIM($1)) LIMIT 1',
      [shopDomain]
    ).catch(() => ({ rows: [] }));
    const tenantId = tenantLookup.rows?.[0]?.id || null;
    const signalLabel = signalType === 'generic' ? 'proactive_signal' : signalType;
    const subject = `[Proactive outreach] ${shopDomain} · ${signalLabel}`;
    const message = [
      'This ticket was generated from proactive support monitoring.',
      `Signal type: ${signalLabel}`,
      `Shop: ${shopDomain}`,
      note ? `Note: ${note}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const metadata = {
      source: 'proactive_support_monitor',
      signal_type: signalLabel,
      created_by_admin: req.adminId || null,
      note: note || null,
      created_at: new Date().toISOString(),
    };

    let insertResult;
    try {
      insertResult = await query(
        `INSERT INTO support_tickets
           (user_id, email, subject, category, message, tenant_id, shop_domain, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING id, created_at`,
        [
          null,
          SUPPORT_PROACTIVE_OUTREACH_EMAIL,
          subject,
          'other',
          message,
          tenantId,
          shopDomain,
          JSON.stringify(metadata),
        ]
      );
    } catch (err) {
      if (err.message && /metadata|column.*does not exist/i.test(err.message)) {
        insertResult = await query(
          `INSERT INTO support_tickets
             (user_id, email, subject, category, message, tenant_id, shop_domain)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, created_at`,
          [null, SUPPORT_PROACTIVE_OUTREACH_EMAIL, subject, 'other', message, tenantId, shopDomain]
        );
      } else {
        throw err;
      }
    }

    const ticketId = insertResult.rows?.[0]?.id || null;
    await auditLogService.logAdminAction(req, {
      entityType: 'support_proactive_outreach',
      entityId: ticketId ? String(ticketId) : shopDomain,
      action: 'create',
      changes: {
        shop_domain: shopDomain,
        signal_type: signalLabel,
      },
    });

    return sendSuccess(res, HTTP_STATUS.CREATED, {
      ticket_id: ticketId,
      shop_domain: shopDomain,
      signal_type: signalLabel,
      created_at: insertResult.rows?.[0]?.created_at || null,
    });
  })
);

/**
 * POST /api/admin/support-tickets/:id/suggest-reply
 * Generate an AI draft reply for admin agents from ticket content + optional KB context.
 */
router.post(
  '/support-tickets/:id/suggest-reply',
  asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    if (!ticketId || !validators.isValidUUID(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket id' });
    }

    const withDeletedSql = `
      SELECT id, email, subject, category, message, status, shop_domain, created_at, updated_at
      FROM support_tickets
      WHERE id = $1::uuid
        AND (deleted_at IS NULL)
      LIMIT 1
    `;
    const noDeletedSql = `
      SELECT id, email, subject, category, message, status, shop_domain, created_at, updated_at
      FROM support_tickets
      WHERE id = $1::uuid
      LIMIT 1
    `;

    let ticketResult;
    try {
      ticketResult = await query(withDeletedSql, [ticketId]);
    } catch (err) {
      if (err.message && /deleted_at|column.*does not exist/i.test(err.message)) {
        ticketResult = await query(noDeletedSql, [ticketId]);
      } else {
        throw err;
      }
    }
    const ticket = ticketResult?.rows?.[0];
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const promptInput = [
      `Subject: ${String(ticket.subject || '').trim()}`,
      `Category: ${String(ticket.category || 'other').trim()}`,
      `Status: ${String(ticket.status || 'open').trim()}`,
      `Shop: ${String(ticket.shop_domain || 'unknown').trim()}`,
      '',
      'Customer message:',
      String(ticket.message || '').trim(),
    ].join('\n');

    let suggestedReply = '';
    let provider = 'fallback_template';
    let kbSources = [];

    if (!apiKey) {
      suggestedReply = buildSupportFallbackReply(ticket);
    } else {
      const { context: kbContext, sources } = await getSupportKbContextForAdmin(
        promptInput,
        apiKey
      );
      kbSources = sources || [];
      const systemPrompt = `You are a senior RipX customer support agent.
Write a support reply email draft in plain text only.
Rules:
- Keep it concise and practical (100-220 words).
- Acknowledge the issue first.
- Provide concrete next steps.
- Ask at most 2 clarifying questions when needed.
- Do not invent unsupported platform features or guarantees.
- End with "Best, RipX Support".`;
      const userPrompt = [
        'Ticket details:',
        promptInput.slice(0, SUPPORT_SUGGEST_REPLY_MAX_INPUT_CHARS),
        '',
        kbContext
          ? `Knowledge base context (use only if relevant and accurate):\n${kbContext}`
          : 'Knowledge base context: (none available)',
      ].join('\n\n');

      try {
        const OpenAI = require('openai').default;
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: SUPPORT_SUGGEST_REPLY_MAX_TOKENS,
          temperature: 0.25,
        });
        suggestedReply =
          completion?.choices?.[0]?.message?.content?.trim() || buildSupportFallbackReply(ticket);
        provider = 'openai';
      } catch (err) {
        suggestedReply = buildSupportFallbackReply(ticket);
        provider = 'fallback_template';
        try {
          const logger = require('../utils/logger');
          logger.warn('Admin suggest-reply OpenAI failed', {
            ticketId,
            error: err?.message || 'unknown',
          });
        } catch (_logErr) {
          // Ignore logger import/emit failures for this non-critical path.
        }
      }
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'support_ticket',
      entityId: String(ticket.id),
      action: 'suggest_reply_generated',
      changes: {
        provider,
        used_kb: kbSources.length > 0,
        source_count: kbSources.length,
      },
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      ticket_id: ticket.id,
      suggested_reply: suggestedReply,
      provider,
      sources: kbSources,
      generated_at: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/admin/support-tickets/:id/route
 * Route a ticket to an assignee and/or escalate priority.
 */
router.post(
  '/support-tickets/:id/route',
  asyncHandler(async (req, res) => {
    const ticketId = req.params.id;
    if (!ticketId || !validators.isValidUUID(ticketId)) {
      return res.status(400).json({ success: false, error: 'Invalid ticket id' });
    }

    const body = req.body || {};
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length > SUPPORT_ROUTE_REASON_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `reason must be ${SUPPORT_ROUTE_REASON_MAX_LENGTH} characters or less`,
      });
    }
    const requestedAssignedTo = typeof body.assigned_to === 'string' ? body.assigned_to.trim() : '';
    if (requestedAssignedTo.length > SUPPORT_ASSIGNED_TO_MAX_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `assigned_to must be ${SUPPORT_ASSIGNED_TO_MAX_LENGTH} characters or less`,
      });
    }

    const requestedPriority =
      typeof body.priority === 'string' ? normalizeSupportPriority(body.priority, '') : '';
    if (body.priority && !requestedPriority) {
      return res.status(400).json({
        success: false,
        error: `priority must be one of: ${SUPPORT_TICKET_PRIORITIES.join(', ')}`,
      });
    }

    const escalate = Boolean(body.escalate);
    const autoAssign = body.auto_assign !== false;
    const manualPool = ['general', 'technical', 'billing'].includes(String(body.pool || '').trim())
      ? String(body.pool || '').trim()
      : null;

    const ticketResult = await getSupportTicketById(ticketId);
    const ticket = ticketResult?.rows?.[0];
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    const currentPriority = normalizeSupportPriority(ticket.priority, 'normal');
    let nextPriority = requestedPriority || currentPriority;
    if (!requestedPriority && escalate) {
      nextPriority = getEscalatedSupportPriority(currentPriority);
    }

    const escalationConfig = getSupportEscalationConfig();
    const escalationState = getSupportEscalationState(ticket, escalationConfig);
    if (escalate && escalationState.targetPriority) {
      const targetRank = getSupportPriorityRank(escalationState.targetPriority);
      const nextRank = getSupportPriorityRank(nextPriority);
      if (targetRank > nextRank) {
        nextPriority = escalationState.targetPriority;
      }
    }

    const pool = manualPool || getSupportRoutingPool(ticket.category);
    const poolAgents = getSupportRoutingAgentsByPool(pool);
    let nextAssignedTo = requestedAssignedTo || ticket.assigned_to || null;
    let assignedSource = requestedAssignedTo ? 'manual' : ticket.assigned_to ? 'existing' : 'none';
    if (!requestedAssignedTo && autoAssign && !ticket.assigned_to) {
      const autoAssignee = await pickSupportRoundRobinAssignee(pool, poolAgents);
      if (autoAssignee) {
        nextAssignedTo = autoAssignee;
        assignedSource = 'auto_round_robin';
      }
    }

    const currentMetadata =
      ticket.metadata && typeof ticket.metadata === 'object' && !Array.isArray(ticket.metadata)
        ? ticket.metadata
        : {};
    const currentRouting =
      currentMetadata.routing &&
      typeof currentMetadata.routing === 'object' &&
      !Array.isArray(currentMetadata.routing)
        ? currentMetadata.routing
        : {};
    const escalationCountBase = Number(currentRouting.escalation_count) || 0;
    const nowIso = new Date().toISOString();
    const nextMetadata = {
      ...currentMetadata,
      routing: {
        ...currentRouting,
        pool,
        reason: reason || null,
        assigned_source: assignedSource,
        auto_assigned: assignedSource === 'auto_round_robin',
        last_routed_at: nowIso,
        last_escalated_at: escalate ? nowIso : currentRouting.last_escalated_at || null,
        escalation_count: escalate ? escalationCountBase + 1 : escalationCountBase,
      },
    };

    const statusNow = String(ticket.status || 'open')
      .trim()
      .toLowerCase();
    const nextStatus =
      escalate && statusNow !== 'open' && SUPPORT_TICKET_STATUSES.includes(statusNow)
        ? 'open'
        : statusNow;
    const updateResult = await persistSupportTicketRoutingUpdate({
      ticketId,
      status: nextStatus,
      priority: nextPriority,
      assignedTo: nextAssignedTo,
      metadataJson: JSON.stringify(nextMetadata),
    });
    if (!updateResult.rows?.length) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'support_ticket',
      entityId: String(ticketId),
      action: escalate ? 'ticket_escalated' : 'ticket_routed',
      changes: {
        status: nextStatus,
        priority: nextPriority,
        assigned_to: nextAssignedTo,
        pool,
        assigned_source: assignedSource,
      },
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      id: updateResult.rows[0].id,
      status: updateResult.rows[0].status,
      priority: updateResult.rows[0].priority,
      assigned_to: updateResult.rows[0].assigned_to || null,
      updated_at: updateResult.rows[0].updated_at,
      pool,
      assigned_source: assignedSource,
      escalation_applied: escalate,
    });
  })
);

/**
 * POST /api/admin/support-tickets/escalate
 * Apply escalation rules to open tickets and optionally auto-assign by pool.
 */
router.post(
  '/support-tickets/escalate',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const highHoursRaw = parseInt(body.high_after_hours, 10);
    const urgentHoursRaw = parseInt(body.urgent_after_hours, 10);
    const escalationConfig = getSupportEscalationConfig(highHoursRaw, urgentHoursRaw);
    const autoAssign = body.auto_assign !== false;
    const parsedLimit = parseInt(body.limit, 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), SUPPORT_ESCALATION_SWEEP_MAX_LIMIT)
      : SUPPORT_ESCALATION_SWEEP_DEFAULT_LIMIT;

    const withDeletedSql = `
      SELECT id, created_at, status, priority
      FROM support_tickets
      WHERE status = 'open'
        AND (deleted_at IS NULL)
        AND created_at <= NOW() - ($1::numeric * INTERVAL '1 hour')
      ORDER BY created_at ASC
      LIMIT $2
    `;
    const noDeletedSql = `
      SELECT id, created_at, status, priority
      FROM support_tickets
      WHERE status = 'open'
        AND created_at <= NOW() - ($1::numeric * INTERVAL '1 hour')
      ORDER BY created_at ASC
      LIMIT $2
    `;

    let candidateResult;
    try {
      candidateResult = await query(withDeletedSql, [escalationConfig.highHours, limit]);
    } catch (err) {
      if (err.message && /deleted_at|column.*does not exist/i.test(err.message)) {
        candidateResult = await query(noDeletedSql, [escalationConfig.highHours, limit]);
      } else {
        throw err;
      }
    }

    const candidates = Array.isArray(candidateResult?.rows) ? candidateResult.rows : [];
    const escalated = [];
    const skipped = [];

    for (const row of candidates) {
      const state = getSupportEscalationState(row, escalationConfig);
      if (!state.due || !state.targetPriority) {
        skipped.push({ id: row.id, reason: 'not_due' });
        continue;
      }

      const ticketResult = await getSupportTicketById(row.id).catch(() => ({ rows: [] }));
      const ticket = ticketResult?.rows?.[0];
      if (!ticket) {
        skipped.push({ id: row.id, reason: 'not_found' });
        continue;
      }

      const currentPriority = normalizeSupportPriority(ticket.priority, 'normal');
      const currentRank = getSupportPriorityRank(currentPriority);
      const targetRank = getSupportPriorityRank(state.targetPriority);
      const pool = getSupportRoutingPool(ticket.category);
      const poolAgents = getSupportRoutingAgentsByPool(pool);
      let nextAssignedTo = ticket.assigned_to || null;
      let assignedSource = ticket.assigned_to ? 'existing' : 'none';
      if (!nextAssignedTo && autoAssign) {
        const autoAssignee = await pickSupportRoundRobinAssignee(pool, poolAgents);
        if (autoAssignee) {
          nextAssignedTo = autoAssignee;
          assignedSource = 'auto_round_robin';
        }
      }

      if (currentRank >= targetRank && assignedSource !== 'auto_round_robin') {
        skipped.push({ id: row.id, reason: 'already_at_or_above_target' });
        continue;
      }
      const nextPriority = targetRank > currentRank ? state.targetPriority : currentPriority;

      const currentMetadata =
        ticket.metadata && typeof ticket.metadata === 'object' && !Array.isArray(ticket.metadata)
          ? ticket.metadata
          : {};
      const currentRouting =
        currentMetadata.routing &&
        typeof currentMetadata.routing === 'object' &&
        !Array.isArray(currentMetadata.routing)
          ? currentMetadata.routing
          : {};
      const escalationCountBase = Number(currentRouting.escalation_count) || 0;
      const nowIso = new Date().toISOString();
      const nextMetadata = {
        ...currentMetadata,
        routing: {
          ...currentRouting,
          pool,
          reason: `escalation_sweep_${escalationConfig.highHours}_${escalationConfig.urgentHours}`,
          assigned_source: assignedSource,
          auto_assigned: assignedSource === 'auto_round_robin',
          last_routed_at: nowIso,
          last_escalated_at: nowIso,
          escalation_count: escalationCountBase + 1,
        },
      };

      const updateResult = await persistSupportTicketRoutingUpdate({
        ticketId: row.id,
        status: 'open',
        priority: nextPriority,
        assignedTo: nextAssignedTo,
        metadataJson: JSON.stringify(nextMetadata),
      }).catch(() => ({ rows: [] }));
      if (updateResult.rows?.length) {
        const routed = updateResult.rows[0];
        escalated.push({
          id: routed.id,
          priority: routed.priority,
          assigned_to: routed.assigned_to || null,
        });
      } else {
        skipped.push({ id: row.id, reason: 'update_failed' });
      }
    }

    await auditLogService.logAdminAction(req, {
      entityType: 'support_ticket',
      entityId: '__bulk__',
      action: 'escalation_sweep_run',
      changes: {
        candidates: candidates.length,
        escalated: escalated.length,
        skipped: skipped.length,
        high_hours: escalationConfig.highHours,
        urgent_hours: escalationConfig.urgentHours,
      },
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      success: true,
      summary: {
        candidates: candidates.length,
        escalated: escalated.length,
        skipped: skipped.length,
      },
      thresholds: {
        high_after_hours: escalationConfig.highHours,
        urgent_after_hours: escalationConfig.urgentHours,
      },
      escalated,
      skipped,
    });
  })
);

/**
 * POST /api/admin/support-tickets/bulk
 * Bulk update ticket status. Body: { ticketIds: string[], action: 'close'|'resolve' }.
 * Defined before :id so "bulk" is not interpreted as a ticket id.
 */
router.post(
  '/support-tickets/bulk',
  asyncHandler(async (req, res) => {
    const ticketIds = Array.isArray(req.body?.ticketIds) ? req.body.ticketIds : [];
    const action = (req.body?.action || '').toLowerCase();
    const statusMap = { close: 'closed', resolve: 'resolved' };
    const newStatus = statusMap[action];
    if (!newStatus || ticketIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ticketIds (non-empty array) and action (close|resolve) required',
      });
    }
    const validIds = ticketIds.filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id));
    if (validIds.length === 0) {
      return sendSuccess(res, HTTP_STATUS.OK, { updated: 0, ticketIds: [] });
    }
    const result = await query(
      `UPDATE support_tickets SET status = $1, updated_at = NOW()
       WHERE id = ANY($2::uuid[]) AND (deleted_at IS NULL)
       RETURNING id`,
      [newStatus, validIds]
    ).catch(() => ({ rows: [] }));
    const updated = result.rows.length;
    return sendSuccess(res, HTTP_STATUS.OK, {
      updated,
      ticketIds: result.rows.map(r => r.id),
    });
  })
);

/**
 * PATCH /api/admin/support-tickets/:id
 * Update ticket status. Body: { status } (open|closed|resolved).
 */
router.patch(
  '/support-tickets/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const newStatus =
      typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : null;
    if (!newStatus || !SUPPORT_TICKET_STATUSES.includes(newStatus)) {
      return res.status(400).json({
        success: false,
        error: 'status must be one of: open, closed, resolved',
      });
    }
    const result = await query(
      `UPDATE support_tickets SET status = $1, updated_at = NOW()
       WHERE id = $2::uuid AND (deleted_at IS NULL)
       RETURNING id, status, updated_at`,
      [newStatus, id]
    ).catch(() => ({ rows: [] }));
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    return sendSuccess(res, HTTP_STATUS.OK, {
      id: result.rows[0].id,
      status: result.rows[0].status,
      updated_at: result.rows[0].updated_at,
    });
  })
);

module.exports = router;
