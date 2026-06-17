const {
  isActionableShippingConfig,
  normalizeShippingVariantConfig,
  normalizeShippingTestPayload,
  summarizeShippingConfigNormalization,
  validateShippingVariants,
} = require('../shippingTestConfigService');

describe('shippingTestConfigService', () => {
  it('normalizes legacy rate into flat_rate strategy', () => {
    const cfg = normalizeShippingVariantConfig({ rate: 7.5, currency: 'usd' });
    expect(cfg.strategy).toBe('flat_rate');
    expect(cfg.amount).toBe(7.5);
    expect(cfg.currency).toBe('USD');
  });

  it('normalizes legacy free_shipping threshold into threshold strategy', () => {
    const cfg = normalizeShippingVariantConfig({ free_shipping_threshold: 80 });
    expect(cfg.strategy).toBe('threshold_free_shipping');
    expect(cfg.threshold_amount).toBe(80);
  });

  it('normalizes full shipping payload variants and type', () => {
    const normalized = normalizeShippingTestPayload({
      type: 'shipping',
      variants: [
        { name: 'Control', allocation: 50, config: { rate: null } },
        { name: 'Variant A', allocation: 50, config: { rate: 4 } },
      ],
    });
    expect(normalized.type).toBe('shipping');
    expect(normalized.variants[1].config.strategy).toBe('flat_rate');
    expect(normalized.variants[1].config.amount).toBe(4);
  });

  it('normalizes shipping scope and multiple carrier rates', () => {
    const cfg = normalizeShippingVariantConfig({
      strategy: 'flat_rate',
      shipping_scope: {
        profile_id: 'gid://shopify/DeliveryProfile/1',
        profile_name: 'General profile',
        location_group_id: 'gid://shopify/DeliveryLocationGroup/1',
        zone_id: 'gid://shopify/DeliveryZone/1',
        zone_name: 'International',
        countries: ['gb', 'US'],
        selected_method_definition_ids: ['gid://shopify/DeliveryMethodDefinition/1'],
        selected_rate_names: ['Express'],
      },
      rates: [
        {
          name: 'Economy',
          amount: '4.5',
          currency: 'gbp',
          service_code: 'economy',
          description: 'Economy shipping',
          delivery_promise: { mode: 'preset', preset: 'next_business_day' },
          condition_type: 'cart_total',
          cart_total_min: 25,
        },
        { name: 'Express', amount: 9, currency: 'GBP' },
      ],
      checkout_display: {
        default_description: 'Includes tracking',
        delivery_promise: { mode: 'preset', preset: '2_3_business_days' },
      },
      replace_existing_rates: true,
      delivery_method_names: ['Express'],
    });

    expect(cfg.shipping_scope).toMatchObject({
      profile_id: 'gid://shopify/DeliveryProfile/1',
      location_group_id: 'gid://shopify/DeliveryLocationGroup/1',
      zone_id: 'gid://shopify/DeliveryZone/1',
      countries: ['GB', 'US'],
      selected_method_definition_ids: ['gid://shopify/DeliveryMethodDefinition/1'],
      selected_rate_names: ['Express'],
    });
    expect(cfg.profile_id).toBe('gid://shopify/DeliveryProfile/1');
    expect(cfg.zone_countries).toEqual(['GB', 'US']);
    expect(cfg.shipping_display_mode).toBe('replace_existing_methods');
    expect(cfg.rates).toEqual([
      expect.objectContaining({
        name: 'Economy',
        amount: 4.5,
        currency: 'GBP',
        service_code: 'economy',
        description: 'Economy shipping',
        delivery_promise: expect.objectContaining({
          mode: 'preset',
          preset: 'next_business_day',
        }),
        condition_type: 'cart_total',
        cart_total_min: 25,
      }),
      expect.objectContaining({ name: 'Express', amount: 9, currency: 'GBP' }),
    ]);
    expect(cfg.checkout_display).toMatchObject({
      default_description: 'Includes tracking',
      delivery_promise: {
        mode: 'preset',
        preset: '2_3_business_days',
      },
    });
  });

  it('normalizes additive display mode and preview label prefix', () => {
    const cfg = normalizeShippingVariantConfig({
      strategy: 'flat_rate',
      amount: 5.99,
      shipping_display_mode: 'add_preview_method',
      preview_label_prefix: 'Intelligems Preview',
    });
    expect(cfg.shipping_display_mode).toBe('add_preview_method');
    expect(cfg.replace_existing_rates).toBe(false);
    expect(cfg.preview_label_prefix).toBe('Intelligems Preview');
  });

  it('sorts configured rates by priority and sort order', () => {
    const cfg = normalizeShippingVariantConfig({
      strategy: 'flat_rate',
      rates: [
        { name: 'Express', amount: 12, priority: 3 },
        { name: 'Economy', amount: 5, priority: 1, sort_order: 2 },
        { name: 'Standard', amount: 8, priority: 1, sort_order: 1 },
      ],
    });
    expect(cfg.rates.map(rate => rate.name)).toEqual(['Standard', 'Economy', 'Express']);
    expect(cfg.rates[0].priority).toBe(1);
    expect(cfg.rates[0].sort_order).toBe(1);
  });

  it('infers flat_rate when configured rates are present without an explicit strategy', () => {
    const cfg = normalizeShippingVariantConfig({
      rates: [{ name: 'Standard', amount: 6, currency: 'USD' }],
    });

    expect(cfg.strategy).toBe('flat_rate');
    expect(cfg.rates).toHaveLength(1);
    expect(isActionableShippingConfig(cfg)).toBe(true);
  });

  it('drops legacy generated fallback rate rows so edited flat amount remains authoritative', () => {
    const cfg = normalizeShippingVariantConfig({
      strategy: 'flat_rate',
      amount: 43,
      rates: [
        {
          name: 'RipX Shipping',
          amount: 44,
          currency: 'USD',
          service_code: 'ripx_flat_rate',
        },
      ],
    });

    expect(cfg.amount).toBe(43);
    expect(cfg.rates).toEqual([]);
  });

  it('maps replace display mode to replace_existing_rates for compatibility', () => {
    const cfg = normalizeShippingVariantConfig({
      strategy: 'flat_rate',
      amount: 9,
      shipping_display_mode: 'replace_existing_methods',
      delivery_method_names: ['Express'],
    });
    expect(cfg.shipping_display_mode).toBe('replace_existing_methods');
    expect(cfg.replace_existing_rates).toBe(true);
  });

  it('treats delivery method targeting as an actionable delivery customization path', () => {
    const cfg = normalizeShippingVariantConfig({
      delivery_method_names: ['Standard Shipping'],
      delivery_action: 'rename',
      delivery_rename_to: 'Tracked standard shipping',
    });
    expect(cfg.strategy).toBe('carrier_quote');
    expect(cfg.delivery_method_names).toEqual(['Standard Shipping']);

    const errors = validateShippingVariants([
      { name: 'Control', allocation: 50, config: { strategy: 'control' } },
      { name: 'Variant A', allocation: 50, config: cfg },
    ]);
    expect(errors).toEqual([]);
  });

  it('requires method targets when a flat rate replaces existing rates', () => {
    const errors = validateShippingVariants([
      { name: 'Control', allocation: 50, config: { strategy: 'control' } },
      {
        name: 'Variant A',
        allocation: 50,
        config: { strategy: 'flat_rate', amount: 44, replace_existing_rates: true },
      },
    ]);
    expect(errors.some(error => error.includes('replacement flat_rate requires'))).toBe(true);
    expect(
      isActionableShippingConfig({
        strategy: 'flat_rate',
        amount: 44,
        replace_existing_rates: true,
      })
    ).toBe(false);
  });

  it('accepts replacement flat rate when method targets are present', () => {
    const errors = validateShippingVariants([
      { name: 'Control', allocation: 50, config: { strategy: 'control' } },
      {
        name: 'Variant A',
        allocation: 50,
        config: {
          strategy: 'flat_rate',
          amount: 44,
          replace_existing_rates: true,
          delivery_method_names: ['Standard Delivery', 'Express'],
        },
      },
    ]);
    expect(errors).toEqual([]);
  });

  it('preserves replacement source metadata when the visible rate name changes', () => {
    const cfg = normalizeShippingVariantConfig({
      strategy: 'flat_rate',
      shipping_display_mode: 'replace_existing_methods',
      delivery_method_names: ['Standard'],
      rates: [
        {
          name: 'Fast Standard',
          amount: 5,
          source_method_name: 'Standard',
          source_rate_id: 'rate-standard',
          source_method_definition_id: 'method-standard',
          source_method_ids: ['method-standard', 'rate-standard'],
        },
      ],
    });

    expect(cfg.delivery_method_names).toEqual(['Standard']);
    expect(cfg.rates[0]).toMatchObject({
      name: 'Fast Standard',
      service_code: 'ripx_replace_standard',
      source_method_name: 'Standard',
      source_rate_name: 'Standard',
      source_rate_id: 'rate-standard',
      source_method_definition_id: 'method-standard',
      source_method_ids: ['method-standard', 'rate-standard'],
    });
  });

  it('summarizes normalized strategy and display-mode mix for diagnostics', () => {
    const summary = summarizeShippingConfigNormalization([
      { name: 'Control', config: { strategy: 'control' } },
      {
        name: 'Variant A',
        config: {
          strategy: 'flat_rate',
          amount: 6,
          shipping_display_mode: 'replace_existing_methods',
          delivery_method_names: ['Standard'],
          rates: [
            { name: 'Standard', amount: 6 },
            { name: 'Express', amount: 12 },
          ],
        },
      },
      {
        name: 'Variant B',
        config: { discount_type: 'percent', discount_value: 15 },
      },
    ]);

    expect(summary).toMatchObject({
      total_variants: 3,
      actionable_variants: 2,
      replace_mode_variants: 1,
      additive_mode_variants: 2,
      multi_rate_variants: 1,
      strategy_counts: {
        control: 1,
        flat_rate: 1,
        discount_percentage: 1,
      },
      display_mode_counts: {
        add_preview_method: 2,
        replace_existing_methods: 1,
      },
    });
  });

  it('requires configured rate amounts when delivery promises are set', () => {
    const errors = validateShippingVariants([
      { name: 'Control', allocation: 50, config: { strategy: 'control' } },
      {
        name: 'Variant A',
        allocation: 50,
        config: {
          strategy: 'flat_rate',
          amount: 5,
          rates: [
            {
              name: 'Promised row',
              delivery_promise: { mode: 'preset', preset: 'next_business_day' },
            },
          ],
        },
      },
    ]);
    expect(errors.some(error => error.includes('delivery promise requires a rate amount'))).toBe(
      true
    );
  });

  it('rejects replacement flat rate actions that do not hide existing rates', () => {
    const errors = validateShippingVariants([
      { name: 'Control', allocation: 50, config: { strategy: 'control' } },
      {
        name: 'Variant A',
        allocation: 50,
        config: {
          strategy: 'flat_rate',
          amount: 44,
          replace_existing_rates: true,
          delivery_method_names: ['Standard Delivery'],
          delivery_action: 'rename',
          delivery_rename_to: 'Tracked Standard',
        },
      },
    ]);
    expect(errors.some(error => error.includes('can only hide'))).toBe(true);
  });

  it('requires rename targets for delivery rename actions', () => {
    const errors = validateShippingVariants([
      { name: 'Control', allocation: 50, config: { strategy: 'control' } },
      {
        name: 'Variant A',
        allocation: 50,
        config: {
          strategy: 'carrier_quote',
          delivery_method_names: ['Standard Delivery'],
          delivery_action: 'rename',
        },
      },
    ]);
    expect(errors.some(error => error.includes('delivery rename action requires'))).toBe(true);
  });

  it('returns validation errors for non-actionable shipping variants', () => {
    const errors = validateShippingVariants([
      { name: 'Control', allocation: 50, config: { strategy: 'control' } },
      { name: 'Variant A', allocation: 50, config: { strategy: 'control' } },
    ]);
    expect(
      errors.some(error => error.includes('Shipping tests require at least one non-control'))
    ).toBe(true);
  });
});
