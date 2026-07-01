/**
 * Compact HUD-style metrics for the Store settings header.
 */

function findCheck(checks, key) {
  const list = Array.isArray(checks) ? checks : [];
  return list.find(item => item.key === key) || null;
}

function statusFromCheck(check) {
  if (!check) return 'neutral';
  if (check.ok) return check.advisory ? 'warn' : 'ok';
  if (check.advisory) return 'warn';
  return 'fail';
}

function truncateHint(text, max = 72) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function buildSettingsSystemsMetrics({
  storeHealth,
  checkoutDiagLastCheckedAt,
  checkoutDiagLoading = false,
  configuredIntegrationCount = 0,
  integrationsTotal = 2,
  setupComplete = false,
  formatRelativeTime,
}) {
  const scriptCheck = findCheck(storeHealth?.checks, 'script_detected');
  const diagCheck = findCheck(storeHealth?.checks, 'checkout_diag');
  const failedRequired = Array.isArray(storeHealth?.failed) ? storeHealth.failed.length : 0;
  const diagAge =
    typeof formatRelativeTime === 'function' && checkoutDiagLastCheckedAt
      ? formatRelativeTime(checkoutDiagLastCheckedAt)
      : null;

  return [
    {
      id: 'storefront',
      label: 'Storefront',
      value: scriptCheck?.ok ? 'Live' : 'Action needed',
      hint: scriptCheck?.ok
        ? 'Script or theme embed detected'
        : truncateHint(scriptCheck?.message) || 'Enable theme embed or App Proxy',
      status: statusFromCheck(scriptCheck),
      tabId: 'installation',
    },
    {
      id: 'checkout',
      label: 'Checkout sync',
      value: checkoutDiagLoading ? 'Checking…' : diagCheck?.ok ? diagAge || 'Synced' : 'Review',
      hint: checkoutDiagLoading
        ? 'Refreshing checkout diagnostics'
        : diagCheck?.ok
          ? 'Checkout diagnostics cached for this store'
          : truncateHint(diagCheck?.message) || 'Run checkout diagnostics in Store setup',
      status: checkoutDiagLoading ? 'neutral' : statusFromCheck(diagCheck),
      tabId: diagCheck?.ok ? 'advanced' : 'installation',
    },
    {
      id: 'connections',
      label: 'Connections',
      value: `${configuredIntegrationCount}/${integrationsTotal}`,
      hint:
        configuredIntegrationCount > 0
          ? 'GA4 or BigQuery linked for this store'
          : 'Optional analytics destinations',
      status: configuredIntegrationCount > 0 ? 'ok' : 'neutral',
      tabId: 'integrations',
    },
    {
      id: 'system',
      label: 'System',
      value: setupComplete
        ? 'Ready'
        : failedRequired > 0
          ? `${failedRequired} blocking`
          : 'Pending',
      hint: setupComplete
        ? 'Store setup complete for live tests'
        : failedRequired > 0
          ? 'Resolve blocking checks in Store setup'
          : 'Finish discount attach and verification',
      status: setupComplete ? 'ok' : failedRequired > 0 ? 'fail' : 'warn',
      tabId: 'installation',
    },
  ];
}
