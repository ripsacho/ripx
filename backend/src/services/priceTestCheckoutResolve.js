/**
 * Resolve RipX price-test line discount for Shopify checkout (Discount Function / Cart UI).
 * Uses same config shape as storefront script: priceMode, price, priceDelta, pricePercent, priceBase,
 * priceApplicationMethod, roundTo, byProduct, byVariant.
 */

const { verifyPriceAssignmentSignature } = require('../utils/priceAssignmentSignature');

const SHOPIFY_FUNCTION_CAPABILITY_CACHE_TTL_MS = Math.max(
  5000,
  Number.parseInt(process.env.RIPX_SHOPIFY_FUNCTION_CAPABILITY_CACHE_TTL_MS || '60000', 10) || 60000
);
const shopCapabilityCache = new Map();

function normalizeCapabilityDomain(domain) {
  return typeof domain === 'string' ? domain.trim().toLowerCase() : '';
}

function hasCartTransformFunction(functionNodes) {
  if (!Array.isArray(functionNodes)) {
    return false;
  }
  return functionNodes.some(node => {
    const apiType = String(node?.apiType || '')
      .trim()
      .toLowerCase();
    return apiType.includes('cart_transform') || apiType.includes('cart transform');
  });
}

function pickCartTransformFunction(functionNodes) {
  if (!Array.isArray(functionNodes)) {
    return null;
  }
  const cartTransforms = functionNodes.filter(node => {
    const apiType = String(node?.apiType || '')
      .trim()
      .toLowerCase();
    return apiType.includes('cart_transform') || apiType.includes('cart transform');
  });
  const ripxMatch = cartTransforms.find(node =>
    String(node?.title || '')
      .trim()
      .toLowerCase()
      .includes('ripx')
  );
  return ripxMatch || cartTransforms[0] || null;
}

function isReadCartTransformsScopeError(error) {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();
  return (
    message.includes('read_cart_transforms') || message.includes('access denied for carttransforms')
  );
}

async function getCheckoutMethodCapabilitiesForDomain(domain) {
  const normalizedDomain = normalizeCapabilityDomain(domain);
  if (!normalizedDomain) {
    return {
      directPriceOverrideAvailable: false,
      cartTransformFunctionAvailable: false,
      cartTransformInstalled: false,
      source: 'missing_domain',
    };
  }

  const now = Date.now();
  const cached = shopCapabilityCache.get(normalizedDomain);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = (async () => {
    const { getShopSession } = require('../models/shopSession');
    const shopifyService = require('./shopifyService');
    const session = await getShopSession(normalizedDomain);
    const accessToken = String(session?.access_token || '').trim();
    if (!accessToken) {
      return {
        directPriceOverrideAvailable: false,
        cartTransformFunctionAvailable: false,
        cartTransformInstalled: false,
        source: 'missing_shop_session',
      };
    }

    try {
      const query = `
        query ripxShopifyFunctions {
          shopifyFunctions(first: 50) {
            nodes {
              id
              title
              apiType
            }
          }
        }
      `;
      const response = await shopifyService.requestAdminGraphql(
        normalizedDomain,
        accessToken,
        query
      );
      const functionNodes = response?.data?.shopifyFunctions?.nodes || [];
      const cartTransformFunctionAvailable = hasCartTransformFunction(functionNodes);
      const chosenCartTransform = pickCartTransformFunction(functionNodes);
      let cartTransformInstalled = false;
      let installCheckStatus = 'verified';
      if (chosenCartTransform?.id) {
        try {
          const transformsQuery = `
            query ripxExistingCartTransforms {
              cartTransforms(first: 20) {
                nodes {
                  id
                  functionId
                }
              }
            }
          `;
          const transformsResp = await shopifyService.requestAdminGraphql(
            normalizedDomain,
            accessToken,
            transformsQuery
          );
          const existingTransforms = transformsResp?.data?.cartTransforms?.nodes || [];
          cartTransformInstalled = existingTransforms.some(node => {
            return (
              String(node?.functionId || '').trim() === String(chosenCartTransform.id || '').trim()
            );
          });
        } catch (transformErr) {
          if (isReadCartTransformsScopeError(transformErr)) {
            cartTransformInstalled = null;
            installCheckStatus = 'scope_missing';
          } else {
            cartTransformInstalled = false;
            installCheckStatus = 'lookup_error';
          }
        }
      }
      const directPriceOverrideAvailable =
        cartTransformFunctionAvailable && cartTransformInstalled !== false;
      return {
        directPriceOverrideAvailable,
        cartTransformFunctionAvailable,
        cartTransformInstalled,
        cartTransformInstallCheckStatus: installCheckStatus,
        source: 'shopify_admin',
      };
    } catch (error) {
      return {
        directPriceOverrideAvailable: false,
        cartTransformFunctionAvailable: false,
        cartTransformInstalled: false,
        source: 'lookup_error',
        error: error?.message || 'lookup_failed',
      };
    }
  })();

  shopCapabilityCache.set(normalizedDomain, {
    expiresAt: now + SHOPIFY_FUNCTION_CAPABILITY_CACHE_TTL_MS,
    value: pending,
  });

  const resolved = await pending;
  shopCapabilityCache.set(normalizedDomain, {
    expiresAt: Date.now() + SHOPIFY_FUNCTION_CAPABILITY_CACHE_TTL_MS,
    value: resolved,
  });
  return resolved;
}

function isPriceTestRowType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'price' || t === 'pricing' || t === 'offer';
}

function isOfferTestRowType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'offer';
}

function getOfferConfigCandidates(config = {}) {
  const base = config && typeof config === 'object' ? config : {};
  const out = [base];
  const nestedKeys = ['offer', 'discount', 'offer_config', 'offerConfig'];
  for (const key of nestedKeys) {
    const nested = base[key];
    if (nested && typeof nested === 'object') {
      out.push(nested);
    }
  }
  return out;
}

function normalizeOfferDiscountType(config = {}) {
  let raw = '';
  for (const cfg of getOfferConfigCandidates(config)) {
    raw = String(
      cfg.discount_type || cfg.discountType || cfg.offer_type || cfg.offerType || cfg.type || ''
    )
      .trim()
      .toLowerCase();
    if (raw) {
      break;
    }
  }
  if (
    raw === 'percent' ||
    raw === 'percentage' ||
    raw === 'pct' ||
    raw === 'percent_off' ||
    raw === 'percentage_off'
  ) {
    return 'percent';
  }
  if (
    raw === 'fixed' ||
    raw === 'fixed_amount' ||
    raw === 'amount' ||
    raw === 'flat' ||
    raw === 'flat_amount' ||
    raw === 'money'
  ) {
    return 'fixed';
  }
  if (
    raw === 'free_shipping' ||
    raw === 'free-shipping' ||
    raw === 'freeshipping' ||
    raw === 'free shipping'
  ) {
    return 'free_shipping';
  }
  if (!raw) {
    const inferredValue = parseOfferDiscountValue(config);
    if (Number.isFinite(inferredValue) && inferredValue > 0) {
      return 'percent';
    }
  }
  return raw;
}

function parseOfferDiscountValue(config = {}) {
  for (const cfg of getOfferConfigCandidates(config)) {
    const candidates = [
      cfg.discount_value,
      cfg.discountValue,
      cfg.discount_amount,
      cfg.discountAmount,
      cfg.value,
      cfg.amount,
      cfg.percent,
      cfg.percentage,
      cfg.pct,
    ];
    for (const raw of candidates) {
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        continue;
      }
      const n = Number(raw);
      if (Number.isFinite(n) && n !== 0) {
        return Math.abs(n);
      }
    }
  }
  return NaN;
}

/** Align with getActiveTestsForStorefront: running, or stopped/completed with personalization rollout. */
function isPriceTestActiveForCheckout(test) {
  if (!test) {
    return false;
  }
  const s = String(test.status || '').toLowerCase();
  if (s === 'running') {
    return true;
  }
  const allowDraft =
    String(process.env.RIPX_CHECKOUT_ALLOW_DRAFT_PRICE_TESTS || '')
      .trim()
      .toLowerCase() === 'true';
  if (allowDraft && (s === 'draft' || s === 'paused')) {
    return true;
  }
  const mode = String(test.personalization_mode || '').toLowerCase();
  if ((s === 'stopped' || s === 'completed') && (mode === 'personalized' || mode === 'rollout')) {
    return true;
  }
  return false;
}

function isCheckoutSupportedPriceTargetType(targetType) {
  const tt = String(targetType || '')
    .toLowerCase()
    .trim();
  return (
    tt === 'product' ||
    tt === 'all' ||
    tt === 'all-products' ||
    tt === 'all_products' ||
    tt === 'collection'
  );
}

function parseRoundTo(roundTo) {
  if (roundTo === undefined || roundTo === null) {
    return 0;
  }
  const n = typeof roundTo === 'number' ? roundTo : parseFloat(String(roundTo).trim());
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

function applyRoundToUnitPrice(unitPrice, roundToVal) {
  let n = Math.max(0, Math.round(unitPrice * 100) / 100);
  if (roundToVal > 0) {
    n = Math.round(n / roundToVal) * roundToVal;
    n = Math.max(0, Math.round(n * 100) / 100);
  }
  return n;
}

function toNumericProductId(id) {
  if (id === undefined || id === null || id === '') {
    return '';
  }
  const s = String(id).trim();
  const m = s.match(/Product\/(\d+)/);
  if (m) {
    return m[1];
  }
  return s.replace(/\D/g, '') || s;
}

function toVariantIdKey(variantId) {
  if (variantId === undefined || variantId === null || variantId === '') {
    return null;
  }
  const s = String(variantId).trim();
  const m = s.match(/ProductVariant\/\s*(\d+)/i) || s.match(/\b(\d{10,})\b/);
  if (m) {
    return m[1];
  }
  return s;
}

function buildResolutionDebugMeta(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function withOptionalDebug(result, debugEnabled, debugMeta) {
  if (!debugEnabled) {
    return result;
  }
  return {
    ...result,
    debug: buildResolutionDebugMeta({
      ...debugMeta,
      resultReason: result && result.reason ? result.reason : null,
      applies: !!(result && result.applies),
      discountDecimal:
        result && result.discountDecimal !== undefined ? result.discountDecimal || null : null,
      targetLineDecimal:
        result && result.targetLineDecimal !== undefined ? result.targetLineDecimal || null : null,
    }),
  };
}

function hasModeValue(cfg, mode) {
  if (!cfg || typeof cfg !== 'object') {
    return false;
  }
  const m = String(mode || '').toLowerCase();
  if (m === 'fixed') {
    return cfg.price !== null && cfg.price !== undefined && String(cfg.price).trim() !== '';
  }
  if (m === 'amount') {
    return (
      cfg.priceDelta !== null &&
      cfg.priceDelta !== undefined &&
      String(cfg.priceDelta).trim() !== ''
    );
  }
  if (m === 'percent') {
    return (
      cfg.pricePercent !== null &&
      cfg.pricePercent !== undefined &&
      String(cfg.pricePercent).trim() !== ''
    );
  }
  if (m === 'control') {
    return true;
  }
  return false;
}

function normalizeMergedPriceConfig(baseCfg, mergedCfg) {
  const base = baseCfg && typeof baseCfg === 'object' ? baseCfg : {};
  const merged = mergedCfg && typeof mergedCfg === 'object' ? { ...mergedCfg } : { ...base };
  const mergedMode = String(merged.priceMode || 'fixed').toLowerCase();
  if (hasModeValue(merged, mergedMode)) {
    return merged;
  }
  const baseMode = String(base.priceMode || 'fixed').toLowerCase();
  if (!hasModeValue(base, baseMode)) {
    return merged;
  }
  merged.priceMode = baseMode;
  if (baseMode === 'fixed') {
    merged.price = base.price;
  }
  if (baseMode === 'amount') {
    merged.priceDelta = base.priceDelta;
    merged.priceBase = base.priceBase || merged.priceBase;
  }
  if (baseMode === 'percent') {
    merged.pricePercent = base.pricePercent;
    merged.priceBase = base.priceBase || merged.priceBase;
  }
  if (
    base.nativeVariantId !== undefined &&
    base.nativeVariantId !== null &&
    (merged.nativeVariantId === undefined || merged.nativeVariantId === null)
  ) {
    merged.nativeVariantId = base.nativeVariantId;
  }
  if (
    base.priceApplicationMethod !== undefined &&
    base.priceApplicationMethod !== null &&
    (merged.priceApplicationMethod === undefined || merged.priceApplicationMethod === null)
  ) {
    merged.priceApplicationMethod = base.priceApplicationMethod;
  }
  if (
    base.roundTo !== undefined &&
    base.roundTo !== null &&
    (merged.roundTo === undefined || merged.roundTo === null)
  ) {
    merged.roundTo = base.roundTo;
  }
  return merged;
}

/**
 * Resolve the price config that checkout should honor for a cart line.
 *
 * Keep this precedence identical to the storefront runtime so PDP paint, cart attributes, and
 * checkout pricing all choose the same matrix row: base -> root byVariant -> byProduct ->
 * byProduct.byVariant.
 */
function getEffectivePriceConfig(cfg, productId, currentVariantId) {
  if (!cfg || typeof cfg !== 'object') {
    return cfg;
  }
  const merged = {};
  for (const k of Object.keys(cfg)) {
    if (k !== 'byProduct' && k !== 'byVariant') {
      merged[k] = cfg[k];
    }
  }

  const rootByVariant = cfg.byVariant;
  if (rootByVariant && typeof rootByVariant === 'object') {
    const vkey = toVariantIdKey(currentVariantId);
    const rootVariantOverride = vkey
      ? rootByVariant[vkey] ||
        rootByVariant[currentVariantId] ||
        rootByVariant[`gid://shopify/ProductVariant/${vkey}`]
      : null;
    if (rootVariantOverride && typeof rootVariantOverride === 'object') {
      for (const key of Object.keys(rootVariantOverride)) {
        merged[key] = rootVariantOverride[key];
      }
    }
  }

  const byProduct = cfg.byProduct;
  if (!byProduct || typeof byProduct !== 'object') {
    return normalizeMergedPriceConfig(cfg, merged);
  }
  const pid = toNumericProductId(productId);
  const gid = pid ? `gid://shopify/Product/${pid}` : '';
  const override = byProduct[productId] || byProduct[pid] || (gid ? byProduct[gid] : null);
  if (!override || typeof override !== 'object') {
    return normalizeMergedPriceConfig(cfg, merged);
  }
  for (const j of Object.keys(override)) {
    if (j !== 'byVariant') {
      merged[j] = override[j];
    }
  }

  const byVariant = override.byVariant;
  if (
    currentVariantId !== undefined &&
    currentVariantId !== null &&
    currentVariantId !== '' &&
    byVariant &&
    typeof byVariant === 'object'
  ) {
    const vkey = toVariantIdKey(currentVariantId);
    const variantOverride = vkey
      ? byVariant[vkey] ||
        byVariant[currentVariantId] ||
        byVariant[`gid://shopify/ProductVariant/${vkey}`]
      : null;
    if (variantOverride && typeof variantOverride === 'object') {
      for (const v of Object.keys(variantOverride)) {
        merged[v] = variantOverride[v];
      }
    }
  } else if (byVariant && typeof byVariant === 'object') {
    const [fallbackVariantKey] = Object.keys(byVariant);
    const fallbackVariantOverride = fallbackVariantKey ? byVariant[fallbackVariantKey] : null;
    if (fallbackVariantOverride && typeof fallbackVariantOverride === 'object') {
      for (const v of Object.keys(fallbackVariantOverride)) {
        merged[v] = fallbackVariantOverride[v];
      }
    }
  }
  return normalizeMergedPriceConfig(cfg, merged);
}

function normalizePriceApplicationMethod(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'discounted_checkout_price') {
    return 'discounted_checkout_price';
  }
  if (raw === 'native_variant_price') {
    return 'native_variant_price';
  }
  if (raw === 'direct_price_override') {
    return 'direct_price_override';
  }
  return 'auto';
}

/**
 * Decide whether the discount-function path can represent the configured price.
 *
 * Shopify discounts can reduce a price but cannot increase it. In auto mode, increases must move
 * to native variant pricing or direct price override when the shop supports that path.
 */
function resolveDiscountFunctionApplicationMethod({
  configuredMethod,
  targetUnit,
  catalogUnit,
  shopCapabilities,
}) {
  const normalized = normalizePriceApplicationMethod(configuredMethod);
  const catalog = Number(catalogUnit);
  const target = Number(targetUnit);
  const tolerance = 0.0001;
  const isPriceIncrease =
    Number.isFinite(target) && Number.isFinite(catalog) && target > catalog + tolerance;
  const canUseDirectPriceOverride = shopCapabilities?.directPriceOverrideAvailable === true;

  if (normalized === 'native_variant_price') {
    return {
      configuredMethod: normalized,
      resolvedMethod: 'native_variant_price',
      canApplyDiscountFunction: false,
      reason: 'selected_native_variant_price',
    };
  }

  if (normalized === 'direct_price_override') {
    if (!isPriceIncrease) {
      return {
        configuredMethod: normalized,
        resolvedMethod: 'discounted_checkout_price',
        canApplyDiscountFunction: true,
        reason: 'direct_override_reduction_uses_signed_discount',
      };
    }
    return {
      configuredMethod: normalized,
      resolvedMethod: 'direct_price_override',
      canApplyDiscountFunction: false,
      reason: 'selected_direct_price_override',
    };
  }

  if (normalized === 'discounted_checkout_price') {
    if (isPriceIncrease) {
      return {
        configuredMethod: normalized,
        resolvedMethod: normalized,
        canApplyDiscountFunction: false,
        reason: 'price_increase_requires_native_variant_price',
      };
    }
    return {
      configuredMethod: normalized,
      resolvedMethod: normalized,
      canApplyDiscountFunction: true,
      reason: null,
    };
  }

  if (isPriceIncrease) {
    return {
      configuredMethod: 'auto',
      resolvedMethod: canUseDirectPriceOverride ? 'direct_price_override' : 'native_variant_price',
      canApplyDiscountFunction: false,
      reason: canUseDirectPriceOverride
        ? 'auto_selected_direct_price_override'
        : 'auto_selected_native_variant_price',
    };
  }

  return {
    configuredMethod: 'auto',
    resolvedMethod: 'discounted_checkout_price',
    canApplyDiscountFunction: true,
    reason: null,
  };
}

function assignmentMatchesVariant(test, assignmentVariantId) {
  if (!test || !assignmentVariantId) {
    return false;
  }
  const vid = String(assignmentVariantId).trim();
  const variants = Array.isArray(test.variants) ? test.variants : [];
  return variants.some(v => {
    if (!v) {
      return false;
    }
    const id = v.id !== undefined && v.id !== null ? String(v.id) : '';
    const name = v.name !== undefined && v.name !== null ? String(v.name) : '';
    return id === vid || name === vid;
  });
}

function findTestVariant(test, assignmentVariantId) {
  const vid = String(assignmentVariantId || '').trim();
  const variants = Array.isArray(test.variants) ? test.variants : [];
  return variants.find(v => {
    if (!v) {
      return false;
    }
    const id = v.id !== undefined && v.id !== null ? String(v.id) : '';
    const name = v.name !== undefined && v.name !== null ? String(v.name) : '';
    return id === vid || name === vid;
  });
}

function productInTargetList(test, productGidOrNumeric) {
  let rawIds = test.target_ids;
  if (typeof rawIds === 'string') {
    try {
      rawIds = JSON.parse(rawIds);
    } catch {
      rawIds = null;
    }
  }
  const ids = Array.isArray(rawIds)
    ? rawIds.filter(Boolean)
    : test.target_id
      ? [test.target_id]
      : [];
  if (!ids.length) {
    return true;
  }
  const pid = toNumericProductId(productGidOrNumeric);
  if (!pid) {
    return false;
  }
  return ids.some(id => id && toNumericProductId(id) === pid);
}

function productExcludedByTest(test, productGidOrNumeric) {
  let rawExcluded = test?.segments?.excluded_product_ids;
  if (typeof rawExcluded === 'string') {
    try {
      rawExcluded = JSON.parse(rawExcluded);
    } catch {
      rawExcluded = rawExcluded
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean);
    }
  }
  const excludedIds = Array.isArray(rawExcluded) ? rawExcluded.filter(Boolean) : [];
  if (!excludedIds.length) {
    return false;
  }
  const pid = toNumericProductId(productGidOrNumeric);
  if (!pid) {
    return false;
  }
  return excludedIds.some(id => id && toNumericProductId(id) === pid);
}

/**
 * Collection-targeted price tests store collection GIDs in target_ids, not product ids.
 * The cart line only has a product id; verifying collection membership would require a Shopify API round-trip.
 * The storefront only injects _ripx_* for products in the targeted collections, so we treat a valid
 * assignment + signature on the line as sufficient for checkout alignment (same trust model as manual line props).
 */
function lineProductMatchesPriceTestTarget(test, productGidOrNumeric) {
  if (productExcludedByTest(test, productGidOrNumeric)) {
    return false;
  }
  const tt = String(test?.target_type || '')
    .toLowerCase()
    .trim();
  if (tt === 'collection') {
    return true;
  }
  return productInTargetList(test, productGidOrNumeric);
}

/**
 * @param {object} params
 * @param {object} params.test - row from DB (variants, target_ids, type, status, target_type)
 * @param {string} params.assignmentVariantId - value of cart _ripx_variant
 * @param {string} params.productId - Shopify product GID or numeric
 * @param {string} [params.variantId] - Shopify variant GID or numeric (for byVariant)
 * @param {number} params.linePresentmentTotal - line subtotal in presentment money (major units e.g. 29.99)
 * @param {number} params.quantity - line qty (>=1)
 * @param {string} [params.shopDomain] - shop domain used for signature verification
 * @param {string} [params.assignmentSignature] - cart _ripx_assignment_sig
 * @param {string|number} [params.assignmentIssuedAtMs] - cart _ripx_assignment_ts
 * @param {string} [params.assignmentUserId] - cart _ripx_assignment_user
 * @returns {{ applies: boolean, discountDecimal?: string, reason?: string }}
 */
function resolvePriceTestLineDiscount({
  test,
  assignmentVariantId,
  productId,
  variantId,
  linePresentmentTotal,
  quantity,
  shopDomain = '',
  assignmentSignature = '',
  assignmentIssuedAtMs = '',
  assignmentUserId = '',
  /** Per-unit compare-at from CartLineCost.compareAtAmountPerQuantity (Shopify); required for priceBase compare_at parity with storefront. */
  compareAtUnitPrice = null,
  shopCapabilities = null,
  debug = false,
}) {
  const debugEnabled = debug === true;
  const debugMeta = {
    testId: test && test.id ? String(test.id) : null,
    testType: test && test.type ? String(test.type) : null,
    testStatus: test && test.status ? String(test.status) : null,
    targetType: test && test.target_type ? String(test.target_type) : null,
    assignmentVariantId:
      assignmentVariantId === undefined || assignmentVariantId === null
        ? null
        : String(assignmentVariantId).trim() || null,
    productId:
      productId === undefined || productId === null ? null : String(productId).trim() || null,
    variantId:
      variantId === undefined || variantId === null ? null : String(variantId).trim() || null,
    shopDomain: shopDomain ? String(shopDomain).trim() || null : null,
  };
  const finish = result => withOptionalDebug(result, debugEnabled, debugMeta);
  if (!test || !isPriceTestRowType(test.type)) {
    return finish({ applies: false, reason: 'not_price_test' });
  }
  if (!isPriceTestActiveForCheckout(test)) {
    return finish({ applies: false, reason: 'test_not_running' });
  }
  const tt = String(test.target_type || '')
    .toLowerCase()
    .trim();
  if (!isCheckoutSupportedPriceTargetType(tt)) {
    return finish({ applies: false, reason: 'unsupported_target_type' });
  }
  if (!assignmentMatchesVariant(test, assignmentVariantId)) {
    return finish({ applies: false, reason: 'unknown_assignment_variant' });
  }
  const signatureCheck = verifyPriceAssignmentSignature({
    testId: test?.id || '',
    variantId: assignmentVariantId,
    userId: assignmentUserId,
    shopDomain,
    issuedAtMs: assignmentIssuedAtMs,
    signature: assignmentSignature,
  });
  debugMeta.signatureCheck = signatureCheck && signatureCheck.reason ? signatureCheck.reason : 'ok';
  if (!signatureCheck.ok) {
    return finish({
      applies: false,
      reason: signatureCheck.reason || 'invalid_assignment_signature',
    });
  }
  if (!lineProductMatchesPriceTestTarget(test, productId)) {
    return finish({ applies: false, reason: 'product_not_in_test' });
  }
  const vRow = findTestVariant(test, assignmentVariantId);
  debugMeta.matchedVariantId =
    vRow && vRow.id !== undefined && vRow.id !== null ? String(vRow.id) : null;
  debugMeta.matchedVariantName =
    vRow && vRow.name !== undefined && vRow.name !== null ? String(vRow.name) : null;
  debugMeta.variantConfigPresent = !!(vRow && vRow.config);
  if (!vRow || !vRow.config) {
    return finish({ applies: false, reason: 'no_variant_config' });
  }
  const qty = Math.max(1, Number(quantity) || 1);
  const lineTotal = Number(linePresentmentTotal);
  debugMeta.quantity = qty;
  debugMeta.linePresentmentTotal = Number.isFinite(lineTotal)
    ? Math.round(lineTotal * 100) / 100
    : null;
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) {
    return finish({ applies: false, reason: 'invalid_line_total' });
  }
  const catalogUnit = lineTotal / qty;
  const compareAtParsed =
    compareAtUnitPrice === undefined || compareAtUnitPrice === null || compareAtUnitPrice === ''
      ? null
      : Number.parseFloat(String(compareAtUnitPrice).trim());
  const hasValidCompareAt = Number.isFinite(compareAtParsed) && compareAtParsed > 0;
  debugMeta.catalogUnit = Math.round(catalogUnit * 100) / 100;
  debugMeta.compareAtUnit = hasValidCompareAt ? Math.round(compareAtParsed * 100) / 100 : null;

  const cfg = getEffectivePriceConfig(vRow.config, productId, variantId || null);
  const isOfferTest = isOfferTestRowType(test?.type);
  if (isOfferTest) {
    const discountType = normalizeOfferDiscountType(cfg);
    debugMeta.offerDiscountType = discountType || null;
    if (!['percent', 'fixed', 'free_shipping'].includes(discountType)) {
      return finish({ applies: false, reason: 'no_offer_config' });
    }
    if (discountType === 'free_shipping') {
      return finish({ applies: false, reason: 'free_shipping_not_supported' });
    }
    const offerValue = parseOfferDiscountValue(cfg);
    debugMeta.offerDiscountValue = Number.isFinite(offerValue) ? offerValue : null;
    if (!Number.isFinite(offerValue) || offerValue <= 0) {
      return finish({ applies: false, reason: 'invalid_offer_value' });
    }
    const roundedLineTotal = Math.round(lineTotal * 100) / 100;
    let discount = 0;
    if (discountType === 'percent') {
      const pct = Math.max(0, Math.min(100, offerValue));
      debugMeta.offerPercent = pct;
      discount = Math.round(roundedLineTotal * (pct / 100) * 100) / 100;
    } else {
      const perUnitOff = Math.max(0, offerValue);
      debugMeta.offerFixedPerUnit = perUnitOff;
      discount = Math.round(Math.min(roundedLineTotal, perUnitOff * qty) * 100) / 100;
    }
    if (!Number.isFinite(discount) || discount <= 0.0001) {
      return finish({ applies: false, reason: 'no_discount_needed' });
    }
    const targetLine = Math.max(0, Math.round((roundedLineTotal - discount) * 100) / 100);
    debugMeta.targetLine = targetLine;
    debugMeta.roundedLineTotal = roundedLineTotal;
    return finish({
      applies: true,
      discountDecimal: discount.toFixed(2),
      targetLineDecimal: targetLine.toFixed(2),
    });
  }

  const priceMode = String(cfg.priceMode || 'fixed').toLowerCase();
  const priceBase = String(cfg.priceBase || 'price').toLowerCase();
  const useCompareAtBase =
    (priceMode === 'amount' || priceMode === 'percent') && priceBase === 'compare_at';
  const basisUnit = useCompareAtBase && hasValidCompareAt ? compareAtParsed : catalogUnit;
  debugMeta.priceMode = priceMode;
  debugMeta.priceBase = priceBase;
  debugMeta.useCompareAtBase = useCompareAtBase;
  debugMeta.basisUnit = Math.round(basisUnit * 100) / 100;
  debugMeta.roundTo = cfg.roundTo !== undefined && cfg.roundTo !== null ? cfg.roundTo : null;
  debugMeta.priceApplicationMethod = normalizePriceApplicationMethod(cfg.priceApplicationMethod);

  if (useCompareAtBase && !hasValidCompareAt) {
    return finish({ applies: false, reason: 'compare_at_unavailable' });
  }

  if (priceMode === 'control') {
    return finish({ applies: false, reason: 'control_variant' });
  }

  let targetUnit = null;
  if (priceMode === 'fixed') {
    if (cfg.price === null || cfg.price === undefined || cfg.price === '') {
      return finish({ applies: false, reason: 'no_fixed_price' });
    }
    targetUnit = parseFloat(String(cfg.price).trim());
  } else if (priceMode === 'amount') {
    if (
      cfg.priceDelta === null ||
      cfg.priceDelta === undefined ||
      String(cfg.priceDelta).trim() === ''
    ) {
      return finish({ applies: false, reason: 'no_price_delta' });
    }
    const delta = parseFloat(String(cfg.priceDelta).trim());
    debugMeta.priceDelta = Number.isFinite(delta) ? delta : null;
    if (!Number.isFinite(delta)) {
      return finish({ applies: false, reason: 'bad_delta' });
    }
    targetUnit = Math.max(0, basisUnit + delta);
  } else if (priceMode === 'percent') {
    if (
      cfg.pricePercent === null ||
      cfg.pricePercent === undefined ||
      String(cfg.pricePercent).trim() === ''
    ) {
      return finish({ applies: false, reason: 'no_price_percent' });
    }
    const pct = parseFloat(String(cfg.pricePercent).trim());
    debugMeta.pricePercent = Number.isFinite(pct) ? pct : null;
    if (!Number.isFinite(pct)) {
      return finish({ applies: false, reason: 'bad_percent' });
    }
    targetUnit = Math.max(0, basisUnit * (1 - pct / 100));
  } else {
    return finish({ applies: false, reason: 'unknown_price_mode' });
  }

  if (!Number.isFinite(targetUnit) || targetUnit < 0) {
    return finish({ applies: false, reason: 'bad_target_unit' });
  }

  targetUnit = applyRoundToUnitPrice(targetUnit, parseRoundTo(cfg.roundTo));
  debugMeta.targetUnit = Math.round(targetUnit * 100) / 100;

  const applicationMethod = resolveDiscountFunctionApplicationMethod({
    configuredMethod: cfg.priceApplicationMethod,
    targetUnit,
    catalogUnit,
    shopCapabilities,
  });
  debugMeta.configuredApplicationMethod = applicationMethod.configuredMethod;
  debugMeta.resolvedApplicationMethod = applicationMethod.resolvedMethod;
  debugMeta.canApplyDiscountFunction = applicationMethod.canApplyDiscountFunction;
  if (!applicationMethod.canApplyDiscountFunction) {
    return finish({ applies: false, reason: applicationMethod.reason });
  }

  const targetLine = Math.round(targetUnit * qty * 100) / 100;
  const roundedLineTotal = Math.round(lineTotal * 100) / 100;
  const discount = Math.round((roundedLineTotal - targetLine) * 100) / 100;
  debugMeta.targetLine = targetLine;
  debugMeta.roundedLineTotal = roundedLineTotal;
  if (discount <= 0.0001) {
    return finish({ applies: false, reason: 'no_discount_needed' });
  }

  return finish({
    applies: true,
    discountDecimal: discount.toFixed(2),
    targetLineDecimal: targetLine.toFixed(2),
  });
}

/**
 * Resolve many cart lines in one round-trip (Shopify Discount Function fetch target).
 *
 * @param {string} domain - normalized tenant domain (shop/site)
 * @param {Array<{
 *   line_id?: string,
 *   test_id: string,
 *   assignment_variant: string,
 *   product_id: string,
 *   variant_id?: string|null,
 *   line_total: number|string,
 *   qty?: number|string
 * }>} lines
 * @param {(testId: string, dom: string) => Promise<object|null>} getTestById
 * @param {(ids: string[], dom: string) => Promise<Map<string, object>>} [getTestsByIds] — when provided (e.g. `getTestsByIds` from models/test), loads all unique tests in **one** SQL round-trip instead of N parallel queries.
 * @returns {Promise<Array<{
 *   line_id: string,
 *   applies: boolean,
 *   discountDecimal: string|null,
 *   targetLineDecimal: string|null,
 *   reason: string|null
 * }>>}
 */
async function resolveCheckoutPriceBatchForDomain(
  domain,
  lines,
  getTestById,
  getTestsByIds,
  opts = {}
) {
  const debugEnabled = opts && opts.debug === true;
  let shopCapabilities = opts?.shopCapabilities || null;
  const testCache = new Map();
  /** Prefetch unique tests — single query when getTestsByIds is available (best under Shopify Function readTimeoutMs). */
  const uniqueTestIds = new Set();
  for (const row of lines) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const tid = row.test_id === undefined || row.test_id === null ? '' : String(row.test_id).trim();
    if (tid) {
      uniqueTestIds.add(tid);
    }
  }
  const ids = [...uniqueTestIds];
  if (ids.length > 0) {
    if (typeof getTestsByIds === 'function') {
      const batchMap = await getTestsByIds(ids, domain);
      for (const id of ids) {
        testCache.set(id, batchMap.get(id) ?? null);
      }
    } else {
      await Promise.all(
        ids.map(async id => {
          const t = await getTestById(id, domain);
          testCache.set(id, t);
        })
      );
    }
  }

  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const row = lines[i] || {};
    const rawLineId = row.line_id;
    const lineId =
      rawLineId !== undefined && rawLineId !== null && String(rawLineId).trim() !== ''
        ? String(rawLineId)
        : String(i);
    const testId =
      row.test_id === undefined || row.test_id === null ? '' : String(row.test_id).trim();
    const assignmentVariant =
      row.assignment_variant === undefined || row.assignment_variant === null
        ? ''
        : String(row.assignment_variant).trim();
    const productId =
      row.product_id === undefined || row.product_id === null ? '' : String(row.product_id).trim();
    const baseDebug = {
      shopDomain: domain,
      lineIndex: i,
      testId: testId || null,
      assignmentVariantId: assignmentVariant || null,
      productId: productId || null,
      variantId:
        row.variant_id === undefined || row.variant_id === null
          ? null
          : String(row.variant_id).trim() || null,
    };

    if (!testId) {
      results.push({
        line_id: lineId,
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'missing_test_id',
        ...(debugEnabled
          ? { debug: buildResolutionDebugMeta({ ...baseDebug, resultReason: 'missing_test_id' }) }
          : {}),
      });
      continue;
    }
    if (!assignmentVariant) {
      results.push({
        line_id: lineId,
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'missing_assignment_variant',
        ...(debugEnabled
          ? {
              debug: buildResolutionDebugMeta({
                ...baseDebug,
                resultReason: 'missing_assignment_variant',
              }),
            }
          : {}),
      });
      continue;
    }
    if (!productId) {
      results.push({
        line_id: lineId,
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'missing_product_id',
        ...(debugEnabled
          ? {
              debug: buildResolutionDebugMeta({ ...baseDebug, resultReason: 'missing_product_id' }),
            }
          : {}),
      });
      continue;
    }

    const lineTotalRaw =
      row.line_total === undefined || row.line_total === null ? '' : row.line_total;
    const lineTotal = Number.parseFloat(String(lineTotalRaw).trim());
    if (!Number.isFinite(lineTotal) || lineTotal <= 0) {
      results.push({
        line_id: lineId,
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'invalid_line_total',
        ...(debugEnabled
          ? {
              debug: buildResolutionDebugMeta({
                ...baseDebug,
                resultReason: 'invalid_line_total',
                linePresentmentTotal: null,
              }),
            }
          : {}),
      });
      continue;
    }
    const qtyRaw = row.qty === undefined || row.qty === null ? '1' : row.qty;
    const quantity = Math.max(1, Number.parseInt(String(qtyRaw), 10) || 1);

    const test = testCache.get(testId);
    if (!test) {
      results.push({
        line_id: lineId,
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'test_not_found',
        ...(debugEnabled
          ? {
              debug: buildResolutionDebugMeta({
                ...baseDebug,
                resultReason: 'test_not_found',
                linePresentmentTotal: Math.round(lineTotal * 100) / 100,
                quantity,
              }),
            }
          : {}),
      });
      continue;
    }

    const rawVid = row.variant_id;
    const variantId =
      rawVid !== undefined && rawVid !== null && String(rawVid).trim() !== ''
        ? String(rawVid).trim()
        : null;

    const compareRaw =
      row.compare_at_unit !== undefined && row.compare_at_unit !== null
        ? row.compare_at_unit
        : row.compare_at_amount_per_quantity !== undefined &&
            row.compare_at_amount_per_quantity !== null
          ? row.compare_at_amount_per_quantity
          : null;

    const resolveArgs = {
      test,
      assignmentVariantId: assignmentVariant,
      productId,
      variantId,
      linePresentmentTotal: lineTotal,
      quantity,
      shopDomain: domain,
      assignmentSignature:
        row.assignment_sig === undefined || row.assignment_sig === null
          ? ''
          : String(row.assignment_sig).trim(),
      assignmentIssuedAtMs:
        row.assignment_ts === undefined || row.assignment_ts === null
          ? ''
          : String(row.assignment_ts).trim(),
      assignmentUserId:
        row.assignment_user === undefined || row.assignment_user === null
          ? ''
          : String(row.assignment_user).trim(),
      compareAtUnitPrice: compareRaw,
      shopCapabilities,
      debug: debugEnabled,
    };

    let result = resolvePriceTestLineDiscount(resolveArgs);
    if (result.reason === 'auto_selected_native_variant_price' && !shopCapabilities && domain) {
      shopCapabilities = await getCheckoutMethodCapabilitiesForDomain(domain);
      if (shopCapabilities?.directPriceOverrideAvailable === true) {
        result = resolvePriceTestLineDiscount({
          ...resolveArgs,
          shopCapabilities,
        });
      }
    }

    results.push({
      line_id: lineId,
      applies: !!result.applies,
      discountDecimal: result.discountDecimal || null,
      targetLineDecimal: result.targetLineDecimal || null,
      reason: result.reason || null,
      ...(debugEnabled && result.debug ? { debug: result.debug } : {}),
    });
  }

  return results;
}

module.exports = {
  resolvePriceTestLineDiscount,
  resolveCheckoutPriceBatchForDomain,
  getCheckoutMethodCapabilitiesForDomain,
  toNumericProductId,
  getEffectivePriceConfig,
  isPriceTestRowType,
  isPriceTestActiveForCheckout,
  lineProductMatchesPriceTestTarget,
};
