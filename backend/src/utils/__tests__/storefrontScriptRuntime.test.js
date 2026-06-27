const fs = require('fs');
const path = require('path');

const {
  SCRIPT_VERSION,
  normalizeTestTypeForStorefront,
  normalizeTargetTypeForStorefront,
  mapTestToStorefrontPayload,
  buildStorefrontRuntimeConfig,
  getHeatmapCollectionRuntimeConfig,
  getStorefrontScriptCacheControl,
  buildEarlyStorefrontAntiFlickerBootstrap,
} = require('../storefrontScriptRuntime');

describe('storefrontScriptRuntime', () => {
  it('normalizes pricing to price', () => {
    expect(normalizeTestTypeForStorefront('pricing')).toBe('price');
    expect(normalizeTestTypeForStorefront('PRICING')).toBe('price');
    expect(normalizeTestTypeForStorefront('price')).toBe('price');
    expect(normalizeTestTypeForStorefront('OFFER')).toBe('offer');
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

  it('maps selected catalog goal events for runtime tracking', () => {
    const row = {
      id: 't-goals',
      type: 'content',
      target_type: 'all',
      target_id: null,
      target_ids: null,
      segments: {},
      goal: {
        secondary: [
          {
            event_name: 'newsletter_signup',
            aggregation: 'count',
            metric_role: 'secondary',
          },
          {
            eventName: 'support_click',
            aggregation: 'sum',
            metric_role: 'guardrail',
          },
        ],
      },
    };
    const mapped = mapTestToStorefrontPayload(row);
    expect(mapped.goalEvents).toEqual([
      { eventName: 'newsletter_signup', aggregation: 'count', metricRole: 'secondary' },
      { eventName: 'support_click', aggregation: 'sum', metricRole: 'guardrail' },
    ]);
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

  it('maps bounded anti-flicker timeout from segments', () => {
    const mapped = mapTestToStorefrontPayload({
      id: 't-price',
      type: 'price',
      target_type: 'all',
      target_id: null,
      target_ids: null,
      segments: { anti_flicker_timeout_ms: 9999 },
    });

    expect(mapped.antiFlickerTimeoutMs).toBe(2000);
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

  it('defaults all offer test target_type to all-products for storefront cart handling', () => {
    const row = {
      id: 't-offer',
      type: 'offer',
      target_type: 'all',
      target_id: null,
      target_ids: null,
      segments: {},
    };
    expect(normalizeTargetTypeForStorefront(row)).toBe('all-products');
    const mapped = mapTestToStorefrontPayload(row);
    expect(mapped.targetType).toBe('all-products');
  });

  it('maps price surface mappings from segments', () => {
    const mapped = mapTestToStorefrontPayload({
      id: 't-price-surfaces',
      type: 'price',
      target_type: 'product',
      target_id: 'gid://shopify/Product/1',
      target_ids: null,
      segments: {
        price_surface_mappings: [
          { surface: 'pdp', role: 'regular', selector: '.product__price' },
          { selector: '' },
        ],
      },
    });
    expect(mapped.priceSurfaceMappings).toEqual([
      expect.objectContaining({
        surface: 'pdp',
        role: 'regular',
        selector: '.product__price',
      }),
    ]);
  });

  it('embeds shop price surface mappings in runtime config', () => {
    const req = {
      protocol: 'https',
      get: h => (h === 'host' ? 'api.example.com' : ''),
    };
    const cfg = buildStorefrontRuntimeConfig('s.myshopify.com', [], req, [], {
      shopMappings: [{ surface: 'plp', role: 'regular', selector: '.money', priority: 1 }],
    });
    expect(cfg.priceSurfaceRegistry.shopMappings).toEqual([
      expect.objectContaining({ surface: 'plp', role: 'regular', selector: '.money' }),
    ]);
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
      expect(cfg.heatmapCollection).toEqual({ enabled: true, sampleRate: 1 });
    } finally {
      if (prevApp !== undefined) {
        process.env.APP_URL = prevApp;
      }
    }
  });

  it('clamps heatmap collection runtime config from environment', () => {
    const prevEnabled = process.env.RIPX_HEATMAP_COLLECTION_ENABLED;
    const prevSampleRate = process.env.RIPX_HEATMAP_SAMPLE_RATE;
    process.env.RIPX_HEATMAP_COLLECTION_ENABLED = 'false';
    process.env.RIPX_HEATMAP_SAMPLE_RATE = '1.8';
    try {
      expect(getHeatmapCollectionRuntimeConfig()).toEqual({ enabled: false, sampleRate: 1 });
      process.env.RIPX_HEATMAP_SAMPLE_RATE = '-1';
      expect(getHeatmapCollectionRuntimeConfig()).toEqual({ enabled: false, sampleRate: 0 });
    } finally {
      if (prevEnabled !== undefined) {
        process.env.RIPX_HEATMAP_COLLECTION_ENABLED = prevEnabled;
      } else {
        delete process.env.RIPX_HEATMAP_COLLECTION_ENABLED;
      }
      if (prevSampleRate !== undefined) {
        process.env.RIPX_HEATMAP_SAMPLE_RATE = prevSampleRate;
      } else {
        delete process.env.RIPX_HEATMAP_SAMPLE_RATE;
      }
    }
  });

  it('embeds sanitized goal metric trigger definitions in runtime config', () => {
    const req = {
      protocol: 'https',
      get: h => (h === 'host' ? 'api.example.com' : ''),
    };
    const cfg = buildStorefrontRuntimeConfig('s.myshopify.com', [], req, [
      {
        id: 'g1',
        name: 'Newsletter signup',
        event_name: 'newsletter_signup',
        trigger_type: 'form_submit',
        trigger_config: {
          selector: 'form.newsletter',
          url_pattern: '/ignored',
          parameter_name: 'value',
          min_relative_lift: 10,
        },
        aggregation: 'count',
        metric_role: 'secondary',
      },
    ]);
    expect(cfg.goalMetricDefinitions).toEqual([
      {
        id: 'g1',
        name: 'Newsletter signup',
        eventName: 'newsletter_signup',
        triggerType: 'form_submit',
        triggerConfig: {
          selector: 'form.newsletter',
          urlPattern: '/ignored',
          parameterName: 'value',
          linkKind: '',
          visibilityThreshold: 50,
          visibilityMinDurationMs: 0,
          visibilityFrequency: 'once_per_page',
          observeDomChanges: true,
          customJavascript: '',
          customJavascriptIntervalMs: 1000,
          customJavascriptMaxWaitMs: 10000,
        },
        aggregation: 'count',
        metricRole: 'secondary',
      },
    ]);
  });

  it('embeds advanced visibility and custom JavaScript trigger options', () => {
    const req = {
      protocol: 'https',
      get: h => (h === 'host' ? 'api.example.com' : ''),
    };
    const cfg = buildStorefrontRuntimeConfig('s.myshopify.com', [], req, [
      {
        id: 'g-visibility',
        name: 'Hero seen',
        event_name: 'hero_seen',
        trigger_type: 'element_visibility',
        trigger_config: {
          selector: '.hero',
          visibility_threshold: 75,
          visibility_min_duration_ms: 1500,
          visibility_frequency: 'once_per_element',
          observe_dom_changes: false,
        },
      },
      {
        id: 'g-js',
        name: 'Promo detected',
        event_name: 'promo_detected',
        trigger_type: 'custom_javascript',
        trigger_config: {
          custom_javascript: "return document.querySelector('.promo') ? 1 : false;",
          custom_javascript_interval_ms: 500,
          custom_javascript_max_wait_ms: 5000,
        },
      },
    ]);
    expect(cfg.goalMetricDefinitions[0].triggerConfig).toMatchObject({
      selector: '.hero',
      visibilityThreshold: 75,
      visibilityMinDurationMs: 1500,
      visibilityFrequency: 'once_per_element',
      observeDomChanges: false,
    });
    expect(cfg.goalMetricDefinitions[1].triggerConfig).toMatchObject({
      customJavascript: "return document.querySelector('.promo') ? 1 : false;",
      customJavascriptIntervalMs: 500,
      customJavascriptMaxWaitMs: 5000,
    });
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

  it('buildEarlyStorefrontAntiFlickerBootstrap injects hide snippet for price or strict tests', () => {
    expect(buildEarlyStorefrontAntiFlickerBootstrap([])).toBe('');
    expect(
      buildEarlyStorefrontAntiFlickerBootstrap([
        { id: 't1', type: 'content', antiFlickerMode: 'balanced' },
      ])
    ).toBe('');
    const snippet = buildEarlyStorefrontAntiFlickerBootstrap([
      { id: 't1', type: 'price', antiFlickerMode: 'balanced' },
    ]);
    expect(snippet).toContain('data-ripx-af');
    expect(snippet).toContain('data-ripx-af","price"');
    expect(snippet).toContain('.price');
    expect(snippet).not.toContain('body{opacity:0');
    expect(snippet).toContain('opacity:0');

    const strictSnippet = buildEarlyStorefrontAntiFlickerBootstrap([
      { id: 't1', type: 'content', antiFlickerMode: 'strict' },
    ]);
    expect(strictSnippet).toContain('data-ripx-af","strict"');
    expect(strictSnippet).toContain('body{opacity:0');
  });

  it('skips early anti-flicker bootstrap when preview context is present', () => {
    const snippet = buildEarlyStorefrontAntiFlickerBootstrap([
      { id: 't1', type: 'price', antiFlickerMode: 'balanced' },
    ]);
    expect(snippet).toContain('ripxHasPreviewCtx');
    expect(snippet).toContain('if(ripxHasPreviewCtx())return;');
  });

  it('includes price surface mapping selectors in price anti-flicker CSS', () => {
    const snippet = buildEarlyStorefrontAntiFlickerBootstrap(
      [
        {
          id: 't-price',
          type: 'price',
          antiFlickerMode: 'balanced',
          priceSurfaceMappings: [
            { surface: 'home', role: 'regular', selector: '.featured-card .custom-price' },
          ],
        },
      ],
      {
        shopMappings: [{ surface: 'pdp', role: 'regular', selector: '.shop-product-price' }],
      }
    );

    expect(snippet).toContain('.featured-card .custom-price');
    expect(snippet).toContain('.shop-product-price');
    expect(snippet).not.toContain('body{opacity:0');
  });

  it('keeps theme app embed script version aligned with backend runtime version', () => {
    const root = path.join(__dirname, '../../../..');
    const liquid = fs.readFileSync(
      path.join(root, 'extensions/ripx-theme/blocks/ripx-app-embed.liquid'),
      'utf8'
    );
    const loader = fs.readFileSync(
      path.join(root, 'extensions/ripx-theme/assets/ripx-app-embed-loader.js'),
      'utf8'
    );
    const frontendConstants = fs.readFileSync(
      path.join(root, 'frontend/src/constants/app.js'),
      'utf8'
    );

    expect(liquid).toContain(`"version": "${SCRIPT_VERSION}"`);
    expect(liquid).toContain(`var version = '${SCRIPT_VERSION}'`);
    expect(liquid).toContain(`/apps/ripx/script.js?v=${SCRIPT_VERSION}`);
    expect(liquid).toContain('installPreviewGuardIfNeeded');
    expect(liquid).toContain('html[data-ripx-af="strict"] body{opacity:0 !important;}');
    expect(loader).toContain(`|| '${SCRIPT_VERSION}'`);
    expect(frontendConstants).toContain(`RIPX_STOREFRONT_SCRIPT_VERSION = '${SCRIPT_VERSION}'`);
  });
});
