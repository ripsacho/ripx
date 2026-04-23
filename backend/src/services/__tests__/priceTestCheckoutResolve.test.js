const {
  resolvePriceTestLineDiscount,
  resolveCheckoutPriceBatchForDomain,
} = require('../priceTestCheckoutResolve');
const { signPriceAssignment } = require('../../utils/priceAssignmentSignature');

describe('priceTestCheckoutResolve', () => {
  const originalEnv = { ...process.env };
  const baseTest = {
    type: 'price',
    status: 'running',
    target_type: 'product',
    target_ids: ['gid://shopify/Product/111'],
    variants: [
      {
        id: 'var-b',
        name: 'Variant B',
        config: { priceMode: 'fixed', price: 19.99 },
      },
    ],
  };
  const baseOfferTest = {
    type: 'offer',
    status: 'running',
    target_type: 'product',
    target_ids: ['gid://shopify/Product/111'],
    variants: [
      {
        id: 'offer-a',
        name: 'Offer A',
        config: { discount_type: 'percent', discount_value: 10 },
      },
    ],
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it('returns discount when fixed price below line total', () => {
    const r = resolvePriceTestLineDiscount({
      test: baseTest,
      assignmentVariantId: 'var-b',
      productId: '111',
      variantId: null,
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(10, 2);
  });

  it('includes debug metadata when requested', () => {
    const r = resolvePriceTestLineDiscount({
      test: baseTest,
      assignmentVariantId: 'var-b',
      productId: '111',
      variantId: 'gid://shopify/ProductVariant/222',
      linePresentmentTotal: 29.99,
      quantity: 1,
      shopDomain: 'store.myshopify.com',
      debug: true,
    });
    expect(r.applies).toBe(true);
    expect(r.debug).toMatchObject({
      testId: null,
      testType: 'price',
      testStatus: 'running',
      targetType: 'product',
      assignmentVariantId: 'var-b',
      productId: '111',
      variantId: 'gid://shopify/ProductVariant/222',
      shopDomain: 'store.myshopify.com',
      matchedVariantId: 'var-b',
      matchedVariantName: 'Variant B',
      priceMode: 'fixed',
      resultReason: null,
      applies: true,
      discountDecimal: '10.00',
      targetLineDecimal: '19.99',
    });
  });

  it('rejects draft test at checkout unless env allows draft price tests', () => {
    const draftTest = { ...baseTest, status: 'draft' };
    const r = resolvePriceTestLineDiscount({
      test: draftTest,
      assignmentVariantId: 'var-b',
      productId: '111',
      variantId: null,
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('test_not_running');
  });

  it('allows draft test when RIPX_CHECKOUT_ALLOW_DRAFT_PRICE_TESTS=true', () => {
    process.env.RIPX_CHECKOUT_ALLOW_DRAFT_PRICE_TESTS = 'true';
    const draftTest = { ...baseTest, status: 'draft' };
    const r = resolvePriceTestLineDiscount({
      test: draftTest,
      assignmentVariantId: 'var-b',
      productId: '111',
      variantId: null,
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
  });

  it('does not apply for control mode', () => {
    const test = {
      ...baseTest,
      variants: [{ id: 'c', name: 'Control', config: { priceMode: 'control' } }],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'c',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('control_variant');
  });

  it('rejects product not in target_ids', () => {
    const r = resolvePriceTestLineDiscount({
      test: baseTest,
      assignmentVariantId: 'var-b',
      productId: '999',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('product_not_in_test');
  });

  it('includes debug reason for compare_at failures', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'percent', pricePercent: 10, priceBase: 'compare_at' },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 20,
      quantity: 1,
      debug: true,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('compare_at_unavailable');
    expect(r.debug).toMatchObject({
      priceMode: 'percent',
      priceBase: 'compare_at',
      useCompareAtBase: true,
      compareAtUnit: null,
      resultReason: 'compare_at_unavailable',
      applies: false,
    });
  });

  it('amount mode uses catalog from line', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'amount', priceDelta: -5 },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(5, 2);
  });

  it('auto application method keeps discount checkout for lower prices', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'amount', priceDelta: -5, priceApplicationMethod: 'auto' },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
      debug: true,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(5, 2);
    expect(r.debug).toMatchObject({
      configuredApplicationMethod: 'auto',
      resolvedApplicationMethod: 'discounted_checkout_price',
      canApplyDiscountFunction: true,
    });
  });

  it('auto application method resolves price increases to native variant price', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'amount', priceDelta: 5, priceApplicationMethod: 'auto' },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
      debug: true,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('auto_selected_native_variant_price');
    expect(r.debug).toMatchObject({
      configuredApplicationMethod: 'auto',
      resolvedApplicationMethod: 'native_variant_price',
      canApplyDiscountFunction: false,
    });
  });

  it('auto application method prefers direct price override for price increases when cart transform is available', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'amount', priceDelta: 5, priceApplicationMethod: 'auto' },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
      shopCapabilities: { directPriceOverrideAvailable: true },
      debug: true,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('auto_selected_direct_price_override');
    expect(r.debug).toMatchObject({
      configuredApplicationMethod: 'auto',
      resolvedApplicationMethod: 'direct_price_override',
      canApplyDiscountFunction: false,
    });
  });

  it('explicit direct price override skips discount-function application', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: {
            priceMode: 'fixed',
            price: 19.99,
            priceApplicationMethod: 'direct_price_override',
          },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
      debug: true,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('selected_direct_price_override');
    expect(r.debug).toMatchObject({
      configuredApplicationMethod: 'direct_price_override',
      resolvedApplicationMethod: 'direct_price_override',
      canApplyDiscountFunction: false,
    });
  });

  it('falls back to base mode when per-product override mode is incomplete', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: {
            priceMode: 'amount',
            priceDelta: -5,
            byProduct: {
              'gid://shopify/Product/111': {
                priceMode: 'fixed',
                priceBase: 'price',
              },
            },
          },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(5, 2);
  });

  it('applies root byVariant override when product override is absent', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: {
            priceMode: 'fixed',
            price: 24.99,
            byVariant: {
              222: {
                priceMode: 'fixed',
                price: 14.99,
              },
            },
          },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      variantId: 'gid://shopify/ProductVariant/222',
      linePresentmentTotal: 24.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(10, 2);
  });

  it('resolveCheckoutPriceBatchForDomain caches getTestById per test_id', async () => {
    const testUuid = '550e8400-e29b-41d4-a716-446655440000';
    const testRow = {
      id: testUuid,
      type: 'price',
      status: 'running',
      target_type: 'product',
      target_ids: ['gid://shopify/Product/111'],
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'fixed', price: 19.99 },
        },
      ],
    };
    let calls = 0;
    const getTestById = (id, domain) => {
      calls += 1;
      expect(domain).toBe('store.myshopify.com');
      expect(id).toBe(testUuid);
      return testRow;
    };

    const out = await resolveCheckoutPriceBatchForDomain(
      'store.myshopify.com',
      [
        {
          line_id: 'gid://shopify/CartLine/1',
          test_id: testUuid,
          assignment_variant: 'var-b',
          product_id: '111',
          line_total: 29.99,
          qty: 1,
        },
        {
          line_id: 'gid://shopify/CartLine/2',
          test_id: testUuid,
          assignment_variant: 'var-b',
          product_id: '111',
          line_total: 29.99,
          qty: 1,
        },
      ],
      getTestById
    );

    expect(calls).toBe(1);
    expect(out).toHaveLength(2);
    expect(out[0].line_id).toBe('gid://shopify/CartLine/1');
    expect(out[0].applies).toBe(true);
    expect(out[1].applies).toBe(true);
  });

  it('resolveCheckoutPriceBatchForDomain prefetches each unique test_id once (parallel-safe)', async () => {
    const u1 = '550e8400-e29b-41d4-a716-446655440001';
    const u2 = '550e8400-e29b-41d4-a716-446655440002';
    const u3 = '550e8400-e29b-41d4-a716-446655440003';
    const mkRow = (uuid, line) => ({
      line_id: line,
      test_id: uuid,
      assignment_variant: 'var-b',
      product_id: '111',
      line_total: 29.99,
      qty: 1,
    });
    const testRow = {
      type: 'price',
      status: 'running',
      target_type: 'product',
      target_ids: ['gid://shopify/Product/111'],
      variants: [{ id: 'var-b', name: 'Variant B', config: { priceMode: 'fixed', price: 19.99 } }],
    };
    let calls = 0;
    const getTestById = id => {
      calls += 1;
      expect([u1, u2, u3]).toContain(id);
      return { ...testRow, id };
    };

    const out = await resolveCheckoutPriceBatchForDomain(
      'store.myshopify.com',
      [mkRow(u1, 'L1'), mkRow(u2, 'L2'), mkRow(u3, 'L3')],
      getTestById
    );

    expect(calls).toBe(3);
    expect(out).toHaveLength(3);
    expect(out.every(r => r.applies)).toBe(true);
  });

  it('resolveCheckoutPriceBatchForDomain uses getTestsByIds for one DB-style round-trip when provided', async () => {
    const testUuid = '550e8400-e29b-41d4-a716-446655440099';
    const testRow = {
      id: testUuid,
      type: 'price',
      status: 'running',
      target_type: 'product',
      target_ids: ['gid://shopify/Product/111'],
      variants: [{ id: 'var-b', name: 'Variant B', config: { priceMode: 'fixed', price: 19.99 } }],
    };
    let getTestByIdCalls = 0;
    const getTestById = () => {
      getTestByIdCalls += 1;
      return testRow;
    };
    let batchIds = null;
    const getTestsByIds = (ids, dom) => {
      batchIds = ids;
      expect(dom).toBe('store.myshopify.com');
      expect(ids).toEqual([testUuid]);
      return new Map([[testUuid, testRow]]);
    };

    const out = await resolveCheckoutPriceBatchForDomain(
      'store.myshopify.com',
      [
        {
          line_id: 'gid://shopify/CartLine/9',
          test_id: testUuid,
          assignment_variant: 'var-b',
          product_id: '111',
          line_total: 29.99,
          qty: 1,
        },
      ],
      getTestById,
      getTestsByIds
    );

    expect(getTestByIdCalls).toBe(0);
    expect(batchIds).toEqual([testUuid]);
    expect(out).toHaveLength(1);
    expect(out[0].applies).toBe(true);
  });

  it('resolveCheckoutPriceBatchForDomain includes per-line debug metadata when requested', async () => {
    const testUuid = '550e8400-e29b-41d4-a716-446655440088';
    const testRow = {
      id: testUuid,
      type: 'price',
      status: 'running',
      target_type: 'product',
      target_ids: ['gid://shopify/Product/111'],
      variants: [{ id: 'var-b', name: 'Variant B', config: { priceMode: 'fixed', price: 19.99 } }],
    };
    const out = await resolveCheckoutPriceBatchForDomain(
      'store.myshopify.com',
      [
        {
          line_id: 'gid://shopify/CartLine/9',
          test_id: testUuid,
          assignment_variant: 'var-b',
          product_id: '111',
          line_total: 29.99,
          qty: 1,
        },
      ],
      () => testRow,
      undefined,
      { debug: true }
    );
    expect(out[0]).toMatchObject({
      line_id: 'gid://shopify/CartLine/9',
      applies: true,
      discountDecimal: '10.00',
      targetLineDecimal: '19.99',
      debug: {
        shopDomain: 'store.myshopify.com',
        testId: testUuid,
        assignmentVariantId: 'var-b',
        productId: '111',
        resultReason: null,
        applies: true,
      },
    });
  });

  it('resolveCheckoutPriceBatchForDomain prefers direct price override for auto premium paths when shop capability is provided', async () => {
    const testUuid = '550e8400-e29b-41d4-a716-446655440066';
    const testRow = {
      id: testUuid,
      type: 'price',
      status: 'running',
      target_type: 'product',
      target_ids: ['gid://shopify/Product/111'],
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'amount', priceDelta: 5, priceApplicationMethod: 'auto' },
        },
      ],
    };

    const out = await resolveCheckoutPriceBatchForDomain(
      'store.myshopify.com',
      [
        {
          line_id: 'gid://shopify/CartLine/66',
          test_id: testUuid,
          assignment_variant: 'var-b',
          product_id: '111',
          line_total: 29.99,
          qty: 1,
        },
      ],
      () => testRow,
      undefined,
      {
        debug: true,
        shopCapabilities: { directPriceOverrideAvailable: true },
      }
    );

    expect(out[0]).toMatchObject({
      line_id: 'gid://shopify/CartLine/66',
      applies: false,
      reason: 'auto_selected_direct_price_override',
      debug: {
        configuredApplicationMethod: 'auto',
        resolvedApplicationMethod: 'direct_price_override',
        canApplyDiscountFunction: false,
      },
    });
  });

  it('accepts type pricing like price', () => {
    const test = { ...baseTest, type: 'pricing' };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
  });

  it('applies percent offer discount for offer tests', () => {
    const r = resolvePriceTestLineDiscount({
      test: baseOfferTest,
      assignmentVariantId: 'offer-a',
      productId: '111',
      linePresentmentTotal: 40,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(4, 2);
  });

  it('applies fixed offer discount per unit and clamps to line total', () => {
    const test = {
      ...baseOfferTest,
      variants: [
        {
          id: 'offer-a',
          name: 'Offer A',
          config: { discount_type: 'fixed', discount_value: 3 },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'offer-a',
      productId: '111',
      linePresentmentTotal: 10,
      quantity: 2,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(6, 2);
  });

  it('accepts legacy offer config aliases for type/value fields', () => {
    const test = {
      ...baseOfferTest,
      variants: [
        {
          id: 'offer-a',
          name: 'Offer A',
          config: { offerType: 'fixed_amount', amount: 2.5 },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'offer-a',
      productId: '111',
      linePresentmentTotal: 12,
      quantity: 2,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(5, 2);
  });

  it('accepts signed offer values and applies by absolute magnitude', () => {
    const test = {
      ...baseOfferTest,
      variants: [
        {
          id: 'offer-a',
          name: 'Offer A',
          config: { discount_type: 'fixed', discount_value: -4 },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'offer-a',
      productId: '111',
      linePresentmentTotal: 20,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(4, 2);
  });

  it('accepts nested offer config shape for type/value fields', () => {
    const test = {
      ...baseOfferTest,
      variants: [
        {
          id: 'offer-a',
          name: 'Offer A',
          config: { offer: { discount_type: 'percent', discount_value: 15 } },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'offer-a',
      productId: '111',
      linePresentmentTotal: 40,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(6, 2);
  });

  it('defaults missing offer type to percent when value exists', () => {
    const test = {
      ...baseOfferTest,
      variants: [
        {
          id: 'offer-a',
          name: 'Offer A',
          config: { discount_value: 10, discount_code_name: 'CODE-10' },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'offer-a',
      productId: '111',
      linePresentmentTotal: 50,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(5, 2);
  });

  it('does not apply free-shipping offer in line discount resolver', () => {
    const test = {
      ...baseOfferTest,
      variants: [
        {
          id: 'offer-a',
          name: 'Offer A',
          config: { discount_type: 'free_shipping', discount_value: null },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'offer-a',
      productId: '111',
      linePresentmentTotal: 40,
      quantity: 1,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('free_shipping_not_supported');
  });

  it('supports all-products target_type for checkout price alignment', () => {
    const test = {
      ...baseTest,
      target_type: 'all-products',
      target_ids: null,
      target_id: '',
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: 'gid://shopify/Product/999999999',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(10, 2);
  });

  it('supports collection target_type at checkout (target_ids are collections, not products)', () => {
    const test = {
      ...baseTest,
      target_type: 'collection',
      target_ids: ['gid://shopify/Collection/100'],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(10, 2);
  });

  it('allows stopped test in rollout personalization mode', () => {
    const test = {
      ...baseTest,
      status: 'stopped',
      personalization_mode: 'rollout',
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
  });

  it('applies roundTo to target unit', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'fixed', price: 19.33, roundTo: 0.25 },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.targetLineDecimal, 10)).toBeCloseTo(19.25, 2);
  });

  it('compare_at percent uses compareAtUnitPrice when priceBase is compare_at', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'percent', pricePercent: 10, priceBase: 'compare_at' },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 50,
      quantity: 1,
      compareAtUnitPrice: '40',
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.targetLineDecimal, 10)).toBeCloseTo(36, 2);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(14, 2);
  });

  it('compare_at without compareAtUnitPrice returns compare_at_unavailable', () => {
    const test = {
      ...baseTest,
      variants: [
        {
          id: 'var-b',
          name: 'Variant B',
          config: { priceMode: 'percent', pricePercent: 10, priceBase: 'compare_at' },
        },
      ],
    };
    const r = resolvePriceTestLineDiscount({
      test,
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 20,
      quantity: 1,
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('compare_at_unavailable');
  });

  it('rejects missing assignment signature when strict mode is enabled', () => {
    process.env.RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET = 'sig-secret';
    process.env.RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT = 'true';
    const r = resolvePriceTestLineDiscount({
      test: { ...baseTest, id: '11111111-1111-4111-8111-111111111111' },
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
      shopDomain: 'test.myshopify.com',
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('missing_assignment_signature');
  });

  it('applies when assignment signature is valid in strict mode', () => {
    process.env.RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET = 'sig-secret';
    process.env.RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT = 'true';
    const testId = '11111111-1111-4111-8111-111111111111';
    const userId = 'u-1';
    const ts = Date.now();
    const sig = signPriceAssignment({
      testId,
      variantId: 'var-b',
      userId,
      shopDomain: 'test.myshopify.com',
      issuedAtMs: ts,
    });
    const r = resolvePriceTestLineDiscount({
      test: { ...baseTest, id: testId },
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
      shopDomain: 'test.myshopify.com',
      assignmentSignature: sig,
      assignmentIssuedAtMs: String(ts),
      assignmentUserId: userId,
    });
    expect(r.applies).toBe(true);
    expect(parseFloat(r.discountDecimal, 10)).toBeCloseTo(10, 2);
  });

  it('rejects invalid assignment signature when provided', () => {
    process.env.RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET = 'sig-secret';
    const r = resolvePriceTestLineDiscount({
      test: { ...baseTest, id: '11111111-1111-4111-8111-111111111111' },
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
      shopDomain: 'test.myshopify.com',
      assignmentSignature: 'deadbeef',
      assignmentIssuedAtMs: String(Date.now()),
      assignmentUserId: 'u-1',
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('invalid_assignment_signature');
  });

  it('requires signature by default in production when strict flag is unset', () => {
    process.env.RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET = 'sig-secret';
    process.env.NODE_ENV = 'production';
    delete process.env.RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT;
    const r = resolvePriceTestLineDiscount({
      test: { ...baseTest, id: '11111111-1111-4111-8111-111111111111' },
      assignmentVariantId: 'var-b',
      productId: '111',
      linePresentmentTotal: 29.99,
      quantity: 1,
      shopDomain: 'test.myshopify.com',
    });
    expect(r.applies).toBe(false);
    expect(r.reason).toBe('missing_assignment_signature');
  });
});
