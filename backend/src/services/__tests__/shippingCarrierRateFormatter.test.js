const {
  formatCarrierRateForCheckout,
  normalizeCheckoutDisplayConfig,
  resolveDeliveryPromiseDates,
} = require('../shippingCarrierRateFormatter');

describe('shippingCarrierRateFormatter', () => {
  it('formats carrier rates without leaking RipX branding into empty descriptions', () => {
    const rate = formatCarrierRateForCheckout({
      rateConfig: { name: 'Economy', amount: 4.5, currency: 'usd' },
      variantConfig: {},
      serviceCodeBase: 'variant-a',
    });

    expect(rate).toMatchObject({
      service_name: 'Economy',
      description: '',
      service_code: 'ripx_flat_variant-a_1',
      total_price: '450',
      currency: 'USD',
    });
  });

  it('uses per-rate description and delivery promise before variant defaults', () => {
    const rate = formatCarrierRateForCheckout({
      rateConfig: {
        name: 'Express',
        description: 'Includes tracking',
        amount: 9,
        currency: 'USD',
        service_code: 'express',
        delivery_promise: { mode: 'preset', preset: 'next_business_day' },
      },
      variantConfig: {
        checkout_display: {
          default_description: 'Default shipping subline',
          delivery_promise: { mode: 'preset', preset: '5_7_business_days' },
        },
      },
      now: new Date('2026-06-05T12:00:00Z'),
    });

    expect(rate).toMatchObject({
      service_name: 'Express',
      description: 'Includes tracking',
      service_code: 'express',
      min_delivery_date: '2026-06-08',
      max_delivery_date: '2026-06-08',
    });
  });

  it('adds config revision to generated fallback service codes', () => {
    const rate = formatCarrierRateForCheckout({
      rateConfig: { name: 'Standard', amount: 8, currency: 'USD' },
      variantConfig: {
        metadata: {
          shipping_config_revision: '2026-06-02T01:02:03.456Z',
        },
      },
      serviceCodeBase: 'variant-a',
    });

    expect(rate.service_code).toBe('ripx_flat_variant-a_2026-06-02T01020_1');
  });

  it('normalizes checkout display defaults and custom delivery dates', () => {
    expect(
      normalizeCheckoutDisplayConfig({
        default_description: 'Ships fast',
        delivery_promise: {
          mode: 'custom',
          min_delivery_date: '2026-07-04T00:00:00Z',
          max_delivery_date: '2026-07-05',
        },
      })
    ).toMatchObject({
      default_description: 'Ships fast',
      delivery_promise: {
        mode: 'custom',
        preset: 'none',
        min_delivery_date: '2026-07-04',
        max_delivery_date: '2026-07-05',
      },
    });
  });

  it('computes preset business-day windows from callback time', () => {
    expect(
      resolveDeliveryPromiseDates(
        { mode: 'preset', preset: '2_3_business_days' },
        new Date('2026-06-05T12:00:00Z')
      )
    ).toEqual({
      min_delivery_date: '2026-06-09',
      max_delivery_date: '2026-06-10',
    });
  });
});
