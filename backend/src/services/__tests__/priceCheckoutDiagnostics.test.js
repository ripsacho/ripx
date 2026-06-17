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
    expect(d.support?.direct_price_override?.level).toBe('needs_deploy');
    expect(d.recommendations.some(r => r.includes('readTimeoutMs'))).toBe(true);
    expect(d.recommendations.some(r => r.includes('RIPX_PRICE_BATCH_FULL_RESPONSE'))).toBe(true);
    expect(d.recommendations.some(r => r.includes('timing-safe'))).toBe(true);
  });

  it('reports deployed discount and cart transform functions when provided', () => {
    process.env.APP_URL = 'https://api.example.com';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics({
      shopifyFunctions: [
        {
          id: 'gid://shopify/ShopifyFunction/1',
          title: 'RipX checkout discount',
          apiType: 'product_discounts',
        },
        {
          id: 'gid://shopify/ShopifyFunction/2',
          title: 'RipX cart transform',
          apiType: 'cart_transform',
        },
      ],
    });
    expect(d.infrastructure.discount_function_available).toBe(true);
    expect(d.infrastructure.cart_transform_function_available).toBe(true);
    expect(d.checklist.find(c => c.id === 'discount_function_available')?.ok).toBe(true);
    expect(d.checklist.find(c => c.id === 'cart_transform_function_available')?.ok).toBe(true);
    expect(d.support?.direct_price_override?.level).toBe('available');
  });

  it('reports cart transform install state when cartTransforms list is provided', () => {
    process.env.APP_URL = 'https://api.example.com';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const baseFunctions = [
      {
        id: 'gid://shopify/ShopifyFunction/2',
        title: 'RipX cart transform',
        apiType: 'cart_transform',
      },
    ];
    const missingInstall = buildCheckoutPriceDiagnostics({
      shopifyFunctions: baseFunctions,
      shopifyCartTransforms: [],
    });
    expect(missingInstall.infrastructure.cart_transform_function_available).toBe(true);
    expect(missingInstall.infrastructure.cart_transform_installed).toBe(false);
    expect(missingInstall.support?.direct_price_override?.level).toBe('needs_install');
    expect(missingInstall.checklist.find(c => c.id === 'cart_transform_installed')?.ok).toBe(false);

    const installed = buildCheckoutPriceDiagnostics({
      shopifyFunctions: baseFunctions,
      shopifyCartTransforms: [
        { id: 'gid://shopify/CartTransform/1', functionId: baseFunctions[0].id },
      ],
    });
    expect(installed.infrastructure.cart_transform_installed).toBe(true);
    expect(installed.support?.direct_price_override?.level).toBe('available');
    expect(installed.checklist.find(c => c.id === 'cart_transform_installed')?.ok).toBe(true);
  });

  it('surfaces invalid Shopify token when Admin API returns 401', () => {
    process.env.APP_URL = 'https://api.example.com';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics({
      shopifyFunctions: [],
      shopifyFunctionsQueryError: 'Shopify Admin GraphQL failed (401) for ripx-plus.myshopify.com',
    });
    expect(d.infrastructure.shopify_admin_api_status).toBe('auth_failed');
    expect(d.checklist.find(c => c.id === 'shopify_admin_api_auth')?.ok).toBe(false);
    expect(d.checklist.find(c => c.id === 'shopify_admin_api_auth')?.severity).toBe('error');
    expect(d.summary.overall_status).toBe('error');
    expect(d.recommendations[0]).toMatch(/OAuth/i);
  });

  it('reports install check as unknown when read_cart_transforms scope is missing', () => {
    process.env.APP_URL = 'https://api.example.com';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const d = buildCheckoutPriceDiagnostics({
      shopifyFunctions: [
        {
          id: 'gid://shopify/ShopifyFunction/2',
          title: 'RipX cart transform',
          apiType: 'cart_transform',
        },
      ],
      shopifyCartTransforms: null,
      cartTransformsLookupStatus: 'scope_missing',
    });
    expect(d.infrastructure.cart_transform_installed).toBeNull();
    expect(d.infrastructure.cart_transform_install_check_status).toBe('scope_missing');
    expect(d.support?.direct_price_override?.level).toBe('unknown_install_state');
    const scopeCheck = d.checklist.find(c => c.id === 'cart_transform_install_check_scope');
    expect(scopeCheck?.ok).toBe(false);
    expect(scopeCheck?.severity).toBe('warning');
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
export const RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT = false;
export const RIPX_CHECKOUT_PROBE_ATTRIBUTE_MATRIX = true;
`;
    const p = parseRipxCheckoutExtensionConfig(src);
    expect(p).toMatchObject({
      batchUrl: 'https://api.example.com/api/track/price-resolve-batch',
      secret: 'secret-one',
      probeAlwaysDiscount: false,
      probeAttributeMatrix: true,
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
      "export const RIPX_PRICE_RESOLVE_BATCH_URL = 'https://api.example.com/api/track/price-resolve-batch';\nexport const RIPX_CHECKOUT_PRICE_SECRET = '';\nexport const RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT = 'true';"
    );
    expect(p).toMatchObject({
      batchUrl: 'https://api.example.com/api/track/price-resolve-batch',
      secret: '',
      probeAlwaysDiscount: true,
    });
  });

  it('buildRipxCheckoutExtensionConfigSource outputs parseable content', () => {
    const {
      buildRipxCheckoutExtensionConfigSource,
      parseRipxCheckoutExtensionConfig,
    } = require('../priceCheckoutDiagnostics');
    const source = buildRipxCheckoutExtensionConfigSource({
      batchUrl: 'https://api.example.com/api/track/price-resolve-batch',
      secret: 'abc123',
      probeAlwaysDiscount: true,
      probeAttributeMatrix: false,
    });
    const parsed = parseRipxCheckoutExtensionConfig(source);
    expect(parsed).toMatchObject({
      batchUrl: 'https://api.example.com/api/track/price-resolve-batch',
      secret: 'abc123',
      probeAlwaysDiscount: true,
      probeAttributeMatrix: false,
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

  it('extensionConfig reports warning when checkout secret differs from .env by default', () => {
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
    expect(ext?.severity).toBe('warning');
    expect(d.summary.overall_status).toBe('warning');
  });

  it('extensionConfig reports error for checkout secret drift when strict diagnostics are enabled', () => {
    process.env.APP_URL = 'https://api.example.com';
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'server-secret';
    process.env.RIPX_PRICE_DIAGNOSTICS_STRICT_EXTENSION_CONFIG = 'true';
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

  it('extensionConfig reports production error when generated config uses temporary tunnel host', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://api.example.com';
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'server-secret';
    const { buildCheckoutPriceDiagnostics } = require('../priceCheckoutDiagnostics');
    const contents = `export const RIPX_PRICE_RESOLVE_BATCH_URL = ${JSON.stringify(
      'https://abc123.trycloudflare.com/api/track/price-resolve-batch'
    )};
export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify('server-secret')};
`;
    const d = buildCheckoutPriceDiagnostics({
      extensionConfig: { source: 'present', contents },
    });
    const ext = d.checklist.find(c => c.id === 'extension_config_matches_env');
    expect(ext?.ok).toBe(false);
    expect(ext?.severity).toBe('error');
    expect(ext?.message).toMatch(/temporary tunnel/i);
    expect(d.infrastructure.extension_batch_url_ephemeral_tunnel).toBe(true);
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
