const CHECKOUT_PHASES = ['experience', 'payment_method', 'delivery_method'];
const CHECKOUT_SECTION_TYPES = [
  'hero_notice',
  'trust_box',
  'guarantee_box',
  'shipping_promise',
  'offer_code_panel',
  'product_list',
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
  const checkoutProductId = sanitizeString(source.checkout_product_id, 120);
  const checkoutMerchandiseId = sanitizeString(source.checkout_merchandise_id, 120);
  const checkoutProductSourceMode = sanitizeString(
    source.checkout_product_source_mode,
    40
  ).toLowerCase();
  const checkoutProductStrategy = sanitizeString(
    source.checkout_product_strategy,
    80
  ).toLowerCase();
  const checkoutProductAction = sanitizeString(source.checkout_product_action, 40).toLowerCase();
  const checkoutProductFailureReason = sanitizeString(
    source.checkout_product_failure_reason,
    100
  ).toLowerCase();

  if (checkoutPhase) {
    source.checkout_phase = CHECKOUT_PHASES.includes(checkoutPhase) ? checkoutPhase : 'experience';
  }
  if (checkoutSectionType) {
    source.checkout_section_type = CHECKOUT_SECTION_TYPES.includes(checkoutSectionType)
      ? checkoutSectionType
      : 'unknown';
  }
  if (checkoutSectionId) {
    source.checkout_section_id = checkoutSectionId;
  }
  if (discountCode) {
    source.discount_code = discountCode;
  }
  if (checkoutProductId) {
    source.checkout_product_id = checkoutProductId;
  }
  if (checkoutMerchandiseId) {
    source.checkout_merchandise_id = checkoutMerchandiseId;
  }
  if (checkoutProductSourceMode) {
    source.checkout_product_source_mode = checkoutProductSourceMode;
  }
  if (checkoutProductStrategy) {
    source.checkout_product_strategy = checkoutProductStrategy;
  }
  if (checkoutProductAction) {
    source.checkout_product_action = ['display_only', 'add_to_cart'].includes(checkoutProductAction)
      ? checkoutProductAction
      : 'display_only';
  }
  if (checkoutProductFailureReason) {
    source.checkout_product_failure_reason = checkoutProductFailureReason;
  }
  const rank = Number.parseInt(String(source.checkout_product_rank || '').trim(), 10);
  if (Number.isFinite(rank) && rank > 0) {
    source.checkout_product_rank = String(Math.min(rank, 50));
  }
  source.checkout_product_analytics_key = sanitizeString(source.checkout_product_analytics_key, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return source;
}

module.exports = {
  normalizeCheckoutTrackingMetadata,
  normalizeEventName,
};
