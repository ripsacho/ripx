const {
  normalizeTestTypeForStorefront,
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
      segments: {},
    };
    const m = mapTestToStorefrontPayload(row);
    expect(m.type).toBe('price');
    expect(m.targetIds).toEqual(['gid://shopify/Product/1']);
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
