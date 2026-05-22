const { buildShippingExecutionPlan } = require('../shippingExecutionPlanner');

describe('shippingExecutionPlanner', () => {
  it('marks flat-rate variant as ready when carrier service is available', () => {
    const plan = buildShippingExecutionPlan(
      {
        id: 't1',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          { name: 'Variant A', allocation: 50, config: { strategy: 'flat_rate', amount: 5 } },
        ],
      },
      {
        capabilities: {
          adapter_support: {
            carrier_service: { available: true },
            discount_function: { available: true },
            manual: { available: true },
          },
        },
        recommended_execution_path: 'carrier_service',
      }
    );
    expect(plan.summary.variants_ready).toBe(1);
    expect(plan.summary.variants_automatic).toBe(1);
    expect(plan.variants[1].execution_mode).toBe('automatic');
    expect(plan.plan_status).toBe('ready');
  });

  it('marks flat-rate variant as manual_required when carrier service is unavailable', () => {
    const plan = buildShippingExecutionPlan(
      {
        id: 't2',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          { name: 'Variant A', allocation: 50, config: { strategy: 'flat_rate', amount: 5 } },
        ],
      },
      {
        capabilities: {
          adapter_support: {
            carrier_service: { available: false },
            discount_function: { available: true },
            manual: { available: true },
          },
        },
        recommended_execution_path: 'discount_function',
      }
    );
    expect(plan.summary.variants_manual_required).toBe(1);
    expect(plan.summary.variants_manual).toBe(1);
    expect(plan.variants[1].execution_mode).toBe('manual');
    expect(plan.plan_status).toBe('partial');
  });

  it('honors delivery customization execution_hint when adapter is available', () => {
    const plan = buildShippingExecutionPlan(
      {
        id: 't3',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant A',
            allocation: 50,
            config: {
              strategy: 'carrier_quote',
              profile_id: 'gid://shopify/DeliveryProfile/123',
              execution_hint: 'delivery_customization',
              delivery_method_names: ['Standard Shipping'],
            },
          },
        ],
      },
      {
        capabilities: {
          adapter_support: {
            carrier_service: { available: false },
            delivery_customization: { available: true },
            discount_function: { available: true },
            manual: { available: true },
          },
        },
        recommended_execution_path: 'delivery_customization',
      }
    );

    expect(plan.variants[1].execution_adapter).toBe('delivery_customization');
    expect(plan.variants[1].execution_mode).toBe('automatic');
    expect(plan.variants[1].status).toBe('ready');
    expect(plan.plan_status).toBe('ready');
  });

  it('auto-selects carrier service for carrier_quote when carrier service is available', () => {
    const plan = buildShippingExecutionPlan(
      {
        id: 't4',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Auto',
            allocation: 50,
            config: {
              strategy: 'carrier_quote',
              profile_id: 'gid://shopify/DeliveryProfile/987',
            },
          },
        ],
      },
      {
        capabilities: {
          adapter_support: {
            carrier_service: { available: true },
            delivery_customization: { available: true },
            discount_function: { available: true },
            manual: { available: true },
          },
        },
        recommended_execution_path: 'carrier_service',
      }
    );

    expect(plan.variants[1].execution_adapter).toBe('carrier_service');
    expect(plan.variants[1].status).toBe('ready');
  });

  it('requires delivery method targets when delivery customization is explicitly requested', () => {
    const plan = buildShippingExecutionPlan(
      {
        id: 't5',
        name: 'Shipping test',
        type: 'shipping',
        variants: [
          { name: 'Control', allocation: 50, config: { strategy: 'control' } },
          {
            name: 'Variant Delivery',
            allocation: 50,
            config: {
              strategy: 'carrier_quote',
              profile_id: 'gid://shopify/DeliveryProfile/987',
              execution_hint: 'delivery_customization',
            },
          },
        ],
      },
      {
        capabilities: {
          adapter_support: {
            carrier_service: { available: false },
            delivery_customization: { available: true },
            discount_function: { available: true },
            manual: { available: true },
          },
        },
        recommended_execution_path: 'delivery_customization',
      }
    );

    expect(plan.variants[1].execution_adapter).toBe('delivery_customization');
    expect(plan.variants[1].execution_mode).toBe('manual');
    expect(plan.variants[1].status).toBe('manual_required');
  });
});
