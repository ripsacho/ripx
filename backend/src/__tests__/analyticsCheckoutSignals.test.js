jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

const analyticsService = require('../services/analytics');

describe('AnalyticsService checkout signal helpers', () => {
  it('returns built-in checkout section event names for checkout experience tests', () => {
    expect(
      analyticsService._getBuiltInCheckoutEventNames({
        type: 'checkout',
        goal: { checkout_phase: 'experience' },
      })
    ).toEqual([
      'checkout_phase_impression',
      'checkout_phase_cta_click',
      'checkout_phase_offer_apply',
      'checkout_phase_conversion',
      'checkout_runtime_diagnostic',
      'checkout_section_impression',
      'checkout_section_cta_click',
      'checkout_section_offer_apply',
      'checkout_product_impression',
      'checkout_product_click',
      'checkout_product_add_attempt',
      'checkout_product_add_success',
      'checkout_product_add_failed',
    ]);
  });

  it('exposes payment customization signals for payment checkout phases', () => {
    expect(
      analyticsService._getBuiltInCheckoutEventNames({
        type: 'checkout',
        goal: { checkout_phase: 'payment_method' },
      })
    ).toEqual([
      'checkout_phase_impression',
      'checkout_phase_cta_click',
      'checkout_phase_offer_apply',
      'checkout_phase_conversion',
      'checkout_runtime_diagnostic',
      'checkout_payment_method_action',
      'checkout_customization_match',
    ]);
  });

  it('exposes delivery customization signals for delivery checkout phases', () => {
    expect(
      analyticsService._getBuiltInCheckoutEventNames({
        type: 'checkout',
        goal: { checkout_phase: 'delivery_method' },
      })
    ).toEqual([
      'checkout_phase_impression',
      'checkout_phase_cta_click',
      'checkout_phase_offer_apply',
      'checkout_phase_conversion',
      'checkout_runtime_diagnostic',
      'checkout_delivery_method_action',
      'checkout_customization_match',
    ]);
  });

  it('builds advanced checkout journey and section output', () => {
    const output = analyticsService._buildCheckoutAdvancedOutput({
      checkoutPhase: 'experience',
      checkoutSectionEventNames: [
        'checkout_phase_impression',
        'checkout_section_impression',
        'checkout_section_cta_click',
      ],
      variants: [
        {
          id: 'control',
          name: 'Control',
          visitors: 10,
          checkoutSectionEvents: {
            checkout_phase_impression: { count: 8 },
            checkout_section_impression: { count: 6 },
            checkout_section_cta_click: { count: 1 },
          },
        },
        {
          id: 'variant-a',
          name: 'Variant A',
          visitors: 10,
          checkoutSectionEvents: {
            checkout_phase_impression: { count: 9 },
            checkout_section_impression: { count: 8 },
            checkout_section_cta_click: { count: 4 },
          },
        },
      ],
      checkoutEventBreakdown: [
        {
          eventName: 'checkout_section_impression',
          variantId: 'variant-a',
          checkoutSectionId: 'trust-box',
          checkoutSectionType: 'trust_box',
          uniqueUsers: 8,
          totalEvents: 8,
        },
        {
          eventName: 'checkout_section_cta_click',
          variantId: 'variant-a',
          checkoutSectionId: 'trust-box',
          checkoutSectionType: 'trust_box',
          uniqueUsers: 4,
          totalEvents: 4,
        },
        {
          eventName: 'checkout_runtime_diagnostic',
          variantId: 'variant-a',
          diagnosticReason: 'discount_code_apply_failed',
          totalEvents: 2,
        },
        {
          eventName: 'checkout_product_impression',
          variantId: 'variant-a',
          checkoutSectionId: 'picks',
          checkoutSectionType: 'product_list',
          checkoutProductId: 'gid://shopify/Product/1',
          checkoutMerchandiseId: 'gid://shopify/ProductVariant/1',
          checkoutProductSourceMode: 'collection',
          checkoutProductStrategy: 'collection_bestseller',
          checkoutProductAction: 'add_to_cart',
          checkoutProductAnalyticsKey: 'collection_1',
          checkoutProductRank: 1,
          uniqueUsers: 6,
          totalEvents: 6,
        },
        {
          eventName: 'checkout_product_add_attempt',
          variantId: 'variant-a',
          checkoutSectionId: 'picks',
          checkoutSectionType: 'product_list',
          checkoutProductId: 'gid://shopify/Product/1',
          checkoutMerchandiseId: 'gid://shopify/ProductVariant/1',
          checkoutProductSourceMode: 'collection',
          checkoutProductStrategy: 'collection_bestseller',
          checkoutProductAction: 'add_to_cart',
          checkoutProductAnalyticsKey: 'collection_1',
          checkoutProductRank: 1,
          uniqueUsers: 6,
          totalEvents: 6,
        },
        {
          eventName: 'checkout_product_add_success',
          variantId: 'variant-a',
          checkoutSectionId: 'picks',
          checkoutSectionType: 'product_list',
          checkoutProductId: 'gid://shopify/Product/1',
          checkoutMerchandiseId: 'gid://shopify/ProductVariant/1',
          checkoutProductSourceMode: 'collection',
          checkoutProductStrategy: 'collection_bestseller',
          checkoutProductAction: 'add_to_cart',
          checkoutProductAnalyticsKey: 'collection_1',
          checkoutProductRank: 1,
          uniqueUsers: 3,
          totalEvents: 3,
        },
      ],
    });

    expect(output.journeySteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cta_click',
          total: 5,
          leader: expect.objectContaining({ variantName: 'Variant A', rate: 40 }),
        }),
      ])
    );
    expect(output.sectionPerformanceRows).toEqual([
      expect.objectContaining({
        sectionId: 'trust-box',
        impressions: 8,
        ctaClicks: 4,
        ctr: 50,
      }),
    ]);
    expect(output.diagnostics).toEqual([
      expect.objectContaining({ reason: 'discount_code_apply_failed', count: 2 }),
    ]);
    expect(output.productPerformanceRows).toEqual([
      expect.objectContaining({
        productId: 'gid://shopify/Product/1',
        impressions: 6,
        addSuccesses: 3,
        addSuccessRate: 50,
      }),
    ]);
  });
});
