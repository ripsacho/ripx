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
              {
                handle: 'ripx-express',
                title: 'Express',
                code: 'ripx_flat_varianta_2',
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

  it('matches variant assignment when cart uses plus-encoded labels', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: '131bdc89-4f54-41ec-ba73-8e296b357865',
            variant_rules: [
              {
                variant_id: 'Variant A',
                variant_index: '1',
                action: 'hide',
                method_names: ['Standard'],
                method_codes: [
                  '1186140225609',
                  'gid://shopify/DeliveryMethodDefinition/1186140225609',
                ],
                protected_method_codes: ['ripx_replace_standard', 'ripx_flat_varianta_2'],
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
                ripxTest: { value: '131bdc89-4f54-41ec-ba73-8e296b357865' },
                ripxVariant: { value: 'Variant+A' },
              },
            ],
            deliveryOptions: [
              { handle: 'native-standard', title: 'Standard', code: '1186140225609' },
              { handle: 'ripx-standard', title: 'Standard', code: 'ripx_replace_standard' },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual([
      { deliveryOptionHide: { deliveryOptionHandle: 'native-standard' } },
    ]);
  });

  it('hides scoped native methods by delivery option handle', () => {
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
                method_names: ['Standard Shipping'],
                method_codes: ['816241836221'],
                protected_method_codes: ['ripx_flat_variantb_1'],
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
                ripxTest: { value: 'test-1' },
                ripxVariant: { value: 'variant-b' },
              },
            ],
            deliveryOptions: [
              {
                handle: 'standard-shipping',
                title: 'Standard Shipping',
                code: '816241836221',
              },
              {
                handle: 'ripx-rate',
                title: 'Standard Shipping',
                code: 'ripx_flat_variantb_1',
              },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual([
      { deliveryOptionHide: { deliveryOptionHandle: 'standard-shipping' } },
    ]);
  });

  it('uses cart-level assignment attributes when line attributes are missing', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: 'test-1',
            variant_rules: [
              {
                variant_id: 'Variant A',
                variant_index: '1',
                action: 'hide',
                method_names: ['Standard'],
                method_codes: ['816241836221'],
                protected_method_codes: ['ripx_flat_varianta_1'],
                skip_replacement_presence_gate: true,
              },
            ],
          },
        },
      },
      cart: {
        ripxTest: { value: 'test-1' },
        ripxVariant: { value: '1' },
        deliveryGroups: [
          {
            cartLines: [{ merchandise: { __typename: 'ProductVariant' } }],
            deliveryOptions: [
              { handle: 'native-standard', title: 'Standard', code: '816241836221' },
              { handle: 'ripx-standard', title: 'Standard', code: 'ripx_flat_varianta_1' },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual([
      { deliveryOptionHide: { deliveryOptionHandle: 'native-standard' } },
    ]);
  });

  it('does not hide native methods when RipX replacement rates are not present yet', () => {
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
                method_names: ['Standard Shipping'],
                method_codes: ['standard-shipping'],
                protected_method_codes: ['ripx_flat_variantb_1'],
                skip_replacement_presence_gate: false,
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
                ripxTest: { value: 'test-1' },
                ripxVariant: { value: 'variant-b' },
              },
            ],
            deliveryOptions: [
              {
                handle: 'standard-shipping',
                title: 'Standard Shipping',
                code: '816241836221',
              },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual([]);
  });

  it('waits to hide add-mode native methods until RipX replacement rates are visible', () => {
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
                method_codes: ['816241836221', '816241901757'],
                protected_method_codes: ['ripx_flat_variantb_1'],
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
                ripxTest: { value: 'test-1' },
                ripxVariant: { value: 'variant-b' },
              },
            ],
            deliveryOptions: [
              {
                handle: 'standard-shipping',
                title: 'Standard Shipping',
                code: '816241836221',
              },
              {
                handle: 'express-shipping',
                title: 'Express Shipping',
                code: '816241901757',
              },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual([]);
  });

  it('hides add-mode native methods once RipX replacement rates are visible', () => {
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
                method_codes: ['816241836221', '816241901757'],
                protected_method_codes: ['ripx_flat_variantb_1'],
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
                ripxTest: { value: 'test-1' },
                ripxVariant: { value: 'variant-b' },
              },
            ],
            deliveryOptions: [
              {
                handle: 'standard-shipping',
                title: 'Standard Shipping',
                code: '816241836221',
              },
              {
                handle: 'express-shipping',
                title: 'Express Shipping',
                code: '816241901757',
              },
              {
                handle: 'ripx-standard',
                title: 'Standard Shipping',
                code: 'ripx_flat_variantb_1',
              },
              {
                handle: 'ripx-express',
                title: 'Express Shipping',
                code: 'ripx_flat_variantb_2',
              },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual([
      { deliveryOptionHide: { deliveryOptionHandle: 'standard-shipping' } },
      { deliveryOptionHide: { deliveryOptionHandle: 'express-shipping' } },
    ]);
  });

  it('avoids hiding every delivery option when replacement rates are missing in replace mode', () => {
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
                method_codes: ['standard-shipping', 'express-shipping'],
                protected_method_codes: ['ripx_flat_variantb_1'],
                skip_replacement_presence_gate: false,
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
                ripxTest: { value: 'test-1' },
                ripxVariant: { value: 'variant-b' },
              },
            ],
            deliveryOptions: [
              {
                handle: 'standard-shipping',
                title: 'Standard Shipping',
                code: '816241836221',
              },
              {
                handle: 'express-shipping',
                title: 'Express Shipping',
                code: '816241901757',
              },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual([]);
  });

  it('hides duplicate-title natives even when RipX and native share the same checkout code', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: '131bdc89-4f54-41ec-ba73-8e296b357865',
            variant_rules: [
              {
                variant_id: 'Variant A',
                action: 'hide',
                method_names: ['Standard', 'Express'],
                method_codes: ['Standard', 'standard', 'Express', 'express'],
                protected_method_codes: ['ripx_replace_standard', 'ripx_flat_1_2026-06-26t09023_2'],
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
                ripxTest: { value: '131bdc89-4f54-41ec-ba73-8e296b357865' },
                ripxVariant: { value: 'Variant A' },
              },
            ],
            deliveryOptions: [
              { handle: 'shopify-standard', title: 'Standard', code: 'Standard' },
              { handle: 'shopify-express', title: 'Express', code: 'Express' },
              { handle: 'ripx-standard', title: 'Standard', code: 'Standard' },
              { handle: 'ripx-express', title: 'Express', code: 'ripx_flat_1_2026-06-26t09023_2' },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual(
      expect.arrayContaining([
        { deliveryOptionHide: { deliveryOptionHandle: 'shopify-standard' } },
        { deliveryOptionHide: { deliveryOptionHandle: 'shopify-express' } },
      ])
    );
    expect(result.operations).toHaveLength(2);
  });

  it('hides add-mode native methods by generic checkout codes once RipX rates are visible', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: '131bdc89-4f54-41ec-ba73-8e296b357865',
            variant_rules: [
              {
                variant_id: 'Variant A',
                variant_index: '1',
                action: 'hide',
                method_names: ['Standard', 'Express'],
                method_codes: ['standard', 'express', '1186140225609', '1186140258377'],
                protected_method_codes: ['ripx_replace_standard', 'ripx_flat_1_2026-06-26t09023_2'],
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
                ripxTest: { value: '131bdc89-4f54-41ec-ba73-8e296b357865' },
                ripxVariant: { value: 'Variant A' },
              },
            ],
            deliveryOptions: [
              { handle: 'native-standard', title: 'Standard', code: 'Standard' },
              { handle: 'native-express', title: 'Express', code: 'Express' },
              { handle: 'ripx-standard', title: 'Standard', code: 'ripx_replace_standard' },
              { handle: 'ripx-express', title: 'Express', code: 'ripx_flat_1_2026-06-26t09023_2' },
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

  it('hides scoped native methods when RipX rates reuse native titles without ripx checkout codes', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: '131bdc89-4f54-41ec-ba73-8e296b357865',
            variant_rules: [
              {
                variant_id: 'Variant A',
                variant_index: '1',
                action: 'hide',
                method_names: ['Standard', 'Express'],
                method_codes: [
                  '1186140225609',
                  'gid://shopify/DeliveryMethodDefinition/1186140225609',
                  '1186140258377',
                  'gid://shopify/DeliveryMethodDefinition/1186140258377',
                ],
                protected_method_codes: ['ripx_replace_standard', 'ripx_flat_1_2'],
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
                ripxTest: { value: '131bdc89-4f54-41ec-ba73-8e296b357865' },
                ripxVariant: { value: 'Variant A' },
              },
            ],
            deliveryOptions: [
              {
                handle: 'native-standard',
                title: 'Standard',
                code: '1186140225609',
              },
              {
                handle: 'native-express',
                title: 'Express',
                code: '1186140258377',
              },
              {
                handle: 'ripx-standard',
                title: 'Standard',
                code: 'carrier-standard',
              },
              {
                handle: 'ripx-express',
                title: 'Express',
                code: 'carrier-express',
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

  it('hides numeric native handles when RipX preview rates use different names', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: '131bdc89-4f54-41ec-ba73-8e296b357865',
            variant_rules: [
              {
                variant_id: 'Variant A',
                action: 'hide',
                method_names: ['Standard', 'Express'],
                method_codes: ['1186140225609', '1186140258377', 'Standard', 'Express'],
                protected_method_codes: ['ripx_flat_economy_1', 'ripx_flat_priority_2'],
                protected_method_names: ['Economy', 'Priority'],
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
                ripxTest: { value: '131bdc89-4f54-41ec-ba73-8e296b357865' },
                ripxVariant: { value: 'Variant A' },
              },
            ],
            deliveryOptions: [
              { handle: '1186140225609', title: 'Standard', code: '1186140225609' },
              { handle: '1186140258377', title: 'Express', code: '1186140258377' },
              { handle: 'ripx-economy', title: 'Economy', code: 'ripx_flat_economy_1' },
              { handle: 'ripx-priority', title: 'Priority', code: 'ripx_flat_priority_2' },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual(
      expect.arrayContaining([
        { deliveryOptionHide: { deliveryOptionHandle: '1186140225609' } },
        { deliveryOptionHide: { deliveryOptionHandle: '1186140258377' } },
      ])
    );
    expect(result.operations).toHaveLength(2);
  });

  it('recognizes RipX carrier rates by protected service codes without ripx prefix', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: 'test-carrier-codes',
            variant_rules: [
              {
                variant_id: 'Variant A',
                action: 'hide',
                method_names: ['Standard', 'Express'],
                method_codes: ['1186140225609', '1186140258377'],
                protected_method_codes: ['preview_standard', 'preview_express'],
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
                ripxTest: { value: 'test-carrier-codes' },
                ripxVariant: { value: 'Variant A' },
              },
            ],
            deliveryOptions: [
              { handle: '1186140225609', title: 'Standard', code: '1186140225609' },
              { handle: '1186140258377', title: 'Express', code: '1186140258377' },
              { handle: '104559181897-standard', title: 'Standard', code: 'preview_standard' },
              { handle: '104559181897-express', title: 'Express', code: 'preview_express' },
            ],
          },
        ],
      },
    });

    expect(result.operations).toEqual(
      expect.arrayContaining([
        { deliveryOptionHide: { deliveryOptionHandle: '1186140225609' } },
        { deliveryOptionHide: { deliveryOptionHandle: '1186140258377' } },
      ])
    );
    expect(result.operations).toHaveLength(2);
  });

  it('aborts add-mode hide when every visible option would be removed', () => {
    const run = loadDeliveryCustomizationRunFunction();
    const result = run({
      deliveryCustomization: {
        metafield: {
          jsonValue: {
            test_id: 'test-unsafe',
            variant_rules: [
              {
                variant_id: 'Variant A',
                action: 'hide',
                method_names: ['Standard'],
                method_codes: ['standard'],
                protected_method_codes: [],
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
                ripxTest: { value: 'test-unsafe' },
                ripxVariant: { value: 'Variant A' },
              },
            ],
            deliveryOptions: [{ handle: 'only-standard', title: 'Standard', code: 'standard' }],
          },
        ],
      },
    });

    expect(result.operations).toEqual([]);
  });
});
