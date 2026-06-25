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

  it('hides add-mode targets when config test_id uses a short prefix of the assigned cart test id', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: '9450d503',
            variant_rules: [
              {
                variant_id: 'Variant A',
                action: 'hide',
                method_names: ['Standard', 'Express'],
                method_codes: ['816241836221', '816241901757'],
                protected_method_codes: ['ripx_flat_varianta_1', 'ripx_flat_varianta_2'],
                skip_replacement_presence_gate: true,
              },
            ],
          },
        },
      },
      cart: {
        deliveryGroups: [
          {
            cartLines: [
              {
                ripxTest: { value: '9450d503-7391-4e65-ba0a-7e742622f029' },
                ripxVariant: { value: 'Variant A' },
              },
            ],
            deliveryOptions: [
              {
                handle: 'native-standard',
                title: 'Standard',
                code: '816241836221',
              },
              {
                handle: 'native-express',
                title: 'Express',
                code: '816241901757',
              },
              {
                handle: 'ripx-standard',
                title: 'Standard',
                code: 'ripx_flat_varianta_1',
              },
            ],
          },
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
