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
