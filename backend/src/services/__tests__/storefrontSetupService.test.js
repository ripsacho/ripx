const { requiresStorefrontRuntimeForTest } = require('../storefrontSetupService');

describe('storefrontSetupService', () => {
  it('flags price and theme tests as needing storefront runtime', () => {
    expect(requiresStorefrontRuntimeForTest({ type: 'price' })).toBe(true);
    expect(requiresStorefrontRuntimeForTest({ type: 'pricing' })).toBe(true);
    expect(requiresStorefrontRuntimeForTest({ type: 'theme' })).toBe(true);
    expect(requiresStorefrontRuntimeForTest({ type: 'checkout' })).toBe(false);
  });
});
