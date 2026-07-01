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
const userDomainAccess = require('../models/userDomainAccess');
const { getRoleAndStatus } = require('../models/user');
const { isUserStatusBlocked } = require('../constants');
const { query } = require('../utils/database');
const EMAIL_SESSION_COOKIE = 'ripx_email_session';

function getRequestedStore(req) {
  const raw =
    req.query?.shop ||
    req.query?.store ||
    req.query?.domain ||
    req.headers['x-ripx-store'] ||
    req.headers['x-shopify-shop-domain'];
  return normalizeDomain(raw !== undefined && raw !== null ? String(raw) : '');
}

function sendShopifyConnectionError(
  res,
  { status = 401, error, code, shop = null, state = 'unknown', action = 'retry' }
) {
  const message = String(error || 'Could not verify Shopify connection');
  return res.status(status).json({
    success: false,
    error: message,
    code: code || 'SHOPIFY_CONNECTION_ERROR',
    connection: {
      connected: false,
      shop: shop || null,
      state,
      action,
      message,
    },
  });
}

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
function isShopifyConnectionStatusRequest(req) {
  return req.method === 'GET' && String(req.path || '').endsWith('/connection-status');
}

function isShopifyReauthorizeRedirectRequest(req) {
  return req.method === 'GET' && String(req.path || '').endsWith('/reauthorize-redirect');
}

async function authenticateShopify(req, res, next) {
  try {
    // Get requested shop domain from query or headers.
    const requestedShop = getRequestedStore(req);
    const connectionStatusProbe = isShopifyConnectionStatusRequest(req);
    const oauthRedirectEntry = isShopifyReauthorizeRedirectRequest(req);

    // If caller has an email session, resolve and enforce store access before loading Shopify token.
    const hasEmailSession = await tryEmailSessionToken(req);
    if (hasEmailSession) {
      await attachEmailSessionStoreContext(req);
      if (!req.shopDomain && connectionStatusProbe && requestedShop) {
        req.shopDomain = requestedShop.trim().toLowerCase();
        req.allowUnlinkedShopifyProbe = true;
      }
      if (!req.shopDomain) {
        if (oauthRedirectEntry && requestedShop) {
          req.shopDomain = requestedShop.trim().toLowerCase();
        } else {
          const requestedTenant = requestedShop ? await getTenantByDomain(requestedShop) : null;
          logger.warn(
            'Authentication failed: Email user has no access to requested Shopify store',
            {
              requestedShop: requestedShop || null,
              path: req.path,
              actor: req.email || null,
            }
          );
          if (requestedShop && !requestedTenant) {
            return sendShopifyConnectionError(res, {
              status: 401,
              error: 'Shop not authenticated',
              code: 'SHOP_NOT_AUTHENTICATED',
              shop: requestedShop || null,
              state: 'needs_install',
              action: 'install',
            });
          }
          return sendShopifyConnectionError(res, {
            status: 403,
            error: 'Store access denied for this user',
            code: 'STORE_ACCESS_DENIED',
            shop: requestedShop || null,
            state: 'needs_link',
            action: 'link',
          });
        }
      }
      if (requestedShop && req.shopDomain !== requestedShop) {
        logger.warn('Authentication failed: Requested Shopify store mismatch for email user', {
          requestedShop,
          resolvedShop: req.shopDomain,
          path: req.path,
          actor: req.email || null,
        });
        return sendShopifyConnectionError(res, {
          status: 403,
          error: 'Requested store is not available for this user',
          code: 'STORE_ACCESS_DENIED',
          shop: requestedShop || null,
          state: 'needs_link',
          action: 'link',
        });
      }
    }

    const shop = req.shopDomain || requestedShop;

    if (!shop) {
      logger.warn('Authentication failed: Shop domain required', {
        path: req.path,
        method: req.method,
      });
      return sendShopifyConnectionError(res, {
        status: 401,
        error: 'Shop domain required',
        code: 'SHOP_REQUIRED',
        shop: null,
        state: 'no_shop',
        action: 'select_store',
      });
    }

    // Validate shop domain format and normalize (Shopify domains are lowercase)
    if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/i)) {
      logger.warn('Authentication failed: Invalid shop domain format', {
        shop,
        path: req.path,
      });
      return sendShopifyConnectionError(res, {
        status: 400,
        error: 'Invalid shop domain',
        code: 'INVALID_SHOP_DOMAIN',
        shop,
        state: 'invalid_shop',
        action: 'verify_store',
      });
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
    } else if (oauthRedirectEntry) {
      logger.debug('Shopify OAuth redirect entry without shop access token', {
        shop: normalizedShop,
        path: req.path,
      });
    } else {
      logger.warn('Authentication failed: No access token found for shop', {
        shop: normalizedShop,
        path: req.path,
      });
      return sendShopifyConnectionError(res, {
        status: 401,
        error: 'Shop not authenticated',
        code: 'SHOP_NOT_AUTHENTICATED',
        shop: normalizedShop,
        state: 'needs_install',
        action: 'install',
      });
    }

    // Require tenant to be linked to an email user for app UI (shop-authenticated) routes.
    // Webhooks (/api/webhooks) do not use this middleware, so they are not affected.
    const tenant = await getTenantByDomain(normalizedShop);
    if (
      tenant &&
      tenant.account_id === null &&
      !req.allowUnlinkedShopifyProbe &&
      !oauthRedirectEntry
    ) {
      logger.warn('Authentication rejected: store not linked to a user', {
        shop: normalizedShop,
        path: req.path,
      });
      return sendShopifyConnectionError(res, {
        status: 403,
        error: 'This store is not linked to a user. Sign in and connect this store to continue.',
        code: 'STORE_NOT_LINKED',
        shop: normalizedShop,
        state: 'needs_link',
        action: 'link',
      });
    }

    const userStatus = await getRoleAndStatus(normalizedShop);
    if (isUserStatusBlocked(userStatus?.status)) {
      logger.warn('Authentication rejected: account restricted', {
        shop: normalizedShop,
        status: userStatus?.status,
        path: req.path,
      });
      return sendShopifyConnectionError(res, {
        status: 403,
        error: 'Account is locked or suspended. Contact support.',
        code: 'ACCOUNT_RESTRICTED',
        shop: normalizedShop,
        state: 'restricted',
        action: 'contact_support',
      });
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
    const storeHeader = getRequestedStore(req);

    if (storeHeader) {
      const storeTenant = await getTenantByAccountAndDomain(account.id, storeHeader);
      if (storeTenant) {
        req.shopDomain = storeTenant.domain;
        req.platform = storeTenant.platform;
        req.tenantId = storeTenant.id;
      } else {
        logger.warn('API key auth: explicit store not found in account', {
          store: String(storeHeader || ''),
          accountId: account.id,
          path: req.path,
        });
        return sendUnauthorized(
          res,
          'Store not found in account. Check X-RipX-Store (or shop/store query) and try again.'
        );
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
      return res.status(403).json({
        success: false,
        error: 'Account is locked or suspended. Contact support.',
        code: 'ACCOUNT_RESTRICTED',
      });
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
  const bearerToken = authHeader && authHeader.replace(/^Bearer\s+/i, '').trim();
  const cookieToken = req.cookies?.[EMAIL_SESSION_COOKIE] || '';
  const token = bearerToken || cookieToken;
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

  const requestedStore = getRequestedStore(req);

  let tenant = null;
  if (requestedStore) {
    if (accountId) {
      tenant = await getTenantByAccountAndDomain(accountId, requestedStore);
    }
    if (!tenant) {
      const candidate = await getTenantByDomain(requestedStore);
      if (candidate?.id) {
        const hasAccess = await userDomainAccess.hasAccess(user.id, candidate.id, accountId);
        if (hasAccess) {
          tenant = candidate;
        }
      }
    }
    // Do not silently fall back to a different tenant when a specific store was requested.
    if (!tenant) {
      return;
    }
  } else {
    if (accountId) {
      tenant = await getFirstTenantForAccount(accountId);
    }
    if (!tenant) {
      const tenantIds = await userDomainAccess.getTenantIdsForUser(user.id, accountId);
      if (tenantIds.length > 0) {
        const fallbackResult = await query(
          `SELECT id, account_id, platform, domain
           FROM tenants
           WHERE id = ANY($1::uuid[])
           ORDER BY created_at ASC
           LIMIT 1`,
          [tenantIds]
        );
        tenant = fallbackResult.rows[0] || null;
      }
    }
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

  const shop = getRequestedStore(req);
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

  const shop = getRequestedStore(req);
  const apiKey =
    req.headers['x-ripx-api-key'] ||
    req.headers['x-ripx-apikey'] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (shop && isShopifyDomain(shop)) {
    try {
      const normalizedShop = shop.trim().toLowerCase();
      const tenant = await getTenantByDomain(normalizedShop);
      if (!tenant || !tenant.id || tenant.account_id === null) {
        return next();
      }
      req.shopDomain = normalizedShop;
      req.tenantId = tenant.id;
      req.accountId = tenant.account_id || null;
      req.platform = tenant.platform;
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
        req.accountId = tenant.account_id || null;
        req.platform = tenant.platform;
        return next();
      }
      const accountResult = await getAccountByApiKey(trimmedKey);
      if (accountResult?.id) {
        req.accountId = accountResult.id;
        const requestedStore = getRequestedStore(req);
        let scopedTenant = null;
        if (requestedStore) {
          scopedTenant = await getTenantByAccountAndDomain(accountResult.id, requestedStore);
          if (!scopedTenant) {
            logger.warn('Optional auth: explicit store not found for account API key', {
              store: String(requestedStore || ''),
              accountId: accountResult.id,
              path: req.path,
            });
            return next();
          }
        } else {
          scopedTenant = await getFirstTenantForAccount(accountResult.id);
        }
        if (scopedTenant) {
          req.shopDomain = scopedTenant.domain;
          req.tenantId = scopedTenant.id;
          req.platform = scopedTenant.platform;
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
