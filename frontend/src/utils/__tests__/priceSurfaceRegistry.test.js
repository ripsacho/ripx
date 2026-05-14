import {
  buildPriceSurfacePickerPath,
  createEmptyPriceSurfaceMapping,
  inferPriceSurfaceFromHref,
  inferPriceSurfaceRoleFromPickerHints,
  normalizePriceSurfaceMappings,
  resolvePriceSurfaceSelectors,
  summarizePriceSurfaceRegistry,
  validatePriceSurfaceMappingsForEditor,
  applyRecommendedPriceSurfaceDefaults,
  collectPriceSurfaceMappingIssues,
  buildPriceSurfaceRegistryStatus,
} from '../priceSurfaceRegistry';

describe('priceSurfaceRegistry (frontend)', () => {
  it('creates empty mapping defaults', () => {
    const mapping = createEmptyPriceSurfaceMapping();
    expect(mapping.surface).toBe('pdp');
    expect(mapping.role).toBe('regular');
  });

  it('drops invalid selectors', () => {
    const normalized = normalizePriceSurfaceMappings([
      { surface: 'plp', role: 'regular', selector: '.money' },
      { surface: 'plp', role: 'regular', selector: '' },
    ]);
    expect(normalized).toHaveLength(1);
  });

  it('resolves test mappings before shop mappings with global fallback', () => {
    const selectors = resolvePriceSurfaceSelectors('pdp', 'regular', {
      testMappings: [{ surface: 'global', role: 'regular', selector: '.global-price' }],
      shopMappings: [{ surface: 'pdp', role: 'regular', selector: '.pdp-price' }],
    });
    expect(selectors).toEqual(['.global-price', '.pdp-price']);
  });

  it('infers price surfaces from preview URLs', () => {
    expect(inferPriceSurfaceFromHref('https://shop.com/products/handle')).toBe('pdp');
    expect(inferPriceSurfaceFromHref('https://shop.com/collections/sale')).toBe('plp');
    expect(inferPriceSurfaceFromHref('https://shop.com/cart')).toBe('cart');
  });

  it('builds picker paths and role hints from picker metadata', () => {
    expect(
      buildPriceSurfacePickerPath('plp', {
        productPath: '/products/a',
        collectionPath: '/collections/b',
      })
    ).toBe('/collections/b');
    expect(
      inferPriceSurfaceRoleFromPickerHints({
        selector: '.price-item--compare',
        roleHint: 'compare_at',
      })
    ).toBe('compare_at');
    expect(
      inferPriceSurfaceRoleFromPickerHints({
        selector: '.price-item--compare',
      })
    ).toBe('compare_at');
  });

  it('summarizes resolved coverage and flags weak selectors', () => {
    const summary = summarizePriceSurfaceRegistry(
      [{ surface: 'pdp', role: 'regular', selector: '.product__price' }],
      []
    );
    expect(summary).toEqual([{ surface: 'pdp', role: 'regular', selectors: ['.product__price'] }]);
    expect(
      validatePriceSurfaceMappingsForEditor([
        { surface: 'pdp', role: 'regular', selector: '.header-logo' },
      ])
    ).toEqual(['Row 1 selector may not target a price node.']);
  });

  it('applies recommended match strategy defaults by surface', () => {
    const mapping = applyRecommendedPriceSurfaceDefaults({
      surface: 'plp',
      role: 'regular',
      selector: '.money',
    });
    expect(mapping.matchStrategy).toBe('within_product_card');
    expect(mapping.productBinding).toBe('card_ancestor');
  });

  it('blocks duplicate selectors when collecting save issues', () => {
    const { errors } = collectPriceSurfaceMappingIssues([
      { surface: 'pdp', role: 'regular', selector: '.product__price' },
      { surface: 'pdp', role: 'regular', selector: '.product__price' },
    ]);
    expect(errors.some(error => error.includes('duplicates'))).toBe(true);
  });

  it('summarizes registry status for compact UI chips', () => {
    const missing = buildPriceSurfaceRegistryStatus([], []);
    expect(missing.showMetaChip).toBe(true);
    expect(missing.label).toBe('Map PDP selectors');

    const ready = buildPriceSurfaceRegistryStatus(
      [{ surface: 'pdp', role: 'regular', selector: '.product__price' }],
      [{ surface: 'plp', role: 'regular', selector: '.card__price' }]
    );
    expect(ready.showMetaChip).toBe(false);
    expect(ready.label).toBe('Theme mapping ready');
  });
});
