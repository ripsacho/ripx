/**
 * Inventory of Shopify Functions the RipX app expects on a store (Admin API shopifyFunctions).
 * Repo: RipX checkout functions currently cover discounting, cart transforms, payment
 * customization, and delivery customization.
 */

const RIPX_EXTENSION_MANIFEST = [
  {
    key: 'checkout_discount',
    label: 'Checkout discount function',
    description:
      'extensions/ripx-checkout-discount — Discount Function API (checkout price alignment via batch URL)',
    apiTypeIncludes: ['discount'],
  },
  {
    key: 'cart_transform',
    label: 'Cart transform function',
    description:
      'extensions/ripx-cart-transform — Cart Transform API (Direct Price Override / lineUpdate on Plus or dev stores)',
    apiTypeIncludes: ['cart_transform', 'cart transform'],
  },
  {
    key: 'payment_customization',
    label: 'Payment customization function',
    description:
      'extensions/ripx-payment-customization — Payment Customization API (hide, rename, or reorder payment methods at checkout)',
    apiTypeIncludes: ['payment_customization', 'payment customization'],
  },
  {
    key: 'delivery_customization',
    label: 'Delivery customization function',
    description:
      'extensions/ripx-delivery-customization — Delivery Customization API (hide, rename, or reorder delivery methods at checkout)',
    apiTypeIncludes: ['delivery_customization', 'delivery customization'],
  },
];

function normalizeType(s) {
  return String(s || '').toLowerCase();
}

function pickRipxPreferred(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  const byTitle = candidates.find(fn =>
    String(fn?.title || '')
      .toLowerCase()
      .includes('ripx')
  );
  return byTitle || candidates[0] || null;
}

/**
 * @param {Array<{ id?: string, title?: string, apiType?: string }>} shopifyFunctions
 * @param {string|null} shopDomain
 */
function buildShopifyFunctionsInventory(shopifyFunctions, shopDomain) {
  const nodes = Array.isArray(shopifyFunctions) ? shopifyFunctions : [];
  const discountCandidates = nodes.filter(fn => normalizeType(fn?.apiType).includes('discount'));
  const cartCandidates = nodes.filter(fn => {
    const t = normalizeType(fn?.apiType);
    return t.includes('cart_transform') || t.includes('cart transform');
  });
  const paymentCandidates = nodes.filter(fn => {
    const t = normalizeType(fn?.apiType);
    return t.includes('payment_customization') || t.includes('payment customization');
  });
  const deliveryCandidates = nodes.filter(fn => {
    const t = normalizeType(fn?.apiType);
    return t.includes('delivery_customization') || t.includes('delivery customization');
  });

  const expectations = RIPX_EXTENSION_MANIFEST.map(spec => {
    const pool =
      spec.key === 'checkout_discount'
        ? discountCandidates
        : spec.key === 'cart_transform'
          ? cartCandidates
          : spec.key === 'payment_customization'
            ? paymentCandidates
            : spec.key === 'delivery_customization'
              ? deliveryCandidates
              : [];
    const selected = pickRipxPreferred(pool);
    return {
      key: spec.key,
      label: spec.label,
      description: spec.description,
      detected: Boolean(selected?.id),
      matchedFunction: selected
        ? { id: selected.id, title: selected.title, apiType: selected.apiType }
        : null,
      candidateCount: pool.length,
    };
  });

  const discountDetected = expectations.some(e => e.key === 'checkout_discount' && e.detected);
  const cartDetected = expectations.some(e => e.key === 'cart_transform' && e.detected);
  const paymentDetected = expectations.some(e => e.key === 'payment_customization' && e.detected);
  const deliveryDetected = expectations.some(e => e.key === 'delivery_customization' && e.detected);

  return {
    success: true,
    shopDomain: shopDomain || null,
    generatedAt: new Date().toISOString(),
    manifestNotes: [
      'This codebase defines checkout-oriented Shopify Functions for discounting, cart transforms, payment customization, and delivery customization. Payment/delivery customization remain optional product surfaces until those phases are deployed on the target shop.',
    ],
    operationalNotes: [
      'You do not need a running price test to deploy these extensions or to create the automatic discount from App settings.',
      'Deploy extensions (e.g. shopify app deploy), then use Create/attach RipX discount when the discount function is visible to Admin API.',
      'Shopify allows at most one cart transform function per store; if another app owns that slot, RipX cart transform cannot be installed until that is resolved.',
    ],
    summary: {
      totalFunctionsReturned: nodes.length,
      discountCandidates: discountCandidates.length,
      cartTransformCandidates: cartCandidates.length,
      paymentCustomizationCandidates: paymentCandidates.length,
      deliveryCustomizationCandidates: deliveryCandidates.length,
    },
    /** High-level gates for price-test checkout paths */
    readiness: {
      discount_function_for_checkout: discountDetected,
      cart_transform_for_direct_price: cartDetected,
      both_detected: discountDetected && cartDetected,
      payment_customization_for_checkout: paymentDetected,
      delivery_customization_for_checkout: deliveryDetected,
    },
    expectations,
    shopifyFunctions: nodes,
  };
}

module.exports = {
  RIPX_EXTENSION_MANIFEST,
  buildShopifyFunctionsInventory,
};
