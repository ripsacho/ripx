const {
  buildNativeHideTargets,
  buildScopedCodesFromHideTargets,
  enrichVariantShippingHideTargets,
  findCurrentSetupRatesForName,
} = require('../shippingHideTargetResolver');

jest.mock('../shippingCurrentSetupService', () => ({
  buildShippingCurrentSetupReport: jest.fn(),
}));

const { buildShippingCurrentSetupReport } = require('../shippingCurrentSetupService');

describe('shippingHideTargetResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds scoped codes from hide targets', () => {
    const codes = buildScopedCodesFromHideTargets([
      {
        name: 'Standard',
        method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
        rate_id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
      },
    ]);

    expect(codes).toEqual(
      expect.arrayContaining([
        '1186140225609',
        'gid://shopify/DeliveryMethodDefinition/1186140225609',
      ])
    );
  });

  it('backfills scoped ids from current setup when scope is missing', async () => {
    buildShippingCurrentSetupReport.mockResolvedValue({
      rates: [
        {
          id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
          name: 'Standard',
          method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
        },
        {
          id: 'gid://shopify/DeliveryMethodDefinition/1186140258377',
          name: 'Express',
          method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140258377',
        },
      ],
    });

    const enriched = await enrichVariantShippingHideTargets('shop.test', 'token', {
      id: 'variant-a',
      config: {
        delivery_method_names: ['Standard', 'Express'],
        shipping_scope: {},
        rates: [{ name: 'Standard', service_code: 'ripx_replace_standard' }],
      },
    });

    expect(enriched.config.native_hide_by_id_only).toBe(true);
    expect(enriched.config.native_hide_scoped_codes).toEqual(
      expect.arrayContaining(['1186140225609', '1186140258377'])
    );
    expect(enriched.config.native_hide_targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Standard',
          method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
        }),
        expect.objectContaining({
          name: 'Express',
          method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140258377',
        }),
      ])
    );
    expect(enriched.config.delivery_method_codes).toEqual(
      expect.arrayContaining(['1186140225609', '1186140258377'])
    );
    expect(enriched.config.delivery_method_codes).not.toEqual(
      expect.arrayContaining(['standard', 'express'])
    );
  });

  it('matches current setup rates by name', () => {
    const rates = [
      { name: 'Standard', method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1' },
      { name: 'Express', method_definition_id: 'gid://shopify/DeliveryMethodDefinition/2' },
    ];
    expect(findCurrentSetupRatesForName(rates, 'standard')).toHaveLength(1);
    expect(buildNativeHideTargets(['Standard'], {}, rates)[0].method_definition_id).toBe(
      'gid://shopify/DeliveryMethodDefinition/1'
    );
  });
});
