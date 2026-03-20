const originalEnv = { ...process.env };

describe('priceCheckoutDiagnostics', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('derives batch URL from APP_URL when RIPX_PRICE_RESOLVE_BATCH_URL unset', () => {
    process.env.APP_URL = 'https://api.example.com/';
    delete process.env.RIPX_PRICE_RESOLVE_BATCH_URL;
    const {
      getConfiguredBatchResolveUrls,
      buildCheckoutPriceDiagnostics,
    } = require('../priceCheckoutDiagnostics');
    const { batchUrl, usedExplicitBatchUrl } = getConfiguredBatchResolveUrls();
    expect(usedExplicitBatchUrl).toBe(false);
    expect(batchUrl).toBe('https://api.example.com/api/track/price-resolve-batch');
    const d = buildCheckoutPriceDiagnostics();
    expect(d.infrastructure.batch_resolve_url).toBe(batchUrl);
    expect(d.infrastructure.price_resolve_batch_response_max_bytes).toBeGreaterThan(80000);
    expect(d.infrastructure.batch_compact_response).toBe(true);
    expect(typeof d.infrastructure.price_batch_slow_log_ms).toBe('number');
    expect(d.checklist.find(c => c.id === 'batch_url_configured')?.ok).toBe(true);
    expect(d.checklist.find(c => c.id === 'https_public_url')?.ok).toBe(true);
    expect(d.summary?.overall_ok).toBe(true);
    expect(d.summary?.checks_total).toBeGreaterThan(0);
    expect(d.recommendations.some(r => r.includes('readTimeoutMs'))).toBe(true);
    expect(d.recommendations.some(r => r.includes('RIPX_PRICE_BATCH_FULL_RESPONSE'))).toBe(true);
    expect(d.recommendations.some(r => r.includes('timing-safe'))).toBe(true);
  });

  it('prefers RIPX_PRICE_RESOLVE_BATCH_URL when set', () => {
    process.env.APP_URL = 'https://ignored.example.com';
    process.env.RIPX_PRICE_RESOLVE_BATCH_URL = 'https://batch.custom/batch-endpoint';
    const { getConfiguredBatchResolveUrls } = require('../priceCheckoutDiagnostics');
    expect(getConfiguredBatchResolveUrls().batchUrl).toBe('https://batch.custom/batch-endpoint');
    expect(getConfiguredBatchResolveUrls().usedExplicitBatchUrl).toBe(true);
  });

  it('flags missing batch URL', () => {
    delete process.env.APP_URL;
    delete process.env.RIPX_PRICE_RESOLVE_BATCH_URL;
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    expect(d.checklist.find(c => c.id === 'batch_url_configured')?.ok).toBe(false);
    expect(d.summary?.overall_ok).toBe(false);
    expect(d.summary?.overall_status).toBe('error');
  });

  it('includes shop snapshot fields when provided', () => {
    delete process.env.APP_URL;
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics({
      shopDomain: 'store.myshopify.com',
      tenantRegistered: true,
      runningPriceTests: 3,
    });
    expect(d.shop).toEqual({
      domain: 'store.myshopify.com',
      tenant_registered: true,
      running_price_tests: 3,
    });
  });

  it('reports batch_compact_response false when RIPX_PRICE_BATCH_FULL_RESPONSE=true', () => {
    process.env.RIPX_PRICE_BATCH_FULL_RESPONSE = 'true';
    process.env.APP_URL = 'https://api.example.com';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    expect(d.infrastructure.batch_compact_response).toBe(false);
  });

  it('flags missing checkout secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://api.example.com';
    delete process.env.RIPX_CHECKOUT_PRICE_SECRET;
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    expect(d.checklist.find(c => c.id === 'checkout_secret_consistency')?.ok).toBe(false);
    expect(d.summary.overall_ok).toBe(false);
    expect(d.summary.overall_status).toBe('warning');
  });

  it('detects ngrok batch host as ephemeral tunnel in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://abc123.ngrok-free.app';
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'x';
    delete process.env.RIPX_PRICE_RESOLVE_BATCH_URL;
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    const tunnel = d.checklist.find(c => c.id === 'tunnel_stability');
    expect(tunnel).toBeDefined();
    expect(tunnel.ok).toBe(false);
    expect(d.summary.overall_ok).toBe(false);
  });
});
