const {
  derivePlanTier,
  buildPlanCapabilities,
  recommendExecutionPath,
} = require('../shippingCapabilityPlanner');

describe('shippingCapabilityPlanner', () => {
  it('derives plus plan tier from plan metadata', () => {
    const tier = derivePlanTier({ displayName: 'Shopify Plus', shopifyPlus: true });
    expect(tier).toBe('plus');
  });

  it('builds capabilities for advanced tier', () => {
    const caps = buildPlanCapabilities('advanced', ['read_shipping']);
    expect(caps.adapter_support.carrier_service.available).toBe(true);
    expect(caps.adapter_support.delivery_customization.available).toBe(false);
    expect(caps.adapter_support.discount_function.available).toBe(false);
  });

  it('recommends carrier service when available', () => {
    const path = recommendExecutionPath({
      adapter_support: {
        carrier_service: { available: true },
        discount_function: { available: true },
      },
    });
    expect(path).toBe('carrier_service');
  });
});
