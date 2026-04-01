import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

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
  const hasOrder = discountClasses.includes(DiscountClass.Order);
  // Be permissive in case Shopify omits/changes class signals for this target.
  // If we have valid resolved rows, still attempt product candidates.

  const status = input.fetchResult?.status;
  if (typeof status === 'number' && (status < 200 || status > 299)) {
    return { operations: [] };
  }

  const body = normalizeFetchBody(input.fetchResult?.jsonBody);
  if (!body || body.success === false || !Array.isArray(body.lines)) {
    return { operations: [] };
  }

  const rows = Array.isArray(body.lines) ? body.lines : [];
  const byLineId = new Map(rows.map(row => [row.line_id, row]));

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

  // Fallback for potential fetch/run line-id drift: map by index order.
  // Some environments may produce non-matching line IDs across stages.
  if (candidates.length === 0 && rows.length > 0) {
    const cartLines = input.cart?.lines || [];
    const n = Math.min(cartLines.length, rows.length);
    for (let i = 0; i < n; i++) {
      const line = cartLines[i];
      const row = rows[i];
      if (!line || !row || !row.applies || !row.discountDecimal) {
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
  }

  if (candidates.length === 0) {
    return { operations: [] };
  }

  // Some discount instances may be configured with ORDER class only.
  // In that case, emit one subtotal candidate using the sum of per-line discounts.
  if (!hasProduct && hasOrder) {
    const total = candidates.reduce((sum, c) => {
      const amt = Number.parseFloat(String(c?.value?.fixedAmount?.amount || ''), 10);
      return Number.isFinite(amt) && amt > 0 ? sum + amt : sum;
    }, 0);
    if (!(total > 0)) {
      return { operations: [] };
    }
    return {
      operations: [
        {
          orderDiscountsAdd: {
            candidates: [
              {
                message: 'RipX price test',
                targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
                value: {
                  fixedAmount: {
                    amount: total.toFixed(2),
                  },
                },
              },
            ],
            selectionStrategy: OrderDiscountSelectionStrategy.Maximum,
          },
        },
      ],
    };
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
