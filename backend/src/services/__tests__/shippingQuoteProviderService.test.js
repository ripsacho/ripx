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
});
