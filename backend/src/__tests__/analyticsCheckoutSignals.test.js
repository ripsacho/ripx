const analyticsService = require('../services/analytics');

describe('AnalyticsService checkout signal helpers', () => {
  it('returns built-in checkout section event names for checkout experience tests', () => {
    expect(
      analyticsService._getBuiltInCheckoutEventNames({
        type: 'checkout',
        goal: { checkout_phase: 'experience' },
      })
    ).toEqual([
      'checkout_section_impression',
      'checkout_section_cta_click',
      'checkout_section_offer_apply',
    ]);
  });

  it('does not expose checkout section signals for non-experience checkout phases', () => {
    expect(
      analyticsService._getBuiltInCheckoutEventNames({
        type: 'checkout',
        goal: { checkout_phase: 'payment_method' },
      })
    ).toEqual([]);
  });
});
