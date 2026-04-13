const SHIPPING_STRATEGIES = new Set([
  'control',
  'flat_rate',
  'threshold_free_shipping',
  'discount_percentage',
  'discount_fixed',
  'free_shipping',
  'carrier_quote',
]);

const SHIPPING_EXECUTION_HINTS = new Set([
  'auto',
  'carrier_service',
  'discount_function',
  'delivery_customization',
  'manual',
]);

function toLowerString(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function toOptionalString(value, maxLen = 120) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.slice(0, maxLen);
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function toCurrency(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return 'USD';
  }
  return normalized;
}

function toStringArray(input) {
  if (Array.isArray(input)) {
    return input
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return [];
}

function toCountryCodes(input) {
  return toStringArray(input)
    .map(code => code.toUpperCase())
    .filter(code => /^[A-Z]{2}$/.test(code))
    .slice(0, 50);
}

function inferStrategy(config = {}) {
  const explicit = toLowerString(config.strategy || config.shipping_strategy);
  if (SHIPPING_STRATEGIES.has(explicit)) {
    return explicit;
  }

  const discountType = toLowerString(config.discount_type || config.discountType);
  const percentOff = toOptionalNumber(config.percent_off ?? config.discount_percent);
  const rate = toOptionalNumber(config.rate ?? config.shipping_rate ?? config.amount);
  const threshold = toOptionalNumber(
    config.threshold_amount ?? config.free_shipping_threshold ?? config.freeShippingThreshold
  );
  const discountValue = toOptionalNumber(config.discount_value ?? config.discountValue);
  const profileId = toOptionalString(config.profile_id || config.profileId, 200);

  if (discountType === 'free_shipping') {
    return 'free_shipping';
  }
  if (threshold !== null) {
    return 'threshold_free_shipping';
  }
  if (
    discountType === 'percent' ||
    (percentOff !== null && (rate === null || String(config.rate || '').trim() === ''))
  ) {
    return 'discount_percentage';
  }
  if (discountType === 'fixed') {
    return 'discount_fixed';
  }
  if (profileId || (Array.isArray(config.method_handles) && config.method_handles.length > 0)) {
    return 'carrier_quote';
  }
  if (rate !== null || discountValue !== null) {
    return 'flat_rate';
  }
  return 'control';
}

function normalizeExecutionHint(value) {
  const normalized = toLowerString(value || 'auto') || 'auto';
  if (SHIPPING_EXECUTION_HINTS.has(normalized)) {
    return normalized;
  }
  return 'auto';
}

function normalizeShippingVariantConfig(config = {}) {
  const raw = config && typeof config === 'object' ? config : {};
  const strategy = inferStrategy(raw);

  const normalized = {
    strategy,
    amount: toOptionalNumber(raw.amount ?? raw.rate ?? raw.shipping_rate),
    threshold_amount: toOptionalNumber(
      raw.threshold_amount ?? raw.free_shipping_threshold ?? raw.freeShippingThreshold
    ),
    percent_off: toOptionalNumber(
      raw.percent_off ??
        raw.discount_percent ??
        (toLowerString(raw.discount_type || raw.discountType) === 'percent'
          ? (raw.discount_value ?? raw.discountValue)
          : null)
    ),
    currency: toCurrency(raw.currency),
    label: toOptionalString(raw.label, 80),
    profile_id: toOptionalString(raw.profile_id || raw.profileId, 200),
    method_handles: toStringArray(raw.method_handles || raw.methodHandles),
    zone_countries: toCountryCodes(raw.zone_countries || raw.zoneCountries),
    execution_hint: normalizeExecutionHint(raw.execution_hint || raw.executionHint),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
  };

  if (strategy === 'discount_fixed' && normalized.amount === null) {
    normalized.amount = toOptionalNumber(raw.discount_value ?? raw.discountValue);
  }
  if (strategy === 'discount_percentage' && normalized.percent_off === null) {
    normalized.percent_off = toOptionalNumber(raw.discount_value ?? raw.discountValue);
  }

  return normalized;
}

function isLikelyControlVariant(variant, index) {
  const name = toLowerString(variant?.name);
  return index === 0 || name === 'control' || name.startsWith('control ');
}

function isShippingTestPayload(payload = {}) {
  const testType = toLowerString(payload.type);
  if (testType === 'shipping') {
    return true;
  }
  const templateKey = toLowerString(payload.goal?.template_key);
  return templateKey === 'shipping';
}

function normalizeShippingTestPayload(payload = {}) {
  if (!isShippingTestPayload(payload) || !Array.isArray(payload.variants)) {
    return payload;
  }

  const nextVariants = payload.variants.map((variant, index) => {
    const current = variant && typeof variant === 'object' ? variant : {};
    const config = normalizeShippingVariantConfig(current.config || {});
    return {
      ...current,
      id:
        current.id !== undefined && current.id !== null && String(current.id).trim() !== ''
          ? current.id
          : current.name || `variant-${index}`,
      config,
    };
  });

  return {
    ...payload,
    type: 'shipping',
    variants: nextVariants,
  };
}

function isActionableShippingConfig(config = {}) {
  const normalized = normalizeShippingVariantConfig(config);
  switch (normalized.strategy) {
    case 'flat_rate':
      return normalized.amount !== null && normalized.amount >= 0;
    case 'threshold_free_shipping':
      return normalized.threshold_amount !== null && normalized.threshold_amount > 0;
    case 'discount_percentage':
      return normalized.percent_off !== null && normalized.percent_off > 0;
    case 'discount_fixed':
      return normalized.amount !== null && normalized.amount > 0;
    case 'free_shipping':
      return true;
    case 'carrier_quote':
      return Boolean(normalized.profile_id || normalized.method_handles.length > 0);
    case 'control':
    default:
      return false;
  }
}

function validateShippingVariants(variants = []) {
  const errors = [];
  let actionableNonControl = 0;

  variants.forEach((variant, index) => {
    const label = variant?.name || `Variant ${index + 1}`;
    const config = normalizeShippingVariantConfig(variant?.config || {});

    if (!SHIPPING_STRATEGIES.has(config.strategy)) {
      errors.push(`${label}: strategy is invalid.`);
      return;
    }

    if (config.strategy === 'flat_rate') {
      if (config.amount === null || config.amount < 0) {
        errors.push(`${label}: flat_rate requires an amount >= 0.`);
      }
    }

    if (config.strategy === 'threshold_free_shipping') {
      if (config.threshold_amount === null || config.threshold_amount <= 0) {
        errors.push(`${label}: threshold_free_shipping requires threshold_amount > 0.`);
      }
    }

    if (config.strategy === 'discount_percentage') {
      if (config.percent_off === null || config.percent_off <= 0 || config.percent_off > 100) {
        errors.push(`${label}: discount_percentage requires percent_off between 0 and 100.`);
      }
    }

    if (config.strategy === 'discount_fixed') {
      if (config.amount === null || config.amount <= 0) {
        errors.push(`${label}: discount_fixed requires amount > 0.`);
      }
    }

    if (config.strategy === 'carrier_quote') {
      if (!config.profile_id && config.method_handles.length === 0) {
        errors.push(`${label}: carrier_quote requires profile_id or at least one method handle.`);
      }
    }

    if (!isLikelyControlVariant(variant, index) && isActionableShippingConfig(config)) {
      actionableNonControl += 1;
    }
  });

  if (variants.length > 1 && actionableNonControl === 0) {
    errors.push(
      'Shipping tests require at least one non-control variant with an actionable shipping strategy.'
    );
  }

  return errors;
}

module.exports = {
  SHIPPING_STRATEGIES: Array.from(SHIPPING_STRATEGIES),
  SHIPPING_EXECUTION_HINTS: Array.from(SHIPPING_EXECUTION_HINTS),
  normalizeShippingVariantConfig,
  normalizeShippingTestPayload,
  validateShippingVariants,
  isActionableShippingConfig,
  isShippingTestPayload,
};
