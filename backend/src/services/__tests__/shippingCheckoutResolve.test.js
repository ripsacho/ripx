const {
  resolveShippingCheckoutGroupDiscount,
  resolveCheckoutShippingBatchForDomain,
} = require('../shippingCheckoutResolve');
const { signPriceAssignment } = require('../../utils/priceAssignmentSignature');

describe('shippingCheckoutResolve', () => {
  const originalEnv = { ...process.env };
  const baseTest = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Shipping threshold test',
    type: 'shipping',
    status: 'running',
    variants: [
      { id: 'control', name: 'Control', config: { strategy: 'control' } },
      {
        id: 'variant-b',
        name: 'Variant B',
        config: { strategy: 'threshold_free_shipping', threshold_amount: 80 },
      },
    ],
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT: 'true',
      RIPX_CHECKOUT_PRICE_SECRET: 'shipping-secret',
    };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  function buildSignature(variantId, issuedAtMs = Date.now()) {
    const userId = 'user-1';
    return {
      userId,
      issuedAtMs: String(issuedAtMs),
      signature: signPriceAssignment({
        testId: baseTest.id,
        variantId,
        userId,
        shopDomain: 'demo.myshopify.com',
        issuedAtMs,
      }),
    };
  }

  it('applies free shipping when threshold is met', () => {
    const sig = buildSignature('variant-b');
    const result = resolveShippingCheckoutGroupDiscount({
      test: baseTest,
      assignmentVariantId: 'variant-b',
      cartPresentmentTotal: '100.00',
      deliveryGroupId: 'gid://shopify/CartDeliveryGroup/1',
      deliveryOptionHandles: ['standard'],
      shopDomain: 'demo.myshopify.com',
      assignmentSignature: sig.signature,
      assignmentIssuedAtMs: sig.issuedAtMs,
      assignmentUserId: sig.userId,
    });

    expect(result).toMatchObject({
      applies: true,
      delivery_group_id: 'gid://shopify/CartDeliveryGroup/1',
      value_type: 'percentage',
      value: '100',
      strategy: 'threshold_free_shipping',
    });
  });

  it('returns threshold_not_met when cart total is too low', () => {
    const sig = buildSignature('variant-b');
    const result = resolveShippingCheckoutGroupDiscount({
      test: baseTest,
      assignmentVariantId: 'variant-b',
      cartPresentmentTotal: '40.00',
      deliveryGroupId: 'gid://shopify/CartDeliveryGroup/1',
      shopDomain: 'demo.myshopify.com',
      assignmentSignature: sig.signature,
      assignmentIssuedAtMs: sig.issuedAtMs,
      assignmentUserId: sig.userId,
    });

    expect(result).toMatchObject({
      applies: false,
      reason: 'threshold_not_met',
    });
  });

  it('returns fixed amount for discount_fixed strategy', () => {
    const fixedTest = {
      ...baseTest,
      variants: [
        { id: 'control', name: 'Control', config: { strategy: 'control' } },
        {
          id: 'variant-c',
          name: 'Variant C',
          config: { strategy: 'discount_fixed', amount: 5.5, execution_hint: 'discount_function' },
        },
      ],
    };
    const ts = Date.now();
    const sig = {
      userId: 'user-2',
      issuedAtMs: String(ts),
      signature: signPriceAssignment({
        testId: fixedTest.id,
        variantId: 'variant-c',
        userId: 'user-2',
        shopDomain: 'demo.myshopify.com',
        issuedAtMs: ts,
      }),
    };
    const result = resolveShippingCheckoutGroupDiscount({
      test: fixedTest,
      assignmentVariantId: 'variant-c',
      cartPresentmentTotal: '50.00',
      deliveryGroupId: 'gid://shopify/CartDeliveryGroup/2',
      shopDomain: 'demo.myshopify.com',
      assignmentSignature: sig.signature,
      assignmentIssuedAtMs: sig.issuedAtMs,
      assignmentUserId: sig.userId,
    });

    expect(result).toMatchObject({
      applies: true,
      value_type: 'fixed_amount',
      value: '5.50',
      strategy: 'discount_fixed',
    });
  });

  it('requires selected products when shipping test uses product-qualified scope', () => {
    const sig = buildSignature('variant-b');
    const productScopedTest = {
      ...baseTest,
      target_type: 'product',
      target_ids: ['gid://shopify/Product/200'],
    };
    const result = resolveShippingCheckoutGroupDiscount({
      test: productScopedTest,
      assignmentVariantId: 'variant-b',
      cartPresentmentTotal: '100.00',
      deliveryGroupId: 'gid://shopify/CartDeliveryGroup/1',
      deliveryGroupProductIds: ['gid://shopify/Product/100'],
      shopDomain: 'demo.myshopify.com',
      assignmentSignature: sig.signature,
      assignmentIssuedAtMs: sig.issuedAtMs,
      assignmentUserId: sig.userId,
    });

    expect(result).toMatchObject({
      applies: false,
      reason: 'product_not_in_test',
    });
  });

  it('blocks excluded products for shipping checkout resolution', () => {
    const sig = buildSignature('variant-b');
    const excludedTest = {
      ...baseTest,
      target_type: 'all-products',
      segments: {
        excluded_product_ids: ['gid://shopify/Product/100'],
      },
    };
    const result = resolveShippingCheckoutGroupDiscount({
      test: excludedTest,
      assignmentVariantId: 'variant-b',
      cartPresentmentTotal: '100.00',
      deliveryGroupId: 'gid://shopify/CartDeliveryGroup/1',
      deliveryGroupProductIds: ['gid://shopify/Product/100'],
      shopDomain: 'demo.myshopify.com',
      assignmentSignature: sig.signature,
      assignmentIssuedAtMs: sig.issuedAtMs,
      assignmentUserId: sig.userId,
    });

    expect(result).toMatchObject({
      applies: false,
      reason: 'product_not_in_test',
    });
  });

  it('rejects missing assignment signature when strict mode is enabled', () => {
    const result = resolveShippingCheckoutGroupDiscount({
      test: baseTest,
      assignmentVariantId: 'variant-b',
      cartPresentmentTotal: '100.00',
      deliveryGroupId: 'gid://shopify/CartDeliveryGroup/1',
      shopDomain: 'demo.myshopify.com',
    });

    expect(result).toMatchObject({
      applies: false,
      reason: 'missing_assignment_signature',
    });
  });

  it('resolves a batch using getTestsByIds', async () => {
    const sig = buildSignature('variant-b');
    const results = await resolveCheckoutShippingBatchForDomain(
      'demo.myshopify.com',
      [
        {
          delivery_group_id: 'gid://shopify/CartDeliveryGroup/1',
          test_id: baseTest.id,
          product_ids: ['gid://shopify/Product/100'],
          assignment_variant: 'variant-b',
          assignment_sig: sig.signature,
          assignment_ts: sig.issuedAtMs,
          assignment_user: sig.userId,
          cart_total: '100.00',
          handles: ['standard'],
        },
      ],
      null,
      jest.fn().mockResolvedValue(new Map([[baseTest.id, baseTest]]))
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      applies: true,
      delivery_group_id: 'gid://shopify/CartDeliveryGroup/1',
      strategy: 'threshold_free_shipping',
    });
  });
});
