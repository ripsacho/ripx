// Price-test checkout path:
// storefront-script.js writes RipX line attributes during cart add. This Cart Transform only uses
// direct override for price increases or forced doc-test probes; signed discounts are handled by
// the checkout discount function. See PRICE_TEST_FLOW.md.
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
    normalized === 'direct_override' ||
    normalized === 'direct-override' ||
    normalized === 'directoverride'
  );
}

function getConfiguredPriceMethod(line) {
  // Shopify Function input may expose configured attributes either through generated aliases or the
  // raw attributes array, depending on schema/runtime shape. Support both to keep deployment-safe.
  return getLineAttributeValue(
    line,
    ['ripxPriceMethod', 'ripxPriceApplicationMethod', 'ripxPriceApplicationMethodLegacy'],
    ['_ripx_price_method', '_ripx_price_application_method', '__ripx_price_application_method']
  );
}

function getForcedCartTransformTestAmount(input) {
  return parseDecimal(input?.cart?.ripxCartTransformTestAmount?.value);
}

function getForcedCartTransformTestVariantId(input) {
  const raw = String(input?.cart?.ripxCartTransformTestVariantId?.value || '').trim();
  return raw || '';
}

function normalizeVariantId(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const gidMatch = raw.match(/\/(\d+)$/);
  if (gidMatch && gidMatch[1]) {
    return gidMatch[1];
  }
  return raw.replace(/\D+/g, '') || raw;
}

function resolveLineTargetUnit(line, forcedTestAmount) {
  if (forcedTestAmount !== null && forcedTestAmount >= 0) {
    return forcedTestAmount;
  }
  return parseDecimal(getLineAttributeValue(line, ['ripxTargetUnit'], ['_ripx_target_unit']));
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
 * @param {number | null} forcedTestAmount
 * @param {string} forcedTestVariantId
 * @returns {boolean}
 */
function shouldApplyDirectOverride(line, forcedTestAmount, forcedTestVariantId) {
  if (!line || !line.id) {
    return false;
  }
  if (line.sellingPlanAllocation) {
    // Shopify rejects lineUpdate for subscription lines.
    return false;
  }
  if (line.merchandise?.__typename !== 'ProductVariant') {
    return false;
  }
  const isForcedDocTestMode = forcedTestAmount !== null && forcedTestAmount >= 0;
  if (isForcedDocTestMode) {
    if (forcedTestVariantId) {
      const lineVariantId = normalizeVariantId(line?.merchandise?.id);
      if (!lineVariantId || lineVariantId !== normalizeVariantId(forcedTestVariantId)) {
        return false;
      }
    }
  } else {
    // Normal production path: only RipX-marked lines using direct override are eligible.
    // Discount-checkout tests are handled by the discount function instead.
    const ripxMarker = getLineAttributeValue(
      line,
      ['ripxTest', 'ripxVariant', 'ripxShop'],
      ['_ripx_price_test', '_ripx_variant', '_ripx_shop']
    );
    if (!ripxMarker) {
      return false;
    }
    if (!isDirectOverrideMethod(getConfiguredPriceMethod(line))) {
      return false;
    }
  }
  const targetUnit = resolveLineTargetUnit(line, forcedTestAmount);
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
  if (!isForcedDocTestMode && targetUnit < currentUnit) {
    // Cart line attributes are client-originated. Do not let direct override become an unsigned
    // discount path; lower prices must go through the signed checkout discount resolver instead.
    return false;
  }
  return true;
}

/**
 * @param {Input['cart']['lines'][number]} line
 * @param {number | null} forcedTestAmount
 * @param {string} forcedTestVariantId
 * @returns {Operation['lineUpdate'] | null}
 */
function buildLineUpdateOperation(line, forcedTestAmount, forcedTestVariantId) {
  if (!shouldApplyDirectOverride(line, forcedTestAmount, forcedTestVariantId)) {
    return null;
  }
  const targetUnit = resolveLineTargetUnit(line, forcedTestAmount);
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
  // Shopify expects an empty operation list when no line needs direct override.
  const operations = [];
  const forcedTestAmount = getForcedCartTransformTestAmount(input);
  const forcedTestVariantId = getForcedCartTransformTestVariantId(input);
  const cartLines = input?.cart?.lines || [];
  for (const line of cartLines) {
    const lineUpdate = buildLineUpdateOperation(line, forcedTestAmount, forcedTestVariantId);
    if (lineUpdate) {
      operations.push({ lineUpdate });
    }
  }
  return operations.length > 0 ? { operations } : NO_CHANGES;
}
