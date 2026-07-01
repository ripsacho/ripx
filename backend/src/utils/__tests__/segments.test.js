const { normalizeSegments } = require('../segments');

describe('normalizeSegments', () => {
  it('preserves price surface mapping rows with empty selectors', () => {
    const normalized = normalizeSegments({
      device: 'all',
      customer: 'all',
      countries: [],
      price_surface_mappings: [
        {
          id: 'mapping-empty',
          surface: 'pdp',
          role: 'regular',
          selector: '',
          matchStrategy: 'page_product',
          productBinding: 'page_product',
          source: 'merchant',
          priority: 1,
          enabled: true,
        },
      ],
    });

    expect(Array.isArray(normalized.price_surface_mappings)).toBe(true);
    expect(normalized.price_surface_mappings).toHaveLength(1);
    expect(normalized.price_surface_mappings[0]).toMatchObject({
      id: 'mapping-empty',
      surface: 'pdp',
      role: 'regular',
      selector: '',
      matchStrategy: 'page_product',
      productBinding: 'page_product',
      source: 'merchant',
      priority: 1,
      enabled: true,
    });
  });

  it('keeps configured selector mappings normalized', () => {
    const normalized = normalizeSegments({
      device: 'all',
      customer: 'all',
      countries: [],
      price_surface_mappings: [
        {
          id: 'mapping-filled',
          surface: 'plp',
          role: 'regular',
          selector: '.price',
          source: 'visual',
          priority: 3,
          enabled: true,
        },
      ],
    });

    expect(normalized.price_surface_mappings).toHaveLength(1);
    expect(normalized.price_surface_mappings[0]).toMatchObject({
      id: 'mapping-filled',
      surface: 'plp',
      role: 'regular',
      selector: '.price',
      source: 'visual',
      priority: 3,
      enabled: true,
    });
  });

  it('keeps explicit empty mapping arrays so clears persist', () => {
    const normalized = normalizeSegments({
      device: 'all',
      customer: 'all',
      countries: [],
      price_surface_mappings: [],
    });

    expect(Array.isArray(normalized.price_surface_mappings)).toBe(true);
    expect(normalized.price_surface_mappings).toHaveLength(0);
  });
});
