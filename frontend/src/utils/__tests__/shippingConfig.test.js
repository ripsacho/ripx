import {
  getShippingReadiness,
  getShippingStrategy,
  hasActionableShippingConfig,
  normalizeShippingRates,
  shouldReplaceExistingShippingMethods,
} from '../shippingConfig';

describe('shippingConfig utilities', () => {
  it('infers backend canonical strategies from legacy shipping fields', () => {
    expect(getShippingStrategy({ discount_type: 'free_shipping' })).toBe('free_shipping');
    expect(getShippingStrategy({ free_shipping_threshold: '75' })).toBe('threshold_free_shipping');
    expect(getShippingStrategy({ discount_type: 'percent', discount_value: '10' })).toBe(
      'discount_percentage'
    );
    expect(getShippingStrategy({ percent_off: '12' })).toBe('discount_percentage');
    expect(getShippingStrategy({ discount_type: 'fixed', discount_value: '4' })).toBe(
      'discount_fixed'
    );
    expect(getShippingStrategy({ amount: '5.5' })).toBe('flat_rate');
    expect(getShippingStrategy({ delivery_method_names: ['Standard'] })).toBe('carrier_quote');
  });

  it('treats replacement flat rates as actionable only with method targets', () => {
    const base = {
      strategy: 'flat_rate',
      amount: '4.99',
      shipping_display_mode: 'replace_existing_methods',
    };

    expect(shouldReplaceExistingShippingMethods(base)).toBe(true);
    expect(hasActionableShippingConfig(base)).toBe(false);
    expect(
      hasActionableShippingConfig({
        ...base,
        delivery_method_names: ['Standard', 'Express'],
      })
    ).toBe(true);
  });

  it('normalizes configured rates while ignoring generated placeholder flat rates', () => {
    expect(
      normalizeShippingRates({
        rates: [{ service_code: 'ripx_flat_rate', amount: '0' }],
      })
    ).toEqual([]);

    expect(
      normalizeShippingRates({
        rates: [{ name: 'Standard', amount: '3.25', priority: '2', sort_order: '3' }],
      })
    ).toMatchObject([
      {
        name: 'Standard',
        amount: 3.25,
        priority: 2,
        sort_order: 3,
      },
    ]);
  });

  it('returns operator-facing readiness blockers aligned to validation rules', () => {
    expect(
      getShippingReadiness(
        {
          name: 'Variant A',
          config: {
            strategy: 'flat_rate',
            amount: '',
            shipping_display_mode: 'replace_existing_methods',
          },
        },
        1
      )
    ).toMatchObject({ status: 'blocked', label: 'Needs rate' });

    expect(
      getShippingReadiness(
        {
          name: 'Variant A',
          config: {
            strategy: 'flat_rate',
            amount: '6',
            shipping_display_mode: 'replace_existing_methods',
            delivery_method_names: ['Standard'],
          },
        },
        1
      )
    ).toMatchObject({ status: 'ready', label: 'Ready' });
  });
});
