import {
  PREVIEW_PARAMS,
  buildPreviewDocumentUrl,
  buildPreviewLaunchUrl,
  buildPreviewUrl,
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
    });

    const url = new URL(result, 'https://app.example.com');
    expect(url.pathname).toBe('/api/track/preview-document');
    expect(url.searchParams.get('url')).toBe(previewUrl);
    expect(url.searchParams.get(PREVIEW_PARAMS.TEST_ID)).toBe(
      '1d1f39c4-4083-44f4-b046-1c341b88cc29'
    );
    expect(url.searchParams.get(PREVIEW_PARAMS.TENANT_DOMAIN)).toBe('echologyx.com');
    expect(url.searchParams.get(PREVIEW_PARAMS.VISUAL_EDITOR)).toBe('1');
  });

  it('builds preview-launch URL and preserves preview params', () => {
    const previewUrl = buildPreviewUrl({
      baseUrl: 'https://makripon.myshopify.com/products/test-product',
      testId: '1d1f39c4-4083-44f4-b046-1c341b88cc29',
      variantId: 'variant-a',
      variantName: 'Variant A',
      tenantDomain: 'echologyx.com',
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
  });
});
