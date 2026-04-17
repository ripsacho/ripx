const CHECKOUT_PHASES = ['experience', 'payment_method', 'delivery_method'];
const CHECKOUT_SECTION_TYPES = [
  'hero_notice',
  'trust_box',
  'guarantee_box',
  'shipping_promise',
  'offer_code_panel',
];

function normalizeEventName(rawValue, fallback = 'checkout_phase_conversion') {
  return String(rawValue || fallback)
    .trim()
    .slice(0, 120);
}

function sanitizeString(value, maxLength = 120) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, maxLength) : '';
}

function normalizeCheckoutTrackingMetadata(rawMetadata = {}) {
  const source = rawMetadata && typeof rawMetadata === 'object' ? { ...rawMetadata } : {};
  const checkoutPhase = sanitizeString(source.checkout_phase, 40).toLowerCase();
  const checkoutSectionType = sanitizeString(source.checkout_section_type, 60).toLowerCase();
  const checkoutSectionId = sanitizeString(source.checkout_section_id, 80);
  const discountCode = sanitizeString(source.discount_code, 64);

  if (checkoutPhase) {
    source.checkout_phase = CHECKOUT_PHASES.includes(checkoutPhase) ? checkoutPhase : 'experience';
  }
  if (checkoutSectionType) {
    source.checkout_section_type = CHECKOUT_SECTION_TYPES.includes(checkoutSectionType)
      ? checkoutSectionType
      : checkoutSectionType;
  }
  if (checkoutSectionId) {
    source.checkout_section_id = checkoutSectionId;
  }
  if (discountCode) {
    source.discount_code = discountCode;
  }

  return source;
}

module.exports = {
  normalizeCheckoutTrackingMetadata,
  normalizeEventName,
};
