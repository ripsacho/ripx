const { normalizeCheckoutTrackingMetadata, normalizeEventName } = require('../checkoutTracking');

describe('checkoutTracking utils', () => {
  it('normalizes checkout event names with a fallback', () => {
    expect(normalizeEventName('', 'checkout_section_impression')).toBe(
      'checkout_section_impression'
    );
    expect(normalizeEventName('  checkout_phase_cta_click  ')).toBe('checkout_phase_cta_click');
  });

  it('sanitizes known checkout tracking metadata fields', () => {
    const metadata = normalizeCheckoutTrackingMetadata({
      checkout_phase: ' PAYMENT_METHOD ',
      checkout_section_id: ' trust-box-1 '.repeat(20),
      checkout_section_type: 'TRUST_BOX',
      discount_code: ' RIPX-TEST-CODE ',
      untouched: 'keep me',
    });

    expect(metadata.checkout_phase).toBe('payment_method');
    expect(metadata.checkout_section_type).toBe('trust_box');
    expect(metadata.checkout_section_id.length).toBeLessThanOrEqual(80);
    expect(metadata.discount_code).toBe('RIPX-TEST-CODE');
    expect(metadata.untouched).toBe('keep me');
  });

  it('falls back to experience for unsupported checkout phases', () => {
    const metadata = normalizeCheckoutTrackingMetadata({
      checkout_phase: 'mystery_phase',
    });

    expect(metadata.checkout_phase).toBe('experience');
  });

  it('sanitizes checkout product metadata fields', () => {
    const metadata = normalizeCheckoutTrackingMetadata({
      checkout_section_type: 'unknown-custom-section',
      checkout_product_id: ' gid://shopify/Product/1 ',
      checkout_merchandise_id: ' gid://shopify/ProductVariant/1 ',
      checkout_product_rank: '3',
      checkout_product_action: 'ADD_TO_CART',
      checkout_product_analytics_key: 'Featured Product 1!',
    });

    expect(metadata.checkout_section_type).toBe('unknown');
    expect(metadata.checkout_product_id).toBe('gid://shopify/Product/1');
    expect(metadata.checkout_merchandise_id).toBe('gid://shopify/ProductVariant/1');
    expect(metadata.checkout_product_rank).toBe('3');
    expect(metadata.checkout_product_action).toBe('add_to_cart');
    expect(metadata.checkout_product_analytics_key).toBe('featured_product_1');
  });
});
