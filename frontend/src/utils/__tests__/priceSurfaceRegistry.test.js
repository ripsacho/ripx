import {
  buildPriceSurfacePickerPath,
  createEmptyPriceSurfaceMapping,
  inferPriceSurfaceFromHref,
  inferPriceSurfaceRoleFromPickerHints,
  normalizePriceSurfaceMappings,
  resolveListingPriceSurfaceKeys,
  resolvePricePreviewVariant,
  resolvePriceSurfaceSelectors,
  summarizePriceSurfaceRegistry,
  validatePriceSurfaceMappingsForEditor,
  applyRecommendedPriceSurfaceDefaults,
  collectPriceSurfaceMappingIssues,
  buildPriceSurfaceCoverageMatrix,
  buildPriceSurfaceRegistryStatus,
  compareCheckoutPaintParity,
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
    expect(inferPriceSurfaceFromHref('https://shop.com/pages/about')).toBe('home');
    expect(
      inferPriceSurfaceFromHref(
        'https://app.example.com/api/track/preview-document?url=https%3A%2F%2Fshop.com%2Fproducts%2Fhandle'
      )
    ).toBe('pdp');
  });

  it('resolves listing surface keys and preview variants', () => {
    expect(resolveListingPriceSurfaceKeys('/collections/sale')).toEqual([
      'plp',
      'recommendation',
      'global',
    ]);
    expect(resolveListingPriceSurfaceKeys('/search?q=hat')).toEqual([
      'search',
      'recommendation',
      'global',
    ]);
    expect(
      resolvePricePreviewVariant([
        { name: 'Control', id: 'control' },
        { name: 'Variant 1', id: 'v1' },
      ])
    ).toMatchObject({ id: 'v1' });
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
    expect(missing.label).toBe('Map storefront prices');

    const ready = buildPriceSurfaceRegistryStatus(
      [{ surface: 'pdp', role: 'regular', selector: '.product__price' }],
      [{ surface: 'plp', role: 'regular', selector: '.card__price' }]
    );
    expect(ready.showMetaChip).toBe(true);
    expect(ready.label).toContain('mapping gap');
    expect(ready.coverageMatrix.some(row => row.surface === 'cart')).toBe(true);
  });

  it('builds readiness coverage matrix and checkout parity checks', () => {
    const matrix = buildPriceSurfaceCoverageMatrix(
      [{ surface: 'pdp', role: 'regular', selector: '.product__price' }],
      []
    );
    expect(matrix.find(row => row.surface === 'pdp' && row.role === 'regular')?.configured).toBe(
      true
    );
    expect(matrix.find(row => row.surface === 'cart' && row.role === 'regular')?.configured).toBe(
      false
    );
    expect(compareCheckoutPaintParity(19.99, 19.99).ok).toBe(true);
    expect(compareCheckoutPaintParity(19.99, 21.5).ok).toBe(false);
  });
});
