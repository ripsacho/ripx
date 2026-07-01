import { buildStoreHealth } from '../buildStoreHealth';

jest.mock('../../../../utils/storefrontSetupStatus', () => ({
  isStorefrontRuntimeReady: jest.fn(() => false),
}));

describe('buildStoreHealth', () => {
  it('marks setup incomplete when required script check fails', () => {
    const health = buildStoreHealth(
      { scriptVerified: false, liveSetupStatus: {} },
      { checklist: [], shop: { tenant_registered: true } }
    );
    expect(health.ready).toBe(false);
    expect(health.supportLevel).toBe('setup_incomplete');
    expect(health.failed.some(item => item.key === 'script_detected')).toBe(true);
  });

  it('passes when script, tenant, and checkout diagnostics are healthy', () => {
    const health = buildStoreHealth(
      {
        scriptVerified: true,
        liveSetupStatus: { proxyStatus: { ok: true } },
        instructions: { cartNative: { status: 'native_installed' } },
      },
      {
        checklist: [{ ok: true, severity: 'info' }],
        shop: { tenant_registered: true, running_price_tests: 0 },
      }
    );
    expect(health.ready).toBe(true);
    expect(health.supportLevel).toBe('native_cart_checkout_aligned');
    expect(health.failed).toHaveLength(0);
  });

  it('treats advisory-only checkout diagnostics as ready', () => {
    const health = buildStoreHealth(
      {
        scriptVerified: true,
        liveSetupStatus: { proxyStatus: { ok: true } },
      },
      {
        checklist: [{ ok: false, severity: 'warning', message: 'Drift detected' }],
        shop: { tenant_registered: true },
      }
    );
    const checkoutCheck = health.checks.find(item => item.key === 'checkout_diag');
    expect(checkoutCheck.ok).toBe(true);
    expect(checkoutCheck.advisory).toBe(true);
    expect(health.ready).toBe(true);
  });

  it('flags blocking checkout diagnostics', () => {
    const health = buildStoreHealth(
      {
        scriptVerified: true,
        liveSetupStatus: { proxyStatus: { ok: true } },
      },
      {
        checklist: [{ ok: false, severity: 'error', message: 'Batch URL missing' }],
        shop: { tenant_registered: true },
      }
    );
    expect(health.ready).toBe(false);
    expect(health.failed.some(item => item.key === 'checkout_diag')).toBe(true);
  });
});
