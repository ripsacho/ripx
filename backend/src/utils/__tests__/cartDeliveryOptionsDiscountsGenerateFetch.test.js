const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadDeliveryFetchFunction() {
  const sourcePath = path.join(
    __dirname,
    '../../../../extensions/ripx-checkout-discount/src/cart_delivery_options_discounts_generate_fetch.js'
  );
  const source = fs.readFileSync(sourcePath, 'utf8');
  const transformed = source
    .replace(
      "import { HttpRequestMethod } from '../generated/api';",
      "const HttpRequestMethod = { Post: 'POST' };"
    )
    .replace(
      "import { RIPX_CHECKOUT_PRICE_SECRET, RIPX_SHIPPING_RESOLVE_BATCH_URL } from './ripxConfig';",
      "const RIPX_CHECKOUT_PRICE_SECRET = 'super-secret'; const RIPX_SHIPPING_RESOLVE_BATCH_URL = 'https://resolver.example.com/api/track/shipping-resolve-batch';"
    )
    .replace(
      'export function cartDeliveryOptionsDiscountsGenerateFetch(',
      'function cartDeliveryOptionsDiscountsGenerateFetch('
    )
    .concat('\nmodule.exports = { cartDeliveryOptionsDiscountsGenerateFetch };');

  const sandbox = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(transformed, sandbox, {
    filename: 'cart_delivery_options_discounts_generate_fetch.js',
  });
  return sandbox.module.exports.cartDeliveryOptionsDiscountsGenerateFetch;
}

function buildLine({
  testId = 'test-1',
  variantId = 'variant-a',
  productId = 'gid://shopify/Product/101',
  shop = 'test.myshopify.com',
  sig = null,
  ts = null,
  user = null,
} = {}) {
  return {
    merchandise: {
      __typename: 'ProductVariant',
      product: { id: productId },
    },
    ripxTest: { value: testId },
    ripxVariant: { value: variantId },
    ripxShop: { value: shop },
    ripxAssignmentSig: sig ? { value: sig } : null,
    ripxAssignmentTs: ts ? { value: ts } : null,
    ripxAssignmentUser: user ? { value: user } : null,
  };
}

function buildInput(groups) {
  return {
    cart: {
      cost: {
        totalAmount: {
          amount: '125.50',
        },
      },
      deliveryGroups: groups,
    },
  };
}

describe('cartDeliveryOptionsDiscountsGenerateFetch', () => {
  it('keeps a delivery group when all tagged lines agree on the assignment', () => {
    const fetchFn = loadDeliveryFetchFunction();
    const result = fetchFn(
      buildInput([
        {
          id: 'gid://shopify/CartDeliveryGroup/1',
          deliveryOptions: [{ handle: 'standard' }],
          cartLines: [buildLine({ sig: 'sig-1', ts: '100', user: 'user-1' }), buildLine()],
        },
      ])
    );

    expect(result.request).toBeTruthy();
    expect(result.request.method).toBe('POST');
    expect(result.request.jsonBody).toEqual({
      shop: 'test.myshopify.com',
      groups: [
        {
          delivery_group_id: 'gid://shopify/CartDeliveryGroup/1',
          handles: ['standard'],
          product_ids: ['gid://shopify/Product/101'],
          test_id: 'test-1',
          assignment_variant: 'variant-a',
          assignment_sig: 'sig-1',
          assignment_ts: '100',
          assignment_user: 'user-1',
          cart_total: '125.50',
        },
      ],
    });
  });

  it('skips ambiguous delivery groups instead of choosing the first tagged line', () => {
    const fetchFn = loadDeliveryFetchFunction();
    const result = fetchFn(
      buildInput([
        {
          id: 'gid://shopify/CartDeliveryGroup/1',
          deliveryOptions: [{ handle: 'standard' }],
          cartLines: [
            buildLine({ testId: 'test-1', variantId: 'variant-a' }),
            buildLine({ testId: 'test-2', variantId: 'variant-b' }),
          ],
        },
      ])
    );

    expect(result).toEqual({ request: null });
  });
});
