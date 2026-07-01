import {
  getShopifyConnectionUiState,
  isShopifyConnectionHealthy,
  shouldOpenShopifyApp,
} from '../shopifyConnectionHealth';

describe('shopifyConnectionHealth (frontend)', () => {
  it('treats VERIFY_UNAVAILABLE as unhealthy', () => {
    expect(
      isShopifyConnectionHealthy({
        connected: true,
        connection: { code: 'VERIFY_UNAVAILABLE' },
        tokenHealth: { checkFailed: true },
      })
    ).toBe(false);
  });

  it('opens app when token is valid but scopes are stale', () => {
    expect(
      shouldOpenShopifyApp({
        connected: false,
        connection: { code: 'SCOPES_STALE' },
        tokenHealth: { valid: true },
      })
    ).toBe(true);
  });

  it('maps verify failures to verify_unavailable UI state', () => {
    expect(
      getShopifyConnectionUiState({
        connected: false,
        connection: { code: 'VERIFY_UNAVAILABLE', state: 'verify_unavailable' },
        tokenHealth: { checkFailed: true },
      })
    ).toBe('verify_unavailable');
  });

  it('opens app when session scopes are not synced yet', () => {
    expect(
      shouldOpenShopifyApp({
        connected: true,
        connection: { code: 'SESSION_OK_UNVERIFIED_SCOPES' },
        tokenHealth: { valid: true },
      })
    ).toBe(true);
  });
});
