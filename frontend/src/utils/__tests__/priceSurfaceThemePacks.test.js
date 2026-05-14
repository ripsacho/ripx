import { mergeThemePackMappings } from '../priceSurfaceThemePacks';
import { analyzePriceSurfaceRegistryGaps } from '../priceSurfaceRegistry';

describe('priceSurfaceThemePacks', () => {
  it('merges theme pack selectors without duplicating existing rows', () => {
    const merged = mergeThemePackMappings(
      [{ surface: 'pdp', role: 'regular', selector: '.custom-price' }],
      'dawn'
    );
    expect(merged.some(row => row.selector === '.custom-price')).toBe(true);
    expect(merged.some(row => row.selector === '.price-item--regular .price-item__regular')).toBe(
      true
    );
    expect(merged.length).toBeGreaterThan(1);
  });

  it('reports coverage gaps for missing PDP and PLP selectors', () => {
    const gaps = analyzePriceSurfaceRegistryGaps([], []);
    expect(gaps.some(gap => gap.surface === 'pdp' && gap.role === 'regular')).toBe(true);
    expect(gaps.some(gap => gap.surface === 'plp' && gap.role === 'regular')).toBe(true);
  });
});
