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
              strategy: 'flat_rate',
              amount: 5,
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
