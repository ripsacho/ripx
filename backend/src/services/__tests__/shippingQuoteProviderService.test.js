const {
  resolveVariantProviderConfig,
  resolveCarrierQuoteRates,
} = require('../shippingQuoteProviderService');

describe('shippingQuoteProviderService', () => {
  it('preserves zero-dollar static quote amounts', () => {
    const providerConfig = resolveVariantProviderConfig({
      config: {
        strategy: 'carrier_quote',
        metadata: {
          quote_provider: 'static_rate',
          quote_amount: 0,
          quote_service_name: 'Free delivery',
        },
      },
    });

    expect(providerConfig.amount).toBe(0);
    const result = resolveCarrierQuoteRates({
      providerConfig,
      currency: 'USD',
      serviceCodeBase: 'zero',
    });

    expect(result.ok).toBe(true);
    expect(result.rates).toEqual([
      expect.objectContaining({
        service_name: 'Free delivery',
        total_price: '0',
        description: '',
      }),
    ]);
  });

  it('falls back to rates[] for amount, name, and service_code', () => {
    const providerConfig = resolveVariantProviderConfig({
      config: {
        strategy: 'carrier_quote',
        shipping_display_mode: 'replace_existing_methods',
        metadata: {
          quote_provider: 'static_rate',
        },
        rates: [
          {
            name: 'RipX Standard',
            amount: 49,
            service_code: 'ripx_replace_standard',
            description: 'Tracked delivery',
          },
        ],
        checkout_display: {
          default_description: 'Tracked delivery',
        },
      },
    });

    expect(providerConfig.amount).toBe(49);
    expect(providerConfig.service_name).toBe('RipX Standard');
    expect(providerConfig.service_code).toBe('ripx_replace_standard');
    expect(providerConfig.replace_existing_rates).toBe(true);

    const result = resolveCarrierQuoteRates({
      providerConfig,
      currency: 'USD',
      serviceCodeBase: 'standard',
    });

    expect(result.ok).toBe(true);
    expect(result.rates[0]).toEqual(
      expect.objectContaining({
        service_name: 'RipX Standard',
        service_code: 'ripx_replace_standard',
        total_price: '4900',
        description: 'Tracked delivery',
      })
    );
  });

  it('uses ripx_replace service code prefix in replace mode when code is missing', () => {
    const providerConfig = resolveVariantProviderConfig({
      config: {
        strategy: 'carrier_quote',
        shipping_display_mode: 'replace_existing_methods',
        metadata: {
          quote_provider: 'static_rate',
          quote_amount: 45,
        },
      },
    });

    const result = resolveCarrierQuoteRates({
      providerConfig,
      currency: 'USD',
      serviceCodeBase: 'variant_a',
    });

    expect(result.rates[0]?.service_code).toBe('ripx_replace_variant_a');
  });
});
