const analyticsService = require('../services/analytics');

describe('AnalyticsService checkout signal helpers', () => {
  it('returns built-in checkout section event names for checkout experience tests', () => {
    expect(
      analyticsService._getBuiltInCheckoutEventNames({
        type: 'checkout',
        goal: { checkout_phase: 'experience' },
      })
    ).toEqual([
      'checkout_phase_impression',
      'checkout_phase_cta_click',
      'checkout_phase_offer_apply',
      'checkout_phase_conversion',
      'checkout_runtime_diagnostic',
      'checkout_section_impression',
      'checkout_section_cta_click',
      'checkout_section_offer_apply',
    ]);
  });

  it('exposes payment customization signals for payment checkout phases', () => {
    expect(
      analyticsService._getBuiltInCheckoutEventNames({
        type: 'checkout',
        goal: { checkout_phase: 'payment_method' },
      })
    ).toEqual([
      'checkout_phase_impression',
      'checkout_phase_cta_click',
      'checkout_phase_offer_apply',
      'checkout_phase_conversion',
      'checkout_runtime_diagnostic',
      'checkout_payment_method_action',
      'checkout_customization_match',
    ]);
  });

  it('exposes delivery customization signals for delivery checkout phases', () => {
    expect(
      analyticsService._getBuiltInCheckoutEventNames({
        type: 'checkout',
        goal: { checkout_phase: 'delivery_method' },
      })
    ).toEqual([
      'checkout_phase_impression',
      'checkout_phase_cta_click',
      'checkout_phase_offer_apply',
      'checkout_phase_conversion',
      'checkout_runtime_diagnostic',
      'checkout_delivery_method_action',
      'checkout_customization_match',
    ]);
  });
});
