jest.mock('../shopifyService', () => ({
  requestAdminGraphql: jest.fn(),
}));

const shopifyService = require('../shopifyService');
const {
  buildCheckoutCustomizationConfig,
  ensureCheckoutCustomizationDeployment,
  isCheckoutCustomizationPhase,
} = require('../checkoutCustomizationDeploymentService');

describe('checkoutCustomizationDeploymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recognizes payment and delivery checkout phases', () => {
    expect(
      isCheckoutCustomizationPhase({ type: 'checkout', goal: { checkout_phase: 'payment_method' } })
    ).toBe(true);
    expect(
      isCheckoutCustomizationPhase({
        type: 'checkout',
        goal: { checkout_phase: 'delivery_method' },
      })
    ).toBe(true);
    expect(
      isCheckoutCustomizationPhase({ type: 'checkout', goal: { checkout_phase: 'experience' } })
    ).toBe(false);
    expect(
      isCheckoutCustomizationPhase({ type: 'offer', goal: { checkout_phase: 'payment_method' } })
    ).toBe(false);
  });

  it('builds payment customization config from actionable non-control variants', () => {
    const config = buildCheckoutCustomizationConfig({
      id: 'test-1',
      name: 'Payment methods test',
      type: 'checkout',
      goal: { checkout_phase: 'payment_method' },
      variants: [
        { id: 'control', name: 'Control', config: {} },
        {
          id: 'variant-a',
          name: 'Variant A',
          config: {
            payment_method_names: ['Cash on Delivery', 'PayPal'],
            payment_action: 'hide',
          },
        },
      ],
    });

    expect(config.phase).toBe('payment_method');
    expect(config.test_id).toBe('test-1');
    expect(config.assignment_keys.variant).toBe('_ripx_variant');
    expect(config.variant_rules).toEqual([
      {
        variant_id: 'variant-a',
        variant_name: 'Variant A',
        action: 'hide',
        method_names: ['Cash on Delivery', 'PayPal'],
        rename_to: '',
      },
    ]);
  });

  it('throws when a deployable checkout test has no actionable variants', () => {
    expect(() =>
      buildCheckoutCustomizationConfig({
        id: 'test-2',
        name: 'Broken test',
        type: 'checkout',
        goal: { checkout_phase: 'delivery_method' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          { id: 'variant-a', name: 'Variant A', config: {} },
        ],
      })
    ).toThrow(/At least one non-control variant/);
  });

  it('throws when rename action is missing a rename target', () => {
    expect(() =>
      buildCheckoutCustomizationConfig({
        id: 'test-rename',
        name: 'Broken rename test',
        type: 'checkout',
        goal: { checkout_phase: 'payment_method' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: {
              payment_method_names: ['Cash on Delivery'],
              payment_action: 'rename',
              payment_rename_to: '',
            },
          },
        ],
      })
    ).toThrow(/rename target is required/i);
  });

  it('supports dry-run deployment without creating resources', async () => {
    shopifyService.requestAdminGraphql
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'gid://shopify/ShopifyFunction/1',
                title: 'RipX payment customization',
                apiType: 'PAYMENT_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          paymentCustomizations: {
            edges: [],
          },
        },
      });

    const result = await ensureCheckoutCustomizationDeployment({
      test: {
        id: 'test-3',
        name: 'Checkout payment test',
        type: 'checkout',
        goal: { checkout_phase: 'payment_method' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-a',
            name: 'Variant A',
            config: {
              payment_method_names: ['Cash on Delivery'],
              payment_action: 'hide',
            },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      accessToken: 'token',
      apply: false,
    });

    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(true);
    expect(result.status).toBe('would_create');
    expect(result.function.id).toBe('gid://shopify/ShopifyFunction/1');
    expect(shopifyService.requestAdminGraphql).toHaveBeenCalledTimes(2);
  });

  it('creates and configures a delivery customization in apply mode', async () => {
    shopifyService.requestAdminGraphql
      .mockResolvedValueOnce({
        data: {
          shopifyFunctions: {
            nodes: [
              {
                id: 'gid://shopify/ShopifyFunction/2',
                title: 'RipX delivery customization',
                apiType: 'DELIVERY_CUSTOMIZATION',
              },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizations: {
            edges: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          deliveryCustomizationCreate: {
            deliveryCustomization: {
              id: 'gid://shopify/DeliveryCustomization/1',
              title: 'RipX Delivery methods · Checkout delivery test · test-4',
              enabled: true,
              functionId: 'gid://shopify/ShopifyFunction/2',
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

    const result = await ensureCheckoutCustomizationDeployment({
      test: {
        id: 'test-4',
        name: 'Checkout delivery test',
        type: 'checkout',
        goal: { checkout_phase: 'delivery_method' },
        variants: [
          { id: 'control', name: 'Control', config: {} },
          {
            id: 'variant-b',
            name: 'Variant B',
            config: {
              delivery_method_names: ['Standard Shipping'],
              delivery_action: 'rename',
              delivery_rename_to: 'Tracked standard shipping',
            },
          },
        ],
      },
      shopDomain: 'store.myshopify.com',
      accessToken: 'token',
      apply: true,
    });

    expect(result.ok).toBe(true);
    expect(result.dry_run).toBe(false);
    expect(result.status).toBe('created');
    expect(result.customization.id).toBe('gid://shopify/DeliveryCustomization/1');
    expect(result.config.variant_rules[0].rename_to).toBe('Tracked standard shipping');
    expect(shopifyService.requestAdminGraphql).toHaveBeenCalledTimes(4);
  });
});
