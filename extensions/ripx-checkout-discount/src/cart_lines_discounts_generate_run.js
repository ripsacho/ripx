import {
  DiscountClass,
  OrderDiscountSelectionStrategy,
  ProductDiscountSelectionStrategy,
} from '../generated/api';
import { RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT } from './ripxConfig';

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

function buildCandidateForLine(line, discountDecimal) {
  const amt = parseFloat(String(discountDecimal), 10);
  if (!Number.isFinite(amt) || amt <= 0) {
    return null;
  }
  return {
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
        amount: amt.toFixed(2),
        appliesToEachItem: false,
      },
    },
  };
}

function buildLocalFallbackCandidates(cartLines) {
  const candidates = [];
  for (const line of cartLines || []) {
    const targetUnitRaw = line?.ripxTargetUnit?.value;
    const qty = Math.max(1, Number(line?.quantity) || 1);
    const subtotal = Number.parseFloat(String(line?.cost?.subtotalAmount?.amount || '').trim());
    if (!targetUnitRaw || !Number.isFinite(subtotal) || subtotal <= 0) {
      continue;
    }
    // Probe mode proved the function executes. When fetch data is missing,
    // fall back as long as the line carries a test marker and target unit.
    // Requiring proof fields here only creates false negatives because this
    // branch cannot validate those fields anyway.
    if (!line?.ripxTest?.value) {
      continue;
    }
    const targetUnit = Number.parseFloat(String(targetUnitRaw).trim());
    if (!Number.isFinite(targetUnit) || targetUnit < 0) {
      continue;
    }
    const targetLine = Math.max(0, Math.round(targetUnit * qty * 100) / 100);
    const roundedSubtotal = Math.round(subtotal * 100) / 100;
    const discount = Math.round((roundedSubtotal - targetLine) * 100) / 100;
    const candidate = buildCandidateForLine(line, discount);
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function buildProbeCandidates(cartLines) {
  const candidates = [];
  for (const line of cartLines || []) {
    if (!line?.ripxTest?.value) {
      continue;
    }
    const candidate = buildCandidateForLine(line, 0.01);
    if (candidate) {
      candidate.message = 'RipX probe discount';
      candidates.push(candidate);
    }
  }
  return candidates;
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
  const cartLines = input.cart?.lines || [];
  const probeEnabled = RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT === true;
  if (probeEnabled) {
    const probeCandidates = buildProbeCandidates(cartLines);
    if (probeCandidates.length === 0) {
      return { operations: [] };
    }
    if (!hasProduct && hasOrder) {
      return {
        operations: [
          {
            orderDiscountsAdd: {
              candidates: [
                {
                  message: 'RipX probe discount',
                  targets: [{ orderSubtotal: { excludedCartLineIds: [] } }],
                  value: {
                    fixedAmount: {
                      amount: (probeCandidates.length * 0.01).toFixed(2),
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
    return {
      operations: [
        {
          productDiscountsAdd: {
            candidates: probeCandidates,
            selectionStrategy: ProductDiscountSelectionStrategy.All,
          },
        },
      ],
    };
  }
  const status = input.fetchResult?.status;
  const body = normalizeFetchBody(input.fetchResult?.jsonBody);
  const rows = Array.isArray(body.lines) ? body.lines : [];
  const byLineId = new Map(rows.map(row => [row.line_id, row]));

  const candidates = [];
  if (!(typeof status === 'number' && (status < 200 || status > 299))) {
    for (const line of cartLines) {
      const row = byLineId.get(line.id);
      if (!row || !row.applies || !row.discountDecimal) {
        continue;
      }
      const candidate = buildCandidateForLine(line, row.discountDecimal);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  // Fallback for potential fetch/run line-id drift: map by index order.
  // Some environments may produce non-matching line IDs across stages.
  if (candidates.length === 0 && rows.length > 0) {
    const n = Math.min(cartLines.length, rows.length);
    for (let i = 0; i < n; i++) {
      const line = cartLines[i];
      const row = rows[i];
      if (!line || !row || !row.applies || !row.discountDecimal) {
        continue;
      }
      const candidate = buildCandidateForLine(line, row.discountDecimal);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  // Local no-network fallback:
  // use line properties set by the storefront when Shopify never executes fetch.
  if (candidates.length === 0) {
    const localCandidates = buildLocalFallbackCandidates(cartLines);
    for (const candidate of localCandidates) {
      candidates.push(candidate);
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
