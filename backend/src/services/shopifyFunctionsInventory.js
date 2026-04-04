/**
 * Inventory of Shopify Functions the RipX app expects on a store (Admin API shopifyFunctions).
 * Repo: exactly two function extensions — extensions/ripx-checkout-discount, extensions/ripx-cart-transform.
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

  const expectations = RIPX_EXTENSION_MANIFEST.map(spec => {
    const pool =
      spec.key === 'checkout_discount'
        ? discountCandidates
        : spec.key === 'cart_transform'
          ? cartCandidates
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

  return {
    success: true,
    shopDomain: shopDomain || null,
    generatedAt: new Date().toISOString(),
    manifestNotes: [
      'This codebase defines exactly two Shopify Functions extensions: ripx-checkout-discount (discount) and ripx-cart-transform (cart transform). RipX does not ship a second cart transform or an extra discount function in this repository.',
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
    },
    /** High-level gates for price-test checkout paths */
    readiness: {
      discount_function_for_checkout: discountDetected,
      cart_transform_for_direct_price: cartDetected,
      both_detected: discountDetected && cartDetected,
    },
    expectations,
    shopifyFunctions: nodes,
  };
}

module.exports = {
  RIPX_EXTENSION_MANIFEST,
  buildShopifyFunctionsInventory,
};
