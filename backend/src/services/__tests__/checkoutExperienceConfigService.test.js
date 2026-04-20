const {
  normalizeCheckoutExperienceConfig,
  normalizeCheckoutExperienceTestPayload,
  validateCheckoutExperienceConfig,
} = require('../checkoutExperienceConfigService');

describe('checkoutExperienceConfigService', () => {
  it('normalizes legacy checkout copy into a hero notice section', () => {
    const normalized = normalizeCheckoutExperienceConfig({
      checkout_title: 'Try express delivery',
      checkout_message: 'Get it by Friday when you order in the next 2 hours.',
      checkout_badge_text: 'Fastest',
      checkout_feature_bullets: ['Tracked shipping', 'Carbon neutral'],
      checkout_cta_label: 'Apply offer',
    });

    expect(normalized.checkout_placement).toBe('purchase.checkout.block.render');
    expect(normalized.checkout_sections).toHaveLength(1);
    expect(normalized.checkout_sections[0]).toMatchObject({
      type: 'hero_notice',
      enabled: true,
      props: {
        title: 'Try express delivery',
        message: 'Get it by Friday when you order in the next 2 hours.',
        badge_text: 'Fastest',
        cta_label: 'Apply offer',
        feature_bullets: ['Tracked shipping', 'Carbon neutral'],
      },
    });
  });

  it('validates structured checkout sections and counts actionable sections', () => {
    const result = validateCheckoutExperienceConfig({
      checkout_placement: 'purchase.checkout.block.render',
      checkout_sections: [
        {
          id: 'trust-box',
          type: 'trust_box',
          enabled: true,
          order: 1,
          props: {
            title: 'Trusted by 12,000 customers',
            feature_bullets: ['Secure checkout', 'Encrypted payment'],
          },
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.actionableSectionCount).toBe(1);
    expect(result.normalizedConfig.checkout_sections[0].type).toBe('trust_box');
  });

  it('rejects unsupported section types', () => {
    const result = validateCheckoutExperienceConfig({
      checkout_sections: [
        {
          type: 'countdown_timer',
          enabled: true,
          props: { title: 'Hurry' },
        },
      ],
    });

    expect(result.errors.some(error => error.includes('checkout_sections[0] type'))).toBe(true);
  });

  it('normalizes full checkout experience payload variants for persistence', () => {
    const normalized = normalizeCheckoutExperienceTestPayload({
      type: 'checkout',
      goal: { checkout_phase: 'experience' },
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            checkout_sections: [
              {
                type: 'trust_box',
                enabled: true,
                props: {
                  title: 'Trusted checkout',
                  message: 'Protected by our support team.',
                  tone: 'info',
                  layout: 'stacked',
                  cta_kind: 'track',
                  cta_label: 'Continue',
                },
              },
            ],
          },
        },
      ],
    });

    expect(normalized.variants[1].id).toBe('Variant A');
    expect(normalized.variants[1].config.checkout_sections).toHaveLength(1);
    expect(normalized.variants[1].config.checkout_title).toBe('Trusted checkout');
    expect(normalized.variants[1].config.checkout_message).toBe('Protected by our support team.');
    expect(normalized.variants[1].config.checkout_tone).toBe('info');
    expect(normalized.variants[1].config.checkout_layout).toBe('stacked');
  });

  it('accepts product list sections with manual product cards', () => {
    const result = validateCheckoutExperienceConfig({
      checkout_sections: [
        {
          type: 'product_list',
          enabled: true,
          props: {
            title: 'Add one more item',
            product_items: [{ title: 'Gift wrap', subtitle: 'Premium presentation', price: '$9' }],
          },
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.normalizedConfig.checkout_sections[0]).toMatchObject({
      type: 'product_list',
      props: {
        title: 'Add one more item',
        product_items: [{ title: 'Gift wrap', subtitle: 'Premium presentation', price: '$9' }],
      },
    });
  });

  it('does not count blank product cards as renderable checkout content', () => {
    const result = validateCheckoutExperienceConfig({
      checkout_sections: [
        {
          type: 'product_list',
          enabled: true,
          props: {
            product_items: [{ id: 'product-1', title: '', subtitle: '', price: '' }],
          },
        },
      ],
    });

    expect(result.errors.some(error => error.includes('checkout_sections must include'))).toBe(
      true
    );
  });

  it('accepts cart-related product lists without manual cards', () => {
    const result = validateCheckoutExperienceConfig({
      checkout_sections: [
        {
          type: 'product_list',
          enabled: true,
          props: {
            product_source_mode: 'cart_related',
            product_source_limit: '5',
          },
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.actionableSectionCount).toBe(1);
    expect(result.normalizedConfig.checkout_sections[0].props).toMatchObject({
      product_source_mode: 'cart_related',
      product_source_limit: 5,
      product_items: [],
    });
  });

  it('accepts collection-fed product lists when collections are configured', () => {
    const result = validateCheckoutExperienceConfig({
      checkout_sections: [
        {
          type: 'product_list',
          enabled: true,
          props: {
            product_source_mode: 'collection',
            product_source_limit: '2',
            product_source_collections: [
              { id: 'gid://shopify/Collection/999', title: 'New', handle: 'new' },
            ],
            product_items: [],
          },
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.actionableSectionCount).toBe(1);
    expect(result.normalizedConfig.checkout_sections[0].props).toMatchObject({
      product_source_mode: 'collection',
      product_source_limit: 2,
      product_source_collections: [
        { id: 'gid://shopify/Collection/999', title: 'New', handle: 'new' },
      ],
    });
  });
});
