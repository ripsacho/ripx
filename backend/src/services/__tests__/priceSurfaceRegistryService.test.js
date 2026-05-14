jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

const { query } = require('../../utils/database');
const {
  getShopPriceSurfaceMappings,
  saveShopPriceSurfaceMappings,
} = require('../priceSurfaceRegistryService');

describe('priceSurfaceRegistryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns normalized shop mappings', async () => {
    query.mockResolvedValue({
      rows: [
        {
          price_surface_mappings: [
            { surface: 'pdp', role: 'regular', selector: '.product__price' },
            { selector: '' },
          ],
        },
      ],
    });
    const mappings = await getShopPriceSurfaceMappings('shop.example');
    expect(mappings).toEqual([
      expect.objectContaining({
        surface: 'pdp',
        role: 'regular',
        selector: '.product__price',
      }),
    ]);
  });

  it('saves normalized mappings and caps at 25 rows', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      surface: 'pdp',
      role: 'regular',
      selector: `.price-${index}`,
    }));
    query.mockResolvedValue({ rows: [] });
    const saved = await saveShopPriceSurfaceMappings('shop.example', rows);
    expect(saved).toHaveLength(25);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO shop_settings'),
      expect.arrayContaining(['shop.example', expect.any(String)])
    );
  });
});
