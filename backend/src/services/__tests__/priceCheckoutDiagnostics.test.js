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
    expect(d.checklist.find(c => c.id === 'batch_path_matches_ripx_handler')?.ok).toBe(true);
    expect(d.checklist.find(c => c.id === 'https_public_url')?.ok).toBe(true);
    expect(d.summary?.overall_ok).toBe(true);
    expect(d.summary?.checks_total).toBeGreaterThan(0);
    expect(d.support?.model).toBe('discount_function_truth');
    expect(d.support?.checkout_alignment?.level).toBe('ready');
    expect(d.support?.cart_rendering?.level).toBe('theme_integration_recommended');
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
    expect(d.summary?.checks_error).toBeGreaterThan(0);
    expect(d.support?.checkout_alignment?.level).toBe('needs_attention');
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
    delete process.env.RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET;
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    expect(d.checklist.find(c => c.id === 'checkout_secret_consistency')?.ok).toBe(false);
    expect(d.checklist.find(c => c.id === 'assignment_signature_enforcement')?.ok).toBe(false);
    expect(d.summary.overall_ok).toBe(false);
    expect(d.summary.overall_status).toBe('warning');
    expect(d.summary.checks_warning).toBeGreaterThan(0);
  });

  it('marks assignment signature enforcement as enabled by default in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://api.example.com';
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'secret';
    delete process.env.RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT;
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    expect(d.infrastructure.assignment_signature_required).toBe(true);
    expect(d.checklist.find(c => c.id === 'assignment_signature_enforcement')?.ok).toBe(true);
  });

  it('allows explicit disable of assignment signature enforcement', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://api.example.com';
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'secret';
    process.env.RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT = 'false';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    expect(d.infrastructure.assignment_signature_required).toBe(false);
    expect(d.checklist.find(c => c.id === 'assignment_signature_enforcement')?.ok).toBe(true);
    expect(d.checklist.find(c => c.id === 'assignment_signature_enforcement')?.message).toMatch(
      /explicitly disabled/i
    );
  });

  it('warns when RIPX_PRICE_RESOLVE_BATCH_URL path is not RipX batch endpoint', () => {
    process.env.APP_URL = 'https://ignored.example.com';
    process.env.RIPX_PRICE_RESOLVE_BATCH_URL = 'https://gateway.example.com/custom-batch';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    const pathCheck = d.checklist.find(c => c.id === 'batch_path_matches_ripx_handler');
    expect(pathCheck?.ok).toBe(true);
    expect(pathCheck?.severity).toBe('warning');
    expect(pathCheck?.message).toContain('custom-batch');
  });

  it('errors when batch URL is not parseable', () => {
    process.env.APP_URL = '';
    process.env.RIPX_PRICE_RESOLVE_BATCH_URL = 'not-a-valid-url';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics();
    const pathCheck = d.checklist.find(c => c.id === 'batch_path_matches_ripx_handler');
    expect(pathCheck?.ok).toBe(false);
    expect(pathCheck?.severity).toBe('error');
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

  it('parseRipxCheckoutExtensionConfig reads synced ripxConfig.js shape', () => {
    const { parseRipxCheckoutExtensionConfig } = require('../priceCheckoutDiagnostics');
    const src = `
export const RIPX_PRICE_RESOLVE_BATCH_URL = ${JSON.stringify('https://api.example.com/api/track/price-resolve-batch')};
export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify('secret-one')};
`;
    const p = parseRipxCheckoutExtensionConfig(src);
    expect(p).toMatchObject({
      batchUrl: 'https://api.example.com/api/track/price-resolve-batch',
      secret: 'secret-one',
    });
  });

  it('parseRipxCheckoutExtensionConfig allows empty batch URL (clone default before sync-config)', () => {
    const { parseRipxCheckoutExtensionConfig } = require('../priceCheckoutDiagnostics');
    const p = parseRipxCheckoutExtensionConfig(
      'export const RIPX_PRICE_RESOLVE_BATCH_URL = "";\nexport const RIPX_CHECKOUT_PRICE_SECRET = "";'
    );
    expect(p).toMatchObject({ batchUrl: '', secret: '' });
  });

  it('parseRipxCheckoutExtensionConfig accepts single-quoted literals in hand-edited config', () => {
    const { parseRipxCheckoutExtensionConfig } = require('../priceCheckoutDiagnostics');
    const p = parseRipxCheckoutExtensionConfig(
      "export const RIPX_PRICE_RESOLVE_BATCH_URL = 'https://api.example.com/api/track/price-resolve-batch';\nexport const RIPX_CHECKOUT_PRICE_SECRET = '';"
    );
    expect(p).toMatchObject({
      batchUrl: 'https://api.example.com/api/track/price-resolve-batch',
      secret: '',
    });
  });

  it('extensionConfig empty batch URL with env set reports drift', () => {
    process.env.APP_URL = 'https://api.example.com';
    delete process.env.RIPX_PRICE_RESOLVE_BATCH_URL;
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const contents =
      'export const RIPX_PRICE_RESOLVE_BATCH_URL = "";\nexport const RIPX_CHECKOUT_PRICE_SECRET = "";';
    const d = buildCheckoutPriceDiagnostics({
      extensionConfig: { source: 'present', contents },
    });
    const ext = d.checklist.find(c => c.id === 'extension_config_matches_env');
    expect(ext?.ok).toBe(false);
    expect(ext?.message).toMatch(/drift|empty/i);
  });

  it('extensionConfig present + matching env passes extension_config_matches_env', () => {
    process.env.APP_URL = 'https://api.example.com';
    delete process.env.RIPX_PRICE_RESOLVE_BATCH_URL;
    delete process.env.RIPX_CHECKOUT_PRICE_SECRET;
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const contents = `export const RIPX_PRICE_RESOLVE_BATCH_URL = ${JSON.stringify(
      'https://api.example.com/api/track/price-resolve-batch'
    )};
export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify('')};
`;
    const d = buildCheckoutPriceDiagnostics({
      extensionConfig: { source: 'present', contents },
    });
    const ext = d.checklist.find(c => c.id === 'extension_config_matches_env');
    expect(ext).toBeDefined();
    expect(ext.ok).toBe(true);
    expect(d.infrastructure.extension_batch_url_matches_env).toBe(true);
  });

  it('extensionConfig reports error when checkout secret differs from .env', () => {
    process.env.APP_URL = 'https://api.example.com';
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'server-secret';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const contents = `export const RIPX_PRICE_RESOLVE_BATCH_URL = ${JSON.stringify(
      'https://api.example.com/api/track/price-resolve-batch'
    )};
export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify('other-secret')};
`;
    const d = buildCheckoutPriceDiagnostics({
      extensionConfig: { source: 'present', contents },
    });
    const ext = d.checklist.find(c => c.id === 'extension_config_matches_env');
    expect(ext?.ok).toBe(false);
    expect(ext?.severity).toBe('error');
    expect(d.summary.overall_status).toBe('error');
  });

  it('extensionConfig missing file adds informational checklist item', () => {
    process.env.APP_URL = 'https://api.example.com';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics({
      extensionConfig: { source: 'missing' },
    });
    const row = d.checklist.find(c => c.id === 'extension_config_file');
    expect(row).toBeDefined();
    expect(row?.ok).toBe(true);
    expect(d.infrastructure.extension_config_status).toBe('missing');
  });
});
