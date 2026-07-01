jest.mock('../shopifyAdmin', () => ({
  normalizeShopifyDomain: shop =>
    String(shop || '')
      .trim()
      .toLowerCase(),
}));

jest.mock('../../services', () => ({
  apiGet: jest.fn(),
  unwrapData: payload => payload?.data ?? payload,
  getEmailToken: jest.fn(),
  isEmbeddedInIframe: jest.fn(() => false),
  getApiBaseUrl: jest.fn(() => 'https://app.example.com/api'),
  openCenteredPopup: jest.fn(() => ({ closed: false })),
}));

const { apiGet, isEmbeddedInIframe, getApiBaseUrl, openCenteredPopup } = require('../../services');
const {
  resolveShopifyOAuthUrl,
  launchShopifyPermissionUpdate,
  buildShopifyPermissionUpdateLaunchUrl,
  resetShopifyOAuthConfigCacheForTests,
} = require('../shopifyOAuthFlow');

describe('resolveShopifyOAuthUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetShopifyOAuthConfigCacheForTests();
    require('../../services').getEmailToken.mockReturnValue('email-jwt');
  });

  it('returns signInRequired when not logged in', async () => {
    require('../../services').getEmailToken.mockReturnValue(null);
    const result = await resolveShopifyOAuthUrl('demo.myshopify.com');
    expect(result).toEqual({ signInRequired: true, shop: 'demo.myshopify.com' });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('prefers /auth/start redirect URL', async () => {
    apiGet
      .mockResolvedValueOnce({
        base: 'https://app.example.com',
        redirectUri: 'https://app.example.com/api/auth/callback',
      })
      .mockResolvedValueOnce({
        redirectUrl: 'https://demo.myshopify.com/admin/oauth/authorize',
      });
    const result = await resolveShopifyOAuthUrl('demo.myshopify.com', {
      callbackBase: 'https://app.example.com',
    });
    expect(result).toEqual({ url: 'https://demo.myshopify.com/admin/oauth/authorize' });
  });
});

describe('launchShopifyPermissionUpdate', () => {
  let mockTopLocation;

  beforeEach(() => {
    jest.clearAllMocks();
    resetShopifyOAuthConfigCacheForTests();
    isEmbeddedInIframe.mockReturnValue(false);
    getApiBaseUrl.mockReturnValue('https://app.example.com/api');
    mockTopLocation = { href: '' };
    global.window = {
      top: { location: mockTopLocation },
      location: { origin: 'https://app.example.com' },
    };
  });

  afterEach(() => {
    delete global.window;
  });

  it('navigates to server reauthorize redirect endpoint', async () => {
    const result = await launchShopifyPermissionUpdate('demo.myshopify.com');
    expect(result).toEqual({
      launched: true,
      url: 'https://app.example.com/api/shopify/reauthorize-redirect?shop=demo.myshopify.com',
    });
    expect(mockTopLocation.href).toBe(
      'https://app.example.com/api/shopify/reauthorize-redirect?shop=demo.myshopify.com'
    );
  });

  it('opens popup when embedded in iframe', async () => {
    isEmbeddedInIframe.mockReturnValue(true);
    const result = await launchShopifyPermissionUpdate('demo.myshopify.com');
    expect(result.launched).toBe(true);
    expect(openCenteredPopup).toHaveBeenCalledWith(
      'https://app.example.com/api/shopify/reauthorize-redirect?shop=demo.myshopify.com'
    );
  });

  it('buildShopifyPermissionUpdateLaunchUrl encodes shop param', () => {
    expect(buildShopifyPermissionUpdateLaunchUrl('demo.myshopify.com')).toBe(
      'https://app.example.com/api/shopify/reauthorize-redirect?shop=demo.myshopify.com'
    );
  });
});
