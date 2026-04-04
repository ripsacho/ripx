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

/**
 * @param {Input['cart']['lines'][number]} line
 * @returns {boolean}
 */
function shouldApplyDirectOverride(line) {
  if (!line || !line.id) {
    return false;
  }
  if (!line.ripxTest?.value || !line.ripxVariant?.value) {
    return false;
  }
  if (normalizePriceMethod(line.ripxPriceMethod?.value) !== DIRECT_OVERRIDE_METHOD) {
    return false;
  }
  if (line.merchandise?.__typename !== 'ProductVariant') {
    return false;
  }
  const targetUnit = parseDecimal(line.ripxTargetUnit?.value);
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
  const targetUnit = parseDecimal(line.ripxTargetUnit?.value);
  if (targetUnit === null) {
    return null;
  }
  return {
    cartLineId: line.id,
    price: {
      adjustment: {
        fixedPricePerUnit: {
          amount: Number(targetUnit.toFixed(2)),
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
