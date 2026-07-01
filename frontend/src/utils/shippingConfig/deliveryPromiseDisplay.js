const SHIPPING_DELIVERY_PROMISE_LABELS = {
  next_business_day: 'Ships next business day',
  '2_3_business_days': 'Delivers in 2-3 business days',
  '5_7_business_days': 'Delivers in 5-7 business days',
};

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
  let resolvedMode = mode;
  if (!resolvedMode) {
    if (preset === 'custom' || minDeliveryDate || maxDeliveryDate) {
      resolvedMode = 'custom';
    } else if (preset) {
      resolvedMode = 'preset';
    } else {
      resolvedMode = 'none';
    }
  }
  return {
    mode: resolvedMode,
    preset: resolvedMode === 'custom' ? 'custom' : preset,
    min_delivery_date: minDeliveryDate,
    max_delivery_date: maxDeliveryDate || minDeliveryDate,
  };
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
  const normalizedTarget = normalizeShippingDeliveryDate(targetDateStr);
  if (!normalizedTarget) {
    return null;
  }
  const start = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate())
  );
  for (let days = 0; days <= 366; days += 1) {
    const cursor = new Date(start);
    let remaining = days;
    while (remaining > 0) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6) {
        remaining -= 1;
      }
    }
    if (cursor.toISOString().slice(0, 10) === normalizedTarget) {
      return days;
    }
  }
  return countBusinessDaysUntil(normalizedTarget, fromDate);
}

export function formatShippingDeliveryPromiseLabel(promise = {}, now = new Date()) {
  const normalized = normalizeShippingDeliveryPromise(promise);
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
    return SHIPPING_DELIVERY_PROMISE_LABELS[normalized.preset] || 'No delivery promise';
  }
  return 'No delivery promise';
}
