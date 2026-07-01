const shopifyService = require('../shopifyService');
const {
  executeShippingTestPlan,
  dedupeDeliveryCustomizationsForVariant,
  buildShippingDeliveryCustomizationConfig,
} = require('../shippingAutoExecutionService');
const { getTestsByShop } = require('../../models/test');
const { buildShippingCurrentSetupReport } = require('../shippingCurrentSetupService');

jest.mock('../../models/test', () => ({
  getTestsByShop: jest.fn().mockResolvedValue([]),
}));

jest.mock('../shippingCurrentSetupService', () => ({
  buildShippingCurrentSetupReport: jest.fn(),
}));

describe('shippingAutoExecutionService', () => {
  const originalScopes = process.env.SHOPIFY_SCOPES;
  const originalCarrierCallbackUrl = process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL;
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    jest.restoreAllMocks();
    getTestsByShop.mockResolvedValue([]);
    buildShippingCurrentSetupReport.mockResolvedValue({ rates: [] });
    process.env.SHOPIFY_SCOPES = 'read_discounts,write_discounts';
    process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL =
      'https://ripx.example.com/api/track/shipping-carrier-rates';
    process.env.APP_URL = 'https://app.ripx.example.com';
  });

  afterAll(() => {
    process.env.SHOPIFY_SCOPES = originalScopes;
    process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL = originalCarrierCallbackUrl;
    process.env.APP_URL = originalAppUrl;
  });

  it('builds native hide targets with Shopify method definition ids from current setup rates', () => {
    const config = buildShippingDeliveryCustomizationConfig(
      { id: 'test-native-targets', name: 'Native target test' },
      {
        name: 'Variant A',
        config: {
          strategy: 'flat_rate',
          shipping_display_mode: 'add_preview_method',
          delivery_method_names: ['Standard'],
          delivery_action: 'hide',
          rates: [],
        },
      },
      {
        currentRates: [
          {
            id: 'gid://shopify/DeliveryRateDefinition/10',
            name: 'Standard',
            method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
            amount: 5,
            currency: 'USD',
          },
        ],
      }
    );

    expect(config.variant_rules[0].native_hide_targets).toEqual([
      expect.objectContaining({
        name: 'Standard',
        method_definition_id: 'gid://shopify/DeliveryMethodDefinition/1186140225609',
        rate_id: 'gid://shopify/DeliveryRateDefinition/10',
      }),
    ]);
    expect(config.variant_rules[0].native_hide_scoped_codes).toEqual(
      expect.arrayContaining([
        'gid://shopify/DeliveryMethodDefinition/1186140225609',
        '1186140225609',
      ])
    );
    expect(config.variant_rules[0].native_hide_by_id_only).toBe(true);
  });

  it('runs dry-run for discount-function strategy without creating discount', async () => {
    const spy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    spy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'demo.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [{ id: 'fn-1', title: 'RipX discount', apiType: 'DISCOUNT' }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: { discountNodes: { nodes: [] } },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-1',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: { strategy: 'threshold_free_shipping', threshold_amount: 100 },
          },
        ],
      },
      shopDomain: 'demo.myshopify.com',
      accessToken: 'token',
      apply: false,
      variantIndex: 1,
    });

    expect(result.execution_result.summary.apply_mode).toBe('dry_run');
    const action = result.execution_result.actions[0];
    expect(action.status).toBe('dry_run_ready');
    expect(action.details?.created).toBe(false);
    expect(action.details?.dry_run).toBe(true);
  });

  it('creates shipping discount in apply mode for discount-function strategy', async () => {
    const spy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    spy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'demo.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [{ id: 'fn-1', title: 'RipX discount', apiType: 'DISCOUNT' }],
          },
        },
      })
      .mockResolvedValueOnce({
        data: { discountNodes: { nodes: [] } },
      })
      .mockResolvedValueOnce({
        data: {
          discountAutomaticAppCreate: {
            automaticAppDiscount: {
              discountId: 'gid://shopify/DiscountAutomaticNode/1',
              title: 'RipX Shipping Test',
              status: 'ACTIVE',
            },
            userErrors: [],
          },
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-1',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: { strategy: 'free_shipping' },
          },
        ],
      },
      shopDomain: 'demo.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    expect(result.execution_result.summary.apply_mode).toBe('apply');
    const action = result.execution_result.actions[0];
    expect(action.status).toBe('created');
    expect(action.details?.created).toBe(true);
    expect(action.details?.discount?.discountId).toContain('DiscountAutomaticNode');
  });

  it('creates carrier service in apply mode for flat-rate strategy', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy
      .mockResolvedValueOnce({
        carrier_services: [],
      })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 101,
          name: 'RipX Shipping Carrier test-1 Variant A',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-1&variant_index=1&strategy=flat_rate&amount=6.50',
          service_discovery: true,
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-1',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: { strategy: 'flat_rate', amount: 6.5 },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.status).toBe('created');
    expect(action.execution_adapter).toBe('carrier_service');
    expect(action.details?.created).toBe(true);
    expect(action.details?.service?.id).toBe(101);
    expect(restSpy).toHaveBeenCalledTimes(2);
  });

  it('recovers when Shopify reports carrier service is already configured during create', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });
    const duplicateError = new Error(
      'base: RipX Shipping Rate - test-dup rrevision is already configured'
    );
    duplicateError.name = 'ShopifyApiError';
    duplicateError.status = 422;
    duplicateError.statusCode = 422;
    duplicateError.payload = {
      errors: {
        base: ['RipX Shipping Rate - test-dup rrevision is already configured'],
      },
    };
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy
      .mockResolvedValueOnce({ carrier_services: [] })
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce({
        carrier_services: [
          {
            id: 101,
            name: 'RipX Shipping Rate - test-dup rrevision',
            callback_url:
              'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-dup&cfg_rev=revision&shop_domain=plus.myshopify.com&variant_index=1&strategy=flat_rate&amount=4.00',
            service_discovery: true,
          },
          {
            id: 102,
            name: 'RipX Shipping Rate - test-dup roldrevis',
            callback_url:
              'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-dup&cfg_rev=old-revision&shop_domain=plus.myshopify.com&variant_index=1&strategy=flat_rate&amount=5.00',
            service_discovery: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 101,
          name: 'RipX Shipping Rate - test-dup rrevision',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-dup&cfg_rev=revision&shop_domain=plus.myshopify.com&variant_index=1&strategy=flat_rate&amount=4.00',
          service_discovery: true,
        },
      })
      .mockResolvedValueOnce({});

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-dup',
        name: 'Shipping duplicate recovery',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 4,
              metadata: { shipping_config_revision: 'revision' },
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.status).toBe('updated');
    expect(action.details?.recovered_duplicate).toBe(true);
    expect(action.details?.message).toContain('already existed');
    expect(action.details?.stale_revision_cleanup).toEqual([
      expect.objectContaining({
        ok: true,
        status: 'deleted',
      }),
    ]);
    expect(result.execution_result.summary.failed_count).toBe(0);
    expect(restSpy).toHaveBeenCalledWith(
      'plus.myshopify.com',
      'token',
      expect.objectContaining({
        method: 'PUT',
        path: 'carrier_services/101.json',
      })
    );
    expect(restSpy).toHaveBeenCalledWith(
      'plus.myshopify.com',
      'token',
      expect.objectContaining({
        method: 'DELETE',
        path: 'carrier_services/102.json',
      })
    );
  });

  it('recovers when Shopify duplicate error references an older unrevisioned carrier name', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });
    const duplicateError = new Error('base: RipX Shipping Rate - 131bdc89 is already configured');
    duplicateError.name = 'ShopifyApiError';
    duplicateError.status = 422;
    duplicateError.statusCode = 422;
    duplicateError.payload = {
      errors: {
        base: ['RipX Shipping Rate - 131bdc89 is already configured'],
      },
    };
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy
      .mockResolvedValueOnce({ carrier_services: [] })
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce({
        carrier_services: [
          {
            id: 909,
            name: 'RipX Shipping Rate - 131bdc89',
            callback_url:
              'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=131bdc89-4f54-41ec-ba73-8e296b357865&shop_domain=plus.myshopify.com&variant_index=1&strategy=flat_rate&amount=44.00',
            service_discovery: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 909,
          name: 'RipX Shipping Rate - 131bdc89 rrevision',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=131bdc89-4f54-41ec-ba73-8e296b357865&cfg_rev=revision&shop_domain=plus.myshopify.com&variant_index=1&strategy=flat_rate&amount=43.00',
          service_discovery: true,
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: '131bdc89-4f54-41ec-ba73-8e296b357865',
        name: 'Shipping duplicate recovery',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 43,
              metadata: { shipping_config_revision: 'revision' },
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.status).toBe('updated');
    expect(action.details?.recovered_duplicate).toBe(true);
    expect(result.execution_result.summary.failed_count).toBe(0);
    expect(restSpy).toHaveBeenCalledWith(
      'plus.myshopify.com',
      'token',
      expect.objectContaining({
        method: 'PUT',
        path: 'carrier_services/909.json',
      })
    );
  });

  it('builds resilient callback params for multi-rate flat-rate variants', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy
      .mockResolvedValueOnce({
        carrier_services: [],
      })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 111,
          name: 'RipX Shipping Carrier test-rates Variant Multi',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-rates&variant_index=1&strategy=flat_rate&amount=4.00',
          service_discovery: true,
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-rates',
        name: 'Shipping multi-rate test',
        updated_at: '2026-06-01T23:00:00.000Z',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Multi',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              shipping_display_mode: 'add_preview_method',
              preview_label_prefix: 'RipX Preview',
              rates: [
                {
                  name: 'Express',
                  description: 'Fast tracked shipping',
                  min_delivery_date: '2026-07-04',
                  max_delivery_date: '2026-07-05',
                  amount: 9,
                  currency: 'USD',
                  priority: 2,
                  sort_order: 2,
                },
                {
                  name: 'Economy',
                  description: 'Budget shipping',
                  delivery_promise: { mode: 'preset', preset: '2_3_business_days' },
                  amount: 4,
                  currency: 'USD',
                  priority: 1,
                  sort_order: 1,
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.status).toBe('created');
    expect(action.details?.callback_url).toContain('shop_domain=plus.myshopify.com');
    expect(action.details?.callback_url).toContain('require_assignment=1');
    expect(action.details?.callback_url).not.toContain('rates_json=');
    const callbackUrl = new URL(action.details?.callback_url);
    expect(callbackUrl.searchParams.get('cfg_rev')).toBe('2026-06-01T23:00:00.000Z');
    expect(callbackUrl.searchParams.get('variant_index')).toBe('1');
    expect(action.details?.callback_url.length).toBeLessThanOrEqual(255);
    expect(restSpy).toHaveBeenCalledTimes(2);
  });

  it('updates the existing carrier service when shipping config revision changes', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy
      .mockResolvedValueOnce({
        carrier_services: [
          {
            id: 201,
            name: 'RipX Shipping Rate - test-rev roldrevis',
            callback_url:
              'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-rev&cfg_rev=old-revision&shop_domain=plus.myshopify.com&variant_index=1&strategy=flat_rate&amount=44.00',
            service_discovery: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 201,
          name: 'RipX Shipping Rate - test-rev rnewrevis',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-rev&cfg_rev=new-revision&shop_domain=plus.myshopify.com&variant_index=1&strategy=flat_rate&amount=43.00',
          service_discovery: true,
        },
      })
      .mockResolvedValueOnce({});

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-rev',
        name: 'Shipping revision test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 43,
              metadata: {
                shipping_config_revision: 'new-revision',
              },
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.status).toBe('updated');
    expect(action.details?.service?.id).toBe(201);
    expect(action.details?.callback_url).toContain('cfg_rev=new-revision');
    expect(action.details?.stale_revision_cleanup).toEqual([]);
    expect(restSpy).toHaveBeenCalledWith(
      'plus.myshopify.com',
      'token',
      expect.objectContaining({
        method: 'PUT',
        path: 'carrier_services/201.json',
      })
    );
  });

  it('attaches carrier service to selected delivery profile zone when scope is configured', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryProfiles: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/DeliveryProfile/1',
                  name: 'General profile',
                  default: true,
                  profileLocationGroups: [
                    {
                      locationGroup: { id: 'gid://shopify/DeliveryLocationGroup/1' },
                      locationGroupZones: {
                        edges: [
                          {
                            node: {
                              zone: {
                                id: 'gid://shopify/DeliveryZone/1',
                                name: 'United States',
                                countries: [{ code: { countryCode: 'US' } }],
                              },
                              methodDefinitions: {
                                edges: [
                                  {
                                    node: {
                                      id: 'gid://shopify/DeliveryMethodDefinition/1',
                                      name: 'Standard',
                                      active: true,
                                      rateProvider: {
                                        __typename: 'DeliveryRateDefinition',
                                        id: 'gid://shopify/DeliveryRateDefinition/1',
                                        price: { amount: '5.00', currencyCode: 'USD' },
                                      },
                                    },
                                  },
                                ],
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryProfileUpdate: {
            profile: { id: 'gid://shopify/DeliveryProfile/1', name: 'General profile' },
            userErrors: [],
          },
        },
      });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy.mockResolvedValueOnce({ carrier_services: [] }).mockResolvedValueOnce({
      carrier_service: {
        id: 202,
        name: 'RipX Shipping Carrier test-1 Variant A',
        callback_url:
          'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-1&variant_index=1&strategy=flat_rate&amount=6.50',
        service_discovery: true,
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-1',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 6.5,
              shipping_scope: {
                profile_id: 'gid://shopify/DeliveryProfile/1',
                location_group_id: 'gid://shopify/DeliveryLocationGroup/1',
                zone_id: 'gid://shopify/DeliveryZone/1',
              },
              rates: [{ name: 'RipX Shipping', amount: 6.5, currency: 'USD' }],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.status).toBe('created');
    expect(action.details?.profile_binding).toMatchObject({
      status: 'bound',
      carrier_service_id: 'gid://shopify/DeliveryCarrierService/202',
    });
    const updateCall = graphSpy.mock.calls.find(call =>
      String(call[2] || '').includes('RipxAttachCarrierRateToDeliveryProfile')
    );
    expect(updateCall?.[3]).toMatchObject({
      id: 'gid://shopify/DeliveryProfile/1',
      profile: {
        locationGroupsToUpdate: [
          {
            id: 'gid://shopify/DeliveryLocationGroup/1',
            zonesToUpdate: [
              {
                id: 'gid://shopify/DeliveryZone/1',
                methodDefinitionsToCreate: [
                  {
                    name: 'RipX Shipping',
                    participant: {
                      carrierServiceId: 'gid://shopify/DeliveryCarrierService/202',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it('tracks carrier service when profile binding fails after creation', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryProfileUpdate: {
            profile: null,
            userErrors: [{ field: ['profile'], message: 'Zone cannot be updated' }],
          },
        },
      });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy
      .mockResolvedValueOnce({ carrier_services: [] })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 303,
          name: 'RipX Shipping Carrier test-bind Variant A',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-bind&variant_index=1&strategy=flat_rate&amount=7.00',
          service_discovery: true,
        },
      })
      .mockResolvedValueOnce({ shipping_zones: [] });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-bind',
        name: 'Shipping binding failure',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 7,
              shipping_scope: {
                profile_id: 'gid://shopify/DeliveryProfile/1',
                location_group_id: 'gid://shopify/DeliveryLocationGroup/1',
                zone_id: 'gid://shopify/DeliveryZone/1',
              },
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(buildShippingCurrentSetupReport).toHaveBeenCalledWith('plus.myshopify.com', 'token');
    expect(graphSpy).toHaveBeenCalledTimes(2);
    expect(graphSpy.mock.calls[1][2]).toContain('deliveryProfileUpdate');
    expect(action.status).toBe('created_profile_binding_failed');
    expect(result.execution_result.summary.failed_count).toBe(1);
    expect(result.execution_result.summary.profile_binding_failed_count).toBe(1);
    expect(action.details?.profile_binding).toMatchObject({
      ok: false,
      status: 'failed',
    });
    expect(result.persisted_variants[1].config.metadata.shipping_resources[0]).toMatchObject({
      resource_type: 'carrier_service',
      id: '303',
      profile_binding: {
        status: 'failed',
        carrier_service_id: 'gid://shopify/DeliveryCarrierService/303',
      },
    });
  });

  it('returns manual-required when carrier callback URL is unavailable', async () => {
    process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL = '';
    process.env.APP_URL = '';

    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-2',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant B',
            allocation: 50,
            config: { strategy: 'flat_rate', amount: 8 },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.status).toBe('manual_required');
    expect(action.details?.status).toBe('manual_required');
    expect(restSpy).not.toHaveBeenCalled();
  });

  it('creates delivery customization in apply mode when execution_hint requests it', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizations: { edges: [] },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/1',
              title: 'RipX Shipping Delivery test-3 Variant C',
              enabled: true,
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [
              {
                id: 'gid://shopify/Metafield/1',
                namespace: 'delivery-customization',
                key: 'function-configuration',
              },
            ],
            userErrors: [],
          },
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-3',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant C',
            allocation: 50,
            config: {
              strategy: 'carrier_quote',
              profile_id: 'gid://shopify/DeliveryProfile/123',
              execution_hint: 'delivery_customization',
              delivery_method_names: ['Standard Shipping'],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.execution_adapter).toBe('delivery_customization');
    expect(action.status).toBe('created');
    expect(action.details?.created).toBe(true);
    expect(action.details?.customization?.id).toContain('DeliveryCustomization');
    expect(action.details?.config?.variant_rules[0]?.method_names).toEqual(['Standard Shipping']);
  });

  it('persists existing delivery customizations after reconfiguration', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizations: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/DeliveryCustomization/777',
                  title: 'RipX Shipping Delivery test-3 Variant C',
                  enabled: true,
                },
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/777' }],
            userErrors: [],
          },
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-3',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant C',
            allocation: 50,
            config: {
              strategy: 'carrier_quote',
              execution_hint: 'delivery_customization',
              delivery_method_names: ['Standard Shipping'],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.status).toBe('configured');
    expect(result.persisted_variants[1].config.metadata.shipping_resources).toEqual([
      expect.objectContaining({
        resource_type: 'delivery_customization',
        id: 'gid://shopify/DeliveryCustomization/777',
      }),
    ]);
    expect(graphSpy).toHaveBeenCalledTimes(4);
  });

  it('creates carrier service and delivery customization for replacement flat rate', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizations: { edges: [] },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/44',
              title: 'RipX Shipping Delivery test-44 Variant Replace',
              enabled: true,
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/44' }],
            userErrors: [],
          },
        },
      });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy.mockResolvedValueOnce({ carrier_services: [] }).mockResolvedValueOnce({
      carrier_service: {
        id: 444,
        name: 'RipX Shipping Carrier test-44 Variant Replace',
        callback_url:
          'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-44&variant_index=1&strategy=flat_rate&amount=44.00',
        service_discovery: true,
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-44',
        name: 'Shipping replacement test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Replace',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 44,
              replace_existing_rates: true,
              delivery_method_names: ['Standard Delivery', 'Express'],
              delivery_action: 'hide',
              rates: [
                {
                  name: 'Fast Standard',
                  amount: 44,
                  source_method_name: 'Standard Delivery',
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const actions = result.execution_result.actions;
    expect(actions).toHaveLength(2);
    expect(actions[0].execution_adapter).toBe('carrier_service');
    expect(actions[0].status).toBe('created');
    expect(actions[1].execution_adapter).toBe('delivery_customization');
    expect(actions[1].status).toBe('created');
    expect(actions[1].details?.config?.variant_rules[0]).toMatchObject({
      action: 'hide',
      method_names: ['Standard Delivery', 'Express'],
      native_hide_by_id_only: expect.any(Boolean),
      require_present_method_names: expect.arrayContaining(['Fast Standard']),
      require_present_method_codes: ['ripx_replace_standard_delivery'],
      protected_method_codes: ['ripx_replace_standard_delivery'],
      protected_method_names: ['Fast Standard'],
      hide_when_unassigned_method_names: [],
      hide_when_unassigned_method_codes: ['ripx_replace_standard_delivery'],
    });
    expect(actions[1].details?.config?.variant_rules[0].rename_to).toBeUndefined();
    expect(actions[0].details?.callback_url).toContain('require_assignment=1');
    expect(result.persisted_variants[1].config.metadata.shipping_resources).toHaveLength(2);
    expect(restSpy).toHaveBeenCalledTimes(2);
  });

  it('does not emit rename_to for hide delivery customization rules', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/1',
              title: 'RipX Shipping Delivery test-rename Variant A',
              enabled: true,
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/1' }],
            userErrors: [],
          },
        },
      });
    jest
      .spyOn(shopifyService, 'requestAdminRest')
      .mockResolvedValueOnce({ carrier_services: [] })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 555,
          name: 'RipX Shipping Carrier',
          callback_url: 'https://ripx.example.com/api/track/shipping-carrier-rates',
          service_discovery: true,
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-rename',
        name: 'Shipping rename stale field',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 42,
              replace_existing_rates: true,
              delivery_method_names: ['Standard'],
              delivery_action: 'hide',
              delivery_rename_to: 'New Standard',
              rates: [{ name: 'Standard A', amount: 39, source_method_name: 'Standard' }],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const hideRule = result.execution_result.actions.find(
      action => action.execution_adapter === 'delivery_customization'
    )?.details?.config?.variant_rules?.[0];
    expect(hideRule?.action).toBe('hide');
    expect(hideRule?.rename_to).toBeUndefined();
  });

  it('treats replace display mode as replacement flat-rate behavior', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizations: { edges: [] },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/45',
              title: 'RipX Shipping Delivery test-45 Variant Replace Display',
              enabled: true,
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/45' }],
            userErrors: [],
          },
        },
      });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy.mockResolvedValueOnce({ carrier_services: [] }).mockResolvedValueOnce({
      carrier_service: {
        id: 445,
        name: 'RipX Shipping Carrier test-45 Variant Replace Display',
        callback_url:
          'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-45&variant_index=1&strategy=flat_rate&amount=44.00',
        service_discovery: true,
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-45',
        name: 'Shipping replacement test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Replace Display',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 44,
              shipping_display_mode: 'replace_existing_methods',
              delivery_method_names: ['Standard Delivery'],
              delivery_action: 'hide',
              rates: [
                {
                  name: 'Standard Delivery',
                  amount: 44,
                  source_method_name: 'Standard Delivery',
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const actions = result.execution_result.actions;
    expect(actions).toHaveLength(2);
    expect(actions[1].execution_adapter).toBe('delivery_customization');
    expect(actions[1].status).toBe('created');
    expect(actions[1].details?.config?.variant_rules[0]).toMatchObject({
      method_names: ['Standard Delivery'],
      require_present_method_names: expect.arrayContaining(['Standard Delivery']),
      require_present_method_codes: ['ripx_replace_standard_delivery'],
      protected_method_codes: ['ripx_replace_standard_delivery'],
      protected_method_names: ['Standard Delivery'],
      hide_when_unassigned_method_codes: ['ripx_replace_standard_delivery'],
    });
    expect(restSpy).toHaveBeenCalledTimes(2);
  });

  it('applies delivery customization for add-preview flat rate hide targets', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizations: { edges: [] },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/46',
              title: 'RipX Shipping Delivery test-add-hide Variant Add Hide',
              enabled: true,
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/46' }],
            userErrors: [],
          },
        },
      });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy.mockResolvedValueOnce({ carrier_services: [] }).mockResolvedValueOnce({
      carrier_service: {
        id: 446,
        name: 'RipX Shipping Rate - test-add-hide',
        callback_url:
          'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-add-hide&variant_index=1&strategy=flat_rate&amount=12.00',
        service_discovery: true,
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-add-hide',
        name: 'Shipping add hide test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Add Hide',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 12,
              shipping_display_mode: 'add_preview_method',
              delivery_method_names: ['Standard Shipping'],
              delivery_action: 'hide',
              rates: [{ name: 'Express', amount: 12, currency: 'USD' }],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const actions = result.execution_result.actions;
    expect(actions).toHaveLength(2);
    expect(actions[1].execution_adapter).toBe('delivery_customization');
    expect(actions[1].status).toBe('created');
    expect(actions[1].details?.config?.variant_rules[0]).toMatchObject({
      method_names: ['Standard Shipping'],
      skip_replacement_presence_gate: true,
      protected_method_names: ['Express'],
      protected_rate_titles: ['Express'],
      protected_method_codes: expect.arrayContaining([expect.stringMatching(/^ripx_flat_/i)]),
      rate_hide_bindings: expect.arrayContaining([
        expect.objectContaining({
          display_name: 'Express',
          reuses_native_title: expect.any(Boolean),
        }),
      ]),
      protected_method_name_prefixes: expect.arrayContaining(['RipX Shipping']),
    });
  });

  it('protects every add-mode RipX rate code when one rate already has an explicit ripx service code', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/47',
              title: 'RipX Shipping Delivery test-mixed-codes Variant A',
              enabled: true,
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/47' }],
            userErrors: [],
          },
        },
      });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy.mockResolvedValueOnce({ carrier_services: [] }).mockResolvedValueOnce({
      carrier_service: {
        id: 447,
        name: 'RipX Shipping Rate - test-mixed-codes',
        callback_url:
          'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-mixed-codes&variant_index=1&strategy=flat_rate&amount=33.00',
        service_discovery: true,
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-mixed-codes',
        name: 'Shipping mixed codes test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            id: 'Variant A',
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 33,
              shipping_display_mode: 'add_preview_method',
              delivery_method_names: ['Standard', 'Express'],
              delivery_action: 'hide',
              method_handles: ['standard'],
              rates: [
                {
                  name: 'Standard',
                  amount: 33,
                  currency: 'USD',
                  service_code: 'ripx_replace_standard',
                },
                {
                  name: 'Express',
                  amount: 64,
                  currency: 'USD',
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const rule = result.execution_result.actions[1].details?.config?.variant_rules[0];
    expect(rule.method_codes).toEqual(
      expect.arrayContaining(['standard', 'Standard', 'express', 'Express'])
    );
    expect(rule.require_present_method_names).toEqual([]);
    expect(rule.protected_method_names).toEqual(expect.arrayContaining(['Standard', 'Express']));
    expect(rule.protected_rate_titles).toEqual(expect.arrayContaining(['Standard', 'Express']));
    expect(rule.protected_method_codes).toEqual(
      expect.arrayContaining(['ripx_replace_standard', expect.stringMatching(/^ripx_flat_1_/i)])
    );
  });

  it('includes custom carrier service codes in protected_method_codes even without ripx prefix', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ data: { deliveryCustomizations: { edges: [] } } })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/48',
              title: 'RipX Shipping Delivery test-custom-codes Variant A',
              enabled: true,
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/48' }],
            userErrors: [],
          },
        },
      });
    jest
      .spyOn(shopifyService, 'requestAdminRest')
      .mockResolvedValueOnce({ carrier_services: [] })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 448,
          name: 'RipX Shipping Rate - test-custom-codes',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-custom-codes&variant_index=1',
          service_discovery: true,
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-custom-codes',
        name: 'Shipping custom codes test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 12,
              shipping_display_mode: 'add_preview_method',
              delivery_method_names: ['Standard', 'Express'],
              delivery_action: 'hide',
              rates: [
                { name: 'Standard', amount: 12, currency: 'USD', service_code: 'preview_standard' },
                { name: 'Express', amount: 20, currency: 'USD', service_code: 'preview_express' },
              ],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const rule = result.execution_result.actions[1].details?.config?.variant_rules[0];
    expect(rule.protected_method_codes).toEqual(
      expect.arrayContaining(['preview_standard', 'preview_express'])
    );
  });

  it('does not hide existing methods when replacement carrier service is not ready', async () => {
    process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL = '';
    process.env.APP_URL = '';

    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-45',
        name: 'Shipping replacement test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Replace',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 44,
              replace_existing_rates: true,
              delivery_method_names: ['Standard Delivery', 'Express'],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const actions = result.execution_result.actions;
    expect(actions).toHaveLength(2);
    expect(actions[0].execution_adapter).toBe('carrier_service');
    expect(actions[0].status).toBe('manual_required');
    expect(actions[1].execution_adapter).toBe('delivery_customization');
    expect(actions[1].details?.status).toBe('skipped_dependency');
    expect(restSpy).not.toHaveBeenCalled();
    expect(graphSpy).toHaveBeenCalledTimes(1);
  });

  it('does not apply delivery customization for replace flags without hide targets', async () => {
    process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL =
      'https://ripx.example.com/api/track/shipping-carrier-rates';
    process.env.APP_URL = 'https://ripx.example.com';

    jest.spyOn(shopifyService, 'requestAdminGraphql').mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy.mockResolvedValueOnce({ carrier_services: [] }).mockResolvedValueOnce({
      carrier_service: {
        id: 123,
        name: 'RipX Shipping Carrier test-46 Variant Replace',
        callback_url:
          'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-46&variant_index=1&strategy=flat_rate&amount=44.00',
        service_discovery: true,
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-46',
        name: 'Shipping replace without targets',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Replace',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 44,
              shipping_display_mode: 'replace_existing_methods',
              replace_existing_rates: true,
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const actions = result.execution_result.actions;
    expect(actions).toHaveLength(1);
    expect(actions[0].execution_adapter).toBe('carrier_service');
    expect(actions[0].status).toBe('created');
    expect(restSpy).toHaveBeenCalledTimes(2);
  });

  it('clears stale delivery customization when hide targets are removed', async () => {
    process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL =
      'https://ripx.example.com/api/track/shipping-carrier-rates';
    process.env.APP_URL = 'https://ripx.example.com';

    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizations: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/DeliveryCustomization/46',
                  title: 'RipX Shipping Delivery test-46 Variant Replace',
                  enabled: true,
                },
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/46' }],
            userErrors: [],
          },
        },
      });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy.mockResolvedValueOnce({ carrier_services: [] }).mockResolvedValueOnce({
      carrier_service: {
        id: 123,
        name: 'RipX Shipping Carrier test-46 Variant Replace',
        callback_url:
          'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-46&variant_index=1&strategy=flat_rate&amount=44.00',
        service_discovery: true,
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-46',
        name: 'Shipping replace without targets',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Replace',
            allocation: 50,
            config: {
              strategy: 'flat_rate',
              amount: 44,
              metadata: {
                shipping_resources: [
                  {
                    resource_type: 'delivery_customization',
                    id: 'gid://shopify/DeliveryCustomization/46',
                  },
                ],
              },
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const actions = result.execution_result.actions;
    expect(actions).toHaveLength(2);
    expect(actions[0].execution_adapter).toBe('carrier_service');
    expect(actions[1].execution_adapter).toBe('delivery_customization');
    expect(actions[1].status).toBe('cleared');
    expect(actions[1].details?.config?.variant_rules).toEqual([]);
  });

  it('auto-selects carrier service for carrier_quote and requires a quote provider', async () => {
    jest.spyOn(shopifyService, 'requestAdminGraphql').mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'plus.myshopify.com',
          plan: { displayName: 'Shopify Plus', shopifyPlus: true },
        },
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-4',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Auto',
            allocation: 50,
            config: {
              strategy: 'carrier_quote',
              profile_id: 'gid://shopify/DeliveryProfile/456',
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.execution_adapter).toBe('carrier_service');
    expect(action.status).toBe('manual_required');
    expect(action.details?.message).toContain('quote provider');
  });

  it('creates carrier service for carrier_quote when a provider is configured', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'advanced.myshopify.com',
          plan: { displayName: 'Advanced Shopify', shopifyPlus: false },
        },
      },
    });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy
      .mockResolvedValueOnce({
        carrier_services: [],
      })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 204,
          name: 'RipX Shipping Carrier test-5 Variant Quote',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-5&variant_index=1&strategy=carrier_quote&quote_provider=static_rate',
          service_discovery: true,
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-5',
        shop_domain: 'advanced.myshopify.com',
        name: 'Shipping quote test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Quote',
            allocation: 50,
            config: {
              strategy: 'carrier_quote',
              profile_id: 'gid://shopify/DeliveryProfile/999',
              execution_hint: 'carrier_service',
              metadata: {
                quote_provider: 'static_rate',
                quote_amount: 12.5,
              },
            },
          },
        ],
      },
      shopDomain: 'advanced.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const action = result.execution_result.actions[0];
    expect(action.execution_adapter).toBe('carrier_service');
    expect(action.status).toBe('created');
    expect(action.details?.provider).toBe('static_rate');
    expect(action.details?.callback_url).toContain('require_assignment=1');
    expect(action.details?.callback_url).toContain('strategy=carrier_quote');
  });

  it('cleans up stale managed shipping resources on apply', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'advanced.myshopify.com',
          plan: { displayName: 'Advanced Shopify', shopifyPlus: false },
        },
      },
    });
    const restSpy = jest.spyOn(shopifyService, 'requestAdminRest');
    restSpy
      .mockResolvedValueOnce({
        carrier_services: [],
      })
      .mockResolvedValueOnce({
        carrier_service: {
          id: 205,
          name: 'RipX Shipping Carrier test-6 Variant Live',
          callback_url:
            'https://ripx.example.com/api/track/shipping-carrier-rates?test_id=test-6&variant_index=1&strategy=flat_rate&amount=7.00',
          service_discovery: true,
        },
      })
      .mockResolvedValueOnce({});

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-6',
        shop_domain: 'advanced.myshopify.com',
        name: 'Shipping cleanup test',
        type: 'shipping',
        variants: [
          {
            name: 'Old Variant',
            allocation: 50,
            config: {
              strategy: 'control',
              metadata: {
                shipping_resources: [
                  {
                    resource_type: 'carrier_service',
                    id: '101',
                    title: 'Old carrier',
                    active: true,
                  },
                ],
              },
            },
          },
          {
            name: 'Variant Live',
            allocation: 50,
            config: { strategy: 'flat_rate', amount: 7 },
          },
        ],
      },
      shopDomain: 'advanced.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    expect(result.cleanup_result[0]).toMatchObject({
      variant_index: 0,
      cleaned_count: 1,
      cleared_all: true,
    });
    expect(result.persisted_variants[0].config.metadata.shipping_resources).toEqual([]);
    expect(restSpy).toHaveBeenLastCalledWith(
      'advanced.myshopify.com',
      'token',
      expect.objectContaining({
        method: 'DELETE',
        path: 'carrier_services/101.json',
      })
    );
  });

  it('blocks apply when another running shipping test has active managed resources', async () => {
    getTestsByShop.mockResolvedValueOnce([
      {
        id: 'other-test',
        name: 'Other shipping test',
        type: 'shipping',
        variants: [
          {
            name: 'Variant B',
            config: {
              metadata: {
                shipping_resources: [{ resource_type: 'carrier_service', id: '999' }],
              },
            },
          },
        ],
      },
    ]);
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy.mockResolvedValueOnce({
      data: {
        shop: {
          id: 'shop-1',
          myshopifyDomain: 'demo.myshopify.com',
          plan: { displayName: 'Advanced Shopify', shopifyPlus: false },
        },
      },
    });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-7',
        shop_domain: 'demo.myshopify.com',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: { strategy: 'flat_rate', amount: 6.5 },
          },
        ],
      },
      shopDomain: 'demo.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    expect(result.execution_result.summary.conflict_count).toBe(1);
    expect(result.execution_result.actions[0].status).toBe('manual_required');
  });

  it('dedupes duplicate delivery customizations by title', async () => {
    const spy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    spy.mockResolvedValueOnce({
      data: {
        deliveryCustomizations: {
          edges: [
            {
              node: {
                id: 'dc-old',
                title: 'RipX Shipping Delivery 131bdc89 Variant A',
                enabled: false,
              },
            },
            {
              node: {
                id: 'dc-keep',
                title: 'RipX Shipping Delivery 131bdc89 Variant A',
                enabled: true,
              },
            },
            { node: { id: 'dc-other', title: 'Some other customization', enabled: true } },
          ],
        },
      },
    });

    const dryRun = await dedupeDeliveryCustomizationsForVariant({
      shopDomain: 'demo.myshopify.com',
      accessToken: 'token',
      customizationTitle: 'RipX Shipping Delivery 131bdc89 Variant A',
      apply: false,
    });
    expect(dryRun.duplicate_count).toBe(2);
    expect(dryRun.kept_id).toBe('dc-keep');
    expect(dryRun.deleted_ids).toEqual(['dc-old']);
    expect(dryRun.dry_run).toBe(true);
  });

  it('deletes duplicate delivery customizations in apply mode', async () => {
    const spy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    spy
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizations: {
            edges: [
              {
                node: {
                  id: 'dc-old',
                  title: 'RipX Shipping Delivery 131bdc89 Variant A',
                  enabled: false,
                },
              },
              {
                node: {
                  id: 'dc-keep',
                  title: 'RipX Shipping Delivery 131bdc89 Variant A',
                  enabled: true,
                },
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: { deliveryCustomizationDelete: { deletedId: 'dc-old', userErrors: [] } },
      });

    const applied = await dedupeDeliveryCustomizationsForVariant({
      shopDomain: 'demo.myshopify.com',
      accessToken: 'token',
      customizationTitle: 'RipX Shipping Delivery 131bdc89 Variant A',
      apply: true,
    });
    expect(applied.kept_id).toBe('dc-keep');
    expect(applied.deleted_ids).toEqual(['dc-old']);
    expect(applied.dry_run).toBe(false);
  });

  it('applies hide-only delivery customization without replacement carrier gates', async () => {
    const graphSpy = jest.spyOn(shopifyService, 'requestAdminGraphql');
    graphSpy
      .mockResolvedValueOnce({
        data: {
          shop: {
            id: 'shop-1',
            myshopifyDomain: 'plus.myshopify.com',
            plan: { displayName: 'Shopify Plus', shopifyPlus: true },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'fn-delivery-1',
                title: 'RipX Delivery Customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({ data: { deliveryCustomizations: { edges: [] } } })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/99',
              title: 'RipX Shipping Delivery test-hide-only Variant A',
              enabled: true,
            },
            userErrors: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          metafieldsSet: {
            metafields: [{ id: 'gid://shopify/Metafield/99' }],
            userErrors: [],
          },
        },
      });

    const result = await executeShippingTestPlan({
      test: {
        id: 'test-hide-only',
        name: 'Hide only shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'carrier_quote',
              execution_hint: 'delivery_customization',
              shipping_display_mode: 'add_preview_method',
              delivery_method_names: ['Standard', 'Express'],
              delivery_action: 'hide',
              rates: [],
            },
          },
        ],
      },
      shopDomain: 'plus.myshopify.com',
      accessToken: 'token',
      apply: true,
      variantIndex: 1,
    });

    const dcAction = result.execution_result.actions.find(
      action => action.execution_adapter === 'delivery_customization'
    );
    expect(dcAction).toBeTruthy();
    expect(dcAction.status).toBe('created');
    expect(dcAction.details?.config?.variant_rules[0]).toMatchObject({
      action: 'hide',
      method_names: ['Standard', 'Express'],
      skip_replacement_presence_gate: true,
      require_present_method_names: [],
      protected_method_codes: [],
    });
  });
});
