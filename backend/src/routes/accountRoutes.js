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
const userModel = require('../models/user');
const standaloneUser = require('../models/standaloneUser');

/**
 * GET /api/account/stores
 * List stores for current auth: email session (user's account), API key (account), or Shopify (single shop).
 */
router.get(
  '/stores',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    const accountId = req.accountId;
    const platform = req.platform;

    // Email session: resolve user -> account -> list stores (so StoreSwitcher/layout work without a shop in storage)
    if (req.authType === 'email' && req.email) {
      const email = (req.email || '').trim().toLowerCase();
      const user = await userModel.getByEmail(email);
      if (!user) {
        return sendSuccess(res, HTTP_STATUS.OK, {
          stores: [],
          currentStore: null,
          multiStore: false,
          platform: 'standalone',
        });
      }
      const { accountId: resolvedAccountId } =
        (await standaloneUser.ensureAccountForUser(user.id)) || {};
      if (!resolvedAccountId) {
        return sendSuccess(res, HTTP_STATUS.OK, {
          stores: [],
          currentStore: null,
          multiStore: false,
          platform: 'standalone',
        });
      }
      const stores = await getStoresForAccount(resolvedAccountId);
      const reqStore = (req.query.store || '').trim().toLowerCase();
      const match = reqStore && stores.find(s => (s.domain || '').toLowerCase() === reqStore);
      const preferredStore = match ? match.domain : (stores[0] && stores[0].domain) || null;
      return sendSuccess(res, HTTP_STATUS.OK, {
        stores: stores.map(s => ({
          id: s.id,
          domain: s.domain,
          platform: /\.myshopify\.com$/i.test(s.domain) ? 'shopify' : s.platform || 'standalone',
          isCurrent: s.domain === preferredStore,
        })),
        currentStore: preferredStore,
        multiStore: stores.length > 1,
        platform: 'standalone',
      });
    }

    if (accountId) {
      const stores = await getStoresForAccount(accountId);
      return sendSuccess(res, HTTP_STATUS.OK, {
        stores: stores.map(s => ({
          id: s.id,
          domain: s.domain,
          platform: /\.myshopify\.com$/i.test(s.domain) ? 'shopify' : s.platform || 'standalone',
          isCurrent: s.domain === shopDomain,
        })),
        currentStore: shopDomain,
        multiStore: stores.length > 1,
        platform: 'standalone',
      });
    }

    if (shopDomain && !accountId) {
      return sendSuccess(res, HTTP_STATUS.OK, {
        stores: [
          { id: shopDomain, domain: shopDomain, platform: platform || 'shopify', isCurrent: true },
        ],
        currentStore: shopDomain,
        multiStore: false,
        platform: 'shopify',
      });
    }

    return sendError(res, HTTP_STATUS.UNAUTHORIZED, 'Not authenticated');
  })
);

/**
 * POST /api/account/stores
 * Add a website to account (standalone only)
 */
router.post(
  '/stores',
  asyncHandler(async (req, res) => {
    const accountId = req.accountId;

    if (!accountId) {
      return sendError(
        res,
        HTTP_STATUS.UNAUTHORIZED,
        'Account required. Use API key for multi-store.'
      );
    }

    const { domain } = req.body;
    if (!domain || typeof domain !== 'string') {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, 'Domain is required');
    }

    const normalized = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
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
  })
);

module.exports = router;
