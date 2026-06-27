import {
  PREVIEW_PARAMS,
  buildPreviewDocumentUrl,
  buildPreviewLaunchUrl,
  buildShopifyPricePreviewBootstrapUrl,
  buildShopifyPreviewBootstrapUrl,
  buildPreviewUrl,
  buildVisualPickerLaunchUrl,
  ensureShopifyPreviewBootstrapUrl,
  isShopifyPreviewUrl,
  loadPersistedStorefrontPassword,
  persistStorefrontPassword,
  getDevStorefrontPasswordDefault,
  resolveShopifySimplePreviewUrl,
  resolveStorefrontPasswordForPreview,
  stripPreviewDocumentSecretParams,
} from '../previewUrl';

describe('previewUrl', () => {
  it('includes saved tenant domain when provided', () => {
    const result = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      tenantDomain: 'echologyx.com',
    });

    const url = new URL(result);
    expect(url.searchParams.get(PREVIEW_PARAMS.TENANT_DOMAIN)).toBe('echologyx.com');
    expect(url.searchParams.get(PREVIEW_PARAMS.TEST_ID)).toBe(
      '1d1f39c4-4083-44f4-b046-1c341b88cc29'
    );
  });

  it('includes test type hint when provided', () => {
    const result = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'Variant A',
      variantName: 'Variant A',
      testType: 'shipping',
    });

    const url = new URL(result);
    expect(url.searchParams.get(PREVIEW_PARAMS.TEST_TYPE)).toBe('shipping');
  });

  it('omits saved tenant domain when not provided', () => {
    const result = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
    });

    const url = new URL(result);
    expect(url.searchParams.has(PREVIEW_PARAMS.TENANT_DOMAIN)).toBe(false);
  });

  it('builds simple preview URL without shell marker', () => {
    const result = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      simplePreview: true,
    });

    const url = new URL(result);
    expect(url.searchParams.get(PREVIEW_PARAMS.PREVIEW)).toBe('1');
    expect(url.searchParams.get(PREVIEW_PARAMS.SIMPLE)).toBe('1');
    expect(url.pathname).toBe('/products/test-product');
  });

  it('builds customer-view URL with preview reset session params', () => {
    const result = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      simplePreview: true,
      resetPreviewSession: true,
      previewSessionId: 'customer-123',
    });

    const url = new URL(result);
    expect(url.searchParams.get(PREVIEW_PARAMS.SIMPLE)).toBe('1');
    expect(url.searchParams.get(PREVIEW_PARAMS.RESET_SESSION)).toBe('1');
    expect(url.searchParams.get(PREVIEW_PARAMS.SESSION_ID)).toBe('customer-123');
  });

  it('builds preview-document URL and preserves preview params', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      tenantDomain: 'echologyx.com',
    });

    const result = buildPreviewDocumentUrl({
      apiBaseUrl: '/api',
      previewUrl,
      visualEditor: true,
      visualPicker: true,
    });

    const url = new URL(result, 'https://app.example.com');
    expect(url.pathname).toBe('/api/track/preview-document');
    expect(url.searchParams.get('url')).toBe(previewUrl);
    expect(url.searchParams.get(PREVIEW_PARAMS.TEST_ID)).toBe(
      '1d1f39c4-4083-44f4-b046-1c341b88cc29'
    );
    expect(url.searchParams.get(PREVIEW_PARAMS.TENANT_DOMAIN)).toBe('echologyx.com');
    expect(url.searchParams.get(PREVIEW_PARAMS.VISUAL_EDITOR)).toBe('1');
    expect(url.searchParams.get(PREVIEW_PARAMS.VISUAL_PICKER)).toBe('1');
  });

  it('builds visual picker launch URLs for saved and unsaved tests', () => {
    const withTest = buildVisualPickerLaunchUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      apiBaseUrl: '/api',
    });
    const withTestUrl = new URL(withTest, 'https://app.example.com');
    expect(withTestUrl.pathname).toBe('/api/track/preview-document');
    expect(withTestUrl.searchParams.get(PREVIEW_PARAMS.VISUAL_PICKER)).toBe('1');
    expect(withTestUrl.searchParams.get(PREVIEW_PARAMS.TEST_ID)).toBe(
      '1d1f39c4-4083-44f4-b046-1c341b88cc29'
    );

    const withPricePick = buildVisualPickerLaunchUrl({
      baseUrl: 'https://makripon.myshopify.com/collections/all',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      apiBaseUrl: '/api',
      priceSurfacePick: true,
    });
    const withPricePickUrl = new URL(withPricePick, 'https://app.example.com');
    expect(withPricePickUrl.searchParams.get(PREVIEW_PARAMS.PRICE_SURFACE_PICK)).toBe('1');
    expect(withPricePickUrl.searchParams.get(PREVIEW_PARAMS.VISUAL_EDITOR)).toBeNull();

    const withoutTest = buildVisualPickerLaunchUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      apiBaseUrl: '/api',
    });
    const withoutTestUrl = new URL(withoutTest, 'https://app.example.com');
    expect(withoutTestUrl.searchParams.get(PREVIEW_PARAMS.VISUAL_PICKER)).toBe('1');
    expect(withoutTestUrl.searchParams.get(PREVIEW_PARAMS.TEST_ID)).toBeNull();
  });

  it('adds price surface pick mode to visual picker launch URLs', () => {
    const launchUrl = buildVisualPickerLaunchUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      apiBaseUrl: '/api',
      priceSurfacePick: true,
    });
    const url = new URL(launchUrl, 'https://app.example.com');
    expect(url.searchParams.get(PREVIEW_PARAMS.PRICE_SURFACE_PICK)).toBe('1');
    expect(url.searchParams.get(PREVIEW_PARAMS.VISUAL_PICKER)).toBe('1');
    expect(url.searchParams.get(PREVIEW_PARAMS.VISUAL_EDITOR)).toBeNull();
  });

  it('preserves simple preview mode through preview-document URLs', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      simplePreview: true,
    });

    const result = buildPreviewDocumentUrl({
      apiBaseUrl: '/api',
      previewUrl,
      visualEditor: true,
    });

    const url = new URL(result, 'https://app.example.com');
    expect(url.searchParams.get('url')).toBe(previewUrl);
    expect(url.searchParams.get(PREVIEW_PARAMS.SIMPLE)).toBe('1');
  });

  it('adds optional storefront password to preview-document URLs only when provided', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
    });

    const result = buildPreviewDocumentUrl({
      apiBaseUrl: '/api',
      previewUrl,
      visualEditor: true,
      storefrontPassword: 'secret-password',
    });

    const url = new URL(result, 'https://app.example.com');
    expect(url.searchParams.get('storefront_password')).toBe('secret-password');
  });

  it('getDevStorefrontPasswordDefault returns sp on echologyx app host', () => {
    const previousWindow = global.window;
    global.window = {
      location: { hostname: 'splitter.echologyx.com', origin: 'https://splitter.echologyx.com' },
    };
    try {
      expect(getDevStorefrontPasswordDefault()).toBe('sp');
    } finally {
      global.window = previousWindow;
    }
  });

  it('resolveStorefrontPasswordForPreview prefers explicit password then sessionStorage', () => {
    const store = new Map();
    const previousWindow = global.window;
    global.window = {
      sessionStorage: {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
          store.set(key, value);
        },
        removeItem: key => {
          store.delete(key);
        },
      },
    };
    try {
      persistStorefrontPassword('splitter-plus.myshopify.com', 'from-session');
      expect(resolveStorefrontPasswordForPreview('splitter-plus.myshopify.com', '')).toBe(
        'from-session'
      );
      expect(resolveStorefrontPasswordForPreview('splitter-plus.myshopify.com', 'typed')).toBe(
        'typed'
      );
      expect(resolveStorefrontPasswordForPreview('', '', ['splitter-plus.myshopify.com'])).toBe(
        'from-session'
      );
    } finally {
      global.window = previousWindow;
    }
  });

  it('persists storefront password in sessionStorage per shop host', () => {
    const store = new Map();
    const previousWindow = global.window;
    global.window = {
      sessionStorage: {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => {
          store.set(key, value);
        },
        removeItem: key => {
          store.delete(key);
        },
      },
    };
    try {
      const domain = 'splitter-plus.myshopify.com';
      persistStorefrontPassword(domain, 'sp');
      expect(loadPersistedStorefrontPassword(domain)).toBe('sp');
      persistStorefrontPassword(domain, '');
      expect(loadPersistedStorefrontPassword(domain)).toBe('');
    } finally {
      global.window = previousWindow;
    }
  });

  it('strips storefront password from copied preview-document links', () => {
    const result = stripPreviewDocumentSecretParams(
      'https://app.example.com/api/track/preview-document?url=https%3A%2F%2Fstore.myshopify.com&storefront_password=secret&ab_visual_editor=1'
    );

    const url = new URL(result);
    expect(url.searchParams.has('storefront_password')).toBe(false);
    expect(url.searchParams.get('ab_visual_editor')).toBe('1');
  });

  it('builds preview-launch URL and preserves preview params', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      tenantDomain: 'echologyx.com',
      simplePreview: true,
    });

    const result = buildPreviewLaunchUrl({
      apiBaseUrl: '/api',
      previewUrl,
    });

    const url = new URL(result, 'https://app.example.com');
    expect(url.pathname).toBe('/api/track/preview-launch');
    expect(url.searchParams.get('url')).toBe(previewUrl);
    expect(url.searchParams.get(PREVIEW_PARAMS.TEST_ID)).toBe(
      '1d1f39c4-4083-44f4-b046-1c341b88cc29'
    );
    expect(url.searchParams.get(PREVIEW_PARAMS.TENANT_DOMAIN)).toBe('echologyx.com');
    expect(url.searchParams.get(PREVIEW_PARAMS.SIMPLE)).toBe('1');
  });

  it('builds Shopify preview-bootstrap URL for myshopify preview', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      tenantDomain: 'echologyx.com',
    });
    const result = buildShopifyPreviewBootstrapUrl({ previewUrl });
    const url = new URL(result);
    expect(url.origin).toBe('https://makripon.myshopify.com');
    expect(url.pathname).toBe('/apps/ripx/preview-bootstrap-v2');
    expect(url.searchParams.get('url')).toBe(previewUrl);
  });

  it('builds isolated Shopify price debug preview bootstrap URL', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      tenantDomain: 'echologyx.com',
    });
    const result = buildShopifyPricePreviewBootstrapUrl({ previewUrl });
    const url = new URL(result);
    expect(url.origin).toBe('https://makripon.myshopify.com');
    expect(url.pathname).toBe('/apps/ripx/price-preview-bootstrap-v1');
    expect(url.searchParams.get('url')).toBe(previewUrl);
    expect(url.searchParams.get(PREVIEW_PARAMS.TEST_ID)).toBe(
      '1d1f39c4-4083-44f4-b046-1c341b88cc29'
    );
    expect(url.searchParams.has(PREVIEW_PARAMS.SIMPLE)).toBe(false);
  });

  it('preserves simple customer price preview params on price bootstrap URL', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      tenantDomain: 'makripon.myshopify.com',
      simplePreview: true,
      resetPreviewSession: true,
      previewSessionId: 'customer-123',
    });
    const result = buildShopifyPricePreviewBootstrapUrl({ previewUrl });
    const url = new URL(result);
    expect(url.pathname).toBe('/apps/ripx/price-preview-bootstrap-v1');
    expect(url.searchParams.get(PREVIEW_PARAMS.SIMPLE)).toBe('1');
    expect(url.searchParams.get(PREVIEW_PARAMS.RESET_SESSION)).toBe('1');
    expect(url.searchParams.get(PREVIEW_PARAMS.SESSION_ID)).toBe('customer-123');
    expect(url.searchParams.get('url')).toBe(previewUrl);
  });

  it('returns null for non-Shopify preview-bootstrap host', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://example.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
    });
    expect(buildShopifyPreviewBootstrapUrl({ previewUrl })).toBeNull();
    expect(buildShopifyPricePreviewBootstrapUrl({ previewUrl })).toBeNull();
  });

  it('detects Shopify preview URL host', () => {
    expect(
      isShopifyPreviewUrl(
        'https://makripon.myshopify.com/products/test?ab_preview=1&ab_preview_test=test-id'
      )
    ).toBe(true);
    expect(isShopifyPreviewUrl('https://example.com/products/test')).toBe(false);
  });

  it('ensures Shopify bootstrap URL as final open target', () => {
    const direct = 'https://makripon.myshopify.com/products/test?ab_preview=1';
    const ensured = ensureShopifyPreviewBootstrapUrl(direct);
    const url = new URL(ensured);
    expect(url.origin).toBe('https://makripon.myshopify.com');
    expect(url.pathname).toBe('/apps/ripx/preview-bootstrap-v2');
    expect(url.searchParams.get('url')).toBe(direct);
  });

  it('does not re-wrap existing bootstrap URL', () => {
    const bootstrap =
      'https://makripon.myshopify.com/apps/ripx/preview-bootstrap-v2?url=https%3A%2F%2Fmakripon.myshopify.com%2Fproducts%2Ftest';
    expect(ensureShopifyPreviewBootstrapUrl(bootstrap)).toBe(bootstrap);
  });

  it('does not re-wrap existing price preview bootstrap URL', () => {
    const bootstrap =
      'https://makripon.myshopify.com/apps/ripx/price-preview-bootstrap-v1?url=https%3A%2F%2Fmakripon.myshopify.com%2Fproducts%2Ftest%3Fab_preview%3D1';
    expect(ensureShopifyPreviewBootstrapUrl(bootstrap)).toBe(bootstrap);
  });

  it('wraps shipping simple preview URLs in Shopify bootstrap', () => {
    const direct = buildPreviewUrl({
      baseUrl: 'https://splitter-plus.myshopify.com/products/the-videographer-snowboard',
      testId: '9450d503-7391-4e65-ba0a-7e742622f029',
      variantId: 'Variant A',
      variantName: 'Variant A',
      tenantDomain: 'splitter-plus.myshopify.com',
      testType: 'shipping',
      simplePreview: true,
    });
    const resolved = resolveShopifySimplePreviewUrl({
      directPreviewUrl: direct,
      apiBaseUrl: 'https://splitter.echologyx.com/api',
    });
    const url = new URL(resolved);
    expect(url.hostname).toBe('splitter-plus.myshopify.com');
    expect(url.pathname).toBe('/apps/ripx/preview-bootstrap-v2');
    expect(url.searchParams.get('url')).toContain('ab_preview_test_type=shipping');
  });

  it('uses preview-document for password-protected shipping simple previews', () => {
    const direct = buildPreviewUrl({
      baseUrl: 'https://splitter-plus.myshopify.com/products/the-videographer-snowboard',
      testId: '9450d503-7391-4e65-ba0a-7e742622f029',
      variantId: 'Variant A',
      variantName: 'Variant A',
      tenantDomain: 'splitter-plus.myshopify.com',
      testType: 'shipping',
      simplePreview: true,
    });
    const resolved = resolveShopifySimplePreviewUrl({
      directPreviewUrl: direct,
      apiBaseUrl: 'https://splitter.echologyx.com/api',
      storefrontPassword: 'sp',
      parentOrigin: 'https://splitter.echologyx.com',
    });
    const url = new URL(resolved);
    expect(url.hostname).toBe('splitter.echologyx.com');
    expect(url.pathname).toBe('/api/track/preview-document');
    expect(url.searchParams.get('storefront_password')).toBe('sp');
    expect(url.searchParams.get('ab_preview_test_type')).toBe('shipping');
  });
});
