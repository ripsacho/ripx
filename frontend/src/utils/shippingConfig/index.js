import { normalizeCheckoutListInput } from '../checkoutSections';

export const SHIPPING_STRATEGIES = [
  'control',
  'flat_rate',
  'threshold_free_shipping',
  'discount_percentage',
  'discount_fixed',
  'free_shipping',
  'carrier_quote',
];

export const SHIPPING_DISPLAY_MODES = ['add_preview_method', 'replace_existing_methods'];

export const SHIPPING_DELIVERY_PROMISE_OPTIONS = [
  { label: 'No delivery promise', value: 'none' },
  { label: 'Ships next business day', value: 'next_business_day' },
  { label: 'Delivers in 2-3 business days', value: '2_3_business_days' },
  { label: 'Delivers in 5-7 business days', value: '5_7_business_days' },
  { label: 'Custom date range', value: 'custom' },
];

export function toShippingNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function getShippingMethodHandles(cfg = {}) {
  if (Array.isArray(cfg.method_handles)) return cfg.method_handles;
  if (Array.isArray(cfg.methodHandles)) return cfg.methodHandles;
  return [];
}

export function getShippingDeliveryTargets(cfg = {}) {
  return normalizeCheckoutListInput(cfg.delivery_method_names || cfg.deliveryMethodNames);
}

export function getShippingScopeTargets(cfg = {}) {
  const scope = cfg.shipping_scope || cfg.shippingScope || {};
  if (!scope || typeof scope !== 'object') return [];
  return [
    scope.profile_id,
    scope.profileId,
    scope.location_group_id,
    scope.locationGroupId,
    scope.zone_id,
    scope.zoneId,
    ...(Array.isArray(scope.selected_rate_names) ? scope.selected_rate_names : []),
    ...(Array.isArray(scope.selectedRateNames) ? scope.selectedRateNames : []),
    ...(Array.isArray(scope.selected_method_definition_ids)
      ? scope.selected_method_definition_ids
      : []),
    ...(Array.isArray(scope.selectedMethodDefinitionIds) ? scope.selectedMethodDefinitionIds : []),
  ].filter(value => String(value || '').trim());
}

export function getShippingStrategy(cfg = {}) {
  const strategy = String(cfg.strategy || cfg.shipping_strategy || '')
    .trim()
    .toLowerCase();
  if (strategy) return strategy;

  const discountType = String(cfg.discount_type || cfg.discountType || '')
    .trim()
    .toLowerCase();
  if (discountType === 'free_shipping') return 'free_shipping';
  const percentOff = toShippingNumber(cfg.percent_off ?? cfg.discount_percent);
  const rate = toShippingNumber(cfg.rate ?? cfg.shipping_rate ?? cfg.amount);
  if (
    cfg.threshold_amount !== undefined ||
    cfg.free_shipping_threshold !== undefined ||
    cfg.freeShippingThreshold !== undefined
  ) {
    return 'threshold_free_shipping';
  }
  if (
    discountType === 'percent' ||
    (percentOff !== null && (rate === null || String(cfg.rate || '').trim() === ''))
  ) {
    return 'discount_percentage';
  }
  if (discountType === 'fixed') return 'discount_fixed';

  if (
    cfg.profile_id ||
    cfg.profileId ||
    getShippingMethodHandles(cfg).length > 0 ||
    getShippingDeliveryTargets(cfg).length > 0 ||
    getShippingScopeTargets(cfg).length > 0
  ) {
    return 'carrier_quote';
  }

  if (
    cfg.amount !== undefined ||
    cfg.rate !== undefined ||
    cfg.shipping_rate !== undefined ||
    cfg.discount_value !== undefined ||
    (Array.isArray(cfg.rates) && cfg.rates.length > 0)
  ) {
    return 'flat_rate';
  }

  return 'control';
}

export function normalizeShippingRates(cfg = {}, fallbackCurrency = 'USD') {
  if (!Array.isArray(cfg?.rates)) return [];
  const rawRates =
    cfg.rates.length === 1 &&
    String(cfg.rates[0]?.service_code || cfg.rates[0]?.serviceCode || cfg.rates[0]?.code || '')
      .trim()
      .toLowerCase() === 'ripx_flat_rate'
      ? []
      : cfg.rates;

  return rawRates.map((rate, index) => {
    const raw = rate && typeof rate === 'object' ? rate : {};
    const amount = toShippingNumber(raw.amount ?? raw.price ?? raw.rate);
    const priority = Number.parseInt(String(raw.priority ?? index + 1), 10);
    const sortOrder = Number.parseInt(
      String(raw.sort_order ?? raw.sortOrder ?? raw.priority ?? index + 1),
      10
    );
    return {
      ...raw,
      name: String(raw.name || raw.service_name || raw.serviceName || '').trim(),
      amount,
      description: String(raw.description || '').trim(),
      delivery_promise: raw.delivery_promise || raw.deliveryPromise || raw,
      currency: String(raw.currency || fallbackCurrency || 'USD')
        .trim()
        .toUpperCase(),
      priority: Number.isFinite(priority) ? priority : null,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : null,
    };
  });
}

export function normalizeShippingDeliveryDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function normalizeShippingDeliveryPromise(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const promise =
    source.delivery_promise && typeof source.delivery_promise === 'object'
      ? source.delivery_promise
      : source.deliveryPromise && typeof source.deliveryPromise === 'object'
        ? source.deliveryPromise
        : source;
  const mode = String(
    promise.mode || promise.delivery_promise_mode || promise.deliveryPromiseMode || ''
  )
    .trim()
    .toLowerCase();
  const preset = String(
    promise.preset || promise.delivery_promise_preset || promise.deliveryPromisePreset || ''
  )
    .trim()
    .toLowerCase();
  const minDeliveryDate = normalizeShippingDeliveryDate(
    promise.min_delivery_date ||
      promise.minDeliveryDate ||
      promise.delivery_min_date ||
      promise.deliveryMinDate
  );
  const maxDeliveryDate = normalizeShippingDeliveryDate(
    promise.max_delivery_date ||
      promise.maxDeliveryDate ||
      promise.delivery_max_date ||
      promise.deliveryMaxDate
  );
  return {
    mode: mode || (preset ? 'preset' : minDeliveryDate || maxDeliveryDate ? 'custom' : 'none'),
    preset,
    min_delivery_date: minDeliveryDate,
    max_delivery_date: maxDeliveryDate || minDeliveryDate,
  };
}

export function getShippingDisplayMode(cfg = {}) {
  const displayMode = String(
    cfg.shipping_display_mode ||
      cfg.shippingDisplayMode ||
      cfg.display_mode ||
      cfg.displayMode ||
      ''
  )
    .trim()
    .toLowerCase();
  if (displayMode === 'replace_existing_methods') return 'replace_existing_methods';
  if (displayMode === 'add_preview_method') return 'add_preview_method';
  return cfg.replace_existing_rates || cfg.replaceExistingRates
    ? 'replace_existing_methods'
    : 'add_preview_method';
}

export function shouldReplaceExistingShippingMethods(cfg = {}) {
  return getShippingDisplayMode(cfg) === 'replace_existing_methods';
}

export function isControlLikeShippingVariant(variant, index) {
  const name = String(variant?.name || '')
    .trim()
    .toLowerCase();
  return index === 0 || name === 'control' || name.startsWith('control ');
}

export function hasActionableShippingConfig(cfg = {}) {
  const strategy = getShippingStrategy(cfg);
  const amount = toShippingNumber(
    cfg.amount ?? cfg.rate ?? cfg.shipping_rate ?? cfg.discount_value
  );
  const threshold = toShippingNumber(
    cfg.threshold_amount ?? cfg.free_shipping_threshold ?? cfg.freeShippingThreshold
  );
  const percentOff = toShippingNumber(
    cfg.percent_off ??
      cfg.discount_percent ??
      (String(cfg.discount_type || '').toLowerCase() === 'percent' ? cfg.discount_value : null)
  );
  const profileId = String(cfg.profile_id || cfg.profileId || '').trim();
  const methodHandles = getShippingMethodHandles(cfg);
  const deliveryTargets = getShippingDeliveryTargets(cfg);
  const scopeTargets = getShippingScopeTargets(cfg);
  const rates = normalizeShippingRates(cfg);
  const hasActionableRate = rates.some(rate => rate.amount !== null && rate.amount >= 0);

  if (strategy === 'flat_rate') {
    if (shouldReplaceExistingShippingMethods(cfg)) {
      return ((amount !== null && amount >= 0) || hasActionableRate) && deliveryTargets.length > 0;
    }
    return (amount !== null && amount >= 0) || hasActionableRate;
  }
  if (strategy === 'threshold_free_shipping') return threshold !== null && threshold > 0;
  if (strategy === 'discount_percentage') {
    return percentOff !== null && percentOff > 0 && percentOff <= 100;
  }
  if (strategy === 'discount_fixed') return amount !== null && amount > 0;
  if (strategy === 'free_shipping') return true;
  if (strategy === 'carrier_quote') {
    return Boolean(
      profileId || methodHandles.length > 0 || deliveryTargets.length > 0 || scopeTargets.length > 0
    );
  }
  return false;
}

export function getShippingReadiness(variant, index) {
  const cfg = variant?.config || {};
  const strategy = getShippingStrategy(cfg);
  if (isControlLikeShippingVariant(variant, index) || strategy === 'control') {
    return { tone: 'success', label: 'Baseline', status: 'control', issue: 'No shipping change' };
  }

  const amount = toShippingNumber(
    cfg.amount ?? cfg.rate ?? cfg.shipping_rate ?? cfg.discount_value
  );
  const threshold = toShippingNumber(
    cfg.threshold_amount ?? cfg.free_shipping_threshold ?? cfg.freeShippingThreshold
  );
  const percentOff = toShippingNumber(
    cfg.percent_off ??
      cfg.discount_percent ??
      (String(cfg.discount_type || '').toLowerCase() === 'percent' ? cfg.discount_value : null)
  );
  const rates = normalizeShippingRates(cfg);
  const hasActionableRate = rates.some(rate => rate.amount !== null && rate.amount >= 0);
  const deliveryTargets = getShippingDeliveryTargets(cfg);
  const methodHandles = getShippingMethodHandles(cfg);
  const profileId = String(cfg.profile_id || cfg.profileId || '').trim();
  const scopeTargets = getShippingScopeTargets(cfg);

  if (strategy === 'flat_rate' && (amount === null || amount < 0) && !hasActionableRate) {
    return {
      tone: 'attention',
      label: 'Needs rate',
      status: 'blocked',
      issue: 'Add fallback amount or at least one configured rate >= 0',
    };
  }
  if (
    strategy === 'flat_rate' &&
    shouldReplaceExistingShippingMethods(cfg) &&
    deliveryTargets.length === 0
  ) {
    return {
      tone: 'attention',
      label: 'Needs methods',
      status: 'blocked',
      issue: 'Pick methods to replace',
    };
  }
  if (strategy === 'threshold_free_shipping' && (threshold === null || threshold <= 0)) {
    return {
      tone: 'attention',
      label: 'Needs threshold',
      status: 'blocked',
      issue: 'Add threshold greater than 0',
    };
  }
  if (
    strategy === 'discount_percentage' &&
    (percentOff === null || percentOff <= 0 || percentOff > 100)
  ) {
    return {
      tone: 'attention',
      label: 'Needs percent',
      status: 'blocked',
      issue: 'Add percent between 1 and 100',
    };
  }
  if (strategy === 'discount_fixed' && (amount === null || amount <= 0)) {
    return {
      tone: 'attention',
      label: 'Needs amount',
      status: 'blocked',
      issue: 'Add fixed discount amount > 0',
    };
  }
  if (
    strategy === 'carrier_quote' &&
    String(cfg.delivery_action || cfg.deliveryAction || 'hide').toLowerCase() === 'rename' &&
    deliveryTargets.length > 0 &&
    !String(cfg.delivery_rename_to || cfg.deliveryRenameTo || '').trim()
  ) {
    return {
      tone: 'attention',
      label: 'Needs label',
      status: 'blocked',
      issue: 'Add rename label',
    };
  }
  if (
    strategy === 'carrier_quote' &&
    !profileId &&
    methodHandles.length === 0 &&
    deliveryTargets.length === 0 &&
    scopeTargets.length === 0
  ) {
    return {
      tone: 'attention',
      label: 'Needs target',
      status: 'blocked',
      issue: 'Add profile, method handle, delivery method target, or shipping scope',
    };
  }
  return { tone: 'info', label: 'Ready', status: 'ready', issue: 'Configuration is actionable' };
}

export function getShippingVariantSummary(
  variant,
  index,
  formatMoney = value => `$${Number(value).toFixed(2)}`
) {
  const cfg = variant?.config || {};
  const strategy = getShippingStrategy(cfg);
  const amount = toShippingNumber(
    cfg.amount ?? cfg.rate ?? cfg.shipping_rate ?? cfg.discount_value
  );
  const threshold = toShippingNumber(
    cfg.threshold_amount ?? cfg.free_shipping_threshold ?? cfg.freeShippingThreshold
  );
  const percentOff = toShippingNumber(
    cfg.percent_off ??
      cfg.discount_percent ??
      (String(cfg.discount_type || '').toLowerCase() === 'percent' ? cfg.discount_value : null)
  );
  const configuredRates = normalizeShippingRates(cfg, cfg.currency || 'USD').filter(
    rate => rate.amount !== null && rate.amount >= 0
  );
  const deliveryTargets = getShippingDeliveryTargets(cfg);
  const methodHandles = getShippingMethodHandles(cfg);

  if (isControlLikeShippingVariant(variant, index) || strategy === 'control')
    return 'No shipping change';
  if (strategy === 'flat_rate') {
    if (configuredRates.length > 1) return `${configuredRates.length} configured flat rates`;
    if (configuredRates.length === 1)
      return `${formatMoney(configuredRates[0].amount)} configured rate`;
    return amount !== null ? `${formatMoney(amount)} flat rate` : 'Flat rate';
  }
  if (strategy === 'threshold_free_shipping') {
    return threshold !== null ? `Free over ${formatMoney(threshold)}` : 'Free over threshold';
  }
  if (strategy === 'discount_percentage') {
    return percentOff !== null ? `${Number(percentOff)}% off shipping` : '% off shipping';
  }
  if (strategy === 'discount_fixed') {
    return amount !== null ? `${formatMoney(amount)} off shipping` : '$ off shipping';
  }
  if (strategy === 'free_shipping') return 'Force free shipping';
  if (strategy === 'carrier_quote') {
    if (methodHandles.length > 0) {
      return `${methodHandles.length} method handle${methodHandles.length === 1 ? '' : 's'}`;
    }
    if (deliveryTargets.length > 0) {
      return `${deliveryTargets.length} delivery target${deliveryTargets.length === 1 ? '' : 's'}`;
    }
    return 'Carrier quote';
  }
  return strategy || 'Control';
}
