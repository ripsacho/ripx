/**
 * Shared runtime config for storefront script (track + app proxy).
 * activeTests and consent flags are embedded in the response — avoid long-lived immutable cache.
 */

/** Bump when embedded runtime config or script contract changes. Keep ?v= in sync: extensions/ripx-theme/blocks/ripx-app-embed.liquid + frontend RIPX_STOREFRONT_SCRIPT_VERSION. */
const SCRIPT_VERSION = '6';

/**
 * DB/API may use "pricing"; storefront logic expects "price".
 * @param {string|null|undefined} type
 * @returns {string}
 */
function normalizeTestTypeForStorefront(type) {
  const t = (type || '').toString().toLowerCase();
  return t === 'pricing' ? 'price' : (type || '').toString();
}

function normalizeTargetTypeForStorefront(test) {
  const raw = String(test?.target_type || '')
    .toLowerCase()
    .trim();
  if (raw) {
    return raw;
  }
  const type = normalizeTestTypeForStorefront(test?.type);
  if (type === 'price') {
    return 'all-products';
  }
  return '';
}

function normalizeProductIdList(rawList) {
  const list = Array.isArray(rawList) ? rawList : [];
  const normalized = list
    .map(id => String(id || '').trim())
    .filter(Boolean)
    .map(id => {
      if (id.startsWith('gid://')) {
        return id;
      }
      const numeric = id.replace(/\D/g, '');
      return numeric ? `gid://shopify/Product/${numeric}` : id;
    });
  return Array.from(new Set(normalized));
}

function mapTestToStorefrontPayload(test) {
  let ids =
    test.target_ids && Array.isArray(test.target_ids) ? test.target_ids.filter(Boolean) : [];
  if (!ids.length && test.target_id) {
    ids = [test.target_id];
  }
  const jsTargeting = test.segments?.js_targeting;
  const antiFlickerModeRaw = String(test.segments?.anti_flicker_mode || '')
    .toLowerCase()
    .trim();
  const antiFlickerMode = antiFlickerModeRaw === 'strict' ? 'strict' : 'balanced';
  const templateKey = String(test.goal?.template_key || '')
    .toLowerCase()
    .trim();
  const excludedProductIds = normalizeProductIdList(test.segments?.excluded_product_ids);
  return {
    id: test.id,
    type: normalizeTestTypeForStorefront(test.type),
    templateKey: templateKey || null,
    targetType: normalizeTargetTypeForStorefront(test),
    targetId: test.target_id || null,
    targetIds: ids.length > 0 ? ids : null,
    excludedProductIds: excludedProductIds.length > 0 ? excludedProductIds : null,
    antiFlickerMode,
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
  normalizeTargetTypeForStorefront,
  mapTestToStorefrontPayload,
};
