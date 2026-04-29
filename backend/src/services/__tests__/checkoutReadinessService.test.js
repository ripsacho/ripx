jest.mock('../shopifyService', () => ({
  requestAdminGraphql: jest.fn(),
}));

const originalEnv = { ...process.env };

describe('checkoutReadinessService', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    const shopifyService = require('../shopifyService');
    shopifyService.requestAdminGraphql.mockReset();
    jest.resetModules();
  });

  function setShopifyEnv() {
    process.env.SHOPIFY_API_KEY = 'test-key';
    process.env.SHOPIFY_API_SECRET = 'test-secret';
    process.env.SHOPIFY_SCOPES = 'read_products';
  }

  it('marks pricing readiness blocked when direct price override is unavailable', async () => {
    process.env.APP_URL = 'https://api.example.com';
    setShopifyEnv();

    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-price-1',
        name: 'Price test',
        type: 'price',
        status: 'draft',
        variants: [{ id: 'control', name: 'Control', config: {} }],
      },
      shopDomain: 'store.myshopify.com',
      accessToken: '',
      shopifyFunctions: [
        {
          id: 'gid://shopify/ShopifyFunction/1',
          title: 'RipX checkout discount',
          apiType: 'product_discounts',
        },
      ],
      shopifyCartTransforms: [],
      cartTransformsLookupStatus: 'ok',
      extensionConfig: {
        source: 'present',
        contents:
          "export const RIPX_PRICE_RESOLVE_BATCH_URL = 'https://api.example.com/api/track/price-resolve-batch';\n" +
          "export const RIPX_CHECKOUT_PRICE_SECRET = '';\n",
      },
      checkoutMethodCapabilities: {
        directPriceOverrideAvailable: false,
        cartTransformFunctionAvailable: false,
        cartTransformInstalled: false,
      },
    });

    expect(readiness.template_key).toBe('pricing');
    expect(readiness.summary.status).toBe('blocked');
    expect(readiness.capabilities.direct_price_override.level).toBe('blocked');
    expect(
      readiness.checks.find(item => item.id === 'pricing_direct_price_override_ready')?.ok
    ).toBe(false);
  });

  it('allows pricing readiness with warning when cart transform install lookup is uncertain', async () => {
    process.env.APP_URL = 'https://api.example.com';
    setShopifyEnv();

    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-price-scope-missing',
        name: 'Price test',
        type: 'price',
        status: 'draft',
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: { priceMode: 'fixed', price: 19.99 },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      accessToken: 'token',
      shopifyFunctions: [
        {
          id: 'gid://shopify/ShopifyFunction/1',
          title: 'RipX cart transform',
          apiType: 'cart_transform',
        },
      ],
      shopifyCartTransforms: null,
      cartTransformsLookupStatus: 'scope_missing',
      extensionConfig: {
        source: 'present',
        contents:
          "export const RIPX_PRICE_RESOLVE_BATCH_URL = 'https://api.example.com/api/track/price-resolve-batch';\n" +
          "export const RIPX_CHECKOUT_PRICE_SECRET = '';\n",
      },
      checkoutMethodCapabilities: {
        directPriceOverrideAvailable: false,
        cartTransformFunctionAvailable: true,
        cartTransformInstalled: null,
        cartTransformInstallCheckStatus: 'scope_missing',
        source: 'shopify_admin',
      },
    });

    const directPriceCheck = readiness.checks.find(
      item => item.id === 'pricing_direct_price_override_ready'
    );
    expect(readiness.summary.status).toBe('needs_attention');
    expect(readiness.capabilities.direct_price_override.level).toBe('needs_attention');
    expect(directPriceCheck?.ok).toBe(false);
    expect(directPriceCheck?.severity).toBe('warning');
  });

  it('flags checkout ui extension sync drift', async () => {
    process.env.APP_URL = 'https://app.ripx.com';
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'shared-secret';
    setShopifyEnv();

    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-checkout-1',
        name: 'Checkout block test',
        type: 'checkout',
        goal: { checkout_phase: 'experience' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: {
              checkout_sections: [
                {
                  type: 'hero_notice',
                  enabled: true,
                  props: {
                    title: 'Checkout with confidence',
                    message: 'Secure payment and free returns.',
                    cta_kind: 'track',
                    cta_label: 'Continue securely',
                  },
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      checkoutUiConfig: {
        source: 'present',
        contents: `
          export const RIPX_CHECKOUT_ASSIGNMENT_URL = 'https://old.example.com/api/track/checkout-assignment';
          export const RIPX_CHECKOUT_CONVERSION_URL = 'https://old.example.com/api/track/checkout-conversion';
          export const RIPX_CHECKOUT_PRICE_SECRET = 'wrong-secret';
          export const RIPX_CHECKOUT_UI_TEST_ID = 'other-test';
          export const RIPX_CHECKOUT_UI_SHOP_DOMAIN = 'other-store.myshopify.com';
        `,
      },
    });

    expect(readiness.template_key).toBe('checkout');
    expect(readiness.summary.status).toBe('needs_attention');
    expect(readiness.capabilities.checkout_ui_extension.level).toBe('needs_attention');
    expect(readiness.checks.find(item => item.id === 'checkout_ui_assignment_url_synced')?.ok).toBe(
      false
    );
    expect(readiness.checks.find(item => item.id === 'checkout_ui_secret_synced')?.ok).toBe(false);
  });

  it('blocks checkout experience readiness when no renderable checkout sections are configured', async () => {
    process.env.APP_URL = 'https://app.ripx.com';
    setShopifyEnv();

    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-checkout-empty',
        name: 'Checkout block test',
        type: 'checkout',
        goal: { checkout_phase: 'experience' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: {
              checkout_sections: [
                {
                  type: 'hero_notice',
                  enabled: true,
                  props: {
                    title: '',
                    message: '',
                    cta_kind: 'none',
                  },
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      checkoutUiConfig: {
        source: 'present',
        contents: `
          export const RIPX_CHECKOUT_ASSIGNMENT_URL = 'https://app.ripx.com/api/track/checkout-assignment';
          export const RIPX_CHECKOUT_CONVERSION_URL = 'https://app.ripx.com/api/track/checkout-conversion';
          export const RIPX_CHECKOUT_PRICE_SECRET = '';
          export const RIPX_CHECKOUT_UI_TEST_ID = 'test-checkout-empty';
          export const RIPX_CHECKOUT_UI_SHOP_DOMAIN = 'store.myshopify.com';
        `,
      },
    });

    expect(readiness.summary.status).toBe('blocked');
    expect(readiness.capabilities.checkout_experience_sections.level).toBe('blocked');
    expect(
      readiness.checks.find(item => item.id === 'checkout_experience_variants_configured')?.ok
    ).toBe(false);
  });

  it('reports checkout experience readiness as ready when renderable sections are configured', async () => {
    process.env.APP_URL = 'https://app.ripx.com';
    setShopifyEnv();

    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-checkout-sections',
        name: 'Checkout block test',
        type: 'checkout',
        goal: { checkout_phase: 'experience' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: {
              checkout_sections: [
                {
                  type: 'hero_notice',
                  enabled: true,
                  props: {
                    title: 'Checkout with confidence',
                    message: 'Secure payment and free returns.',
                    cta_kind: 'track',
                    cta_label: 'Continue securely',
                  },
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      checkoutUiConfig: {
        source: 'present',
        contents: `
          export const RIPX_CHECKOUT_ASSIGNMENT_URL = 'https://app.ripx.com/api/track/checkout-assignment';
          export const RIPX_CHECKOUT_CONVERSION_URL = 'https://app.ripx.com/api/track/checkout-conversion';
          export const RIPX_CHECKOUT_PRICE_SECRET = '';
          export const RIPX_CHECKOUT_UI_TEST_ID = 'test-checkout-sections';
          export const RIPX_CHECKOUT_UI_SHOP_DOMAIN = 'store.myshopify.com';
        `,
      },
    });

    expect(readiness.summary.status).toBe('ready');
    expect(readiness.capabilities.checkout_experience_sections.level).toBe('ready');
    expect(readiness.sources.checkout_experience.renderable_section_count).toBeGreaterThanOrEqual(
      1
    );
  });

  it('reports shipping readiness as ready with a prepared execution plan', async () => {
    process.env.APP_URL = 'https://api.example.com';
    setShopifyEnv();

    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-shipping-1',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { id: 'control', name: 'Control', config: { strategy: 'control' } },
          { id: 'variant-a', name: 'Variant A', config: { strategy: 'flat_rate' } },
        ],
      },
      shopDomain: 'store.myshopify.com',
      accessToken: 'token',
      shippingCapabilityReport: {
        recommended_execution_path: 'carrier_service',
      },
      shippingExecutionPlan: {
        plan_status: 'ready',
        variants: [
          {
            id: 'variant-a',
            actionable: true,
            execution_adapter: 'carrier_service',
            execution_mode: 'automatic',
          },
        ],
      },
    });

    expect(readiness.template_key).toBe('shipping');
    expect(readiness.summary.status).toBe('ready');
    expect(readiness.capabilities.shipping_execution.level).toBe('ready');
    expect(readiness.capabilities.shipping_execution.execution_mix.automatic).toBe(1);
    expect(readiness.checks.find(item => item.id === 'shipping_execution_plan_ready')?.ok).toBe(
      true
    );
  });

  it('treats payment-method checkout tests as a first-class readiness phase', async () => {
    setShopifyEnv();

    const shopifyService = require('../shopifyService');
    shopifyService.requestAdminGraphql.mockResolvedValue({
      data: {
        paymentCustomizations: {
          edges: [
            {
              node: {
                id: 'gid://shopify/PaymentCustomization/44',
                title: 'RipX Payment methods · Payment test · test-pay',
                enabled: true,
                functionId: 'gid://shopify/ShopifyFunction/77',
              },
            },
          ],
        },
      },
    });
    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-payment-xyz',
        name: 'Payment test',
        type: 'checkout',
        goal: { checkout_phase: 'payment_method' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: { payment_method_names: ['Cash on Delivery'], payment_action: 'hide' },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      accessToken: 'token',
      shopifyFunctions: [
        {
          id: 'gid://shopify/ShopifyFunction/77',
          title: 'RipX payment customization',
          apiType: 'PAYMENT_CUSTOMIZATION',
        },
      ],
    });

    expect(readiness.template_key).toBe('checkout');
    expect(readiness.summary.status).toBe('ready');
    expect(readiness.capabilities.payment_customization.level).toBe('ready');
    expect(readiness.checks.find(item => item.id === 'payment_method_function_detected')?.ok).toBe(
      true
    );
    expect(
      readiness.checks.find(item => item.id === 'payment_method_customization_applied')?.ok
    ).toBe(true);
  });

  it('blocks payment-method readiness until the Shopify customization has been applied', async () => {
    setShopifyEnv();

    const shopifyService = require('../shopifyService');
    shopifyService.requestAdminGraphql.mockResolvedValue({
      data: {
        paymentCustomizations: {
          edges: [],
        },
      },
    });
    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-payment-missing',
        name: 'Payment test',
        type: 'checkout',
        goal: { checkout_phase: 'payment_method' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: { payment_method_names: ['Cash on Delivery'], payment_action: 'hide' },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      accessToken: 'token',
      shopifyFunctions: [
        {
          id: 'gid://shopify/ShopifyFunction/77',
          title: 'RipX payment customization',
          apiType: 'PAYMENT_CUSTOMIZATION',
        },
      ],
    });

    expect(readiness.summary.status).toBe('blocked');
    expect(readiness.capabilities.payment_customization.level).toBe('needs_attention');
    expect(
      readiness.checks.find(item => item.id === 'payment_method_customization_applied')?.ok
    ).toBe(false);
  });

  it('blocks checkout experience readiness when collection-fed sections are configured without read_products scope', async () => {
    process.env.APP_URL = 'https://app.ripx.com';
    process.env.SHOPIFY_API_KEY = 'test-key';
    process.env.SHOPIFY_API_SECRET = 'test-secret';
    process.env.SHOPIFY_SCOPES = 'read_orders,read_content';

    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-checkout-collection-scope',
        name: 'Checkout collection test',
        type: 'checkout',
        goal: { checkout_phase: 'experience' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: {
              checkout_sections: [
                {
                  type: 'product_list',
                  enabled: true,
                  props: {
                    product_source_mode: 'collection',
                    product_source_collections: [
                      {
                        id: 'gid://shopify/Collection/123',
                        title: 'Summer',
                        handle: 'summer',
                      },
                    ],
                    product_source_limit: '2',
                  },
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      checkoutUiConfig: {
        source: 'present',
        contents: `
          export const RIPX_CHECKOUT_ASSIGNMENT_URL = 'https://app.ripx.com/api/track/checkout-assignment';
          export const RIPX_CHECKOUT_CONVERSION_URL = 'https://app.ripx.com/api/track/checkout-conversion';
          export const RIPX_CHECKOUT_PRICE_SECRET = '';
          export const RIPX_CHECKOUT_UI_TEST_ID = 'test-checkout-collection-scope';
          export const RIPX_CHECKOUT_UI_SHOP_DOMAIN = 'store.myshopify.com';
        `,
      },
    });

    expect(readiness.summary.status).toBe('blocked');
    expect(
      readiness.checks.find(item => item.id === 'checkout_collection_scope_configured')?.ok
    ).toBe(false);
  });

  it('passes collection scope check when read_products is configured for collection-fed checkout', async () => {
    process.env.APP_URL = 'https://app.ripx.com';
    process.env.SHOPIFY_API_KEY = 'test-key';
    process.env.SHOPIFY_API_SECRET = 'test-secret';
    process.env.SHOPIFY_SCOPES = 'read_products';

    const { buildTestCheckoutReadiness } = require('../checkoutReadinessService');
    const readiness = await buildTestCheckoutReadiness({
      test: {
        id: 'test-checkout-collection-ok',
        name: 'Checkout collection test',
        type: 'checkout',
        goal: { checkout_phase: 'experience' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: {
              checkout_sections: [
                {
                  type: 'product_list',
                  enabled: true,
                  props: {
                    product_source_mode: 'collection',
                    product_source_collections: [
                      {
                        id: 'gid://shopify/Collection/123',
                        title: 'Summer',
                        handle: 'summer',
                      },
                    ],
                    product_source_limit: '2',
                  },
                },
              ],
            },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      checkoutUiConfig: {
        source: 'present',
        contents: `
          export const RIPX_CHECKOUT_ASSIGNMENT_URL = 'https://app.ripx.com/api/track/checkout-assignment';
          export const RIPX_CHECKOUT_CONVERSION_URL = 'https://app.ripx.com/api/track/checkout-conversion';
          export const RIPX_CHECKOUT_PRICE_SECRET = '';
          export const RIPX_CHECKOUT_UI_TEST_ID = 'test-checkout-collection-ok';
          export const RIPX_CHECKOUT_UI_SHOP_DOMAIN = 'store.myshopify.com';
        `,
      },
    });

    expect(
      readiness.checks.find(item => item.id === 'checkout_collection_scope_configured')?.ok
    ).toBe(true);
    expect(readiness.summary.status).toBe('ready');
  });
});
