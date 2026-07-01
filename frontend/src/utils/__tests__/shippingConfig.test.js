import {
  getShippingReadiness,
  getShippingStrategy,
  hasActionableShippingConfig,
  normalizeShippingRates,
  shouldReplaceExistingShippingMethods,
  getShippingOfferMode,
  buildPromoteShippingOfferToMultiplePatch,
  getShippingOfferAttributes,
  normalizeShippingOfferMode,
  getOfferWizardReadinessIssues,
  buildOfferAttributeRevertPatch,
  formatShippingDeliveryPromiseLabel,
  isOfferWizardConfig,
  sanitizeLegacyShippingPreviewConfig,
  stripLegacyPreviewLabelFromName,
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

    expect(shouldReplaceExistingShippingMethods(base)).toBe(false);
    expect(hasActionableShippingConfig(base)).toBe(true);
    expect(
      shouldReplaceExistingShippingMethods({
        ...base,
        delivery_method_names: ['Standard', 'Express'],
      })
    ).toBe(true);
    expect(
      hasActionableShippingConfig({
        ...base,
        delivery_method_names: ['Standard', 'Express'],
      })
    ).toBe(true);
  });

  it('strips legacy preview prefixes only when preview_label_prefix is configured', () => {
    expect(stripLegacyPreviewLabelFromName('RipX Preview: Economy')).toBe('RipX Preview: Economy');
    expect(stripLegacyPreviewLabelFromName('New York Express')).toBe('New York Express');
    expect(stripLegacyPreviewLabelFromName('RipX Preview: Economy', ['RipX Preview'])).toBe(
      'Economy'
    );
    expect(stripLegacyPreviewLabelFromName('New: Express', ['New'])).toBe('Express');
    expect(
      sanitizeLegacyShippingPreviewConfig({
        preview_label_prefix: 'New',
        rates: [{ name: 'New: Express', amount: 9 }],
      })
    ).toMatchObject({
      rates: [{ name: 'Express', amount: 9 }],
    });
    expect(
      sanitizeLegacyShippingPreviewConfig({
        preview_label_prefix: 'New',
      }).preview_label_prefix
    ).toBeUndefined();
    expect(
      sanitizeLegacyShippingPreviewConfig({
        rates: [{ name: 'New York Express', amount: 9 }],
      }).rates[0].name
    ).toBe('New York Express');
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

  it('blocks unified wizard incentives until Shopify methods are targeted', () => {
    expect(
      getShippingReadiness(
        {
          name: 'Variant A',
          config: {
            strategy: 'free_shipping',
            metadata: {
              shipping_wizard_path: 'unified',
              shipping_test_type: 'free_shipping',
            },
          },
        },
        1
      )
    ).toMatchObject({
      status: 'blocked',
      issue: 'Pick at least one Shopify method to target',
    });

    expect(
      getShippingReadiness(
        {
          name: 'Variant A',
          config: {
            strategy: 'discount_percentage',
            percent_off: 15,
            delivery_method_names: ['Standard Shipping'],
            metadata: {
              shipping_wizard_path: 'unified',
              shipping_test_type: 'discount_percentage',
            },
          },
        },
        1
      )
    ).toMatchObject({ status: 'ready', label: 'Ready' });
  });

  it('derives offer wizard mode and attributes with backward-compatible defaults', () => {
    expect(normalizeShippingOfferMode('MULTIPLE')).toBe('multiple');
    expect(getShippingOfferMode({ rates: [{ name: 'A' }, { name: 'B' }] })).toBe('multiple');
    expect(getShippingOfferMode({ rates: [{ name: 'A' }] })).toBe('single');
    expect(
      getShippingOfferMode({
        metadata: { shipping_offer_mode: 'multiple' },
        rates: [{ name: 'A' }],
      })
    ).toBe('single');
    expect(
      getShippingOfferMode({
        metadata: { shipping_offer_mode: 'single' },
        rates: [{ name: 'A' }, { name: 'B' }],
      })
    ).toBe('multiple');
    expect(getShippingOfferAttributes({})).toEqual({
      name: true,
      rate: true,
      range: true,
      message: true,
    });
    expect(
      getShippingOfferAttributes({
        metadata: {
          shipping_offer_attributes: {
            update_name: false,
            update_rate: true,
            update_range: true,
            update_message: true,
          },
        },
      })
    ).toEqual({
      name: false,
      rate: true,
      range: true,
      message: true,
    });
  });

  it('promotes single checkout offer fields into a multi-row rate table', () => {
    expect(
      buildPromoteShippingOfferToMultiplePatch(
        {
          label: 'RipX Standard',
          amount: 7.5,
          currency: 'USD',
          checkout_display: {
            message: 'Arrives in 2-3 days',
            delivery_promise: { mode: 'preset', preset: '2_3_business_days' },
          },
        },
        { name: 'Standard', rate: 5 }
      )
    ).toMatchObject({
      metadata: { shipping_offer_mode: 'multiple' },
      rates: [
        {
          name: 'RipX Standard',
          amount: 7.5,
          currency: 'USD',
          description: 'Arrives in 2-3 days',
        },
      ],
    });
    expect(
      buildPromoteShippingOfferToMultiplePatch(
        { rates: [{ name: 'Linked Standard', amount: 5 }] },
        { name: 'Standard', rate: 5 }
      )
    ).toEqual({
      metadata: { shipping_offer_mode: 'multiple' },
    });
  });

  it('treats unified wizard configs as non-offer readiness checks', () => {
    expect(
      isOfferWizardConfig({
        metadata: { shipping_wizard_path: 'unified', shipping_offer_mode: 'multiple' },
      })
    ).toBe(false);
    expect(
      getShippingReadiness(
        {
          name: 'Variant A',
          config: {
            strategy: 'flat_rate',
            metadata: {
              shipping_wizard_path: 'unified',
              shipping_offer_mode: 'multiple',
            },
            delivery_method_names: ['Standard'],
            rates: [{ name: 'Standard', amount: 4.99 }],
          },
        },
        1
      )
    ).toMatchObject({ status: 'ready' });
  });

  it('validates offer wizard readiness and reverts unchecked attribute values to baseline', () => {
    const baseline = {
      name: 'Standard',
      rate: 4.99,
      message: '',
      range: { mode: 'none', preset: 'none' },
    };
    const cfg = {
      metadata: {
        shipping_wizard_path: 'offer',
        shipping_offer_mode: 'multiple',
        shipping_offer_attributes: { name: true, rate: true, range: false, message: false },
      },
      label: 'RipX Express',
      amount: 9.99,
      rates: [{ name: 'RipX Express', amount: 9.99 }],
    };
    expect(getOfferWizardReadinessIssues(cfg, { normalizeRates: () => cfg.rates })).toEqual([]);

    const revertPatch = buildOfferAttributeRevertPatch(cfg, 'rate', baseline);
    expect(revertPatch.amount).toBe(4.99);
    expect(revertPatch.metadata.quote_amount).toBe(4.99);
    expect(revertPatch.rates[0].amount).toBe(4.99);

    expect(
      getShippingReadiness(
        {
          name: 'Variant A',
          config: {
            ...cfg,
            rates: [
              { name: 'Standard', amount: 4.99 },
              { name: 'Express', amount: 9.99 },
            ],
          },
        },
        1
      )
    ).toMatchObject({ status: 'ready' });
  });

  it('formats custom delivery promises like checkout business-day labels', () => {
    expect(
      formatShippingDeliveryPromiseLabel(
        {
          mode: 'custom',
          min_delivery_date: '2026-06-09',
          max_delivery_date: '2026-06-10',
        },
        new Date('2026-06-05T12:00:00Z')
      )
    ).toBe('Delivers in 2-3 business days');
  });
});
