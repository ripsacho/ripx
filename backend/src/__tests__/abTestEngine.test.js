/**
 * Unit tests for AB Test Engine
 */

const ABTestEngine = require('../services/abTestEngine');

describe('ABTestEngine.selectVariant', () => {
  const variants = [
    { id: 'v1', name: 'Control', allocation: 50, config: {} },
    { id: 'v2', name: 'Variant A', allocation: 50, config: {} },
  ];

  it('returns same variant for same userId (deterministic)', () => {
    const result1 = ABTestEngine.selectVariant(variants, 'user-123');
    const result2 = ABTestEngine.selectVariant(variants, 'user-123');
    expect(result1).toEqual(result2);
  });

  it('returns holdout when user falls in holdout bucket', () => {
    const result = ABTestEngine.selectVariant(variants, 'user-123', 100);
    expect(result.name).toBe('Holdout');
    expect(result.id).toBe('holdout');
  });

  it('returns holdout when user falls in partial holdout', () => {
    const result = ABTestEngine.selectVariant(variants, 'user-00000000', 50);
    expect(result.name).toBe('Holdout');
  });

  it('returns one of the variants for 50/50 split', () => {
    const result = ABTestEngine.selectVariant(variants, 'user-xyz-789');
    expect(['Control', 'Variant A']).toContain(result.name);
  });

  it('returns last variant when cumulative edge case', () => {
    const twoVariants = [
      { id: 'a', name: 'A', allocation: 50, config: {} },
      { id: 'b', name: 'B', allocation: 50, config: {} },
    ];
    const result = ABTestEngine.selectVariant(twoVariants, 'user-deterministic');
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });
});

describe('ABTestEngine traffic ramp helpers', () => {
  it('allows user when no ramp configured', () => {
    const test = { segments: {} };
    expect(ABTestEngine._isUserInTrafficRamp(test, 'user-1')).toBe(true);
  });

  it('allows all users once ramp reaches 100%', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const test = {
      segments: { traffic_ramp_percent: 10, traffic_ramp_days: 5 },
      started_at: tenDaysAgo,
    };
    expect(ABTestEngine._isUserInTrafficRamp(test, 'user-any')).toBe(true);
  });
});

describe('ABTestEngine._shouldPersistAssignment', () => {
  it('returns false for preview_session truthy variants', () => {
    expect(ABTestEngine._shouldPersistAssignment({ preview_session: true })).toBe(false);
    expect(ABTestEngine._shouldPersistAssignment({ preview_session: 'true' })).toBe(false);
    expect(ABTestEngine._shouldPersistAssignment({ preview_session: '1' })).toBe(false);
    expect(ABTestEngine._shouldPersistAssignment({ preview_session: 'yes' })).toBe(false);
  });

  it('returns false for legacy preview truthy variants', () => {
    expect(ABTestEngine._shouldPersistAssignment({ preview: true })).toBe(false);
    expect(ABTestEngine._shouldPersistAssignment({ preview: 'true' })).toBe(false);
    expect(ABTestEngine._shouldPersistAssignment({ preview: '1' })).toBe(false);
  });

  it('returns true when preview flags are not enabled', () => {
    expect(ABTestEngine._shouldPersistAssignment({})).toBe(true);
    expect(ABTestEngine._shouldPersistAssignment({ preview_session: '0' })).toBe(true);
    expect(ABTestEngine._shouldPersistAssignment({ preview: 'no' })).toBe(true);
  });
});

describe('ABTestEngine.isUserEligible', () => {
  it('returns true when segments are all or empty', () => {
    const test = { segments: {} };
    expect(ABTestEngine.isUserEligible(test, {})).toBe(true);
    expect(ABTestEngine.isUserEligible(test, { device: 'mobile' })).toBe(true);
  });

  it('returns false when device does not match', () => {
    const test = { segments: { device: 'mobile' } };
    expect(ABTestEngine.isUserEligible(test, { device: 'desktop' })).toBe(false);
  });

  it('returns true when device matches', () => {
    const test = { segments: { device: 'mobile' } };
    expect(ABTestEngine.isUserEligible(test, { device: 'mobile' })).toBe(true);
  });

  it('returns false when country not in list', () => {
    const test = { segments: { countries: ['US', 'CA'] } };
    expect(ABTestEngine.isUserEligible(test, { country: 'BD' })).toBe(false);
  });

  it('returns true when country in list', () => {
    const test = { segments: { countries: ['US', 'BD'] } };
    expect(ABTestEngine.isUserEligible(test, { country: 'BD' })).toBe(true);
  });

  it('ignores legacy url_pattern for price tests in all-products scope', () => {
    const test = {
      type: 'price',
      target_type: 'all-products',
      segments: { url_pattern: '/products/' },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/collections/snowboards',
        current_pathname: '/collections/snowboards',
      })
    ).toBe(true);
  });

  it('still enforces url_pattern for non-price tests', () => {
    const test = {
      type: 'content',
      target_type: 'homepage',
      segments: { url_pattern: '^/products/' },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/collections/snowboards',
        current_pathname: '/collections/snowboards',
      })
    ).toBe(false);
  });

  it('still enforces explicit page_rules for price tests', () => {
    const test = {
      type: 'price',
      target_type: 'all-products',
      segments: {
        page_rules: [{ type: 'include', match_type: 'starts_with', pattern: '/products/' }],
      },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/collections/snowboards',
        current_pathname: '/collections/snowboards',
      })
    ).toBe(false);
  });

  it('ignores legacy url_pattern for offer tests in all-products scope', () => {
    const test = {
      type: 'offer',
      target_type: 'all-products',
      segments: { url_pattern: '/products/' },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/collections/snowboards',
        current_pathname: '/collections/snowboards',
      })
    ).toBe(true);
  });

  it('blocks excluded product IDs for product-scope tests', () => {
    const test = {
      type: 'price',
      target_type: 'all-products',
      segments: { excluded_product_ids: ['gid://shopify/Product/100'] },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/products/board',
        current_pathname: '/products/board',
        current_product_id: 'gid://shopify/Product/100',
      })
    ).toBe(false);
  });

  it('requires included products for shipping selected-product scope when current product is known', () => {
    const test = {
      type: 'shipping',
      target_type: 'product',
      target_ids: ['gid://shopify/Product/200'],
      segments: {},
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/products/boots',
        current_pathname: '/products/boots',
        current_product_id: 'gid://shopify/Product/999',
      })
    ).toBe(false);
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/products/boots',
        current_pathname: '/products/boots',
        current_product_id: 'gid://shopify/Product/200',
      })
    ).toBe(true);
  });

  it('keeps shipping selected-product scope eligible on cart surfaces without a current product id', () => {
    const test = {
      type: 'shipping',
      target_type: 'product',
      target_ids: ['gid://shopify/Product/200'],
      segments: {},
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/cart',
        current_pathname: '/cart',
      })
    ).toBe(true);
  });

  it('blocks excluded current products for shipping all-products scope', () => {
    const test = {
      type: 'shipping',
      target_type: 'all-products',
      segments: { excluded_product_ids: ['gid://shopify/Product/300'] },
    };
    expect(
      ABTestEngine.isUserEligible(test, {
        current_url: 'https://shop.example.com/products/bag',
        current_pathname: '/products/bag',
        current_product_id: 'gid://shopify/Product/300',
      })
    ).toBe(false);
  });
});

describe('ABTestEngine.validateTest theme contract', () => {
  it('returns invalid when template_switch variant is missing template handle', () => {
    const result = ABTestEngine.validateTest({
      name: 'Theme test',
      type: 'theme',
      goal: { type: 'conversion', template_key: 'template' },
      variants: [
        { name: 'Control', allocation: 50, config: { themeMode: 'template_switch', template: '' } },
        {
          name: 'Variant A',
          allocation: 50,
          config: { themeMode: 'template_switch', template: '' },
        },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(err => err.includes('template handle is required'))).toBe(true);
  });

  it('accepts theme test when non-control variant has body class signal', () => {
    const result = ABTestEngine.validateTest({
      name: 'Theme test',
      type: 'theme',
      goal: { type: 'conversion', template_key: 'theme' },
      variants: [
        { name: 'Control', allocation: 50, config: { themeMode: 'asset_flag', bodyClass: '' } },
        {
          name: 'Variant A',
          allocation: 50,
          config: { themeMode: 'asset_flag', bodyClass: 'ripx-theme-v2' },
        },
      ],
    });
    expect(result.isValid).toBe(true);
  });

  it('validates offer variants require actionable non-control configuration', () => {
    const result = ABTestEngine.validateTest({
      name: 'Offer test',
      type: 'offer',
      goal: { type: 'conversion' },
      variants: [
        {
          name: 'Control',
          allocation: 50,
          config: { discount_type: 'percent', discount_value: null },
        },
        {
          name: 'Variant A',
          allocation: 50,
          config: { discount_type: 'percent', discount_value: '' },
        },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(
      result.errors.some(err => err.includes('Offer tests require at least one non-control'))
    ).toBe(true);
  });

  it('accepts offer variants when non-control has valid discount', () => {
    const result = ABTestEngine.validateTest({
      name: 'Offer test valid',
      type: 'offer',
      goal: { type: 'conversion' },
      variants: [
        {
          name: 'Control',
          allocation: 50,
          config: { discount_type: 'percent', discount_value: null },
        },
        {
          name: 'Variant A',
          allocation: 50,
          config: { discount_type: 'fixed', discount_value: 10 },
        },
      ],
    });
    expect(result.isValid).toBe(true);
  });

  it('rejects invalid offer discount code name format', () => {
    const result = ABTestEngine.validateTest({
      name: 'Offer code format',
      type: 'offer',
      goal: { type: 'conversion' },
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            discount_type: 'percent',
            discount_value: 10,
            discount_code_name: 'BAD CODE!*',
          },
        },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(err => err.includes('discount code name'))).toBe(true);
  });

  it('rejects shipping tests without actionable non-control strategy', () => {
    const result = ABTestEngine.validateTest({
      name: 'Shipping test',
      type: 'shipping',
      goal: { type: 'conversion', template_key: 'shipping' },
      variants: [
        { name: 'Control', allocation: 50, config: { strategy: 'control' } },
        { name: 'Variant A', allocation: 50, config: { strategy: 'control' } },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(
      result.errors.some(err =>
        err.includes('Shipping tests require at least one non-control variant')
      )
    ).toBe(true);
  });

  it('accepts shipping tests with actionable strategy', () => {
    const result = ABTestEngine.validateTest({
      name: 'Shipping test',
      type: 'shipping',
      goal: { type: 'conversion', template_key: 'shipping' },
      variants: [
        { name: 'Control', allocation: 50, config: { strategy: 'control' } },
        { name: 'Variant A', allocation: 50, config: { strategy: 'flat_rate', amount: 4.99 } },
      ],
    });
    expect(result.isValid).toBe(true);
  });

  it('rejects payment-method checkout tests without target methods', () => {
    const result = ABTestEngine.validateTest({
      name: 'Checkout payment test',
      type: 'checkout',
      goal: { type: 'conversion', checkout_phase: 'payment_method' },
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Variant A', allocation: 50, config: { payment_action: 'hide' } },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(err => err.includes('target payment methods'))).toBe(true);
  });

  it('rejects rename-based delivery checkout tests without rename target', () => {
    const result = ABTestEngine.validateTest({
      name: 'Checkout delivery rename test',
      type: 'checkout',
      goal: { type: 'conversion', checkout_phase: 'delivery_method' },
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        {
          name: 'Variant A',
          allocation: 50,
          config: {
            delivery_method_names: ['Standard Shipping'],
            delivery_action: 'rename',
            delivery_rename_to: '',
          },
        },
      ],
    });
    expect(result.isValid).toBe(false);
    expect(result.errors.some(err => err.includes('delivery_rename_to'))).toBe(true);
  });
});
