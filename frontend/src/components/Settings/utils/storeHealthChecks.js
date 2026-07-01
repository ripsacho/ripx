export const HEALTH_CHECK_LABELS = {
  script_detected: 'Storefront script',
  checkout_diag: 'Checkout diagnostics',
  running_price_test: 'Active price tests',
  tenant_registered: 'Tenant registration',
  cart_native_rendering: 'Cart native rendering',
};

export function getHealthCheckTitle(item) {
  const key = String(item?.key || '').trim();
  if (HEALTH_CHECK_LABELS[key]) return HEALTH_CHECK_LABELS[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

export function getHealthCheckStatus(item) {
  if (item?.ok) {
    return { tone: 'success', label: 'Passing' };
  }
  if (item?.advisory === true || item?.required === false) {
    return { tone: 'attention', label: 'Advisory' };
  }
  return { tone: 'critical', label: 'Blocking' };
}

export function sortHealthChecks(items) {
  const score = item => {
    if (item.ok) return 2;
    if (item.advisory === true || item.required === false) return 1;
    return 0;
  };
  return [...items].sort((a, b) => score(a) - score(b));
}

export function summarizeHealthChecks(checks) {
  const list = Array.isArray(checks) ? checks : [];
  let passing = 0;
  let advisory = 0;
  let blocking = 0;
  list.forEach(item => {
    if (item.ok) {
      passing += 1;
      return;
    }
    if (item.advisory === true || item.required === false) {
      advisory += 1;
      return;
    }
    blocking += 1;
  });
  return { passing, advisory, blocking, total: list.length };
}

export function getHealthSummaryHint(stats) {
  if (stats.blocking > 0) {
    return `${stats.blocking} blocking issue${stats.blocking === 1 ? '' : 's'} need attention.`;
  }
  if (stats.advisory > 0) {
    return `${stats.advisory} advisory item${stats.advisory === 1 ? '' : 's'} — review when convenient.`;
  }
  return 'All required checks are passing.';
}

export function partitionHealthChecks(checks) {
  const list = Array.isArray(checks) ? checks : [];
  return {
    required: sortHealthChecks(list.filter(item => item.required !== false)),
    optional: sortHealthChecks(list.filter(item => item.required === false)),
  };
}

export function filterVisibleHealthChecks(items, showPassing) {
  if (showPassing) return items;
  return items.filter(item => !item.ok || item.advisory === true);
}

export function shouldAutoOpenHealthChecks(checks) {
  return summarizeHealthChecks(checks).blocking > 0;
}

/** Expand the health panel when async diagnostics surface new blocking issues. */
export function shouldExpandHealthChecksOnUpdate(previousBlocking, nextBlocking) {
  const prev = Number(previousBlocking) || 0;
  const next = Number(nextBlocking) || 0;
  return next > prev && next > 0;
}

export function resolveSettingsPresetKey(settings, presets) {
  if (!settings || !presets) return null;
  const match = Object.entries(presets).find(([, preset]) => {
    return (
      Number(settings.minSampleSize) === Number(preset.minSampleSize) &&
      Math.abs(Number(settings.confidenceLevel) - Number(preset.confidenceLevel)) < 0.001 &&
      Boolean(settings.autoStopEnabled) === Boolean(preset.autoStopEnabled)
    );
  });
  return match?.[0] || null;
}
