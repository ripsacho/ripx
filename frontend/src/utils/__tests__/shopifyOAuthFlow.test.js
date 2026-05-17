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
}));

const { apiGet, getEmailToken } = require('../../services');
const { resolveShopifyOAuthUrl } = require('../shopifyOAuthFlow');

describe('resolveShopifyOAuthUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getEmailToken.mockReturnValue('email-jwt');
  });

  it('returns signInRequired when not logged in', async () => {
    getEmailToken.mockReturnValue(null);
    const result = await resolveShopifyOAuthUrl('demo.myshopify.com');
    expect(result).toEqual({ signInRequired: true, shop: 'demo.myshopify.com' });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('prefers /auth/start redirect URL', async () => {
    apiGet.mockResolvedValueOnce({
      redirectUrl: 'https://demo.myshopify.com/admin/oauth/authorize',
    });
    const result = await resolveShopifyOAuthUrl('demo.myshopify.com', {
      callbackBase: 'https://app.example.com',
    });
    expect(result).toEqual({ url: 'https://demo.myshopify.com/admin/oauth/authorize' });
    expect(apiGet).toHaveBeenCalledWith('/auth/start', {
      shop: 'demo.myshopify.com',
      callback_base: 'https://app.example.com',
    });
  });

  it('falls back to install-link when /auth/start returns no URL', async () => {
    apiGet.mockResolvedValueOnce({}).mockResolvedValueOnce({
      url: 'https://app.example.com/api/auth/install?shop=demo.myshopify.com&t=abc',
    });
    const result = await resolveShopifyOAuthUrl('demo.myshopify.com');
    expect(result.url).toContain('/api/auth/install');
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet.mock.calls[1][0]).toBe('/auth/install-link');
  });
});
