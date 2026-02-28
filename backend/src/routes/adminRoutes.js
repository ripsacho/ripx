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
const { requireAdmin, getEnvAdminDomains } = require('../middleware/requireAdmin');
const { asyncHandler } = require('../middleware/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');
const {
  getRoleAndStatus,
  setStatus: setUserStatus,
  setRole: _setUserRole,
  getProfile,
} = require('../models/user');
const {
  listTenants,
  getTenantByDomain,
  setTenantStatus,
  normalizeDomain,
} = require('../models/tenant');
const { getTestByIdForAdmin } = require('../models/test');
const { listAccounts, getAccountById } = require('../models/account');
const abTestEngine = require('../services/abTestEngine');
const auditLogService = require('../services/auditLogService');
const timeSeriesService = require('../services/timeSeriesService');
const validators = require('../utils/validators');
const standaloneUser = require('../models/standaloneUser');
const emailService = require('../services/emailService');

/**
 * GET /api/admin/me - Current user identity (any authenticated shop).
 * Does not require admin role; returns role so UI can show/hide admin features.
 * Role: users.role, or RIPX_ADMIN_SHOP_DOMAINS, or 'admin' in development.
 */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    let role = null;
    let status = 'active';
    if (req.authType === 'email' && req.email) {
      const adminEmails = (process.env.RIPX_ADMIN_EMAIL || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      if (adminEmails.includes(req.email.trim().toLowerCase())) {
        role = 'admin';
      }
    }
    if (!role) {
      const user = await getRoleAndStatus(req.shopDomain);
      status = user?.status ?? 'active';
      role = user?.role ?? null;
      if (!role) {
        const envAdmins = getEnvAdminDomains();
        const normalized = (req.shopDomain || '').toLowerCase().trim();
        if (envAdmins.length > 0 && envAdmins.includes(normalized)) {
          role = 'admin';
        }
      }
      if (!role && process.env.NODE_ENV === 'development') {
        role = 'admin';
      }
    }
    return sendSuccess(res, HTTP_STATUS.OK, {
      adminId: req.shopDomain || req.email,
      shopDomain: req.shopDomain || null,
      role,
      status,
    });
  })
);

router.use(requireAdmin);

const IMPERSONATION_TOKEN_EXPIRY_SEC = 15 * 60; // 15 minutes

/**
 * POST /api/admin/impersonate
 * Issue a short-lived JWT to act as another shop (support debugging). Body: { shop_domain }. Audited.
 */
router.post(
  '/impersonate',
  asyncHandler(async (req, res) => {
    const shopDomain =
      normalizeDomain(req.body?.shop_domain) ||
      (req.body?.shop_domain && String(req.body.shop_domain).trim().toLowerCase());
    if (!shopDomain) {
      return res.status(400).json({ success: false, error: 'shop_domain is required' });
    }
    const tenant = await getTenantByDomain(shopDomain);
    const userRow = await query('SELECT shop_domain FROM users WHERE shop_domain = $1', [
      shopDomain,
    ]);
    if (!tenant && userRow.rows.length === 0) {
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
 * POST /api/admin/accept-user/:id
 * Accept a pending registration (standalone_users.id).
 */
router.post(
  '/accept-user/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const accepted = await standaloneUser.accept(id, req.adminId);
    if (!accepted) {
      return res.status(404).json({ success: false, error: 'User not found or not pending' });
    }
    return sendSuccess(res, HTTP_STATUS.OK, { message: 'User accepted' });
  })
);

/**
 * POST /api/admin/reject-user/:id
 * Reject a pending registration.
 */
router.post(
  '/reject-user/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const rejected = await standaloneUser.reject(id, req.adminId);
    if (!rejected) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return sendSuccess(res, HTTP_STATUS.OK, { message: 'User rejected' });
  })
);

/**
 * POST /api/admin/send-announcement
 * Send announcement email to all accepted standalone users. Body: { subject, bodyHtml, bodyText }.
 */
router.post(
  '/send-announcement',
  asyncHandler(async (req, res) => {
    const subject = req.body?.subject || 'Announcement from RipX';
    const bodyHtml = req.body?.bodyHtml || req.body?.body || '';
    const bodyText = req.body?.bodyText || '';
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
 * GET /api/admin/users
 * List all users (paginated, optional status and search)
 */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { limit = 50, offset = 0, status: statusFilter, q: search } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    const conditions = [];
    const params = [];
    let idx = 1;
    if (statusFilter) {
      conditions.push(`COALESCE(status, 'active') = $${idx}`);
      params.push(statusFilter);
      idx++;
    }
    if (search && String(search).trim()) {
      const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
      conditions.push(
        `(LOWER(shop_domain) LIKE LOWER($${idx}) OR LOWER(profile->>'email') LIKE LOWER($${idx}) OR LOWER(profile->>'firstName') LIKE LOWER($${idx}) OR LOWER(profile->>'lastName') LIKE LOWER($${idx}))`
      );
      params.push(term);
      idx++;
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*)::int AS c FROM users${where}`;
    const countRes = await query(countSql, params);
    const total = countRes.rows[0]?.c ?? 0;

    const sql = `
      SELECT id, shop_domain, role, COALESCE(status, 'active') AS status,
             created_at, updated_at,
             profile->>'email' AS email,
             profile->>'firstName' AS first_name,
             profile->>'lastName' AS last_name
      FROM users
      ${where}
      ORDER BY updated_at DESC
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
      createdAt: r.created_at,
      updatedAt: r.updated_at,
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
 * Export users list as CSV (must be before /users/:shopDomain)
 */
router.get(
  '/users/export',
  asyncHandler(async (req, res) => {
    const { status: statusFilter, q: search } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (statusFilter) {
      conditions.push(`COALESCE(status, 'active') = $${idx}`);
      params.push(statusFilter);
      idx++;
    }
    if (search && String(search).trim()) {
      const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
      conditions.push(
        `(LOWER(shop_domain) LIKE LOWER($${idx}) OR LOWER(profile->>'email') LIKE LOWER($${idx}) OR LOWER(profile->>'firstName') LIKE LOWER($${idx}) OR LOWER(profile->>'lastName') LIKE LOWER($${idx}))`
      );
      params.push(term);
      idx++;
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT shop_domain, profile->>'email' AS email, profile->>'firstName' AS first_name, profile->>'lastName' AS last_name,
             role, COALESCE(status, 'active') AS status, created_at, updated_at
      FROM users ${where}
      ORDER BY updated_at DESC
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
 * User detail
 */
router.get(
  '/users/:shopDomain',
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    const profile = await getProfile(shopDomain);
    const roleStatus = await getRoleAndStatus(shopDomain);

    if (!profile && !roleStatus) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const sql =
      "SELECT id, shop_domain, role, COALESCE(status, 'active') AS status, profile, account, preferences, created_at, updated_at FROM users WHERE shop_domain = $1";
    const result = await query(sql, [shopDomain]);
    const row = result.rows[0];

    return sendSuccess(res, HTTP_STATUS.OK, {
      id: row?.shop_domain,
      shopDomain: row?.shop_domain,
      profile: row?.profile || {},
      account: row?.account || {},
      preferences: row?.preferences || {},
      role: row?.role,
      status: row?.status || 'active',
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
    });
  })
);

/**
 * GET /api/admin/users/:shopDomain/export
 * Phase 3: GDPR-style data export for the user (profile, domains, tests metadata). JSON only.
 */
router.get(
  '/users/:shopDomain/export',
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    const userRow = await query(
      "SELECT shop_domain, role, COALESCE(status, 'active') AS status, profile, account, preferences, created_at, updated_at FROM users WHERE shop_domain = $1",
      [shopDomain]
    );
    if (userRow.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    const u = userRow.rows[0];
    const domains = await query(
      'SELECT domain, platform, created_at FROM tenants WHERE LOWER(TRIM(domain)) = LOWER(TRIM($1))',
      [shopDomain]
    );
    const tests = await query(
      'SELECT id, name, type, status, created_at, updated_at, started_at, stopped_at FROM tests WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1)) ORDER BY updated_at DESC',
      [shopDomain]
    );
    const payload = {
      exportedAt: new Date().toISOString(),
      shopDomain: u.shop_domain,
      profile: u.profile || {},
      account: u.account || {},
      preferences: u.preferences || {},
      role: u.role,
      status: u.status,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      domains: domains.rows.map(r => ({
        domain: r.domain,
        platform: r.platform,
        createdAt: r.created_at,
      })),
      tests: tests.rows.map(t => ({
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
 */
router.put(
  '/users/:shopDomain/lock',
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
 */
router.put(
  '/users/:shopDomain/unlock',
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
 * Body: { role: 'admin' | 'superadmin' | null }
 */
router.put(
  '/users/:shopDomain/role',
  asyncHandler(async (req, res) => {
    const shopDomain = normalizeDomain(req.params.shopDomain) || req.params.shopDomain;
    const { role } = req.body || {};
    const newRole = role === null || role === '' ? null : role;
    if (newRole !== null && !['admin', 'superadmin'].includes(newRole)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    const sql =
      'UPDATE users SET role = $1, updated_at = NOW() WHERE shop_domain = $2 RETURNING shop_domain';
    const result = await query(sql, [newRole, shopDomain]);
    if (result.rows.length === 0) {
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

    const [testsRes, eventsRes] = await Promise.all([
      query(
        'SELECT id, name, type, status, created_at FROM tests WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1)) ORDER BY updated_at DESC LIMIT 20',
        [domain]
      ),
      query(
        'SELECT COUNT(*)::bigint AS c, COALESCE(SUM(event_value), 0)::float AS revenue FROM events WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))',
        [domain]
      ),
    ]);

    return sendSuccess(res, HTTP_STATUS.OK, {
      ...tenant,
      status: tenant.status || 'active',
      recentTests: testsRes.rows,
      totalEvents: parseInt(eventsRes.rows[0]?.c, 10) || 0,
      totalRevenue: parseFloat(eventsRes.rows[0]?.revenue) || 0,
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
    const { actor_id: actorId, shop_domain: shopDomain, limit = 5000 } = req.query;
    let sql = `
      SELECT id, shop_domain, entity_type, entity_id, action, user_id,
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
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(Math.min(parseInt(limit, 10) || 5000, 10000));

    const result = await query(sql, params);
    const headers = [
      'created_at',
      'shop_domain',
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
 * List admin and tenant audit entries (optional filters: entity_type, shop_domain, actor_id)
 */
router.get(
  '/audit-log',
  asyncHandler(async (req, res) => {
    const {
      actor_id: actorId,
      shop_domain: shopDomain,
      entity_type: entityType,
      limit = 100,
      offset = 0,
    } = req.query;
    let sql = `
      SELECT id, shop_domain, entity_type, entity_id, action, user_id,
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
    if (entityType && String(entityType).trim()) {
      sql += ` AND entity_type = $${idx}`;
      params.push(String(entityType).trim());
      idx++;
    }
    sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit, 10) || 100, parseInt(offset, 10) || 0);

    const result = await query(sql, params);
    const list = result.rows.map(r => ({
      id: r.id,
      shopDomain: r.shop_domain,
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

    const limitNum = parseInt(limit, 10) || 100;
    const offsetNum = parseInt(offset, 10) || 0;
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
        ? Math.max(10, Math.min(10000, parseInt(body.min_sample_size, 10) || 100))
        : null;
    const confidenceLevel =
      body.confidence_level !== undefined && body.confidence_level !== null
        ? Math.max(0.8, Math.min(1, parseFloat(body.confidence_level) || 0.95))
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
    const kv = await query(
      "SELECT key, value FROM key_value_store WHERE key IN ('config.terms_url', 'config.privacy_url')"
    );
    const termsUrl = kv.rows.find(r => r.key === 'config.terms_url')?.value || null;
    const privacyUrl = kv.rows.find(r => r.key === 'config.privacy_url')?.value || null;
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
        `INSERT INTO key_value_store (key, value, updated_at) VALUES ('config.terms_url', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [val]
      );
    }
    if (privacyUrl !== undefined) {
      const val = privacyUrl === null || privacyUrl === '' ? '' : String(privacyUrl).trim();
      await query(
        `INSERT INTO key_value_store (key, value, updated_at) VALUES ('config.privacy_url', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [val]
      );
    }
    await auditLogService.logAdminAction(req, {
      entityType: 'config',
      entityId: 'legal',
      action: 'set',
      changes: { terms_url: termsUrl !== undefined, privacy_url: privacyUrl !== undefined },
    });
    const kv = await query(
      "SELECT key, value FROM key_value_store WHERE key IN ('config.terms_url', 'config.privacy_url')"
    );
    const t = kv.rows.find(r => r.key === 'config.terms_url')?.value || null;
    const p = kv.rows.find(r => r.key === 'config.privacy_url')?.value || null;
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

const { getMaintenanceMode, MAINTENANCE_KEY } = require('../utils/maintenanceMode');
const MAINTENANCE_MESSAGE_KEY = 'config.maintenance_message';
const ANNOUNCEMENT_BANNER_KEY = 'config.announcement_banner';

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

module.exports = router;
