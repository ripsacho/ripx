const {
  resolvePriceTestLineDiscount,
  resolveCheckoutPriceBatchForDomain,
} = require('../priceTestCheckoutResolve');

describe('priceTestCheckoutResolve', () => {
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
});
