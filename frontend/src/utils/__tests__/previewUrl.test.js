import {
  PREVIEW_PARAMS,
  buildPreviewDocumentUrl,
  buildPreviewLaunchUrl,
  buildShopifyPricePreviewBootstrapUrl,
  buildShopifyPreviewBootstrapUrl,
  buildPreviewUrl,
  ensureShopifyPreviewBootstrapUrl,
  isShopifyPreviewUrl,
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

  it('builds isolated Shopify price preview bootstrap URL', () => {
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
});
