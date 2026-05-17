import { isStorefrontRuntimeReady, storefrontRuntimeReviewMessage } from '../storefrontSetupStatus';

describe('storefrontSetupStatus', () => {
  it('uses API storefrontRuntimeReady when provided', () => {
    expect(isStorefrontRuntimeReady({ storefrontRuntimeReady: true })).toBe(true);
    expect(isStorefrontRuntimeReady({ storefrontRuntimeReady: false })).toBe(false);
  });

  it('falls back to proxy and embed flags', () => {
    expect(
      isStorefrontRuntimeReady({
        proxyStatus: { scriptDetected: true },
        embedStatus: { detected: true, via: 'app_proxy' },
      })
    ).toBe(true);
  });

  it('returns actionable review message when proxy fails', () => {
    const message = storefrontRuntimeReviewMessage({
      proxyStatus: { ok: false },
      embedStatus: { detected: false },
    });
    expect(message).toMatch(/App Proxy/i);
  });
});
