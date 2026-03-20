/**
 * Shared runtime config for storefront script (track + app proxy).
 * activeTests and consent flags are embedded in the response — avoid long-lived immutable cache.
 */

const SCRIPT_VERSION = '2';

/**
 * DB/API may use "pricing"; storefront logic expects "price".
 * @param {string|null|undefined} type
 * @returns {string}
 */
function normalizeTestTypeForStorefront(type) {
  const t = (type || '').toString().toLowerCase();
  return t === 'pricing' ? 'price' : (type || '').toString();
}

function mapTestToStorefrontPayload(test) {
  const ids =
    test.target_ids && Array.isArray(test.target_ids)
      ? test.target_ids.filter(Boolean)
      : test.target_id
        ? [test.target_id]
        : [];
  const jsTargeting = test.segments?.js_targeting;
  return {
    id: test.id,
    type: normalizeTestTypeForStorefront(test.type),
    targetType: test.target_type,
    targetId: test.target_id || null,
    targetIds: ids.length > 0 ? ids : null,
    jsTargeting:
      jsTargeting?.enabled && jsTargeting?.code ? { enabled: true, code: jsTargeting.code } : null,
  };
}

/**
 * @param {string} shop
 * @param {object[]} tests
 * @param {import('express').Request} req
 */
function buildStorefrontRuntimeConfig(shop, tests, req) {
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(
    /\/+$/,
    ''
  );

  return {
    apiUrl: `${appUrl}/api`,
    shopDomain: shop,
    version: SCRIPT_VERSION,
    consentRequired: process.env.RIPX_CONSENT_REQUIRED === 'true',
    activeTests: (tests || []).map(mapTestToStorefrontPayload),
  };
}

/**
 * Cache-Control for script responses that embed activeTests.
 * Use RIPX_SCRIPT_CACHE_MAX_AGE (seconds, 0–3600). Default 120. Never immutable — stale cache hides new/updated tests.
 * @returns {string}
 */
function getStorefrontScriptCacheControl() {
  const parsed = parseInt(process.env.RIPX_SCRIPT_CACHE_MAX_AGE, 10);
  let maxAge = Number.isFinite(parsed) && parsed >= 0 ? parsed : 120;
  maxAge = Math.min(maxAge, 3600);
  return `public, max-age=${maxAge}, must-revalidate`;
}

module.exports = {
  SCRIPT_VERSION,
  buildStorefrontRuntimeConfig,
  getStorefrontScriptCacheControl,
  normalizeTestTypeForStorefront,
  mapTestToStorefrontPayload,
};
