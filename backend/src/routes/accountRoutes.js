/**
 * Account Routes
 *
 * Multi-store: list stores, add website to account
 */

const express = require('express');
const router = express.Router();
const { getStoresForAccount, addStoreToAccount } = require('../models/account');
const { sendSuccess, sendError } = require('../utils/response');
const { isShopifyDomain } = require('../models/tenant');
const validators = require('../utils/validators');
const { asyncHandler } = require('../middleware/asyncHandler');
const { HTTP_STATUS } = require('../constants');

/**
 * GET /api/account/stores
 * List stores for current auth (standalone: account tenants; Shopify: current shop)
 */
router.get('/stores', asyncHandler(async (req, res) => {
  const shopDomain = req.shopDomain;
  const accountId = req.accountId;
  const platform = req.platform;

  if (accountId) {
    const stores = await getStoresForAccount(accountId);
    return sendSuccess(res, HTTP_STATUS.OK, {
      stores: stores.map((s) => ({
        id: s.id,
        domain: s.domain,
        platform: s.platform,
        isCurrent: s.domain === shopDomain,
      })),
      currentStore: shopDomain,
      multiStore: stores.length > 1,
      platform: 'standalone',
    });
  }

  if (shopDomain && !accountId) {
    return sendSuccess(res, HTTP_STATUS.OK, {
      stores: [{ id: shopDomain, domain: shopDomain, platform: platform || 'shopify', isCurrent: true }],
      currentStore: shopDomain,
      multiStore: false,
      platform: 'shopify',
    });
  }

  return sendError(res, HTTP_STATUS.UNAUTHORIZED, 'Not authenticated');
}));

/**
 * POST /api/account/stores
 * Add a website to account (standalone only)
 */
router.post('/stores', asyncHandler(async (req, res) => {
  const accountId = req.accountId;

  if (!accountId) {
    return sendError(res, HTTP_STATUS.UNAUTHORIZED, 'Account required. Use API key for multi-store.');
  }

  const { domain } = req.body;
  if (!domain || typeof domain !== 'string') {
    return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Domain is required');
  }

  const normalized = domain.trim().replace(/^https?:\/\//, '').split('/')[0];
  if (!normalized) {
    return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Invalid domain');
  }
  if (!validators.isValidDomain(domain)) {
    return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Enter a valid domain (e.g. example.com)');
  }

  if (isShopifyDomain(normalized)) {
    return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Use Shopify OAuth for Shopify stores');
  }

  try {
    const tenant = await addStoreToAccount(accountId, normalized, 'standalone');
    return sendSuccess(res, HTTP_STATUS.CREATED, {
      store: {
        id: tenant.id,
        domain: tenant.domain,
        platform: tenant.platform,
      },
      message: `Website ${tenant.domain} added. Switch to it in the store selector.`,
    });
  } catch (error) {
    if (error.message === 'Domain already registered') {
      return sendError(res, HTTP_STATUS.CONFLICT, error.message);
    }
    if (error.message === 'Domain is too long') {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, error.message);
    }
    throw error;
  }
}));

module.exports = router;
