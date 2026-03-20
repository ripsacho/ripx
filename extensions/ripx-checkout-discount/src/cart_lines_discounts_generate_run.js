import { DiscountClass, ProductDiscountSelectionStrategy } from '../generated/api';

function normalizeFetchBody(jsonBody) {
  if (jsonBody == null) {
    return null;
  }
  if (typeof jsonBody === 'string') {
    try {
      return JSON.parse(jsonBody);
    } catch {
      return null;
    }
  }
  return jsonBody;
}

/**
 * @param {import("../generated/api").RipxCartLinesRun} input
 */
export function cartLinesDiscountsGenerateRun(input) {
  const discountClasses = input.discount?.discountClasses || [];
  const hasProduct = discountClasses.includes(DiscountClass.Product);
  if (!hasProduct) {
    return { operations: [] };
  }

  const status = input.fetchResult?.status;
  if (typeof status === 'number' && (status < 200 || status > 299)) {
    return { operations: [] };
  }

  const body = normalizeFetchBody(input.fetchResult?.jsonBody);
  if (!body || body.success === false || !Array.isArray(body.lines)) {
    return { operations: [] };
  }

  const byLineId = new Map(body.lines.map(row => [row.line_id, row]));

  const candidates = [];
  for (const line of input.cart?.lines || []) {
    const row = byLineId.get(line.id);
    if (!row || !row.applies || !row.discountDecimal) {
      continue;
    }
    const amt = parseFloat(String(row.discountDecimal), 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      continue;
    }
    candidates.push({
      message: 'RipX price test',
      targets: [
        {
          cartLine: {
            id: line.id,
          },
        },
      ],
      value: {
        fixedAmount: {
          amount: String(row.discountDecimal),
          appliesToEachItem: false,
        },
      },
    });
  }

  if (candidates.length === 0) {
    return { operations: [] };
  }

  // ALL = apply every candidate to its cart line. FIRST would only honor one line in multi-line carts.
  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
