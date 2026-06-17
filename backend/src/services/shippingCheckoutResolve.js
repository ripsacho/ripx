const { verifyPriceAssignmentSignature } = require('../utils/priceAssignmentSignature');
const {
  normalizeShippingTestPayload,
  normalizeShippingVariantConfig,
} = require('./shippingTestConfigService');
const logger = require('../utils/logger');

function isShippingTestRowType(type) {
  const normalized = String(type || '')
    .trim()
    .toLowerCase();
  return normalized === 'shipping';
}

function isShippingTestActiveForCheckout(test = {}) {
  const status = String(test?.status || '')
    .trim()
    .toLowerCase();
  return status === 'running';
}

function findTestVariant(test, assignmentVariantId) {
  const target = String(assignmentVariantId || '').trim();
  if (!target) {
    return null;
  }
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  return (
    variants.find(variant => {
      const id = String(variant?.id || '').trim();
      const name = String(variant?.name || '').trim();
      return (id && id === target) || (name && name === target);
    }) || null
  );
}

function buildCheckoutMessage(test, variant, strategy) {
  const variantLabel = String(variant?.name || '').trim() || 'Variant';
  switch (strategy) {
    case 'threshold_free_shipping':
      return `${variantLabel} free shipping threshold`;
    case 'discount_percentage':
      return `${variantLabel} shipping discount`;
    case 'discount_fixed':
      return `${variantLabel} shipping discount`;
    case 'free_shipping':
      return `${variantLabel} free shipping`;
    default:
      return `${String(test?.name || 'RipX shipping test').trim()} shipping`;
  }
}

function normalizeProductId(input) {
  if (input === undefined || input === null || input === '') {
    return '';
  }
  const raw = String(input).trim();
  if (!raw) {
    return '';
  }
  const gidMatch = raw.match(/Product\/(\d+)/i);
  if (gidMatch && gidMatch[1]) {
    return gidMatch[1];
  }
  return raw.replace(/\D/g, '') || raw;
}

function normalizeProductIdList(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = source
        .split(/[\n,]+/)
        .map(item => item.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(source)) {
    return [];
  }
  return Array.from(new Set(source.map(item => normalizeProductId(item)).filter(Boolean)));
}

function normalizeShippingTargetType(targetType) {
  return String(targetType || '')
    .trim()
    .toLowerCase();
}

function deliveryGroupMatchesShippingTarget(test, groupProductIds = []) {
  const targetType = normalizeShippingTargetType(test?.target_type);
  const normalizedGroupProductIds = normalizeProductIdList(groupProductIds);
  const excludedProductIds = normalizeProductIdList(test?.segments?.excluded_product_ids);

  if (
    normalizedGroupProductIds.length > 0 &&
    excludedProductIds.length > 0 &&
    normalizedGroupProductIds.some(productId => excludedProductIds.includes(productId))
  ) {
    return false;
  }

  if (targetType === 'product') {
    const includedProductIds = normalizeProductIdList([
      ...(Array.isArray(test?.target_ids) ? test.target_ids : []),
      test?.target_id,
    ]);
    if (includedProductIds.length === 0 || normalizedGroupProductIds.length === 0) {
      return false;
    }
    return normalizedGroupProductIds.some(productId => includedProductIds.includes(productId));
  }

  return true;
}

function resolveShippingCheckoutGroupDiscount({
  test,
  assignmentVariantId,
  cartPresentmentTotal,
  deliveryGroupId,
  deliveryOptionHandles = [],
  deliveryGroupProductIds = [],
  shopDomain,
  assignmentSignature = '',
  assignmentIssuedAtMs = '',
  assignmentUserId = '',
  debug = false,
}) {
  const debugMeta = debug
    ? {
        testId: test?.id || null,
        assignmentVariantId: assignmentVariantId || null,
        deliveryGroupId: deliveryGroupId || null,
      }
    : null;
  const finish = result => {
    if (debugMeta) {
      logger.debug('Shipping checkout resolve decision', {
        ...debugMeta,
        applies: Boolean(result?.applies),
        reason: result?.reason || null,
        strategy: debugMeta.strategy || null,
      });
    }
    if (!debugMeta) {
      return result;
    }
    return { ...result, debug: debugMeta };
  };

  if (!test || !isShippingTestRowType(test.type)) {
    return finish({ applies: false, reason: 'not_shipping_test' });
  }
  if (!isShippingTestActiveForCheckout(test)) {
    return finish({ applies: false, reason: 'test_not_running' });
  }
  if (!deliveryGroupId || !String(deliveryGroupId).trim()) {
    return finish({ applies: false, reason: 'missing_delivery_group' });
  }
  if (!assignmentVariantId || !String(assignmentVariantId).trim()) {
    return finish({ applies: false, reason: 'missing_assignment_variant' });
  }

  const signatureCheck = verifyPriceAssignmentSignature({
    testId: test?.id || '',
    variantId: assignmentVariantId,
    userId: assignmentUserId,
    shopDomain,
    issuedAtMs: assignmentIssuedAtMs,
    signature: assignmentSignature,
  });
  if (debugMeta) {
    debugMeta.signatureCheck = signatureCheck?.reason || 'ok';
  }
  if (!signatureCheck.ok) {
    return finish({
      applies: false,
      reason: signatureCheck.reason || 'invalid_assignment_signature',
    });
  }
  if (!deliveryGroupMatchesShippingTarget(test, deliveryGroupProductIds)) {
    return finish({ applies: false, reason: 'product_not_in_test' });
  }

  const normalizedTest = normalizeShippingTestPayload(test || {});
  const variant = findTestVariant(normalizedTest, assignmentVariantId);
  if (!variant) {
    return finish({ applies: false, reason: 'unknown_assignment_variant' });
  }
  const config = normalizeShippingVariantConfig(variant?.config || {});
  if (debugMeta) {
    debugMeta.strategy = config.strategy;
    debugMeta.executionHint = config.execution_hint || 'auto';
  }

  if (
    !['threshold_free_shipping', 'discount_percentage', 'discount_fixed', 'free_shipping'].includes(
      config.strategy
    )
  ) {
    return finish({ applies: false, reason: 'unsupported_shipping_strategy' });
  }

  if (config.execution_hint === 'carrier_service' || config.execution_hint === 'manual') {
    return finish({ applies: false, reason: 'shipping_checkout_path_disabled' });
  }

  const cartTotal = Number.parseFloat(String(cartPresentmentTotal || '').trim());
  if (!Number.isFinite(cartTotal) || cartTotal < 0) {
    return finish({ applies: false, reason: 'invalid_cart_total' });
  }

  if (config.strategy === 'threshold_free_shipping') {
    const threshold = Number(config.threshold_amount);
    if (!Number.isFinite(threshold) || threshold <= 0) {
      return finish({ applies: false, reason: 'invalid_threshold_amount' });
    }
    if (cartTotal < threshold) {
      return finish({ applies: false, reason: 'threshold_not_met' });
    }
    return finish({
      applies: true,
      delivery_group_id: String(deliveryGroupId).trim(),
      handles: Array.isArray(deliveryOptionHandles) ? deliveryOptionHandles : [],
      value_type: 'percentage',
      value: '100',
      target_type: 'delivery_group',
      strategy: config.strategy,
      variant_id: String(variant?.id || assignmentVariantId).trim() || null,
      variant_name: String(variant?.name || '').trim() || null,
      message: buildCheckoutMessage(normalizedTest, variant, config.strategy),
      reason: null,
    });
  }

  if (config.strategy === 'discount_percentage') {
    const pct = Number(config.percent_off);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return finish({ applies: false, reason: 'invalid_percent_off' });
    }
    return finish({
      applies: true,
      delivery_group_id: String(deliveryGroupId).trim(),
      handles: Array.isArray(deliveryOptionHandles) ? deliveryOptionHandles : [],
      value_type: 'percentage',
      value: pct.toFixed(2).replace(/\.00$/, ''),
      target_type: 'delivery_group',
      strategy: config.strategy,
      variant_id: String(variant?.id || assignmentVariantId).trim() || null,
      variant_name: String(variant?.name || '').trim() || null,
      message: buildCheckoutMessage(normalizedTest, variant, config.strategy),
      reason: null,
    });
  }

  if (config.strategy === 'discount_fixed') {
    const amount = Number(config.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return finish({ applies: false, reason: 'invalid_discount_amount' });
    }
    return finish({
      applies: true,
      delivery_group_id: String(deliveryGroupId).trim(),
      handles: Array.isArray(deliveryOptionHandles) ? deliveryOptionHandles : [],
      value_type: 'fixed_amount',
      value: amount.toFixed(2),
      target_type: 'delivery_group',
      strategy: config.strategy,
      variant_id: String(variant?.id || assignmentVariantId).trim() || null,
      variant_name: String(variant?.name || '').trim() || null,
      message: buildCheckoutMessage(normalizedTest, variant, config.strategy),
      reason: null,
    });
  }

  if (config.strategy === 'free_shipping') {
    return finish({
      applies: true,
      delivery_group_id: String(deliveryGroupId).trim(),
      handles: Array.isArray(deliveryOptionHandles) ? deliveryOptionHandles : [],
      value_type: 'percentage',
      value: '100',
      target_type: 'delivery_group',
      strategy: config.strategy,
      variant_id: String(variant?.id || assignmentVariantId).trim() || null,
      variant_name: String(variant?.name || '').trim() || null,
      message: buildCheckoutMessage(normalizedTest, variant, config.strategy),
      reason: null,
    });
  }

  return finish({ applies: false, reason: 'unsupported_shipping_strategy' });
}

async function resolveCheckoutShippingBatchForDomain(
  shopDomain,
  groups,
  getTestById,
  getTestsByIds,
  options = {}
) {
  const rows = Array.isArray(groups) ? groups : [];
  if (rows.length === 0) {
    return [];
  }
  const debug = Boolean(options?.debug);
  const uniqueTestIds = Array.from(
    new Set(rows.map(row => String(row?.test_id || '').trim()).filter(Boolean))
  );

  const testMap = new Map();
  if (uniqueTestIds.length === 1 && typeof getTestById === 'function') {
    const onlyId = uniqueTestIds[0];
    const test = await getTestById(onlyId, shopDomain);
    if (test) {
      testMap.set(onlyId, test);
    }
  } else if (uniqueTestIds.length > 0 && typeof getTestsByIds === 'function') {
    const batch = await getTestsByIds(uniqueTestIds, shopDomain);
    if (batch instanceof Map) {
      batch.forEach((value, key) => testMap.set(String(key), value));
    } else if (batch && typeof batch === 'object') {
      Object.entries(batch).forEach(([key, value]) => testMap.set(String(key), value));
    }
  }

  return rows.map(row => {
    const testId = String(row?.test_id || '').trim();
    const test = testMap.get(testId) || null;
    return resolveShippingCheckoutGroupDiscount({
      test,
      assignmentVariantId: String(row?.assignment_variant || '').trim(),
      cartPresentmentTotal: row?.cart_total,
      deliveryGroupId: String(row?.delivery_group_id || '').trim(),
      deliveryOptionHandles: Array.isArray(row?.handles) ? row.handles : [],
      deliveryGroupProductIds: Array.isArray(row?.product_ids) ? row.product_ids : [],
      shopDomain,
      assignmentSignature:
        row?.assignment_sig !== undefined && row?.assignment_sig !== null
          ? String(row.assignment_sig).trim()
          : '',
      assignmentIssuedAtMs:
        row?.assignment_ts !== undefined && row?.assignment_ts !== null
          ? String(row.assignment_ts).trim()
          : '',
      assignmentUserId:
        row?.assignment_user !== undefined && row?.assignment_user !== null
          ? String(row.assignment_user).trim()
          : '',
      debug,
    });
  });
}

module.exports = {
  resolveShippingCheckoutGroupDiscount,
  resolveCheckoutShippingBatchForDomain,
};
