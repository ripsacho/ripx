const {
  isLikelyShopifyPasswordPage,
  isLikelyRipXStorefrontScript,
  computeStorefrontRuntimeReady,
} = require('../storefrontSetupProbe');

describe('storefrontSetupProbe', () => {
  it('detects password-protected storefront HTML', () => {
    const html = '<form><input name="form_type" value="storefront_password"></form>';
    expect(isLikelyShopifyPasswordPage(html, 'https://demo.myshopify.com/password')).toBe(true);
  });

  it('detects RipX script body markers', () => {
    const body = 'window.RipX = {}; var activeTests = [];';
    expect(isLikelyRipXStorefrontScript(body)).toBe(true);
  });

  it('computes runtime ready when proxy script and embed are detected', () => {
    expect(
      computeStorefrontRuntimeReady(
        { ok: true, scriptDetected: true },
        { detected: true, via: 'app_proxy' }
      )
    ).toBe(true);
  });

  it('is not ready when proxy script is missing', () => {
    expect(
      computeStorefrontRuntimeReady({ ok: false, scriptDetected: false }, { detected: true })
    ).toBe(false);
  });
});
