import {
  toVariantIdKey,
  getEffectivePriceConfig,
  configUsesCompareAtBase,
  computeEffectivePrice,
  buildPriceSimulationRows,
  buildPriceSimulationCsv,
} from '../priceSimulation';

describe('priceSimulation utils', () => {
  it('normalizes variant id keys like storefront script', () => {
    expect(toVariantIdKey('gid://shopify/ProductVariant/200')).toBe('200');
    expect(toVariantIdKey('1234567890')).toBe('1234567890');
    expect(toVariantIdKey('123456789')).toBe('123456789');
  });

  it('applies byProduct + byVariant overrides in precedence order', () => {
    const cfg = {
      priceMode: 'fixed',
      price: 30,
      byProduct: {
        'gid://shopify/Product/100': {
          priceMode: 'fixed',
          price: 25,
          byVariant: {
            'gid://shopify/ProductVariant/200': {
              priceMode: 'fixed',
              price: 22,
            },
          },
        },
      },
    };

    const productOnly = getEffectivePriceConfig(cfg, 'gid://shopify/Product/100', null);
    expect(productOnly.price).toBe(25);

    const skuSpecific = getEffectivePriceConfig(
      cfg,
      'gid://shopify/Product/100',
      'gid://shopify/ProductVariant/200'
    );
    expect(skuSpecific.price).toBe(22);
  });

  it('falls back to base mode when override mode is incomplete', () => {
    const cfg = {
      priceMode: 'amount',
      priceDelta: -5,
      byProduct: {
        'gid://shopify/Product/100': {
          priceMode: 'fixed',
          priceBase: 'price',
        },
      },
    };
    const productOnly = getEffectivePriceConfig(cfg, 'gid://shopify/Product/100', null);
    expect(productOnly.priceMode).toBe('amount');
    expect(productOnly.priceDelta).toBe(-5);
  });

  it('computes fixed, amount, and percent modes with roundTo', () => {
    expect(computeEffectivePrice({ priceMode: 'fixed', price: 19.49 }, 50)).toBe(19.49);
    expect(computeEffectivePrice({ priceMode: 'amount', priceDelta: -5 }, 50)).toBe(45);
    expect(computeEffectivePrice({ priceMode: 'percent', pricePercent: 10 }, 50)).toBe(45);
    expect(computeEffectivePrice({ priceMode: 'percent', pricePercent: -10 }, 50)).toBe(55);
    expect(
      computeEffectivePrice({ priceMode: 'amount', priceDelta: -1.13, roundTo: 0.25 }, 50)
    ).toBe(48.75);
  });

  it('uses compare-at as basis when priceBase is compare_at', () => {
    expect(
      computeEffectivePrice({ priceMode: 'amount', priceBase: 'compare_at', priceDelta: -5 }, 50, {
        compareAtPrice: 80,
      })
    ).toBe(75);
    expect(
      computeEffectivePrice(
        { priceMode: 'percent', priceBase: 'compare_at', pricePercent: 10 },
        50,
        { compareAtPrice: 80 }
      )
    ).toBe(72);
    expect(
      computeEffectivePrice({ priceMode: 'amount', priceBase: 'compare_at', priceDelta: -5 }, 50, {
        compareAtPrice: null,
      })
    ).toBeNull();
  });

  it('detects compare-at usage across product and variant overrides', () => {
    expect(configUsesCompareAtBase({ priceMode: 'fixed', price: 20 })).toBe(false);
    expect(
      configUsesCompareAtBase({ priceMode: 'amount', priceBase: 'compare_at', priceDelta: -2 })
    ).toBe(true);
    expect(
      configUsesCompareAtBase({
        priceMode: 'fixed',
        byProduct: {
          'gid://shopify/Product/100': {
            byVariant: {
              'gid://shopify/ProductVariant/200': {
                priceMode: 'percent',
                priceBase: 'compare_at',
                pricePercent: 15,
              },
            },
          },
        },
      })
    ).toBe(true);
  });

  it('builds scenario rows for default, product, and SKU override cases', () => {
    const variants = [
      { name: 'Control', config: { priceMode: 'fixed', price: 50 } },
      {
        name: 'Variant A',
        config: {
          priceMode: 'fixed',
          price: 45,
          byProduct: {
            'gid://shopify/Product/100': {
              priceMode: 'fixed',
              price: 40,
              byVariant: {
                'gid://shopify/ProductVariant/200': { priceMode: 'fixed', price: 39 },
              },
            },
          },
        },
      },
    ];

    const out = buildPriceSimulationRows({
      variants,
      catalogPrice: 50,
      targetType: 'product',
      targetProductIds: ['gid://shopify/Product/100'],
    });

    expect(out.rows.length).toBeGreaterThanOrEqual(3);
    expect(out.rows.some(r => r.label.includes('All targeted products'))).toBe(true);
    expect(out.rows.some(r => r.label.includes('Product 100'))).toBe(true);
    expect(out.rows.some(r => r.label.includes('SKU 200'))).toBe(true);
    expect(out.hasVariantOverrideRows).toBe(true);
  });

  it('reports missing compare-at when compare_at base is configured', () => {
    const out = buildPriceSimulationRows({
      variants: [
        {
          name: 'Variant A',
          config: { priceMode: 'percent', priceBase: 'compare_at', pricePercent: 10 },
        },
      ],
      catalogPrice: 50,
      targetType: 'all-products',
    });
    expect(out.hasCompareAtBase).toBe(true);
    expect(out.hasMissingCompareAt).toBe(true);
    expect(out.rows[0].prices[0]).toBe('—');
  });

  it('builds CSV with escaped cells', () => {
    const csv = buildPriceSimulationCsv({
      variantNames: ['Control', 'Variant "A"'],
      rows: [{ label: 'Product 100 / SKU 200', prices: ['$50.00', '$39.00'] }],
    });
    expect(csv).toContain('Scenario,Control,"Variant ""A"""');
    expect(csv).toContain('Product 100 / SKU 200,$50.00,$39.00');
    expect(csv.endsWith('\n')).toBe(true);
  });
});
