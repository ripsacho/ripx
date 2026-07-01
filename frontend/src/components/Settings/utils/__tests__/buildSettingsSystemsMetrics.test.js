import { buildSettingsSystemsMetrics } from '../buildSettingsSystemsMetrics';

const healthyStoreHealth = {
  ready: true,
  failed: [],
  checks: [
    { key: 'script_detected', ok: true, required: true },
    { key: 'checkout_diag', ok: true, required: true },
  ],
};

describe('buildSettingsSystemsMetrics', () => {
  it('returns four compact systems metrics', () => {
    const metrics = buildSettingsSystemsMetrics({
      storeHealth: healthyStoreHealth,
      checkoutDiagLastCheckedAt: new Date(Date.now() - 3600000).toISOString(),
      configuredIntegrationCount: 1,
      integrationsTotal: 2,
      setupComplete: true,
      formatRelativeTime: () => '1 hr ago',
    });

    expect(metrics).toHaveLength(4);
    expect(metrics.map(metric => metric.id)).toEqual([
      'storefront',
      'checkout',
      'connections',
      'system',
    ]);
    expect(metrics[0].value).toBe('Live');
    expect(metrics[1].value).toBe('1 hr ago');
    expect(metrics[2].value).toBe('1/2');
    expect(metrics[3].value).toBe('Ready');
    expect(metrics[0].tabId).toBe('installation');
    expect(metrics[1].tabId).toBe('advanced');
    expect(metrics[2].tabId).toBe('integrations');
  });

  it('surfaces blocking system state when setup is incomplete', () => {
    const metrics = buildSettingsSystemsMetrics({
      storeHealth: {
        ready: false,
        failed: [{ key: 'checkout_diag' }, { key: 'tenant_registered' }],
        checks: [
          { key: 'script_detected', ok: false, required: true, message: 'Embed missing' },
          { key: 'checkout_diag', ok: false, required: true, message: 'Batch URL missing' },
        ],
      },
      configuredIntegrationCount: 0,
      setupComplete: false,
    });

    expect(metrics[0].status).toBe('fail');
    expect(metrics[3].value).toBe('2 blocking');
    expect(metrics[3].status).toBe('fail');
  });

  it('shows checking state while diagnostics refresh', () => {
    const metrics = buildSettingsSystemsMetrics({
      storeHealth: healthyStoreHealth,
      checkoutDiagLoading: true,
      setupComplete: true,
    });

    expect(metrics[1].value).toBe('Checking…');
    expect(metrics[1].status).toBe('neutral');
  });

  it('routes checkout review to store setup tab', () => {
    const metrics = buildSettingsSystemsMetrics({
      storeHealth: {
        ready: false,
        failed: [{ key: 'checkout_diag' }],
        checks: [{ key: 'checkout_diag', ok: false, required: true, message: 'Run diagnostics' }],
      },
      setupComplete: false,
    });

    expect(metrics[1].tabId).toBe('installation');
  });
});
