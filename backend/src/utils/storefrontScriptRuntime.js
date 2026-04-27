/**
 * Shared runtime config for storefront script (track + app proxy).
 * activeTests and consent flags are embedded in the response — avoid long-lived immutable cache.
 */

/** Bump when embedded runtime config or script contract changes. Keep ?v= in sync: extensions/ripx-theme/blocks/ripx-app-embed.liquid + frontend RIPX_STOREFRONT_SCRIPT_VERSION. */
const SCRIPT_VERSION = '1.0.40';

/**
 * DB/API may use "pricing"; storefront logic expects "price".
 * @param {string|null|undefined} type
 * @returns {string}
 */
function normalizeTestTypeForStorefront(type) {
  const t = (type || '').toString().toLowerCase();
  return t === 'pricing' ? 'price' : t;
}

function normalizeTargetTypeForStorefront(test) {
  const raw = String(test?.target_type || '')
    .toLowerCase()
    .trim();
  const type = normalizeTestTypeForStorefront(test?.type);
  if ((type === 'price' || type === 'shipping' || type === 'offer') && (!raw || raw === 'all')) {
    return 'all-products';
  }
  if (raw === 'all_products') {
    return 'all-products';
  }
  if (raw) {
    return raw;
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
  // This is the browser contract for price tests. Keep type/target normalization in sync with the
  // wizard and `shouldRunPriceTestOnCurrentPage`, especially all-products and matrix-price tests.
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
