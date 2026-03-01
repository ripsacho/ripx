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
const { getTenantByApiKey, isShopifyDomain } = require('../models/tenant');
const {
  getAccountByApiKey,
  getTenantByAccountAndDomain,
  getFirstTenantForAccount,
} = require('../models/account');
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

    // Validate shop domain format
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/)) {
      logger.warn('Authentication failed: Invalid shop domain format', {
        shop,
        path: req.path,
      });
      return sendUnauthorized(res, 'Invalid shop domain');
    }

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

    req.shopDomain = shop;

    const shopSession = await getShopSession(shop);
    if (shopSession?.access_token) {
      req.shopifyAccessToken = shopSession.access_token;
    } else if (process.env.NODE_ENV !== 'production' && process.env.SHOPIFY_ACCESS_TOKEN) {
      // Dev-only fallback when shop has not completed OAuth
      req.shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
      logger.debug('Using SHOPIFY_ACCESS_TOKEN dev fallback', { shop });
    } else {
      logger.warn('Authentication failed: No access token found for shop', {
        shop,
        path: req.path,
      });
      return sendUnauthorized(res, 'Shop not authenticated');
    }

    const userStatus = await getRoleAndStatus(shop);
    if (isUserStatusBlocked(userStatus?.status)) {
      logger.warn('Authentication rejected: account restricted', {
        shop,
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
 * Returns true if valid and req was set; false otherwise.
 */
function tryImpersonationToken(req, res, next) {
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
      next();
      return true;
    }
  } catch (_) {
    // Not a valid JWT or expired; fall through to other auth
  }
  return false;
}

/**
 * Check for email session JWT (passwordless login). Sets req.shopDomain = email, req.authType = 'email'.
 */
function tryEmailSessionToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || !process.env.JWT_SECRET) {
    return false;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.ripxtype === 'email_session' && decoded.email) {
      req.shopDomain = decoded.email;
      req.authType = 'email';
      req.email = decoded.email;
      next();
      return true;
    }
  } catch (_) {
    /* invalid or expired */
  }
  return false;
}

/**
 * Multi-platform auth: impersonation JWT first, then Shopify, then API key.
 * Returns a promise from async paths; do not await so that next() hands off
 * control without the caller continuing after next() (Express middleware chain).
 */
function authenticate(req, res, next) {
  if (tryImpersonationToken(req, res, next)) {
    return;
  }
  if (tryEmailSessionToken(req, res, next)) {
    return;
  }

  const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
  const apiKey =
    req.headers['x-ripx-api-key'] ||
    req.headers['x-ripx-apikey'] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (shop && isShopifyDomain(shop)) {
    return authenticateShopify(req, res, next).catch(next);
  }
  if (apiKey) {
    return authenticateApiKey(req, res, next).catch(next);
  }

  logger.warn('Authentication failed: No valid credentials', {
    path: req.path,
    hasShop: !!shop,
    hasApiKey: !!apiKey,
  });
  return sendUnauthorized(res, 'Shop domain or API key required');
}

module.exports = {
  authenticateShopify,
  authenticateApiKey,
  authenticate,
  verifyToken,
};
