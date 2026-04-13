const {
  normalizeTestTypeForStorefront,
  normalizeTargetTypeForStorefront,
  mapTestToStorefrontPayload,
  buildStorefrontRuntimeConfig,
  getStorefrontScriptCacheControl,
} = require('../storefrontScriptRuntime');

describe('storefrontScriptRuntime', () => {
  it('normalizes pricing to price', () => {
    expect(normalizeTestTypeForStorefront('pricing')).toBe('price');
    expect(normalizeTestTypeForStorefront('PRICING')).toBe('price');
    expect(normalizeTestTypeForStorefront('price')).toBe('price');
    expect(normalizeTestTypeForStorefront('content')).toBe('content');
  });

  it('maps test payload with normalized type', () => {
    const row = {
      id: 't1',
      type: 'pricing',
      target_type: 'product',
      target_id: 'gid://shopify/Product/1',
      target_ids: null,
      segments: { excluded_product_ids: ['2', 'gid://shopify/Product/2'] },
    };
    const m = mapTestToStorefrontPayload(row);
    expect(m.type).toBe('price');
    expect(m.targetIds).toEqual(['gid://shopify/Product/1']);
    expect(m.excludedProductIds).toEqual(['gid://shopify/Product/2']);
    expect(m.antiFlickerMode).toBe('balanced');
  });

  it('falls back to target_id when target_ids is an empty array', () => {
    const row = {
      id: 't-empty',
      type: 'price',
      target_type: 'product',
      target_id: 'gid://shopify/Product/99',
      target_ids: [],
      segments: {},
    };
    const m = mapTestToStorefrontPayload(row);
    expect(m.targetIds).toEqual(['gid://shopify/Product/99']);
  });

  it('maps strict anti-flicker mode from segments', () => {
    const row = {
      id: 't2',
      type: 'content',
      target_type: 'all',
      target_id: null,
      target_ids: null,
      segments: { anti_flicker_mode: 'strict' },
    };
    const m = mapTestToStorefrontPayload(row);
    expect(m.antiFlickerMode).toBe('strict');
  });

  it('defaults empty price test target_type to all-products', () => {
    const row = {
      id: 't3',
      type: 'price',
      target_type: '',
      target_id: null,
      target_ids: null,
      segments: {},
    };
    expect(normalizeTargetTypeForStorefront(row)).toBe('all-products');
    const mapped = mapTestToStorefrontPayload(row);
    expect(mapped.targetType).toBe('all-products');
  });

  it('defaults empty shipping test target_type to all-products', () => {
    const row = {
      id: 't4',
      type: 'shipping',
      target_type: '',
      target_id: null,
      target_ids: null,
      segments: {},
    };
    expect(normalizeTargetTypeForStorefront(row)).toBe('all-products');
    const mapped = mapTestToStorefrontPayload(row);
    expect(mapped.targetType).toBe('all-products');
  });

  it('buildStorefrontRuntimeConfig uses req for fallback app URL', () => {
    const prevApp = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      const req = {
        protocol: 'https',
        get: h => (h === 'host' ? 'api.example.com' : ''),
      };
      const cfg = buildStorefrontRuntimeConfig('s.myshopify.com', [], req);
      expect(cfg.apiUrl).toBe('https://api.example.com/api');
      expect(cfg.consentRequired).toBe(false);
    } finally {
      if (prevApp !== undefined) {
        process.env.APP_URL = prevApp;
      }
    }
  });

  it('getStorefrontScriptCacheControl is short and must-revalidate', () => {
    const prev = process.env.RIPX_SCRIPT_CACHE_MAX_AGE;
    delete process.env.RIPX_SCRIPT_CACHE_MAX_AGE;
    try {
      expect(getStorefrontScriptCacheControl()).toMatch(/max-age=120/);
      expect(getStorefrontScriptCacheControl()).toMatch(/must-revalidate/);
    } finally {
      if (prev !== undefined) {
        process.env.RIPX_SCRIPT_CACHE_MAX_AGE = prev;
      } else {
        delete process.env.RIPX_SCRIPT_CACHE_MAX_AGE;
      }
    }
  });
});
