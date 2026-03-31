/**
 * Resolve RipX price-test line discount for Shopify checkout (Discount Function / Cart UI).
 * Uses same config shape as storefront script: priceMode, price, priceDelta, pricePercent, priceBase, roundTo, byProduct, byVariant.
 */

const { verifyPriceAssignmentSignature } = require('../utils/priceAssignmentSignature');

function isPriceTestRowType(type) {
  const t = String(type || '').toLowerCase();
  return t === 'price' || t === 'pricing';
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
  return tt === 'product' || tt === 'all-products' || tt === 'all_products' || tt === 'collection';
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
    base.roundTo !== undefined &&
    base.roundTo !== null &&
    (merged.roundTo === undefined || merged.roundTo === null)
  ) {
    merged.roundTo = base.roundTo;
  }
  return merged;
}

function getEffectivePriceConfig(cfg, productId, currentVariantId) {
  if (!cfg || typeof cfg !== 'object') {
    return cfg;
  }
  const byProduct = cfg.byProduct;
  if (!byProduct || typeof byProduct !== 'object') {
    return cfg;
  }
  const pid = toNumericProductId(productId);
  const gid = pid ? `gid://shopify/Product/${pid}` : '';
  const override = byProduct[productId] || byProduct[pid] || (gid ? byProduct[gid] : null);
  if (!override || typeof override !== 'object') {
    return cfg;
  }
  const merged = {};
  for (const k of Object.keys(cfg)) {
    if (k !== 'byProduct') {
      merged[k] = cfg[k];
    }
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
  }
  return normalizeMergedPriceConfig(cfg, merged);
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

/**
 * Collection-targeted price tests store collection GIDs in target_ids, not product ids.
 * The cart line only has a product id; verifying collection membership would require a Shopify API round-trip.
 * The storefront only injects _ripx_* for products in the targeted collections, so we treat a valid
 * assignment + signature on the line as sufficient for checkout alignment (same trust model as manual line props).
 */
function lineProductMatchesPriceTestTarget(test, productGidOrNumeric) {
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
}) {
  if (!test || !isPriceTestRowType(test.type)) {
    return { applies: false, reason: 'not_price_test' };
  }
  if (!isPriceTestActiveForCheckout(test)) {
    return { applies: false, reason: 'test_not_running' };
  }
  const tt = String(test.target_type || '').toLowerCase();
  if (!isCheckoutSupportedPriceTargetType(tt)) {
    return { applies: false, reason: 'unsupported_target_type' };
  }
  if (!assignmentMatchesVariant(test, assignmentVariantId)) {
    return { applies: false, reason: 'unknown_assignment_variant' };
  }
  const signatureCheck = verifyPriceAssignmentSignature({
    testId: test?.id || '',
    variantId: assignmentVariantId,
    userId: assignmentUserId,
    shopDomain,
    issuedAtMs: assignmentIssuedAtMs,
    signature: assignmentSignature,
  });
  if (!signatureCheck.ok) {
    return { applies: false, reason: signatureCheck.reason || 'invalid_assignment_signature' };
  }
  if (!lineProductMatchesPriceTestTarget(test, productId)) {
    return { applies: false, reason: 'product_not_in_test' };
  }
  const vRow = findTestVariant(test, assignmentVariantId);
  if (!vRow || !vRow.config) {
    return { applies: false, reason: 'no_variant_config' };
  }
  const qty = Math.max(1, Number(quantity) || 1);
  const lineTotal = Number(linePresentmentTotal);
  if (!Number.isFinite(lineTotal) || lineTotal <= 0) {
    return { applies: false, reason: 'invalid_line_total' };
  }
  const catalogUnit = lineTotal / qty;
  const compareAtParsed =
    compareAtUnitPrice === undefined || compareAtUnitPrice === null || compareAtUnitPrice === ''
      ? null
      : Number.parseFloat(String(compareAtUnitPrice).trim());
  const hasValidCompareAt = Number.isFinite(compareAtParsed) && compareAtParsed > 0;

  const cfg = getEffectivePriceConfig(vRow.config, productId, variantId || null);
  const priceMode = String(cfg.priceMode || 'fixed').toLowerCase();
  const priceBase = String(cfg.priceBase || 'price').toLowerCase();
  const useCompareAtBase =
    (priceMode === 'amount' || priceMode === 'percent') && priceBase === 'compare_at';
  const basisUnit = useCompareAtBase && hasValidCompareAt ? compareAtParsed : catalogUnit;

  if (useCompareAtBase && !hasValidCompareAt) {
    return { applies: false, reason: 'compare_at_unavailable' };
  }

  if (priceMode === 'control') {
    return { applies: false, reason: 'control_variant' };
  }

  let targetUnit = null;
  if (priceMode === 'fixed') {
    if (cfg.price === null || cfg.price === undefined || cfg.price === '') {
      return { applies: false, reason: 'no_fixed_price' };
    }
    targetUnit = parseFloat(String(cfg.price).trim());
  } else if (priceMode === 'amount') {
    if (
      cfg.priceDelta === null ||
      cfg.priceDelta === undefined ||
      String(cfg.priceDelta).trim() === ''
    ) {
      return { applies: false, reason: 'no_price_delta' };
    }
    const delta = parseFloat(String(cfg.priceDelta).trim());
    if (!Number.isFinite(delta)) {
      return { applies: false, reason: 'bad_delta' };
    }
    targetUnit = Math.max(0, basisUnit + delta);
  } else if (priceMode === 'percent') {
    if (
      cfg.pricePercent === null ||
      cfg.pricePercent === undefined ||
      String(cfg.pricePercent).trim() === ''
    ) {
      return { applies: false, reason: 'no_price_percent' };
    }
    const pct = parseFloat(String(cfg.pricePercent).trim());
    if (!Number.isFinite(pct)) {
      return { applies: false, reason: 'bad_percent' };
    }
    targetUnit = Math.max(0, basisUnit * (1 - pct / 100));
  } else {
    return { applies: false, reason: 'unknown_price_mode' };
  }

  if (!Number.isFinite(targetUnit) || targetUnit < 0) {
    return { applies: false, reason: 'bad_target_unit' };
  }

  targetUnit = applyRoundToUnitPrice(targetUnit, parseRoundTo(cfg.roundTo));

  const targetLine = Math.round(targetUnit * qty * 100) / 100;
  const roundedLineTotal = Math.round(lineTotal * 100) / 100;
  const discount = Math.round((roundedLineTotal - targetLine) * 100) / 100;
  if (discount <= 0.0001) {
    return { applies: false, reason: 'no_discount_needed' };
  }

  return {
    applies: true,
    discountDecimal: discount.toFixed(2),
    targetLineDecimal: targetLine.toFixed(2),
  };
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
async function resolveCheckoutPriceBatchForDomain(domain, lines, getTestById, getTestsByIds) {
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

    if (!testId) {
      results.push({
        line_id: lineId,
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'missing_test_id',
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

    const result = resolvePriceTestLineDiscount({
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
    });

    results.push({
      line_id: lineId,
      applies: !!result.applies,
      discountDecimal: result.discountDecimal || null,
      targetLineDecimal: result.targetLineDecimal || null,
      reason: result.reason || null,
    });
  }

  return results;
}

module.exports = {
  resolvePriceTestLineDiscount,
  resolveCheckoutPriceBatchForDomain,
  toNumericProductId,
  getEffectivePriceConfig,
  isPriceTestRowType,
  isPriceTestActiveForCheckout,
  lineProductMatchesPriceTestTarget,
};
