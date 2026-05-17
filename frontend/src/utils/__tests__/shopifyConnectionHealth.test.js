import {
  getShopifyConnectionUiState,
  isShopifyConnectionHealthy,
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

  it('maps verify failures to verify_unavailable UI state', () => {
    expect(
      getShopifyConnectionUiState({
        connected: false,
        connection: { code: 'VERIFY_UNAVAILABLE', state: 'verify_unavailable' },
        tokenHealth: { checkFailed: true },
      })
    ).toBe('verify_unavailable');
  });
});
