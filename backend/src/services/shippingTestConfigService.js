const SHIPPING_STRATEGIES = new Set([
  'control',
  'flat_rate',
  'threshold_free_shipping',
  'discount_percentage',
  'discount_fixed',
  'free_shipping',
  'carrier_quote',
]);

const {
  normalizeCheckoutDisplayConfig,
  normalizeDeliveryPromiseConfig,
} = require('./shippingCarrierRateFormatter');

const SHIPPING_EXECUTION_HINTS = new Set([
  'auto',
  'carrier_service',
  'discount_function',
  'delivery_customization',
  'manual',
]);

const SHIPPING_DISPLAY_MODES = new Set(['add_preview_method', 'replace_existing_methods']);
const DEFAULT_LEGACY_PREVIEW_LABEL_PREFIXES = ['RipX Preview', 'New'];

function collectLegacyPreviewLabelPrefixes(raw = {}) {
  const configured = toOptionalString(
    raw.preview_label_prefix || raw.previewLabelPrefix || raw.label_prefix || raw.labelPrefix,
    40
  );
  return Array.from(
    new Set([configured, ...DEFAULT_LEGACY_PREVIEW_LABEL_PREFIXES].filter(Boolean))
  );
}

function stripLegacyPreviewLabelFromName(name, prefixes = DEFAULT_LEGACY_PREVIEW_LABEL_PREFIXES) {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    return '';
  }
  for (const prefix of prefixes) {
    const normalizedPrefix = String(prefix || '').trim();
    if (!normalizedPrefix) {
      continue;
    }
    const lowerName = normalizedName.toLowerCase();
    const lowerPrefix = normalizedPrefix.toLowerCase();
    if (lowerName.startsWith(`${lowerPrefix}:`)) {
      return normalizedName.slice(normalizedPrefix.length + 1).trim();
    }
    if (lowerName.startsWith(`${lowerPrefix} `)) {
      return normalizedName.slice(normalizedPrefix.length + 1).trim();
    }
  }
  return normalizedName;
}

function stripLegacyShippingPreviewMetadata(config = {}) {
  const raw = config && typeof config === 'object' ? config : {};
  const prefixes = collectLegacyPreviewLabelPrefixes(raw);
  const cleaned = { ...raw };
  delete cleaned.preview_label_prefix;
  delete cleaned.previewLabelPrefix;
  delete cleaned.label_prefix;
  delete cleaned.labelPrefix;

  if (Array.isArray(cleaned.rates)) {
    cleaned.rates = cleaned.rates.map(rate => {
      const item = rate && typeof rate === 'object' ? { ...rate } : {};
      ['name', 'service_name', 'serviceName'].forEach(field => {
        if (item[field]) {
          item[field] = stripLegacyPreviewLabelFromName(item[field], prefixes);
        }
      });
      return item;
    });
  }

  if (cleaned.label) {
    cleaned.label = stripLegacyPreviewLabelFromName(cleaned.label, prefixes);
  }

  const metadata =
    cleaned.metadata && typeof cleaned.metadata === 'object' ? { ...cleaned.metadata } : null;
  if (metadata) {
    if (metadata.quote_service_name) {
      metadata.quote_service_name = stripLegacyPreviewLabelFromName(
        metadata.quote_service_name,
        prefixes
      );
    }
    if (metadata.quoteServiceName) {
      metadata.quoteServiceName = stripLegacyPreviewLabelFromName(
        metadata.quoteServiceName,
        prefixes
      );
    }
    cleaned.metadata = metadata;
  }

  return cleaned;
}

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

function toOptionalInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : null;
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

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return Boolean(fallback);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return ['1', 'true', 'yes', 'y', 'on'].includes(toLowerString(value));
}

function slugifyReplacementServiceCode(value, index = 0) {
  const slug =
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `method_${index + 1}`;
  return `ripx_replace_${slug}`.slice(0, 64);
}

function slugifyNativeDeliveryMethodCode(value, index = 0) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || `method_${index + 1}`;
}

function buildNativeDeliveryMethodCodes(methodNames = []) {
  const codes = [];
  methodNames.forEach((name, index) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      return;
    }
    codes.push(trimmed);
    codes.push(trimmed.toLowerCase());
    codes.push(slugifyNativeDeliveryMethodCode(trimmed, index));
    codes.push(
      String(trimmed)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    );
  });
  return Array.from(new Set(codes.filter(Boolean))).slice(0, 50);
}

function normalizeShippingScope(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const selectedRateIds = toStringArray(
    raw.selected_rate_ids || raw.selectedRateIds || raw.rate_ids || raw.rateIds
  );
  const selectedRateNames = toStringArray(
    raw.selected_rate_names || raw.selectedRateNames || raw.rate_names || raw.rateNames
  );
  const selectedMethodDefinitionIds = toStringArray(
    raw.selected_method_definition_ids ||
      raw.selectedMethodDefinitionIds ||
      raw.method_definition_ids ||
      raw.methodDefinitionIds
  );
  return {
    profile_id: toOptionalString(raw.profile_id || raw.profileId, 220),
    profile_name: toOptionalString(raw.profile_name || raw.profileName, 160),
    location_group_id: toOptionalString(raw.location_group_id || raw.locationGroupId, 220),
    zone_id: toOptionalString(raw.zone_id || raw.zoneId, 220),
    zone_name: toOptionalString(raw.zone_name || raw.zoneName, 160),
    countries: toCountryCodes(raw.countries || raw.zone_countries || raw.zoneCountries),
    selected_rate_ids: selectedRateIds,
    selected_rate_names: selectedRateNames,
    selected_method_definition_ids: selectedMethodDefinitionIds,
  };
}

function hasShippingScopeValue(scope = {}) {
  return Boolean(
    scope.profile_id ||
    scope.profile_name ||
    scope.location_group_id ||
    scope.zone_id ||
    scope.zone_name ||
    scope.countries.length > 0 ||
    scope.selected_rate_ids.length > 0 ||
    scope.selected_rate_names.length > 0 ||
    scope.selected_method_definition_ids.length > 0
  );
}

function normalizeShippingRateConfig(input = {}, index = 0, fallbackCurrency = 'USD') {
  const raw = input && typeof input === 'object' ? input : {};
  const name = toOptionalString(raw.name || raw.service_name || raw.serviceName, 100);
  const priority =
    toOptionalInteger(raw.priority ?? raw.order ?? raw.position ?? raw.rank) ?? index + 1;
  const sortOrder = toOptionalInteger(raw.sort_order ?? raw.sortOrder) ?? priority;
  const serviceCode = toOptionalString(
    raw.service_code || raw.serviceCode || raw.code || (name ? '' : `ripx_rate_${index + 1}`),
    100
  );
  return {
    name,
    description: toOptionalString(raw.description, 200),
    delivery_promise: normalizeDeliveryPromiseConfig(
      raw.delivery_promise || raw.deliveryPromise || raw
    ),
    amount: toOptionalNumber(raw.amount ?? raw.price ?? raw.rate),
    currency: toCurrency(raw.currency || fallbackCurrency),
    service_code: serviceCode,
    condition_type: toLowerString(raw.condition_type || raw.conditionType || 'none') || 'none',
    cart_total_min: toOptionalNumber(raw.cart_total_min ?? raw.cartTotalMin),
    cart_total_max: toOptionalNumber(raw.cart_total_max ?? raw.cartTotalMax),
    weight_min: toOptionalNumber(raw.weight_min ?? raw.weightMin),
    weight_max: toOptionalNumber(raw.weight_max ?? raw.weightMax),
    countries: toCountryCodes(raw.countries),
    source_method_name: toOptionalString(
      raw.source_method_name || raw.sourceMethodName || raw.source_rate_name || raw.sourceRateName,
      120
    ),
    source_rate_name: toOptionalString(
      raw.source_rate_name || raw.sourceRateName || raw.source_method_name || raw.sourceMethodName,
      120
    ),
    source_rate_id: toOptionalString(raw.source_rate_id || raw.sourceRateId, 200),
    source_method_definition_id: toOptionalString(
      raw.source_method_definition_id || raw.sourceMethodDefinitionId,
      200
    ),
    source_method_ids: toStringArray(raw.source_method_ids || raw.sourceMethodIds),
    priority,
    sort_order: sortOrder,
  };
}

function normalizeShippingRates(input, _fallbackAmount = null, fallbackCurrency = 'USD') {
  const rawRates = Array.isArray(input) ? input : [];
  const isGeneratedFallbackRate =
    rawRates.length === 1 &&
    String(rawRates[0]?.service_code || rawRates[0]?.serviceCode || rawRates[0]?.code || '')
      .trim()
      .toLowerCase() === 'ripx_flat_rate';
  if (isGeneratedFallbackRate) {
    return [];
  }
  const normalizedRates = rawRates
    .map((rate, index) => normalizeShippingRateConfig(rate, index, fallbackCurrency))
    .filter(rate => rate.amount !== null || rate.name || rate.service_code)
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      if (a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return String(a.name || a.service_code || '').localeCompare(
        String(b.name || b.service_code || '')
      );
    });
  if (normalizedRates.length > 0) {
    return normalizedRates.slice(0, 20);
  }
  return [];
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
  if (
    profileId ||
    (Array.isArray(config.method_handles) && config.method_handles.length > 0) ||
    (Array.isArray(config.methodHandles) && config.methodHandles.length > 0) ||
    (Array.isArray(config.delivery_method_names) && config.delivery_method_names.length > 0) ||
    (Array.isArray(config.deliveryMethodNames) && config.deliveryMethodNames.length > 0)
  ) {
    return 'carrier_quote';
  }
  if (
    rate !== null ||
    discountValue !== null ||
    (Array.isArray(config.rates) && config.rates.length > 0)
  ) {
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

function normalizeShippingDisplayMode(value, replaceExistingRates = false) {
  const normalized = toLowerString(value || '');
  if (SHIPPING_DISPLAY_MODES.has(normalized)) {
    return normalized;
  }
  return replaceExistingRates ? 'replace_existing_methods' : 'add_preview_method';
}

function normalizeShippingVariantConfig(config = {}) {
  const raw = stripLegacyShippingPreviewMetadata(config);
  const strategy = inferStrategy(raw);
  const amount = toOptionalNumber(raw.amount ?? raw.rate ?? raw.shipping_rate);
  const currency = toCurrency(raw.currency);
  const shippingScope = normalizeShippingScope(raw.shipping_scope || raw.shippingScope || raw);
  const replaceExistingRates = toBoolean(raw.replace_existing_rates ?? raw.replaceExistingRates);
  const shippingDisplayMode = normalizeShippingDisplayMode(
    raw.shipping_display_mode || raw.shippingDisplayMode || raw.display_mode || raw.displayMode,
    replaceExistingRates
  );

  const normalized = {
    strategy,
    amount,
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
    currency,
    label: toOptionalString(raw.label, 80),
    checkout_display: normalizeCheckoutDisplayConfig(
      raw.checkout_display || raw.checkoutDisplay || raw
    ),
    shipping_scope: shippingScope,
    rates: normalizeShippingRates(raw.rates, amount, currency),
    profile_id: shippingScope.profile_id || toOptionalString(raw.profile_id || raw.profileId, 200),
    method_handles: toStringArray(raw.method_handles || raw.methodHandles),
    delivery_method_names: toStringArray(
      raw.delivery_method_names || raw.deliveryMethodNames || raw.method_names || raw.methodNames
    ),
    delivery_method_codes: toStringArray(
      raw.delivery_method_codes || raw.deliveryMethodCodes || raw.method_codes || raw.methodCodes
    ),
    delivery_action: toLowerString(
      raw.delivery_action || raw.deliveryAction || raw.action || 'hide'
    ),
    delivery_rename_to: toOptionalString(
      raw.delivery_rename_to || raw.deliveryRenameTo || raw.rename_to,
      120
    ),
    zone_countries: shippingScope.countries.length
      ? shippingScope.countries
      : toCountryCodes(raw.zone_countries || raw.zoneCountries),
    shipping_display_mode: shippingDisplayMode,
    replace_existing_rates: shippingDisplayMode === 'replace_existing_methods',
    execution_hint: normalizeExecutionHint(raw.execution_hint || raw.executionHint),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
  };

  if (
    normalized.delivery_method_codes.length === 0 &&
    normalized.delivery_method_names.length > 0
  ) {
    normalized.delivery_method_codes = buildNativeDeliveryMethodCodes(
      normalized.delivery_method_names
    );
  }

  if (Array.isArray(normalized.shipping_scope?.selected_rate_names)) {
    const scopedNames = normalized.shipping_scope.selected_rate_names
      .map(name => String(name || '').trim())
      .filter(Boolean);
    if (scopedNames.length > 0) {
      normalized.delivery_method_names = Array.from(
        new Set([...normalized.delivery_method_names, ...scopedNames])
      ).slice(0, 50);
      normalized.delivery_method_codes = Array.from(
        new Set([
          ...normalized.delivery_method_codes,
          ...buildNativeDeliveryMethodCodes(normalized.delivery_method_names),
        ])
      ).slice(0, 50);
    }
  }

  if (
    normalized.shipping_display_mode === 'replace_existing_methods' &&
    normalized.delivery_method_names.length === 0
  ) {
    normalized.shipping_display_mode = 'add_preview_method';
    normalized.replace_existing_rates = false;
  }

  if (strategy === 'discount_fixed' && normalized.amount === null) {
    normalized.amount = toOptionalNumber(raw.discount_value ?? raw.discountValue);
  }
  if (strategy === 'discount_percentage' && normalized.percent_off === null) {
    normalized.percent_off = toOptionalNumber(raw.discount_value ?? raw.discountValue);
  }
  if (
    (normalized.strategy === 'flat_rate' || normalized.strategy === 'carrier_quote') &&
    normalized.shipping_display_mode === 'replace_existing_methods'
  ) {
    normalized.rates = normalized.rates.map((rate, index) => ({
      ...rate,
      service_code:
        rate.service_code ||
        slugifyReplacementServiceCode(
          rate.source_method_name || rate.source_rate_name || rate.name,
          index
        ),
    }));
  }
  if (normalized.strategy === 'carrier_quote') {
    const primaryRate = normalized.rates[0] || null;
    const nextMetadata = { ...normalized.metadata };
    if (!toOptionalString(nextMetadata.quote_service_name) && primaryRate?.name) {
      nextMetadata.quote_service_name = primaryRate.name;
    }
    if (
      nextMetadata.quote_amount === undefined ||
      nextMetadata.quote_amount === null ||
      String(nextMetadata.quote_amount).trim() === ''
    ) {
      const fromRate = toOptionalNumber(primaryRate?.amount);
      if (fromRate !== null) {
        nextMetadata.quote_amount = fromRate;
      }
    }
    normalized.metadata = nextMetadata;
    if (normalized.amount === null && nextMetadata.quote_amount !== null) {
      normalized.amount = toOptionalNumber(nextMetadata.quote_amount);
    }
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
      return (
        (normalized.amount !== null && normalized.amount >= 0) ||
        normalized.rates.some(rate => rate.amount !== null && rate.amount >= 0)
      );
    case 'threshold_free_shipping':
      return normalized.threshold_amount !== null && normalized.threshold_amount > 0;
    case 'discount_percentage':
      return normalized.percent_off !== null && normalized.percent_off > 0;
    case 'discount_fixed':
      return normalized.amount !== null && normalized.amount > 0;
    case 'free_shipping':
      return true;
    case 'carrier_quote': {
      const metadata =
        normalized.metadata && typeof normalized.metadata === 'object' ? normalized.metadata : {};
      const provider = toLowerString(
        metadata.quote_provider || metadata.quoteProvider || metadata.provider || ''
      );
      const hasResolvableAmount =
        (normalized.amount !== null && normalized.amount >= 0) ||
        normalized.rates.some(rate => rate.amount !== null && rate.amount >= 0) ||
        (metadata.quote_amount !== undefined &&
          metadata.quote_amount !== null &&
          Number(metadata.quote_amount) >= 0);
      const hasScope = Boolean(
        normalized.profile_id ||
        hasShippingScopeValue(normalized.shipping_scope) ||
        normalized.method_handles.length > 0 ||
        normalized.delivery_method_names.length > 0
      );
      const isReplaceMode = normalized.shipping_display_mode === 'replace_existing_methods';
      const isDeliveryOnly =
        !isReplaceMode &&
        (normalized.delivery_action === 'rename' ||
          normalized.delivery_action === 'reorder' ||
          normalized.execution_hint === 'delivery_customization');
      if (!hasScope) {
        return false;
      }
      if (isDeliveryOnly) {
        return true;
      }
      if (isReplaceMode) {
        if (provider === 'country_table') {
          const countryRates = String(metadata.country_rates || metadata.countryRates || '').trim();
          return Boolean(countryRates);
        }
        return hasResolvableAmount;
      }
      return true;
    }
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
      const hasValidFlatRate =
        (config.amount !== null && config.amount >= 0) ||
        config.rates.some(rate => rate.amount !== null && rate.amount >= 0);
      if (!hasValidFlatRate) {
        errors.push(`${label}: flat_rate requires an amount >= 0.`);
      }
      const replacesExistingRates = config.shipping_display_mode === 'replace_existing_methods';
      if (replacesExistingRates && config.delivery_action !== 'hide') {
        errors.push(`${label}: replacement flat_rate can only hide existing delivery methods.`);
      }
    }

    const defaultDescription = String(config.checkout_display?.default_description || '');
    if (defaultDescription.length > 200) {
      errors.push(
        `${label}: checkout display default description must be 200 characters or fewer.`
      );
    }
    config.rates.forEach((rate, rateIndex) => {
      if (String(rate.description || '').length > 200) {
        errors.push(`${label}: rate ${rateIndex + 1} description must be 200 characters or fewer.`);
      }
      const promise = rate.delivery_promise || config.checkout_display?.delivery_promise || {};
      if (promise.mode && promise.mode !== 'none' && rate.amount === null) {
        errors.push(`${label}: rate ${rateIndex + 1} delivery promise requires a rate amount.`);
      }
      if (
        promise.mode === 'custom' &&
        promise.min_delivery_date &&
        promise.max_delivery_date &&
        promise.min_delivery_date > promise.max_delivery_date
      ) {
        errors.push(`${label}: rate ${rateIndex + 1} delivery promise date range is invalid.`);
      }
    });

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
      if (
        !config.profile_id &&
        !hasShippingScopeValue(config.shipping_scope) &&
        config.method_handles.length === 0 &&
        config.delivery_method_names.length === 0
      ) {
        errors.push(
          `${label}: carrier_quote requires profile_id, at least one method handle, or at least one delivery method name.`
        );
      }
    }

    if (config.delivery_action === 'rename' && !config.delivery_rename_to) {
      errors.push(`${label}: delivery rename action requires delivery_rename_to.`);
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

function summarizeShippingConfigNormalization(variants = []) {
  const summary = {
    total_variants: Array.isArray(variants) ? variants.length : 0,
    actionable_variants: 0,
    strategy_counts: {},
    display_mode_counts: {},
    replace_mode_variants: 0,
    additive_mode_variants: 0,
    multi_rate_variants: 0,
    blocker_count: 0,
  };

  if (!Array.isArray(variants)) {
    return summary;
  }

  variants.forEach((variant, index) => {
    const config = normalizeShippingVariantConfig(variant?.config || {});
    summary.strategy_counts[config.strategy] = (summary.strategy_counts[config.strategy] || 0) + 1;
    summary.display_mode_counts[config.shipping_display_mode] =
      (summary.display_mode_counts[config.shipping_display_mode] || 0) + 1;
    if (config.shipping_display_mode === 'replace_existing_methods') {
      summary.replace_mode_variants += 1;
    } else {
      summary.additive_mode_variants += 1;
    }
    if (Array.isArray(config.rates) && config.rates.length > 1) {
      summary.multi_rate_variants += 1;
    }
    if (!isLikelyControlVariant(variant, index) && isActionableShippingConfig(config)) {
      summary.actionable_variants += 1;
    }
  });

  summary.blocker_count = validateShippingVariants(variants).length;
  return summary;
}

module.exports = {
  SHIPPING_STRATEGIES: Array.from(SHIPPING_STRATEGIES),
  SHIPPING_EXECUTION_HINTS: Array.from(SHIPPING_EXECUTION_HINTS),
  SHIPPING_DISPLAY_MODES: Array.from(SHIPPING_DISPLAY_MODES),
  normalizeShippingVariantConfig,
  normalizeShippingTestPayload,
  normalizeShippingScope,
  normalizeShippingRates,
  summarizeShippingConfigNormalization,
  validateShippingVariants,
  isActionableShippingConfig,
  isShippingTestPayload,
};
