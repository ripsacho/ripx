const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadDeliveryRunFunction() {
  const sourcePath = path.join(
    __dirname,
    '../../../../extensions/ripx-checkout-discount/src/cart_delivery_options_discounts_generate_run.js'
  );
  const source = fs.readFileSync(sourcePath, 'utf8');
  const transformed = source
    .replace(
      "import { DeliveryDiscountSelectionStrategy, DiscountClass } from '../generated/api';",
      "const DeliveryDiscountSelectionStrategy = { All: 'ALL' }; const DiscountClass = { Shipping: 'SHIPPING' };"
    )
    .replace(
      'export function cartDeliveryOptionsDiscountsGenerateRun(',
      'function cartDeliveryOptionsDiscountsGenerateRun('
    )
    .concat('\nmodule.exports = { cartDeliveryOptionsDiscountsGenerateRun };');

  const sandbox = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(transformed, sandbox, {
    filename: 'cart_delivery_options_discounts_generate_run.js',
  });
  return sandbox.module.exports.cartDeliveryOptionsDiscountsGenerateRun;
}

function buildInput({ discountClasses = ['SHIPPING'], deliveryGroups = [] } = {}) {
  return {
    discount: {
      discountClasses,
    },
    cart: {
      deliveryGroups,
    },
  };
}

function buildGroup({
  id = 'gid://shopify/CartDeliveryGroup/1',
  withFreeShippingMarker = false,
  deliveryOptionCount = 1,
} = {}) {
  const cartLines = [
    {
      ripxTest: { value: 'test-1' },
      ripxVariant: { value: 'variant-a' },
      ripxOfferDiscountType: { value: withFreeShippingMarker ? 'free_shipping' : 'percent' },
    },
  ];
  const deliveryOptions = Array.from({ length: deliveryOptionCount }).map((_, idx) => ({
    handle: `standard-${idx + 1}`,
  }));
  return { id, cartLines, deliveryOptions };
}

describe('cartDeliveryOptionsDiscountsGenerateRun', () => {
  it('returns no operations when shipping class is missing', () => {
    const run = loadDeliveryRunFunction();
    const result = run(
      buildInput({
        discountClasses: ['PRODUCT'],
        deliveryGroups: [buildGroup({ withFreeShippingMarker: true })],
      })
    );

    expect(result).toEqual({ operations: [] });
  });

  it('returns no operations when no free shipping marker exists', () => {
    const run = loadDeliveryRunFunction();
    const result = run(
      buildInput({
        deliveryGroups: [buildGroup({ withFreeShippingMarker: false })],
      })
    );

    expect(result).toEqual({ operations: [] });
  });

  it('adds a 100% delivery discount candidate for each marked delivery group', () => {
    const run = loadDeliveryRunFunction();
    const result = run(
      buildInput({
        deliveryGroups: [
          buildGroup({ id: 'gid://shopify/CartDeliveryGroup/1', withFreeShippingMarker: true }),
          buildGroup({ id: 'gid://shopify/CartDeliveryGroup/2', withFreeShippingMarker: true }),
        ],
      })
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].deliveryDiscountsAdd.selectionStrategy).toBe('ALL');
    expect(result.operations[0].deliveryDiscountsAdd.candidates).toEqual([
      {
        message: 'RipX offer free shipping',
        targets: [{ deliveryGroup: { id: 'gid://shopify/CartDeliveryGroup/1' } }],
        value: { percentage: { value: 100 } },
      },
      {
        message: 'RipX offer free shipping',
        targets: [{ deliveryGroup: { id: 'gid://shopify/CartDeliveryGroup/2' } }],
        value: { percentage: { value: 100 } },
      },
    ]);
  });

  it('ignores delivery groups that have no delivery options', () => {
    const run = loadDeliveryRunFunction();
    const result = run(
      buildInput({
        deliveryGroups: [buildGroup({ withFreeShippingMarker: true, deliveryOptionCount: 0 })],
      })
    );

    expect(result).toEqual({ operations: [] });
  });
});
