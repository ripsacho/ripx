/**
 * Authentication Middleware
 *
 * Handles Shopify OAuth and API key authentication (multi-platform)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { ERROR_MESSAGES } = require('../constants');
const { sendUnauthorized } = require('../utils/response');
const { getShopSession } = require('../models/shopSession');
const {
  getTenantByApiKey,
  getTenantByDomain,
  isShopifyDomain,
  normalizeDomain,
} = require('../models/tenant');
const {
  getAccountByApiKey,
  getTenantByAccountAndDomain,
  getFirstTenantForAccount,
} = require('../models/account');
const standaloneUser = require('../models/standaloneUser');
const { getRoleAndStatus } = require('../models/user');
const { isUserStatusBlocked } = require('../constants');

/**
 * Verify HMAC signature for Shopify requests
 *
 * @param {string} data - Request data
 * @param {string} hmacHeader - HMAC signature from header
 * @returns {boolean} True if signature is valid
 */
function verifyHMAC(data, hmacHeader) {
  if (!hmacHeader || !process.env.SHOPIFY_API_SECRET) {
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET);
    const hash = hmac.update(data, 'utf8').digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch (error) {
    logger.error('HMAC verification error', { error });
    return false;
  }
}

/**
 * Authenticate Shopify request
 * Verifies the request is from an authenticated Shopify shop
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
async function authenticateShopify(req, res, next) {
  try {
    // Get shop domain from query or headers
    const shop = req.query.shop || req.headers['x-shopify-shop-domain'];

    if (!shop) {
      logger.warn('Authentication failed: Shop domain required', {
        path: req.path,
        method: req.method,
      });
      return sendUnauthorized(res, 'Shop domain required');
    }

    // Validate shop domain format and normalize (Shopify domains are lowercase)
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/i)) {
      logger.warn('Authentication failed: Invalid shop domain format', {
        shop,
        path: req.path,
      });
      return sendUnauthorized(res, 'Invalid shop domain');
    }
    const normalizedShop = shop.trim().toLowerCase();

    // For POST/PUT requests with body, verify HMAC if present
    if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
      const hmacHeader = req.headers['x-shopify-hmac-sha256'];

      if (hmacHeader) {
        const bodyString = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

        if (!verifyHMAC(bodyString, hmacHeader)) {
          logger.warn('Authentication failed: Invalid HMAC signature', {
            shop,
            path: req.path,
          });
          return sendUnauthorized(res, 'Invalid request signature');
        }
      }
    }

    // In production, you should:
    // 1. Check if shop has installed the app (query database)
    // 2. Get access token from database based on shop domain
    // 3. Verify token is still valid

    req.shopDomain = normalizedShop;

    const shopSession = await getShopSession(normalizedShop);
    if (shopSession?.access_token) {
      req.shopifyAccessToken = shopSession.access_token;
    } else if (process.env.NODE_ENV !== 'production' && process.env.SHOPIFY_ACCESS_TOKEN) {
      // Dev-only fallback when shop has not completed OAuth
      req.shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
      logger.debug('Using SHOPIFY_ACCESS_TOKEN dev fallback', { shop: normalizedShop });
    } else {
      logger.warn('Authentication failed: No access token found for shop', {
        shop: normalizedShop,
        path: req.path,
      });
      return sendUnauthorized(res, 'Shop not authenticated');
    }

    // Require tenant to be linked to an email user for app UI (shop-authenticated) routes.
    // Webhooks (/api/webhooks) do not use this middleware, so they are not affected.
    const tenant = await getTenantByDomain(normalizedShop);
    if (tenant && tenant.account_id === null) {
      logger.warn('Authentication rejected: store not linked to a user', {
        shop: normalizedShop,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        error: 'This store is not linked to a user. Sign in and connect this store to continue.',
        code: 'STORE_NOT_LINKED',
        shop: normalizedShop,
      });
    }

    const userStatus = await getRoleAndStatus(normalizedShop);
    if (isUserStatusBlocked(userStatus?.status)) {
      logger.warn('Authentication rejected: account restricted', {
        shop: normalizedShop,
        status: userStatus?.status,
        path: req.path,
      });
      return res
        .status(403)
        .json({ success: false, error: 'Account is locked or suspended. Contact support.' });
    }

    next();
  } catch (error) {
    logger.error('Authentication error', { error, path: req.path });
    return sendUnauthorized(res, ERROR_MESSAGES.UNAUTHORIZED);
  }
}

/**
 * Verify JWT token
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies.token;

  if (!token) {
    logger.warn('Token verification failed: No token provided', {
      path: req.path,
      method: req.method,
    });
    return sendUnauthorized(res, 'No token provided');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Token verification failed: Invalid token', {
      error: error.message,
      path: req.path,
    });
    return sendUnauthorized(res, 'Invalid token');
  }
}

/**
 * Authenticate via API key (standalone sites)
 * Header: X-RipX-API-Key or Authorization: Bearer <api_key>
 * Optional: X-RipX-Store for multi-store (domain to use when account has multiple stores)
 */
async function authenticateApiKey(req, res, next) {
  try {
    const apiKey =
      req.headers['x-ripx-api-key'] ||
      req.headers['x-ripx-apikey'] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!apiKey) {
      return sendUnauthorized(res, 'API key required');
    }

    const trimmedKey = apiKey.trim();

    // 1. Try legacy tenant-level API key (backward compat)
    const tenant = await getTenantByApiKey(trimmedKey);
    if (tenant) {
      req.shopDomain = tenant.domain;
      req.platform = tenant.platform;
      req.tenantId = tenant.id;
      req.accountId = tenant.account_id;
      return next();
    }

    // 2. Try account-level API key (multi-store)
    let account = null;
    try {
      account = await getAccountByApiKey(trimmedKey);
    } catch (err) {
      logger.debug('Account lookup skipped', { error: err.message });
    }
    if (!account) {
      logger.warn('API key authentication failed: Invalid key', { path: req.path });
      return sendUnauthorized(res, 'Invalid API key');
    }

    req.accountId = account.id;
    const storeHeader = req.headers['x-ripx-store'] || req.query.store;

    if (storeHeader) {
      const storeTenant = await getTenantByAccountAndDomain(account.id, storeHeader);
      if (storeTenant) {
        req.shopDomain = storeTenant.domain;
        req.platform = storeTenant.platform;
        req.tenantId = storeTenant.id;
      } else {
        const first = await getFirstTenantForAccount(account.id);
        if (!first) {
          logger.warn('API key auth: store not in account and no fallback tenant', {
            store: storeHeader,
            path: req.path,
          });
          return sendUnauthorized(
            res,
            'Store not found in account. Add the store or omit X-RipX-Store.'
          );
        }
        req.shopDomain = first.domain;
        req.platform = first.platform;
        req.tenantId = first.id;
      }
    } else {
      const first = await getFirstTenantForAccount(account.id);
      if (!first) {
        return sendUnauthorized(res, 'No stores in account. Add a website first.');
      }
      req.shopDomain = first.domain;
      req.platform = first.platform;
      req.tenantId = first.id;
    }

    if (!req.shopDomain) {
      logger.warn('API key auth: no shop domain resolved', { path: req.path });
      return sendUnauthorized(
        res,
        'Could not resolve store. Add a store to your account or provide X-RipX-Store.'
      );
    }

    const userStatus = await getRoleAndStatus(req.shopDomain);
    if (isUserStatusBlocked(userStatus?.status)) {
      logger.warn('Authentication rejected: account restricted', {
        shopDomain: req.shopDomain,
        status: userStatus?.status,
        path: req.path,
      });
      return res
        .status(403)
        .json({ success: false, error: 'Account is locked or suspended. Contact support.' });
    }

    next();
  } catch (error) {
    logger.error('API key auth error', { error: error.message, path: req.path });
    return sendUnauthorized(res, ERROR_MESSAGES.UNAUTHORIZED);
  }
}

/**
 * Check for impersonation JWT (admin-issued short-lived token to act as another shop).
 * Sets req and returns true if valid; false otherwise. Does not call next() — caller must.
 */
function tryImpersonationToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token || !process.env.JWT_SECRET) {
    return false;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.ripxtype === 'impersonation' && decoded.impersonated_shop) {
      req.shopDomain = decoded.impersonated_shop;
      req.impersonation = true;
      return true;
    }
  } catch (_) {
    // Not a valid JWT or expired; fall through to other auth
  }
  return false;
}

/**
 * Check for email session JWT (passwordless login). Sets req.email + req.authType = 'email'.
 * Returns true if valid; false otherwise. Does not call next() — caller must.
 */
async function tryEmailSessionToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || !process.env.JWT_SECRET) {
    return false;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.ripxtype === 'email_session' && decoded.email) {
      const normalizedEmail = String(decoded.email || '')
        .trim()
        .toLowerCase();
      const tokenVersion = Number(decoded.token_version ?? 0);
      let currentTokenVersion = 0;
      try {
        const user = await standaloneUser.getByEmail(normalizedEmail);
        currentTokenVersion = Number(user?.token_version ?? 0);
      } catch (_) {
        return false;
      }
      if (!Number.isFinite(tokenVersion) || tokenVersion !== currentTokenVersion) {
        return false;
      }
      req.authType = 'email';
      req.email = normalizedEmail;
      req.emailSessionTokenVersion = tokenVersion;
      return true;
    }
  } catch (_) {
    /* invalid or expired */
  }
  return false;
}

/**
 * Resolve tenant/store context for email-session requests.
 * Email auth identifies the user, but many routes still need req.shopDomain.
 */
async function attachEmailSessionStoreContext(req) {
  if (!req?.email) {
    return;
  }

  const email = String(req.email || '')
    .trim()
    .toLowerCase();
  if (!email) {
    return;
  }

  const user = await standaloneUser.getByEmail(email);
  if (!user) {
    return;
  }

  let accountId = user.account_id || null;
  if (!accountId) {
    const ensured = await standaloneUser.ensureAccountForUser(user.id);
    accountId = ensured?.accountId || null;
  }

  if (accountId) {
    req.accountId = accountId;
  }

  const requestedStoreRaw =
    req.query?.store ||
    req.headers['x-ripx-store'] ||
    req.query?.domain ||
    req.query?.shop ||
    req.headers['x-shopify-shop-domain'];
  const requestedStore = normalizeDomain(
    requestedStoreRaw !== undefined && requestedStoreRaw !== null ? String(requestedStoreRaw) : ''
  );

  if (!accountId) {
    return;
  }

  let tenant = null;
  if (requestedStore) {
    tenant = await getTenantByAccountAndDomain(accountId, requestedStore);
    // Do not silently fall back to a different tenant when a specific store was requested.
    if (!tenant) {
      return;
    }
  } else {
    tenant = await getFirstTenantForAccount(accountId);
  }
  if (!tenant) {
    return;
  }

  req.shopDomain = tenant.domain;
  req.platform = tenant.platform;
  req.tenantId = tenant.id;
}

/**
 * Multi-platform auth: impersonation JWT first, then Shopify, then API key.
 * Sync paths: caller invokes next() once. Async paths: awaited so req is set before next().
 */
async function authenticate(req, res, next) {
  if (tryImpersonationToken(req)) {
    return next();
  }
  if (await tryEmailSessionToken(req)) {
    await attachEmailSessionStoreContext(req);
    return next();
  }

  const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
  const apiKey =
    req.headers['x-ripx-api-key'] ||
    req.headers['x-ripx-apikey'] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (shop && isShopifyDomain(shop)) {
    try {
      await authenticateShopify(req, res, next);
    } catch (err) {
      next(err);
    }
    return;
  }
  if (apiKey) {
    try {
      await authenticateApiKey(req, res, next);
    } catch (err) {
      next(err);
    }
    return;
  }

  logger.warn('Authentication failed: No valid credentials', {
    path: req.path,
    hasShop: !!shop,
    hasApiKey: !!apiKey,
  });
  return sendUnauthorized(res, 'Shop domain or API key required');
}

/**
 * Optional authentication for routes that work with or without auth (e.g. support ticket submit).
 * Tries the same resolution as authenticate; on success sets req.shopDomain, req.email, req.tenantId.
 * Never sends 401 — always calls next(). Use when you want to attach user/tenant context when available.
 */
async function optionalAuthenticate(req, res, next) {
  if (tryImpersonationToken(req)) {
    return next();
  }
  if (await tryEmailSessionToken(req)) {
    await attachEmailSessionStoreContext(req);
    return next();
  }

  const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
  const apiKey =
    req.headers['x-ripx-api-key'] ||
    req.headers['x-ripx-apikey'] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (shop && isShopifyDomain(shop)) {
    try {
      const normalizedShop = shop.trim().toLowerCase();
      const tenant = await getTenantByDomain(normalizedShop);
      req.shopDomain = normalizedShop;
      if (tenant) {
        req.tenantId = tenant.id;
      }
      return next();
    } catch (_) {
      return next();
    }
  }
  if (apiKey) {
    try {
      const trimmedKey = apiKey.trim();
      const tenant = await getTenantByApiKey(trimmedKey);
      if (tenant) {
        req.shopDomain = tenant.domain;
        req.tenantId = tenant.id;
        return next();
      }
      const accountResult = await getAccountByApiKey(trimmedKey);
      if (accountResult?.account) {
        const first = await getFirstTenantForAccount(accountResult.account.id);
        if (first) {
          req.shopDomain = first.domain;
          req.tenantId = first.id;
        }
        return next();
      }
    } catch (_) {
      // ignore
    }
    return next();
  }
  next();
}

module.exports = {
  authenticateShopify,
  authenticateApiKey,
  authenticate,
  optionalAuthenticate,
  verifyToken,
};
