/**
 * Me Routes – current user (email session) scoped APIs
 *
 * GET    /api/me/domains       – list domains the user can access (with permitted users)
 * POST   /api/me/domains       – add a domain (create tenant under user's account, return API key if new account)
 * DELETE /api/me/domains/:id   – remove a domain from current user (revoke access, unlink tenant from account)
 * POST   /api/me/account/regenerate-api-key – regenerate account API key (invalidates previous key; returns new key once)
 *
 * Requires: authenticate (email session) + requireEmailSession
 */

const express = require('express');
const router = express.Router();
const { query } = require('../utils/database');
const { asyncHandler } = require('../middleware/asyncHandler');
const { sendSuccess, sendError } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');
const userModel = require('../models/user');
const standaloneUser = require('../models/standaloneUser');
const account = require('../models/account');
const userDomainAccess = require('../models/userDomainAccess');
const auditLogService = require('../services/auditLogService');
const { isShopifyDomain, normalizeDomain } = require('../models/tenant');
const { isUserStatusAllowedForSession } = require('../constants');

/**
 * GET /api/me/domains
 * List domains the current user can access; includes connection (masked) and permitted users per domain.
 */
router.get(
  '/domains',
  asyncHandler(async (req, res) => {
    const email = (req.email || req.shopDomain || '').trim().toLowerCase();
    if (!email) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, 'Email session required');
    }

    const user = await userModel.getByEmail(email);
    if (!user) {
      return sendSuccess(res, HTTP_STATUS.OK, { domains: [] });
    }
    if (!isUserStatusAllowedForSession(user.status)) {
      return sendError(
        res,
        HTTP_STATUS.FORBIDDEN,
        'Account not yet approved or is restricted. Contact support if you have already been approved.'
      );
    }

    const tenantIds = await userDomainAccess.getTenantIdsForUser(user.id, user.account_id);
    if (tenantIds.length === 0) {
      return sendSuccess(res, HTTP_STATUS.OK, { domains: [] });
    }

    const placeholders = tenantIds.map((_, i) => `$${i + 1}`).join(', ');
    const tenantsResult = await query(
      `SELECT t.id, t.domain, t.platform, t.account_id, t.domain_verified_at, a.api_key_prefix
       FROM tenants t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.id IN (${placeholders})`,
      tenantIds
    );

    const domains = await Promise.all(
      tenantsResult.rows.map(async row => {
        const permittedUsers = await userDomainAccess.getUsersForTenant(row.id);
        const role = await userDomainAccess.getRole(user.id, row.id);
        return {
          id: row.id,
          domain: row.domain,
          platform: row.platform,
          connection: row.api_key_prefix ? `${row.api_key_prefix}...` : '—',
          verifiedAt: row.domain_verified_at || null,
          permittedUsers,
          myRole: role || (row.account_id && user.account_id === row.account_id ? 'owner' : null),
        };
      })
    );

    return sendSuccess(res, HTTP_STATUS.OK, { domains });
  })
);

/**
 * POST /api/me/domains
 * Add a domain to the current user's account. Creates account if needed; returns API key only on first domain.
 */
router.post(
  '/domains',
  asyncHandler(async (req, res) => {
    const email = (req.email || req.shopDomain || '').trim().toLowerCase();
    if (!email) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, 'Email session required');
    }

    const user = await userModel.getByEmail(email);
    if (!user) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, 'User not found');
    }
    if (!isUserStatusAllowedForSession(user.status)) {
      return sendError(
        res,
        HTTP_STATUS.FORBIDDEN,
        'Account must be approved before adding domains. Contact support if you have already been approved.'
      );
    }

    const { domain } = req.body || {};
    const normalized = normalizeDomain(domain);
    if (!normalized) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Valid domain is required');
    }
    if (normalized.length > 253) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Domain too long');
    }
    if (isShopifyDomain(normalized)) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Use Shopify OAuth for Shopify stores');
    }

    const existing = await query('SELECT id FROM tenants WHERE domain = $1', [normalized]);
    if (existing.rows.length > 0) {
      return sendError(res, HTTP_STATUS.CONFLICT, 'Domain already registered');
    }

    const { accountId, apiKey } = await standaloneUser.ensureAccountForUser(user.id);
    if (!accountId) {
      return sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Could not create or get account');
    }

    const tenant = await account.addStoreToAccount(accountId, normalized, 'standalone');
    await userDomainAccess.addAccess(user.id, tenant.id, 'owner');

    auditLogService.logAuthAction(req, {
      action: 'add_domain',
      actorId: email,
      entityId: tenant.id,
      changes: { domain: normalized },
    });

    const payload = {
      domain: { id: tenant.id, domain: tenant.domain, platform: tenant.platform },
      message: `Domain ${tenant.domain} added. Use your account API key to connect.`,
    };
    if (apiKey) {
      payload.apiKey = apiKey;
      payload.message =
        'Store your API key securely. It will not be shown again. Use it in the X-RipX-API-Key header.';
    }

    return sendSuccess(res, HTTP_STATUS.CREATED, payload);
  })
);

/**
 * DELETE /api/me/domains/:id
 * Remove a domain from the current user: revoke user_domain_access and set tenant.account_id to NULL
 * so the domain no longer appears in "my domains" and becomes unassigned.
 */
router.delete(
  '/domains/:id',
  asyncHandler(async (req, res) => {
    const email = (req.email || req.shopDomain || '').trim().toLowerCase();
    if (!email) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, 'Email session required');
    }

    const tenantId = req.params.id;
    if (!tenantId) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Domain id required');
    }

    const user = await userModel.getByEmail(email);
    if (!user) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, 'User not found');
    }
    if (!isUserStatusAllowedForSession(user.status)) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, 'Account not approved or restricted.');
    }

    const hasAccess = await userDomainAccess.hasAccess(user.id, tenantId, user.account_id);
    if (!hasAccess) {
      return sendError(res, HTTP_STATUS.NOT_FOUND, 'Domain not found or access denied');
    }

    await userDomainAccess.removeAccess(user.id, tenantId);
    await query('UPDATE tenants SET account_id = NULL, updated_at = NOW() WHERE id = $1', [
      tenantId,
    ]);

    auditLogService.logAuthAction(req, {
      action: 'remove_domain',
      actorId: email,
      entityId: tenantId,
      changes: {},
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      message: 'Domain removed from your list.',
    });
  })
);

/**
 * POST /api/me/account/regenerate-api-key
 * Regenerate the account API key. Previous key is invalidated. New key returned once (store securely).
 */
router.post(
  '/account/regenerate-api-key',
  asyncHandler(async (req, res) => {
    const email = (req.email || req.shopDomain || '').trim().toLowerCase();
    if (!email) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, 'Email session required');
    }

    const user = await userModel.getByEmail(email);
    if (!user) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, 'User not found');
    }
    if (!isUserStatusAllowedForSession(user.status)) {
      return sendError(
        res,
        HTTP_STATUS.FORBIDDEN,
        'Account must be approved to regenerate API key. Contact support if you have already been approved.'
      );
    }
    if (!user.account_id) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'No account linked. Add a domain first.');
    }

    const apiKey = await account.regenerateApiKey(user.account_id);
    if (!apiKey) {
      return sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Could not regenerate API key');
    }

    auditLogService.logAuthAction(req, {
      action: 'regenerate_api_key',
      actorId: email,
      entityId: user.account_id,
      changes: {},
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      apiKey,
      message:
        'Store your new API key securely. The previous key no longer works. Use it in the X-RipX-API-Key header.',
    });
  })
);

module.exports = router;
