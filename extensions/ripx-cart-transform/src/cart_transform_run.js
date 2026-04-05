const NO_CHANGES = { operations: [] };
const DIRECT_OVERRIDE_METHOD = 'direct_price_override';

function normalizePriceMethod(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function parseDecimal(value) {
  const num = Number.parseFloat(String(value === null || value === undefined ? '' : value).trim());
  return Number.isFinite(num) ? num : null;
}

function amountsMatch(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.0001;
}

function isDirectOverrideMethod(value) {
  const normalized = normalizePriceMethod(value);
  return (
    normalized === DIRECT_OVERRIDE_METHOD ||
    normalized === 'direct-override' ||
    normalized === 'directoverride'
  );
}

function getConfiguredPriceMethod(line) {
  return getLineAttributeValue(
    line,
    ['ripxPriceMethod', 'ripxPriceApplicationMethod', 'ripxPriceApplicationMethodLegacy'],
    ['_ripx_price_method', '_ripx_price_application_method', '__ripx_price_application_method']
  );
}

function getLineAttributeValue(line, aliasNames = [], keys = []) {
  for (const aliasName of aliasNames) {
    const value = line?.[aliasName]?.value;
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }
  const attrs = Array.isArray(line?.attributes) ? line.attributes : [];
  if (!attrs.length || !keys.length) {
    return '';
  }
  const wanted = new Set(
    keys
      .map(k =>
        String(k || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
  for (const attr of attrs) {
    const key = String(attr?.key || '')
      .trim()
      .toLowerCase();
    if (!wanted.has(key)) {
      continue;
    }
    const value = attr?.value;
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return value;
    }
  }
  return '';
}

/**
 * @param {Input['cart']['lines'][number]} line
 * @returns {boolean}
 */
function shouldApplyDirectOverride(line) {
  if (!line || !line.id) {
    return false;
  }
  const ripxMarker = getLineAttributeValue(
    line,
    ['ripxTest', 'ripxVariant', 'ripxShop'],
    ['_ripx_price_test', '_ripx_variant', '_ripx_shop']
  );
  if (!ripxMarker) {
    return false;
  }
  if (line.sellingPlanAllocation) {
    // Shopify rejects lineUpdate for subscription lines.
    return false;
  }
  if (!isDirectOverrideMethod(getConfiguredPriceMethod(line))) {
    return false;
  }
  if (line.merchandise?.__typename !== 'ProductVariant') {
    return false;
  }
  const targetUnit = parseDecimal(
    getLineAttributeValue(line, ['ripxTargetUnit'], ['_ripx_target_unit'])
  );
  const currentUnit = parseDecimal(line.cost?.amountPerQuantity?.amount);
  if (targetUnit === null || targetUnit < 0) {
    return false;
  }
  if (currentUnit === null) {
    return false;
  }
  if (amountsMatch(targetUnit, currentUnit)) {
    return false;
  }
  return true;
}

/**
 * @param {Input['cart']['lines'][number]} line
 * @returns {Operation['lineUpdate'] | null}
 */
function buildLineUpdateOperation(line) {
  if (!shouldApplyDirectOverride(line)) {
    return null;
  }
  const targetUnit = parseDecimal(
    getLineAttributeValue(line, ['ripxTargetUnit'], ['_ripx_target_unit'])
  );
  if (targetUnit === null) {
    return null;
  }
  return {
    cartLineId: line.id,
    price: {
      adjustment: {
        fixedPricePerUnit: {
          amount: targetUnit.toFixed(2),
        },
      },
    },
  };
}

/**
 * @param {Input} input
 * @returns {CartTransformRunResult}
 */
export function cartTransformRun(input) {
  const operations = [];
  const cartLines = input?.cart?.lines || [];
  for (const line of cartLines) {
    const lineUpdate = buildLineUpdateOperation(line);
    if (lineUpdate) {
      operations.push({ lineUpdate });
    }
  }
  return operations.length > 0 ? { operations } : NO_CHANGES;
}
