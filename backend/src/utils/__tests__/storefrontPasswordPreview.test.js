const {
  getDevStorefrontPasswordDefault,
  resolveStorefrontPasswordForPreviewRequest,
  isLikelyShopifyPasswordPage,
} = require('../storefrontPasswordPreview');

describe('storefrontPasswordPreview', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RIPX_DEV_STOREFRONT_PASSWORD;
    delete process.env.APP_URL;
    delete process.env.RIPX_OAUTH_REDIRECT_BASE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses explicit query password when provided', () => {
    expect(resolveStorefrontPasswordForPreviewRequest('custom', 'splitter.echologyx.com')).toBe(
      'custom'
    );
  });

  it('falls back to sp on echologyx request host in production', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveStorefrontPasswordForPreviewRequest('', 'splitter.echologyx.com')).toBe('sp');
  });

  it('falls back to sp in non-production when query is empty', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveStorefrontPasswordForPreviewRequest('')).toBe('sp');
  });

  it('respects RIPX_DEV_STOREFRONT_PASSWORD override', () => {
    process.env.NODE_ENV = 'production';
    process.env.RIPX_DEV_STOREFRONT_PASSWORD = 'override';
    expect(getDevStorefrontPasswordDefault('merchant.example.com')).toBe('override');
  });

  it('returns empty dev default on unrelated production hosts', () => {
    process.env.NODE_ENV = 'production';
    expect(getDevStorefrontPasswordDefault('app.merchant.com')).toBe('');
  });

  it('detects Shopify storefront password pages', () => {
    expect(
      isLikelyShopifyPasswordPage(
        '<form><input name="form_type" value="storefront_password"></form>',
        'https://shop.myshopify.com/password'
      )
    ).toBe(true);
    expect(isLikelyShopifyPasswordPage('<html><body>Product page</body></html>')).toBe(false);
  });
});
