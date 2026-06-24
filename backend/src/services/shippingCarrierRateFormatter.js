const DELIVERY_PROMISE_PRESETS = new Set([
  'none',
  'next_business_day',
  '2_3_business_days',
  '5_7_business_days',
  'custom',
]);

function toOptionalString(value, maxLen = 200) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, maxLen) : '';
}

function toFiniteNumber(value) {
  const n = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeDeliveryDate(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function normalizeDeliveryPromiseConfig(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const explicitMode = normalizeLower(
    raw.mode || raw.delivery_promise_mode || raw.deliveryPromiseMode
  );
  const preset = normalizeLower(
    raw.preset || raw.delivery_promise_preset || raw.deliveryPromisePreset
  );
  const minDeliveryDate = normalizeDeliveryDate(
    raw.min_delivery_date || raw.minDeliveryDate || raw.delivery_min_date || raw.deliveryMinDate
  );
  const maxDeliveryDate = normalizeDeliveryDate(
    raw.max_delivery_date || raw.maxDeliveryDate || raw.delivery_max_date || raw.deliveryMaxDate
  );
  let mode = explicitMode;
  if (!mode) {
    if (preset === 'custom' || minDeliveryDate || maxDeliveryDate) {
      mode = 'custom';
    } else if (preset) {
      mode = 'preset';
    } else {
      mode = 'none';
    }
  }
  let normalizedPreset = preset;

  if (DELIVERY_PROMISE_PRESETS.has(mode) && mode !== 'custom' && mode !== 'none') {
    normalizedPreset = mode;
    mode = 'preset';
  }
  if (mode === 'preset' && !DELIVERY_PROMISE_PRESETS.has(normalizedPreset)) {
    normalizedPreset = 'none';
    mode = 'none';
  }
  if (!['none', 'preset', 'custom'].includes(mode)) {
    mode = 'none';
    normalizedPreset = 'none';
  }
  if (mode === 'none') {
    normalizedPreset = 'none';
  }
  if (mode === 'custom') {
    normalizedPreset = 'custom';
  }

  return {
    mode,
    preset: normalizedPreset || (mode === 'preset' ? 'next_business_day' : 'none'),
    min_delivery_date: minDeliveryDate,
    max_delivery_date: maxDeliveryDate || minDeliveryDate,
  };
}

function hasMeaningfulDeliveryPromise(input = {}) {
  const normalized = normalizeDeliveryPromiseConfig(input);
  if (normalized.mode === 'custom') {
    return Boolean(normalized.min_delivery_date || normalized.max_delivery_date);
  }
  if (normalized.mode === 'preset') {
    return normalized.preset !== 'none';
  }
  return false;
}

function countBusinessDaysUntil(targetDateStr, fromDate = new Date()) {
  const match = String(targetDateStr || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    return null;
  }
  const target = new Date(`${match[1]}T12:00:00Z`);
  const start = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate())
  );
  if (Number.isNaN(target.getTime()) || target <= start) {
    return 0;
  }
  let count = 0;
  const cursor = new Date(start);
  while (cursor < target) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }
  return count;
}

function businessDaysUntilTarget(fromDate, targetDateStr) {
  const normalizedTarget = normalizeDeliveryDate(targetDateStr);
  if (!normalizedTarget) {
    return null;
  }
  for (let days = 0; days <= 366; days += 1) {
    if (formatDate(addBusinessDays(fromDate, days)) === normalizedTarget) {
      return days;
    }
  }
  return countBusinessDaysUntil(normalizedTarget, fromDate);
}

function formatDeliveryPromiseShopperLabel(deliveryPromise = {}, now = new Date()) {
  const normalized = normalizeDeliveryPromiseConfig(deliveryPromise);
  if (normalized.mode === 'custom') {
    const minDays = businessDaysUntilTarget(now, normalized.min_delivery_date);
    const maxDays = businessDaysUntilTarget(
      now,
      normalized.max_delivery_date || normalized.min_delivery_date
    );
    if (minDays !== null && maxDays !== null) {
      if (minDays === maxDays) {
        return minDays === 1
          ? 'Delivers in 1 business day'
          : `Delivers in ${minDays} business days`;
      }
      return `Delivers in ${minDays}-${maxDays} business days`;
    }
    if (normalized.min_delivery_date || normalized.max_delivery_date) {
      return `${normalized.min_delivery_date || 'Start'} to ${
        normalized.max_delivery_date || normalized.min_delivery_date
      }`;
    }
    return 'Custom date range';
  }
  if (normalized.mode === 'preset') {
    const presetLabels = {
      next_business_day: 'Ships next business day',
      '2_3_business_days': 'Delivers in 2-3 business days',
      '5_7_business_days': 'Delivers in 5-7 business days',
    };
    return presetLabels[normalized.preset] || 'No delivery promise';
  }
  return 'No delivery promise';
}

function normalizeCheckoutDisplayConfig(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const deliveryPromiseSource =
    raw.delivery_promise && typeof raw.delivery_promise === 'object'
      ? raw.delivery_promise
      : raw.deliveryPromise && typeof raw.deliveryPromise === 'object'
        ? raw.deliveryPromise
        : raw;
  return {
    default_description: toOptionalString(
      raw.default_description || raw.defaultDescription || raw.description,
      200
    ),
    delivery_promise: normalizeDeliveryPromiseConfig(deliveryPromiseSource),
  };
}

function toSafeServiceCodePart(value, maxLen = 16) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, maxLen);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addBusinessDays(fromDate, daysToAdd) {
  const date = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate())
  );
  let remaining = Math.max(0, Number(daysToAdd) || 0);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
    }
  }
  return date;
}

function resolveDeliveryPromiseDates(deliveryPromise = {}, now = new Date()) {
  const normalized = normalizeDeliveryPromiseConfig(deliveryPromise);
  if (normalized.mode === 'custom') {
    return {
      min_delivery_date: normalized.min_delivery_date,
      max_delivery_date: normalized.max_delivery_date || normalized.min_delivery_date,
    };
  }
  if (normalized.mode !== 'preset' || normalized.preset === 'none') {
    return { min_delivery_date: '', max_delivery_date: '' };
  }

  const presetWindows = {
    next_business_day: [1, 1],
    '2_3_business_days': [2, 3],
    '5_7_business_days': [5, 7],
  };
  const window = presetWindows[normalized.preset];
  if (!window) {
    return { min_delivery_date: '', max_delivery_date: '' };
  }
  return {
    min_delivery_date: formatDate(addBusinessDays(now, window[0])),
    max_delivery_date: formatDate(addBusinessDays(now, window[1])),
  };
}

function formatCarrierRateForCheckout({
  rateConfig = {},
  variantConfig = {},
  index = 0,
  serviceName = 'RipX Shipping',
  serviceCodeBase = 'shipping',
  fallbackAmount = null,
  fallbackCurrency = 'USD',
  now = new Date(),
} = {}) {
  const rawRate = rateConfig && typeof rateConfig === 'object' ? rateConfig : {};
  const hasOwnRateKey = key => Object.prototype.hasOwnProperty.call(rawRate, key);
  const hasExplicitRateDescription = hasOwnRateKey('description');
  const rateAmount = toFiniteNumber(
    rawRate.amount ?? rawRate.price ?? rawRate.rate ?? fallbackAmount
  );
  if (rateAmount === null || rateAmount < 0) {
    return null;
  }
  const checkoutDisplay = normalizeCheckoutDisplayConfig(
    variantConfig.checkout_display || variantConfig.checkoutDisplay || variantConfig
  );
  const rateName =
    toOptionalString(
      rawRate.name || rawRate.service_name || rawRate.serviceName || serviceName,
      100
    ) || serviceName;
  const revisionCodePart = toSafeServiceCodePart(
    variantConfig?.metadata?.shipping_config_revision ||
      variantConfig?.metadata?.shippingConfigRevision ||
      variantConfig?.shipping_config_revision ||
      variantConfig?.shippingConfigRevision
  );
  const fallbackCodeBase = revisionCodePart
    ? `${serviceCodeBase}_${revisionCodePart}`
    : serviceCodeBase;
  const rateCode =
    toOptionalString(rawRate.service_code || rawRate.serviceCode || rawRate.code, 100)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) || `ripx_flat_${fallbackCodeBase}_${index + 1}`;
  const rateDeliveryPromise = normalizeDeliveryPromiseConfig(
    rawRate.delivery_promise || rawRate.deliveryPromise || rawRate
  );
  const deliveryPromise = hasMeaningfulDeliveryPromise(rateDeliveryPromise)
    ? rateDeliveryPromise
    : checkoutDisplay.delivery_promise;
  const deliveryDates = resolveDeliveryPromiseDates(deliveryPromise, now);
  const normalizedRateDescription = toOptionalString(rawRate.description, 200) || '';
  const carrierRate = {
    service_name: rateName,
    description: hasExplicitRateDescription
      ? normalizedRateDescription
      : normalizedRateDescription || checkoutDisplay.default_description || '',
    service_code: rateCode,
    total_price: String(Math.max(0, Math.round(rateAmount * 100))),
    currency:
      toOptionalString(rawRate.currency || fallbackCurrency || 'USD', 3).toUpperCase() || 'USD',
  };

  if (deliveryDates.min_delivery_date) {
    carrierRate.min_delivery_date = deliveryDates.min_delivery_date;
  }
  if (deliveryDates.max_delivery_date) {
    carrierRate.max_delivery_date = deliveryDates.max_delivery_date;
  }

  return carrierRate;
}

module.exports = {
  normalizeCheckoutDisplayConfig,
  normalizeDeliveryPromiseConfig,
  hasMeaningfulDeliveryPromise,
  resolveDeliveryPromiseDates,
  countBusinessDaysUntil,
  formatDeliveryPromiseShopperLabel,
  formatCarrierRateForCheckout,
};
