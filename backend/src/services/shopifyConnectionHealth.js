/**
 * Live Shopify OAuth session health (token + scopes).
 */

const shopifyService = require('./shopifyService');
const logger = require('../utils/logger');
const { missingShopifyScopes } = require('../utils/shopifyScopes');

const CONNECTION_HEALTH_QUERY = `
  query RipXConnectionHealth {
    shop {
      name
    }
  }
`;

const CONNECTION_HEALTH_CACHE_TTL_MS = Math.max(
  15000,
  Number.parseInt(process.env.RIPX_CONNECTION_HEALTH_CACHE_TTL_MS || '60000', 10) || 60000
);
const connectionHealthCache = new Map();

function buildConnectionPayload({
  shopDomain,
  connected,
  state,
  action,
  message,
  code = null,
  tokenValid = null,
  missingScopes = [],
  shopName = null,
  checkFailed = false,
}) {
  return {
    connected: Boolean(connected),
    shop: shopDomain,
    connection: {
      connected: Boolean(connected),
      shop: shopDomain,
      state,
      action,
      message,
      code,
    },
    tokenHealth: {
      valid: tokenValid,
      missingScopes,
      shopName,
      checkFailed: Boolean(checkFailed),
    },
  };
}

function getCachedConnectionHealth(shopDomain) {
  const entry = connectionHealthCache.get(shopDomain);
  if (!entry || entry.expiresAt <= Date.now()) {
    return null;
  }
  return entry.value;
}

function setCachedConnectionHealth(shopDomain, value) {
  connectionHealthCache.set(shopDomain, {
    expiresAt: Date.now() + CONNECTION_HEALTH_CACHE_TTL_MS,
    value,
  });
}

/**
 * @param {{ shopDomain: string, accessToken?: string|null, sessionScope?: string|null }} input
 */
/**
 * DB/session-only check (no Shopify API). Used for home domain lists to avoid N slow GraphQL calls.
 */
function evaluateShopifyConnectionHealthQuick({ shopDomain, accessToken, sessionScope = null }) {
  const normalizedShop = String(shopDomain || '')
    .trim()
    .toLowerCase();
  const token = String(accessToken || '').trim();
  const scopeRaw = String(sessionScope || '').trim();
  const scopeMissing = scopeRaw ? missingShopifyScopes(sessionScope) : [];

  if (!token) {
    return buildConnectionPayload({
      shopDomain: normalizedShop,
      connected: false,
      state: 'needs_install',
      action: 'install',
      code: 'NO_TOKEN',
      message:
        'This store is not connected to RipX. Install the app using your Domains install link or open it from Shopify Admin.',
      tokenValid: false,
      missingScopes: scopeMissing,
    });
  }

  if (scopeMissing.length > 0) {
    const preview =
      scopeMissing.length > 4
        ? `${scopeMissing.slice(0, 4).join(', ')} (+${scopeMissing.length - 4} more)`
        : scopeMissing.join(', ');
    return buildConnectionPayload({
      shopDomain: normalizedShop,
      connected: true,
      state: 'scopes_stale',
      action: 'reauthorize',
      code: 'SCOPES_STALE',
      message: `Update RipX permissions to grant: ${preview}.`,
      tokenValid: true,
      missingScopes: scopeMissing,
    });
  }

  return buildConnectionPayload({
    shopDomain: normalizedShop,
    connected: true,
    state: 'connected',
    action: 'none',
    code: scopeRaw ? 'SESSION_OK' : 'SESSION_OK_UNVERIFIED_SCOPES',
    message: scopeRaw
      ? 'Store session is present (token not verified with Shopify in quick mode).'
      : 'Store is connected. Permissions will sync on the next authorization.',
    tokenValid: true,
    missingScopes: [],
  });
}

async function evaluateShopifyConnectionHealth({
  shopDomain,
  accessToken,
  sessionScope = null,
  skipCache = false,
  quick = false,
}) {
  const normalizedShop = String(shopDomain || '')
    .trim()
    .toLowerCase();
  if (!skipCache) {
    const cached = getCachedConnectionHealth(normalizedShop);
    if (cached) {
      return cached;
    }
  }
  const token = String(accessToken || '').trim();
  const scopeRaw = String(sessionScope || '').trim();
  const scopeMissing = scopeRaw ? missingShopifyScopes(sessionScope) : [];

  if (quick) {
    const payload = evaluateShopifyConnectionHealthQuick({
      shopDomain: normalizedShop,
      accessToken: token,
      sessionScope,
    });
    setCachedConnectionHealth(normalizedShop, payload);
    return payload;
  }

  if (!token) {
    const payload = buildConnectionPayload({
      shopDomain: normalizedShop,
      connected: false,
      state: 'needs_install',
      action: 'install',
      code: 'NO_TOKEN',
      message:
        'This store is not connected to RipX. Install the app using your Domains install link or open it from Shopify Admin.',
      tokenValid: false,
      missingScopes: scopeMissing,
    });
    setCachedConnectionHealth(normalizedShop, payload);
    return payload;
  }

  try {
    const resp = await shopifyService.requestAdminGraphql(
      normalizedShop,
      token,
      CONNECTION_HEALTH_QUERY
    );
    const shopName = resp?.data?.shop?.name || null;

    if (scopeMissing.length > 0) {
      const preview =
        scopeMissing.length > 4
          ? `${scopeMissing.slice(0, 4).join(', ')} (+${scopeMissing.length - 4} more)`
          : scopeMissing.join(', ');
      const payload = buildConnectionPayload({
        shopDomain: normalizedShop,
        connected: true,
        state: 'scopes_stale',
        action: 'reauthorize',
        code: 'SCOPES_STALE',
        message: `Update RipX permissions to grant: ${preview}.`,
        tokenValid: true,
        missingScopes: scopeMissing,
        shopName,
      });
      setCachedConnectionHealth(normalizedShop, payload);
      return payload;
    }

    const payload = buildConnectionPayload({
      shopDomain: normalizedShop,
      connected: true,
      state: 'connected',
      action: 'none',
      code: 'CONNECTED',
      message: 'Store is connected',
      tokenValid: true,
      missingScopes: [],
      shopName,
    });
    setCachedConnectionHealth(normalizedShop, payload);
    return payload;
  } catch (error) {
    const message = String(error?.message || error || '');
    const tokenInvalid = /401|invalid.*token|unauthorized/i.test(message);

    if (tokenInvalid) {
      const payload = buildConnectionPayload({
        shopDomain: normalizedShop,
        connected: false,
        state: 'needs_install',
        action: 'install',
        code: 'TOKEN_INVALID',
        message:
          'Shopify rejected the stored access token. Reconnect via Domains → install link (use a private/incognito window) or open RipX from Shopify Admin.',
        tokenValid: false,
        missingScopes: scopeMissing,
      });
      setCachedConnectionHealth(normalizedShop, payload);
      return payload;
    }

    logger.warn('Shopify connection health check failed (non-auth)', {
      shopDomain: normalizedShop,
      error: message,
    });

    const payload = buildConnectionPayload({
      shopDomain: normalizedShop,
      connected: false,
      state: 'verify_unavailable',
      action: 'retry',
      code: 'VERIFY_UNAVAILABLE',
      message:
        'RipX could not verify this store with Shopify right now. Retry in a moment or reconnect via Domains if the problem persists.',
      tokenValid: null,
      missingScopes: scopeMissing,
      checkFailed: true,
    });
    return payload;
  }
}

function clearConnectionHealthCache(shopDomain) {
  const normalized = String(shopDomain || '')
    .trim()
    .toLowerCase();
  if (normalized) {
    connectionHealthCache.delete(normalized);
  } else {
    connectionHealthCache.clear();
  }
}

module.exports = {
  evaluateShopifyConnectionHealth,
  evaluateShopifyConnectionHealthQuick,
  buildConnectionPayload,
  clearConnectionHealthCache,
};
