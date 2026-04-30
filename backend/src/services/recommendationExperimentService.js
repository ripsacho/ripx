const RECOMMENDATION_EVENT_NAMES = Object.freeze([
  'recommendation_impression',
  'recommendation_click',
  'recommendation_add_to_cart',
  'recommendation_checkout_start',
  'recommendation_purchase',
]);

const RECOMMENDATION_STRATEGIES = Object.freeze({
  manual_picks: {
    label: 'Manual picks',
    requiresShopifyData: false,
    description: 'Merchant-selected products for controlled merchandising experiments.',
  },
  collection_fed: {
    label: 'Collection-fed',
    requiresShopifyData: true,
    description: 'Products are sourced from a Shopify collection with optional filters.',
  },
  cart_related: {
    label: 'Cart-related',
    requiresShopifyData: true,
    description: 'Products are selected from cart context and matching tags/product types.',
  },
  price_band: {
    label: 'Price band',
    requiresShopifyData: true,
    description: 'Products are filtered by minimum and maximum price.',
  },
  frequently_bought_together: {
    label: 'Frequently bought together',
    requiresShopifyData: true,
    placeholder: true,
    description: 'Analytics-backed association rules once enough order data is available.',
  },
});

function buildRecommendationBlockConfig(input = {}) {
  const strategy = RECOMMENDATION_STRATEGIES[input.strategy] ? input.strategy : 'manual_picks';
  return {
    blockId: input.blockId || input.block_id || `rec_${strategy}`,
    strategy,
    title: String(input.title || 'Recommended for you')
      .trim()
      .slice(0, 120),
    placement: String(input.placement || 'storefront_block').trim(),
    productSource: {
      productIds: Array.isArray(input.productIds) ? input.productIds.slice(0, 50) : [],
      collectionId: input.collectionId || null,
      priceBand: input.priceBand || null,
    },
    tracking: {
      eventNames: RECOMMENDATION_EVENT_NAMES,
      metadataKeys: ['block_id', 'strategy', 'product_id', 'variant_id', 'placement'],
    },
    readiness: {
      requiresShopifyData: RECOMMENDATION_STRATEGIES[strategy].requiresShopifyData,
      placeholder: Boolean(RECOMMENDATION_STRATEGIES[strategy].placeholder),
    },
  };
}

function listRecommendationTemplates() {
  return Object.entries(RECOMMENDATION_STRATEGIES).map(([key, strategy]) => ({
    key,
    ...strategy,
    defaultConfig: buildRecommendationBlockConfig({ strategy: key }),
  }));
}

module.exports = {
  RECOMMENDATION_EVENT_NAMES,
  RECOMMENDATION_STRATEGIES,
  buildRecommendationBlockConfig,
  listRecommendationTemplates,
};
