/**
 * Test Type Display Utilities
 *
 * Maps raw test types and variant config to human-readable labels and icons.
 * goal.template_key is primary; config is fallback; type is last resort.
 */

import { TEST_TYPE_ICONS, TEST_TYPE_LABELS } from '../constants';

const TEMPLATE_KEY_LABELS = {
  'split-url': TEST_TYPE_LABELS['split-url'],
  template: TEST_TYPE_LABELS.template,
  shipping: TEST_TYPE_LABELS.shipping,
  offer: TEST_TYPE_LABELS.offer,
  price: TEST_TYPE_LABELS.price,
  pricing: TEST_TYPE_LABELS.pricing,
  'onsite-edit': TEST_TYPE_LABELS['onsite-edit'],
  theme: TEST_TYPE_LABELS.theme,
  content: TEST_TYPE_LABELS.content,
  checkout: TEST_TYPE_LABELS.checkout,
  combination: TEST_TYPE_LABELS.combination,
};

/**
 * Resolve config from first variant that has a distinctive key (handles Control with empty config)
 */
function getEffectiveConfig(test) {
  const variants = test.variants || [];
  for (const v of variants) {
    const c = v?.config;
    if (c && typeof c === 'object' && Object.keys(c).length > 0) {
      return c;
    }
  }
  return variants[0]?.config || null;
}

/**
 * Get reliable variant count for display.
 * Prefers explicit variant_count, otherwise counts non-null variants.
 *
 * @param {Object} test - Test object with variants or variant_count
 * @returns {number}
 */
export function getVariantCount(test) {
  if (!test) return 0;
  if (typeof test.variant_count === 'number' && test.variant_count >= 0) {
    return test.variant_count;
  }
  const variants = test.variants;
  if (!Array.isArray(variants)) return 0;
  return variants.filter(v => v !== null && v !== undefined).length;
}

/**
 * Infer template_key from variants and type (for backfilling when goal.template_key is missing)
 * @param {Array} variants
 * @param {string} [testType] - test.type or formData.type
 * @returns {string|null}
 */
export function inferTemplateKeyFromVariants(variants = [], testType = '') {
  const type = (testType || '').toLowerCase();

  // Trust type first for shipping/offer/checkout/combination (prevents wrong inference from config pollution)
  if (type === 'shipping') return 'shipping';
  if (type === 'offer') return 'offer';
  if (type === 'checkout') return 'checkout';
  if (type === 'combination') return 'combination';
  if (type === 'theme') return 'theme';

  for (const v of variants) {
    const c = v?.config;
    if (!c || typeof c !== 'object') continue;
    if ('url' in c) return 'split-url';
    if ('template' in c) return 'template';
    if (
      'themeMode' in c ||
      'theme_mode' in c ||
      'themeTemplateHandle' in c ||
      'theme_template_handle' in c ||
      'themeId' in c ||
      'theme_id' in c ||
      'sectionId' in c ||
      'section_id' in c ||
      'bodyClass' in c ||
      'body_class' in c
    ) {
      return 'theme';
    }
    if (
      'rate' in c ||
      'strategy' in c ||
      'shipping_strategy' in c ||
      'threshold_amount' in c ||
      'free_shipping_threshold' in c ||
      'percent_off' in c ||
      'profile_id' in c
    )
      return 'shipping';
    if ('discount_type' in c || 'discount_value' in c) return 'offer';
    if ('price' in c) return type === 'pricing' ? 'pricing' : 'price';
    if ('code' in c) return 'onsite-edit';
  }
  if (type === 'price' || type === 'pricing') return type === 'pricing' ? 'pricing' : 'price';
  if (type === 'offer') return 'offer';
  if (type === 'checkout') return 'checkout';
  if (type === 'content') return 'theme';
  return null;
}

/**
 * Get display info (label + icon) for a test.
 * Uses goal.template_key first, then config inference, then type.
 *
 * @param {Object} test - Test object with type, goal, and variants
 * @returns {{ label: string, icon: string }}
 */
export function getTestTypeDisplay(test) {
  const type = (test.type || '').toLowerCase();

  // Always trust type for shipping/offer/checkout/combination (overrides wrong goal.template_key from pollution)
  if (type === 'shipping')
    return { label: TEST_TYPE_LABELS.shipping, icon: TEST_TYPE_ICONS.shipping };
  if (type === 'offer') return { label: TEST_TYPE_LABELS.offer, icon: TEST_TYPE_ICONS.offer };
  if (type === 'checkout')
    return { label: TEST_TYPE_LABELS.checkout, icon: TEST_TYPE_ICONS.checkout };
  if (type === 'combination')
    return { label: TEST_TYPE_LABELS.combination, icon: TEST_TYPE_ICONS.combination };

  const config = getEffectiveConfig(test);

  // Check config only when it has distinctive keys; empty config falls through to template_key
  const hasDistinctiveConfig =
    config &&
    typeof config === 'object' &&
    Object.keys(config).length > 0 &&
    ('rate' in config ||
      'strategy' in config ||
      'shipping_strategy' in config ||
      'threshold_amount' in config ||
      'free_shipping_threshold' in config ||
      'percent_off' in config ||
      'profile_id' in config ||
      'discount_type' in config ||
      'discount_value' in config ||
      'url' in config ||
      'template' in config ||
      'price' in config ||
      'code' in config);
  if (hasDistinctiveConfig) {
    if (
      'rate' in config ||
      'strategy' in config ||
      'shipping_strategy' in config ||
      'threshold_amount' in config ||
      'free_shipping_threshold' in config ||
      'percent_off' in config ||
      'profile_id' in config
    )
      return { label: TEST_TYPE_LABELS.shipping, icon: TEST_TYPE_ICONS.shipping };
    if ('discount_type' in config || 'discount_value' in config)
      return { label: TEST_TYPE_LABELS.offer, icon: TEST_TYPE_ICONS.offer };
    if ('url' in config)
      return { label: TEST_TYPE_LABELS['split-url'], icon: TEST_TYPE_ICONS['split-url'] };
    if ('template' in config)
      return { label: TEST_TYPE_LABELS.template, icon: TEST_TYPE_ICONS.template };
    if ('price' in config) return { label: TEST_TYPE_LABELS.price, icon: TEST_TYPE_ICONS.price };
    if ('code' in config)
      return { label: TEST_TYPE_LABELS['onsite-edit'], icon: TEST_TYPE_ICONS['onsite-edit'] };
  }

  // Use goal.template_key when set (critical for onsite-edit vs theme when config is empty)
  const templateKey = (test.goal?.template_key || '').toLowerCase().replace(/\s+/g, '-');
  if (templateKey && (TEMPLATE_KEY_LABELS[templateKey] || TEST_TYPE_LABELS[templateKey])) {
    return {
      label: TEMPLATE_KEY_LABELS[templateKey] || TEST_TYPE_LABELS[templateKey],
      icon: TEST_TYPE_ICONS[templateKey] || TEST_TYPE_ICONS.default,
    };
  }

  const key = type === 'pricing' ? 'pricing' : type;
  return {
    label: TEST_TYPE_LABELS[key] || TEST_TYPE_LABELS[type] || type || 'Test',
    icon: TEST_TYPE_ICONS[key] || TEST_TYPE_ICONS[type] || TEST_TYPE_ICONS.default,
  };
}
