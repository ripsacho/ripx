const {
  compareDeliveryCustomizationConfigs,
  loadDeliveryCustomizationRunModule,
  buildAutoSimulationDeliveryOptions,
} = require('../shippingDcDebugService');

describe('shippingDcDebugService', () => {
  it('flags legacy slug codes and missing rate_hide_bindings on live metafield', () => {
    const expected = {
      test_id: 'test-1',
      variant_rules: [
        {
          variant_id: 'Variant A',
          method_names: ['Standard'],
          method_codes: ['1186140225609'],
          native_hide_by_id_only: true,
          rate_hide_bindings: [
            {
              native_name: 'Standard',
              ripx_service_code: 'ripx_replace_standard',
              display_name: 'Standard',
              reuses_native_title: true,
            },
          ],
        },
      ],
    };
    const live = {
      test_id: 'test-1',
      variant_rules: [
        {
          variant_id: 'Variant A',
          method_names: ['Standard'],
          method_codes: ['1186140225609', 'standard'],
          native_hide_by_id_only: true,
          rate_hide_bindings: [],
        },
      ],
    };

    const comparison = compareDeliveryCustomizationConfigs(expected, live);
    expect(comparison.in_sync).toBe(false);
    expect(comparison.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'variant_rule.summary' }),
        expect.objectContaining({ field: 'legacy_slug_codes_on_live_metafield' }),
        expect.objectContaining({ field: 'missing_rate_hide_bindings_on_live' }),
      ])
    );
  });

  it('explains hide decisions for same-title checkout options', () => {
    const { explainDeliveryCustomizationHide } = loadDeliveryCustomizationRunModule();
    const result = explainDeliveryCustomizationHide({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: 'test-sim',
            variant_rules: [
              {
                variant_id: 'Variant A',
                action: 'hide',
                method_names: ['Standard'],
                native_hide_targets: [
                  {
                    name: 'Standard',
                    method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
                  },
                ],
                rate_hide_bindings: [
                  {
                    native_name: 'Standard',
                    native_method_definition_id:
                      'gid://shopify/DeliveryMethodDefinition/1186140225609',
                    ripx_service_code: 'ripx_replace_standard',
                    display_name: 'Standard',
                    reuses_native_title: true,
                  },
                ],
                native_hide_scoped_codes: ['1186140225609'],
                native_hide_by_id_only: true,
                protected_method_codes: ['ripx_replace_standard'],
                skip_replacement_presence_gate: true,
              },
            ],
          },
        },
      },
      cart: {
        deliveryGroups: [
          {
            cartLines: [
              {
                ripxTest: { value: 'test-sim' },
                ripxVariant: { value: 'Variant A' },
              },
            ],
            deliveryOptions: [
              {
                handle: '1186140225609',
                title: 'Standard',
                code: '1186140225609',
                deliveryMethodType: 'SHIPPING',
                cost: { amount: '5.00', currencyCode: 'USD' },
              },
              {
                handle: 'ripx-standard',
                title: 'Standard',
                code: 'ripx_replace_standard',
                deliveryMethodType: 'SHIPPING',
                cost: { amount: '12.00', currencyCode: 'USD' },
              },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual(
      expect.arrayContaining([{ deliveryOptionHide: { deliveryOptionHandle: '1186140225609' } }])
    );
    expect(result.operations).toHaveLength(1);
    expect(result.option_decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handle: '1186140225609',
          hidden: true,
          reason: 'hidden',
        }),
        expect.objectContaining({
          handle: 'ripx-standard',
          hidden: false,
          reason: expect.stringMatching(/protected/),
        }),
      ])
    );
  });

  it('builds auto simulation options from hide targets and configured RipX rates', () => {
    const options = buildAutoSimulationDeliveryOptions({
      variant: {
        config: {
          native_hide_targets: [
            {
              name: 'Standard',
              method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
            },
          ],
          rates: [
            {
              name: 'Standard',
              service_code: 'ripx_replace_standard',
              amount: '12.00',
            },
          ],
        },
      },
      currentSetup: {
        rates: [{ name: 'Standard', id: '1186140225609', code: '1186140225609', amount: '5.00' }],
      },
    });

    expect(options).toHaveLength(2);
    expect(options.map(option => option.code)).toEqual(
      expect.arrayContaining(['1186140225609', 'ripx_replace_standard'])
    );
  });
});
