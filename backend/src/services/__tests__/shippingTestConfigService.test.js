const {
  normalizeShippingVariantConfig,
  normalizeShippingTestPayload,
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
