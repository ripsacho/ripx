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

/**
 * Applies free-shipping offer variants to delivery groups in checkout.
 * @param {import("../generated/api").RipxDeliveryRun} input
 * @returns {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult}
 */
export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const candidates = buildFreeShippingCandidates(input?.cart?.deliveryGroups);
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
