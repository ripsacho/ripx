import {
  createEmptyCheckoutSection,
  getActionableCheckoutSections,
  getNormalizedCheckoutExperienceConfig,
  syncLegacyCheckoutExperienceFields,
} from '../checkoutSections';

describe('checkoutSections utils', () => {
  it('normalizes legacy checkout fields into a single section', () => {
    const normalized = getNormalizedCheckoutExperienceConfig({
      checkout_title: 'Checkout with confidence',
      checkout_message: 'Secure payment and free returns.',
      checkout_feature_bullets: ['Encrypted checkout', '24/7 support'],
    });

    expect(normalized.checkout_sections).toHaveLength(1);
    expect(normalized.checkout_sections[0]).toMatchObject({
      type: 'hero_notice',
      props: {
        title: 'Checkout with confidence',
        message: 'Secure payment and free returns.',
        feature_bullets: ['Encrypted checkout', '24/7 support'],
      },
    });
  });

  it('returns actionable structured sections only when enabled and populated', () => {
    const actionable = getActionableCheckoutSections({
      checkout_sections: [
        createEmptyCheckoutSection(0),
        {
          id: 'trust-box',
          type: 'trust_box',
          enabled: true,
          props: { title: 'Trusted by 12,000 customers' },
        },
        {
          id: 'disabled-box',
          type: 'guarantee_box',
          enabled: false,
          props: { title: 'Disabled section' },
        },
      ],
    });

    expect(actionable).toHaveLength(1);
    expect(actionable[0].type).toBe('trust_box');
  });

  it('syncs legacy root fields from the first actionable section', () => {
    const synced = syncLegacyCheckoutExperienceFields({
      checkout_sections: [
        {
          id: 'trust-box',
          type: 'trust_box',
          enabled: true,
          props: {
            title: 'Trusted checkout',
            message: 'Every order is protected.',
            cta_label: 'Continue',
            tone: 'info',
            layout: 'stacked',
            cta_kind: 'track',
            feature_bullets: ['Buyer protection'],
          },
        },
      ],
    });

    expect(synced.checkout_title).toBe('Trusted checkout');
    expect(synced.checkout_message).toBe('Every order is protected.');
    expect(synced.checkout_cta_label).toBe('Continue');
    expect(synced.checkout_tone).toBe('info');
    expect(synced.checkout_layout).toBe('stacked');
    expect(synced.checkout_feature_bullets).toEqual(['Buyer protection']);
  });

  it('keeps manual product cards on a product list section', () => {
    const normalized = getNormalizedCheckoutExperienceConfig({
      checkout_sections: [
        {
          id: 'checkout-picks',
          type: 'product_list',
          enabled: true,
          props: {
            title: 'Recommended for your order',
            product_items: [
              { title: 'Gift wrap', subtitle: 'Premium presentation', price: '$9' },
              { title: 'Priority support', badge_text: 'Popular', compare_at_price: '$19' },
            ],
          },
        },
      ],
    });

    expect(normalized.checkout_sections[0]).toMatchObject({
      type: 'product_list',
      props: {
        title: 'Recommended for your order',
        product_items: [
          { title: 'Gift wrap', subtitle: 'Premium presentation', price: '$9' },
          { title: 'Priority support', badge_text: 'Popular', compare_at_price: '$19' },
        ],
      },
    });
  });

  it('normalizes v2 product action metadata for checkout product offers', () => {
    const normalized = getNormalizedCheckoutExperienceConfig({
      checkout_sections: [
        {
          id: 'checkout-picks',
          type: 'product_list',
          strategy_key: 'manual_upsell',
          props: {
            product_action: 'add_to_cart',
            selection_strategy: 'manual_upsell',
            product_items: [
              {
                title: 'Gift wrap',
                merchandise_id: 'gid://shopify/ProductVariant/1',
                quantity: '2',
                action_label: 'Add gift wrap',
              },
            ],
          },
        },
      ],
    });

    expect(normalized.checkout_config_version).toBe(2);
    expect(normalized.checkout_sections[0].props.product_items[0]).toMatchObject({
      title: 'Gift wrap',
      merchandise_id: 'gid://shopify/ProductVariant/1',
      variant_gid: 'gid://shopify/ProductVariant/1',
      quantity: 2,
      action_label: 'Add gift wrap',
      product_action: 'display_only',
      selection_strategy: 'manual_upsell',
    });
  });

  it('does not treat blank product cards as actionable checkout content', () => {
    const actionable = getActionableCheckoutSections({
      checkout_sections: [
        {
          id: 'checkout-picks',
          type: 'product_list',
          enabled: true,
          props: {
            title: '',
            product_items: [{ id: 'product-1', title: '', subtitle: '', price: '' }],
          },
        },
      ],
    });

    expect(actionable).toHaveLength(0);
  });

  it('treats cart-related product lists as actionable without manual cards', () => {
    const normalized = getNormalizedCheckoutExperienceConfig({
      checkout_sections: [
        {
          id: 'cart-picks',
          type: 'product_list',
          enabled: true,
          props: {
            product_source_mode: 'cart_related',
            product_source_limit: '4',
            product_items: [],
          },
        },
      ],
    });

    expect(normalized.checkout_sections[0].props).toMatchObject({
      product_source_mode: 'cart_related',
      product_source_limit: 4,
      product_items: [],
    });
    expect(getActionableCheckoutSections(normalized)).toHaveLength(1);
  });

  it('treats collection-fed product lists as actionable when collections are selected', () => {
    const normalized = getNormalizedCheckoutExperienceConfig({
      checkout_sections: [
        {
          id: 'collection-picks',
          type: 'product_list',
          enabled: true,
          props: {
            product_source_mode: 'collection',
            product_source_limit: 3,
            product_source_collections: [
              { id: 'gid://shopify/Collection/123', title: 'Sale', handle: 'sale' },
            ],
            product_items: [],
          },
        },
      ],
    });

    expect(normalized.checkout_sections[0].props).toMatchObject({
      product_source_mode: 'collection',
      product_source_limit: 3,
      product_source_collections: [
        { id: 'gid://shopify/Collection/123', title: 'Sale', handle: 'sale' },
      ],
      product_items: [],
    });
    expect(getActionableCheckoutSections(normalized)).toHaveLength(1);
  });
});
