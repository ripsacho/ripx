const { enrichCheckoutReadinessCheck } = require('../checkoutReadinessHints');

describe('checkoutReadinessHints', () => {
  it('adds Plus plan guidance when shop is not eligible', () => {
    const enriched = enrichCheckoutReadinessCheck({
      id: 'pricing_shopify_plus_required',
      ok: false,
      severity: 'error',
      message: 'Direct Price Override requires Shopify Plus.',
    });
    expect(enriched.message).toMatch(/Shopify Plus/i);
  });

  it('adds installation action path for cart transform readiness', () => {
    const enriched = enrichCheckoutReadinessCheck({
      id: 'pricing_direct_price_override_ready',
      ok: false,
      severity: 'warning',
      message: 'Direct Price Override is not ready.',
    });
    expect(enriched.action_path).toMatch(/Direct price override/i);
    expect(enriched.message).toMatch(/Settings → Installation/i);
  });
});
