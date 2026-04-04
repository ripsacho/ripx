const { buildShopifyFunctionsInventory } = require('../shopifyFunctionsInventory');

describe('shopifyFunctionsInventory', () => {
  it('reports both expectations detected when RipX-titled discount and cart transform exist', () => {
    const nodes = [
      { id: 'gid://1', title: 'RipX checkout discount', apiType: 'product_discount' },
      { id: 'gid://2', title: 'RipX cart transform', apiType: 'cart_transform' },
    ];
    const res = buildShopifyFunctionsInventory(nodes, 'dev.myshopify.com');
    expect(res.success).toBe(true);
    const discount = res.expectations.find(e => e.key === 'checkout_discount');
    const cart = res.expectations.find(e => e.key === 'cart_transform');
    expect(discount.detected).toBe(true);
    expect(cart.detected).toBe(true);
    expect(discount.matchedFunction.id).toBe('gid://1');
    expect(cart.matchedFunction.id).toBe('gid://2');
  });

  it('falls back to first discount/cart candidate when title has no RipX', () => {
    const nodes = [
      { id: 'a', title: 'Other discount', apiType: 'discount' },
      { id: 'b', title: 'Other cart', apiType: 'cart_transform' },
    ];
    const res = buildShopifyFunctionsInventory(nodes, 'x.myshopify.com');
    expect(res.expectations[0].matchedFunction.id).toBe('a');
    expect(res.expectations[1].matchedFunction.id).toBe('b');
  });

  it('marks missing when no matching api types', () => {
    const res = buildShopifyFunctionsInventory([], 'x.myshopify.com');
    expect(res.expectations.every(e => !e.detected)).toBe(true);
    expect(res.summary.totalFunctionsReturned).toBe(0);
    expect(res.readiness.discount_function_for_checkout).toBe(false);
    expect(res.readiness.cart_transform_for_direct_price).toBe(false);
    expect(res.readiness.both_detected).toBe(false);
  });

  it('sets readiness when both roles detected', () => {
    const nodes = [
      { id: 'd', title: 'RipX Discount', apiType: 'discount' },
      { id: 'c', title: 'RipX Cart', apiType: 'cart_transform' },
    ];
    const res = buildShopifyFunctionsInventory(nodes, 's.myshopify.com');
    expect(res.readiness.both_detected).toBe(true);
    expect(res.readiness.discount_function_for_checkout).toBe(true);
    expect(res.readiness.cart_transform_for_direct_price).toBe(true);
  });
});
