const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadDeliveryCustomizationRunFunction() {
  const sourcePath = path.join(
    __dirname,
    '../../../../extensions/ripx-delivery-customization/src/run.js'
  );
  const source = fs.readFileSync(sourcePath, 'utf8');
  const transformed = source
    .replace(
      'export function cartDeliveryOptionsTransformRun(',
      'function cartDeliveryOptionsTransformRun('
    )
    .concat('\nmodule.exports = { cartDeliveryOptionsTransformRun };');

  const sandbox = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(transformed, sandbox, {
    filename: 'run.js',
  });
  return sandbox.module.exports.cartDeliveryOptionsTransformRun;
}

function buildDeliveryGroup(options = []) {
  return {
    cartLines: [
      {
        ripxTest: { value: 'test-1' },
        ripxVariant: { value: 'variant-b' },
      },
    ],
    deliveryOptions: options,
  };
}

describe('cartDeliveryOptionsTransformRun', () => {
  it('hides every selected native method even when replacement codes substring-match native codes', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: 'test-1',
            variant_rules: [
              {
                variant_id: 'variant-b',
                action: 'hide',
                method_names: ['Standard Delivery', 'Express'],
                method_codes: ['standard_delivery', 'express'],
                require_present_method_names: ['Fast Standard'],
                require_present_method_codes: ['ripx_replace_standard_delivery'],
                protected_method_codes: ['ripx_replace_standard_delivery'],
                protected_method_names: ['Fast Standard'],
                skip_replacement_presence_gate: false,
              },
            ],
          },
        },
      },
      cart: {
        deliveryGroups: [
          buildDeliveryGroup([
            {
              handle: 'native-standard',
              title: 'Standard Delivery',
              code: 'standard_delivery',
            },
            {
              handle: 'native-express',
              title: 'Express',
              code: 'express',
            },
            {
              handle: 'ripx-replacement',
              title: 'Fast Standard',
              code: 'ripx_replace_standard_delivery',
            },
          ]),
        ],
      },
    });

    expect(result.operations).toEqual(
      expect.arrayContaining([
        { deliveryOptionHide: { deliveryOptionHandle: 'native-standard' } },
        { deliveryOptionHide: { deliveryOptionHandle: 'native-express' } },
      ])
    );
    expect(result.operations).toHaveLength(2);
  });

  it('hides multiple add-mode targets while still protecting RipX carrier rates', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: 'test-1',
            variant_rules: [
              {
                variant_id: 'variant-b',
                action: 'hide',
                method_names: ['Standard Shipping', 'Express Shipping'],
                method_codes: ['standard_shipping', 'express_shipping'],
                protected_method_codes: ['express', 'standard_shipping'],
                protected_method_name_prefixes: ['RipX Shipping Rate'],
                skip_replacement_presence_gate: true,
              },
            ],
          },
        },
      },
      cart: {
        deliveryGroups: [
          buildDeliveryGroup([
            {
              handle: 'native-standard',
              title: 'Standard Shipping',
              code: 'standard_shipping',
            },
            {
              handle: 'native-express',
              title: 'Express Shipping',
              code: 'express_shipping',
            },
            {
              handle: 'ripx-rate',
              title: 'RipX Shipping Rate: Express',
              code: 'ripx_flat_express',
            },
          ]),
        ],
      },
    });

    expect(result.operations).toEqual(
      expect.arrayContaining([
        { deliveryOptionHide: { deliveryOptionHandle: 'native-standard' } },
        { deliveryOptionHide: { deliveryOptionHandle: 'native-express' } },
      ])
    );
    expect(result.operations).toHaveLength(2);
  });
});
