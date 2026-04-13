import { DeliveryDiscountSelectionStrategy } from '../generated/api';

function hasFreeShippingOfferMarker(line) {
  const testId = String(line?.ripxTest?.value || '').trim();
  const variantId = String(line?.ripxVariant?.value || '').trim();
  const discountType = String(line?.ripxOfferDiscountType?.value || '')
    .trim()
    .toLowerCase();
  return Boolean(testId && variantId && discountType === 'free_shipping');
}

function buildFreeShippingCandidates(deliveryGroups) {
  const groups = Array.isArray(deliveryGroups) ? deliveryGroups : [];
  const candidates = [];

  for (const group of groups) {
    const groupId = String(group?.id || '').trim();
    const hasDeliveryOptions =
      Array.isArray(group?.deliveryOptions) && group.deliveryOptions.length > 0;
    const lines = Array.isArray(group?.cartLines) ? group.cartLines : [];
    if (!groupId || !hasDeliveryOptions) {
      continue;
    }
    if (!lines.some(hasFreeShippingOfferMarker)) {
      continue;
    }

    candidates.push({
      message: 'RipX offer free shipping',
      targets: [{ deliveryGroup: { id: groupId } }],
      value: { percentage: { value: 100 } },
    });
  }

  return candidates;
}

function normalizeFetchBody(jsonBody) {
  if (jsonBody === null || jsonBody === undefined) {
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

function buildCandidateFromResolvedGroup(group, row) {
  if (!group || !row || !row.applies) {
    return null;
  }
  const groupId = String(group?.id || '').trim();
  if (!groupId) {
    return null;
  }
  const message = String(row?.message || 'RipX shipping test').trim() || 'RipX shipping test';
  const valueType = String(row?.value_type || '')
    .trim()
    .toLowerCase();
  const rawValue = String(row?.value || '').trim();
  if (valueType === 'percentage') {
    const pct = Number.parseFloat(rawValue);
    if (!Number.isFinite(pct) || pct <= 0) {
      return null;
    }
    return {
      message,
      targets: [{ deliveryGroup: { id: groupId } }],
      value: { percentage: { value: pct } },
    };
  }
  if (valueType === 'fixed_amount') {
    const amount = Number.parseFloat(rawValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    return {
      message,
      targets: [{ deliveryGroup: { id: groupId } }],
      value: { fixedAmount: { amount: amount.toFixed(2) } },
    };
  }
  return null;
}

/**
 * Applies free-shipping offer variants to delivery groups in checkout.
 * @param {import("../generated/api").RipxDeliveryRun} input
 * @returns {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult}
 */
export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const deliveryGroups = Array.isArray(input?.cart?.deliveryGroups)
    ? input.cart.deliveryGroups
    : [];
  const status = input?.fetchResult?.status;
  const body = normalizeFetchBody(input?.fetchResult?.jsonBody);
  const rows = Array.isArray(body?.groups) ? body.groups : [];
  const byGroupId = new Map(
    rows
      .filter(row => row && row.delivery_group_id)
      .map(row => [String(row.delivery_group_id), row])
  );

  const candidates = [];
  if (!(typeof status === 'number' && (status < 200 || status > 299))) {
    for (const group of deliveryGroups) {
      const row = byGroupId.get(String(group?.id || '').trim());
      const candidate = buildCandidateFromResolvedGroup(group, row);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }
  if (candidates.length === 0) {
    const fallbackCandidates = buildFreeShippingCandidates(deliveryGroups);
    for (const candidate of fallbackCandidates) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates,
          selectionStrategy: DeliveryDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
