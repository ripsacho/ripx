const shopifyService = require('../shopifyService');
const { executeShippingTestPlan } = require('../shippingAutoExecutionService');
const { getTestsByShop } = require('../../models/test');

jest.mock('../../models/test', () => ({
  getTestsByShop: jest.fn().mockResolvedValue([]),
}));

describe('shippingAutoExecutionService', () => {
  const originalScopes = process.env.SHOPIFY_SCOPES;
  const originalCarrierCallbackUrl = process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL;
  const originalAppUrl = process.env.APP_URL;

  beforeEach(() => {
    jest.restoreAllMocks();
    getTestsByShop.mockResolvedValue([]);
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
    expect(action.details?.callback_url).toContain('amount=4.00');
    expect(action.details?.callback_url).toContain('shop_domain=plus.myshopify.com');
    expect(action.details?.callback_url).toContain('shipping_display_mode=add_preview_method');
    expect(action.details?.callback_url).toContain('preview_label_prefix=RipX+Preview');
    expect(action.details?.callback_url).toContain('rates_count=2');
    expect(action.details?.callback_url).toContain('rates_json=');
    const callbackUrl = new URL(action.details?.callback_url);
    expect(callbackUrl.searchParams.get('cfg_rev')).toBe('2026-06-01T23:00:00.000Z');
    const ratesJson = JSON.parse(callbackUrl.searchParams.get('rates_json'));
    expect(ratesJson).toEqual([
      expect.objectContaining({
        name: 'Economy',
        description: 'Budget shipping',
        delivery_promise: expect.objectContaining({
          mode: 'preset',
          preset: '2_3_business_days',
        }),
      }),
      expect.objectContaining({
        name: 'Express',
        description: 'Fast tracked shipping',
        min_delivery_date: '2026-07-04',
        max_delivery_date: '2026-07-05',
      }),
    ]);
    expect(restSpy).toHaveBeenCalledTimes(2);
  });

  it('creates a fresh carrier service when shipping config revision changes', async () => {
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
          id: 202,
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
    expect(action.status).toBe('created');
    expect(action.details?.service?.id).toBe(202);
    expect(action.details?.callback_url).toContain('cfg_rev=new-revision');
    expect(action.details?.stale_revision_cleanup).toEqual([
      expect.objectContaining({
        ok: true,
        status: 'deleted',
      }),
    ]);
    expect(restSpy).toHaveBeenCalledWith(
      'plus.myshopify.com',
      'token',
      expect.objectContaining({
        method: 'POST',
        path: 'carrier_services.json',
      })
    );
    expect(restSpy).toHaveBeenCalledWith(
      'plus.myshopify.com',
      'token',
      expect.objectContaining({
        method: 'DELETE',
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
        data: { deliveryProfiles: { edges: [] } },
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
      require_present_method_names: [],
      require_present_method_codes: ['ripx_replace_standard_delivery'],
      protected_method_codes: ['ripx_replace_standard_delivery'],
      hide_when_unassigned_method_names: [],
      hide_when_unassigned_method_codes: ['ripx_replace_standard_delivery'],
    });
    expect(actions[0].details?.callback_url).not.toContain('require_assignment=');
    expect(result.persisted_variants[1].config.metadata.shipping_resources).toHaveLength(2);
    expect(restSpy).toHaveBeenCalledTimes(2);
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
      require_present_method_names: [],
      require_present_method_codes: ['ripx_replace_standard_delivery'],
      protected_method_codes: ['ripx_replace_standard_delivery'],
      hide_when_unassigned_method_codes: ['ripx_replace_standard_delivery'],
    });
    expect(restSpy).toHaveBeenCalledTimes(2);
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
    expect(action.details?.callback_url).toContain('quote_provider=static_rate');
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
});
