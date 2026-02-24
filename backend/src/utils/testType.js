/**
 * Test Type Utilities
 *
 * Infers template_key from variants and type for display.
 * Used when goal.template_key is missing (e.g. legacy tests).
 */

function getEffectiveConfig(variants = []) {
  for (const v of variants) {
    const c = v?.config;
    if (c && typeof c === 'object' && Object.keys(c).length > 0) {
      return c;
    }
  }
  return variants[0]?.config || null;
}

/**
 * Infer template_key from variants and type
 * @param {Array} variants
 * @param {string} testType
 * @returns {string|null}
 */
function inferTemplateKey(variants = [], testType = '') {
  const type = (testType || '').toLowerCase();

  // Trust type for shipping/offer/checkout (config can be polluted)
  if (type === 'shipping') {
    return 'shipping';
  }
  if (type === 'offer') {
    return 'offer';
  }
  if (type === 'checkout') {
    return 'checkout';
  }

  const config = getEffectiveConfig(variants);

  if (config && typeof config === 'object') {
    if ('url' in config) {
      return 'split-url';
    }
    if ('template' in config) {
      return 'template';
    }
    if ('rate' in config) {
      return 'shipping';
    }
    if ('discount_type' in config || 'discount_value' in config) {
      return 'offer';
    }
    if ('price' in config) {
      return type === 'pricing' ? 'pricing' : 'price';
    }
    if ('code' in config) {
      return 'onsite-edit';
    }
  }

  if (type === 'price' || type === 'pricing') {
    return type === 'pricing' ? 'pricing' : 'price';
  }
  if (type === 'offer') {
    return 'offer';
  }
  if (type === 'checkout') {
    return 'checkout';
  }
  if (type === 'content') {
    return 'theme';
  }
  return null;
}

/**
 * Enrich goal with template_key when missing
 * @param {Object} test - { goal, variants, type }
 * @returns {Object} test with goal.template_key set if inferred
 */
function enrichGoalWithTemplateKey(test) {
  if (!test || !test.goal) {
    return test;
  }

  const type = (test.type || '').toLowerCase();
  const existingKey = (test.goal.template_key || '').toLowerCase().replace(/\s+/g, '-');

  // Fix wrong template_key: shipping/offer/checkout type must override polluted template_key
  const typeAuthority = ['shipping', 'offer', 'checkout'];
  if (typeAuthority.includes(type)) {
    return {
      ...test,
      goal: { ...test.goal, template_key: type },
    };
  }

  // Infer from config: overrides polluted template_key when config clearly indicates shipping/offer
  const inferred = inferTemplateKey(test.variants || [], test.type);
  if (inferred && typeAuthority.includes(inferred)) {
    return {
      ...test,
      goal: { ...test.goal, template_key: inferred },
    };
  }

  if (existingKey) {
    return test;
  }

  if (inferred) {
    return {
      ...test,
      goal: { ...test.goal, template_key: inferred },
    };
  }
  return test;
}

module.exports = {
  inferTemplateKey,
  enrichGoalWithTemplateKey,
};
