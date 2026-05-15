const {
  normalizePriceSurfaceMappings,
  resolvePriceSurfaceSelectors,
  buildPriceSurfaceReadinessSummary,
} = require('../priceSurfaceRegistry');

describe('priceSurfaceRegistry', () => {
  it('normalizes and filters invalid mappings', () => {
    const normalized = normalizePriceSurfaceMappings([
      { surface: 'pdp', role: 'regular', selector: '.product__price' },
      { surface: 'bad', role: 'regular', selector: '.x' },
      { selector: '' },
    ]);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].surface).toBe('pdp');
    expect(normalized[1].surface).toBe('global');
  });

  it('prefers test mappings before shop mappings', () => {
    const selectors = resolvePriceSurfaceSelectors('pdp', 'regular', {
      testMappings: [{ surface: 'pdp', role: 'regular', selector: '.test-price', priority: 1 }],
      shopMappings: [{ surface: 'pdp', role: 'regular', selector: '.shop-price', priority: 5 }],
    });
    expect(selectors).toEqual(['.test-price', '.shop-price']);
  });

  it('dedupes selectors by priority order', () => {
    const selectors = resolvePriceSurfaceSelectors('plp', 'regular', {
      shopMappings: [
        { surface: 'plp', role: 'regular', selector: '.money', priority: 2 },
        { surface: 'plp', role: 'regular', selector: '.money', priority: 9 },
      ],
    });
    expect(selectors).toEqual(['.money']);
  });

  it('falls back to global mappings after surface-specific selectors', () => {
    const selectors = resolvePriceSurfaceSelectors('pdp', 'regular', {
      testMappings: [
        { surface: 'global', role: 'regular', selector: '.global-price', priority: 1 },
      ],
      shopMappings: [{ surface: 'pdp', role: 'regular', selector: '.pdp-price', priority: 1 }],
    });
    expect(selectors).toEqual(['.global-price', '.pdp-price']);
  });

  it('summarizes storefront readiness gaps for checkout and wizard', () => {
    const blocked = buildPriceSurfaceReadinessSummary([], []);
    expect(blocked.status).toBe('blocked');
    expect(blocked.highSeverityGapCount).toBeGreaterThan(0);

    const ready = buildPriceSurfaceReadinessSummary(
      [{ surface: 'pdp', role: 'regular', selector: '.product__price' }],
      [
        { surface: 'plp', role: 'regular', selector: '.card__price' },
        { surface: 'cart', role: 'regular', selector: '.cart-item__price' },
        { surface: 'search', role: 'regular', selector: '.card__price' },
      ]
    );
    expect(ready.status).toBe('ready');
  });
});
