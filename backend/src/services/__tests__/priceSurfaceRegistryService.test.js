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

  it('returns draft shop mappings with empty selectors when requested', async () => {
    query.mockResolvedValue({
      rows: [
        {
          price_surface_mappings: [
            {
              id: 'draft-1',
              surface: 'pdp',
              role: 'regular',
              selector: '',
              source: 'merchant',
            },
          ],
        },
      ],
    });
    const mappings = await getShopPriceSurfaceMappings('shop.example', {
      allowEmptySelector: true,
    });
    expect(mappings).toEqual([
      expect.objectContaining({
        id: 'draft-1',
        surface: 'pdp',
        role: 'regular',
        selector: '',
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

  it('saves draft mappings with empty selectors when requested', async () => {
    query.mockResolvedValue({ rows: [] });
    const saved = await saveShopPriceSurfaceMappings(
      'shop.example',
      [{ id: 'draft-2', surface: 'plp', role: 'regular', selector: '' }],
      { allowEmptySelector: true }
    );
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: 'draft-2',
      surface: 'plp',
      role: 'regular',
      selector: '',
    });
  });

  it('falls back to key_value_store when shop_settings column is unavailable', async () => {
    query.mockRejectedValueOnce({ code: '42703' }).mockResolvedValueOnce({
      rows: [{ value: [{ surface: 'cart', role: 'regular', selector: '.cart-price' }] }],
    });
    const mappings = await getShopPriceSurfaceMappings('shop.example');
    expect(mappings).toEqual([
      expect.objectContaining({
        surface: 'cart',
        role: 'regular',
        selector: '.cart-price',
      }),
    ]);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SELECT value FROM key_value_store'),
      ['price_surface_mappings.shop.example']
    );
  });

  it('saves to key_value_store when shop_settings column is unavailable', async () => {
    query.mockRejectedValueOnce({ code: '42703' }).mockResolvedValueOnce({ rows: [] });
    const saved = await saveShopPriceSurfaceMappings('shop.example', [
      { surface: 'pdp', role: 'regular', selector: '.price' },
    ]);
    expect(saved).toHaveLength(1);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO key_value_store'),
      ['price_surface_mappings.shop.example', expect.any(String)]
    );
  });
});
