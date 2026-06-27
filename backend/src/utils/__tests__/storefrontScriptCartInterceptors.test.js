const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createDocumentStub(opts = {}) {
  const documentElementAttrs = {};
  const listeners = {};
  const addEventListener = jest.fn((eventName, handler) => {
    const key = String(eventName || '');
    listeners[key] = listeners[key] || [];
    listeners[key].push(handler);
  });
  return {
    readyState: opts.readyState || 'loading',
    cookie: '',
    body: {
      addEventListener: jest.fn(),
      appendChild: jest.fn(),
      querySelectorAll: jest.fn(() =>
        typeof opts.bodyQuerySelectorAll === 'function' ? opts.bodyQuerySelectorAll() : []
      ),
    },
    head: { appendChild: jest.fn() },
    documentElement: {
      setAttribute: jest.fn((name, value) => {
        documentElementAttrs[String(name)] = String(value);
      }),
      getAttribute: jest.fn(name => documentElementAttrs[String(name)] || null),
      removeAttribute: jest.fn(name => {
        delete documentElementAttrs[String(name)];
      }),
      appendChild: jest.fn(),
    },
    getElementById: jest.fn(() => null),
    addEventListener,
    removeEventListener: jest.fn(),
    querySelector: jest.fn(selector =>
      typeof opts.querySelector === 'function' ? opts.querySelector(selector) : null
    ),
    querySelectorAll: jest.fn(selector =>
      typeof opts.querySelectorAll === 'function' ? opts.querySelectorAll(selector) : []
    ),
    createElement: jest.fn(() => ({
      setAttribute: jest.fn(),
      appendChild: jest.fn(),
      querySelector: jest.fn(() => null),
      querySelectorAll: jest.fn(() => []),
      closest: jest.fn(() => null),
    })),
    __listeners: listeners,
  };
}

function bootStorefrontScriptHarness(opts = {}) {
  const storefrontPath = path.join(__dirname, '../../../../shopify/storefront-script.js');
  const source = fs.readFileSync(storefrontPath, 'utf8');
  const fetchCalls = [];
  const search = typeof opts.search === 'string' ? opts.search : '';
  const pathname = typeof opts.pathname === 'string' ? opts.pathname : '/products/demo';
  const href = `https://example.com${pathname}${search}`;

  const location = {
    href,
    origin: 'https://example.com',
    protocol: 'https:',
    pathname,
    search,
    hostname: 'example.com',
  };
  const document = createDocumentStub({
    readyState: opts.readyState,
    querySelector: opts.documentQuerySelector,
    querySelectorAll: opts.documentQuerySelectorAll,
    bodyQuerySelectorAll: opts.bodyQuerySelectorAll,
  });
  const sessionStore = new Map(Object.entries(opts.sessionStorage || {}));
  const sessionStorage = {
    get length() {
      return sessionStore.size;
    },
    key: jest.fn(index => Array.from(sessionStore.keys())[index] || null),
    getItem: jest.fn(key => (sessionStore.has(String(key)) ? sessionStore.get(String(key)) : null)),
    setItem: jest.fn((key, value) => {
      sessionStore.set(String(key), String(value));
    }),
    removeItem: jest.fn(key => {
      sessionStore.delete(String(key));
    }),
  };
  const localStore = new Map(Object.entries(opts.localStorage || {}));
  const localStorage = {
    getItem: jest.fn(key => (localStore.has(String(key)) ? localStore.get(String(key)) : null)),
    setItem: jest.fn((key, value) => {
      localStore.set(String(key), String(value));
    }),
    removeItem: jest.fn(key => {
      localStore.delete(String(key));
    }),
  };

  class FakeXMLHttpRequest {
    constructor() {
      this.headers = {};
      this.method = '';
      this.url = '';
      this.sentBody = null;
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader(name, value) {
      this.headers[String(name || '').toLowerCase()] = String(value || '');
    }

    send(body) {
      this.sentBody = body;
    }
  }

  const setIntervalStub = opts.setInterval || jest.fn(() => 1);
  const clearIntervalStub = opts.clearInterval || jest.fn();

  const windowObj = {
    __RIPX_TEST_HOOKS__: {},
    __RIPX_DEBUG__: false,
    __RIPX_PRICE_PREVIEW_FRAME__: Boolean(opts.pricePreviewFrame),
    ripx_consent: opts.ripxConsent === true,
    location,
    sessionStorage,
    localStorage,
    history: opts.history || { state: null, replaceState: jest.fn() },
    navigator: { userAgent: 'node-test' },
    document,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    setTimeout,
    clearTimeout,
    setInterval: setIntervalStub,
    clearInterval: clearIntervalStub,
    URL,
    URLSearchParams,
    FormData,
    Headers,
    Blob,
    fetch: jest.fn((input, init) => {
      fetchCalls.push({ input, init });
      if (typeof opts.fetchImpl === 'function') {
        return opts.fetchImpl(input, init);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    }),
    XMLHttpRequest: FakeXMLHttpRequest,
    Shopify: { shop: 'makripon.myshopify.com' },
    AB_TEST_RUNTIME_CONFIG: {
      apiUrl: '',
      shopDomain: 'makripon.myshopify.com',
      activeTests: [],
      ...(opts.runtimeConfig || {}),
    },
  };

  windowObj.window = windowObj;
  windowObj.self = windowObj;
  windowObj.top = windowObj;
  windowObj.parent = windowObj;

  const sandbox = {
    window: windowObj,
    document,
    navigator: windowObj.navigator,
    location,
    history: windowObj.history,
    URL,
    URLSearchParams,
    FormData,
    Headers,
    Blob,
    XMLHttpRequest: FakeXMLHttpRequest,
    fetch: windowObj.fetch,
    setTimeout,
    clearTimeout,
    setInterval: setIntervalStub,
    clearInterval: clearIntervalStub,
    console,
    CSS: { escape: s => String(s) },
    Intl,
    Date,
    Math,
    JSON,
    Promise,
    AbortController,
    performance: { now: () => Date.now() },
  };

  vm.runInNewContext(source, sandbox, { filename: 'storefront-script.js' });
  return {
    hooks: windowObj.__RIPX_TEST_HOOKS__,
    fetchCalls,
    windowObj,
    FakeXMLHttpRequest,
    sessionStore,
    localStore,
  };
}

function createCartProductEl(productId) {
  return {
    getAttribute: jest.fn(name => (name === 'data-product-id' ? String(productId) : '')),
    shadowRoot: null,
  };
}

function createCartRoot(productIds) {
  const nodes = (productIds || []).map(createCartProductEl);
  return {
    shadowRoot: null,
    querySelectorAll: jest.fn(() => nodes),
  };
}

function getFetchInputUrl(call) {
  if (!call) {
    return '';
  }
  const input = call.input;
  if (typeof input === 'string') {
    return input;
  }
  if (input && typeof input.url === 'string') {
    return input.url;
  }
  return '';
}

function getCartAddFetchCall(fetchCalls) {
  return (Array.isArray(fetchCalls) ? fetchCalls : []).find(call =>
    /\/cart\/add(?:\.js)?(?:[?#]|$)/i.test(getFetchInputUrl(call))
  );
}

function getCartSnapshotCalls(fetchCalls) {
  return (Array.isArray(fetchCalls) ? fetchCalls : []).filter(call =>
    /\/cart\.js(?:[?#]|$)/i.test(getFetchInputUrl(call))
  );
}

function getCartChangeFetchCalls(fetchCalls) {
  return (Array.isArray(fetchCalls) ? fetchCalls : []).filter(call =>
    /\/cart\/change(?:\.js)?(?:[?#]|$)/i.test(getFetchInputUrl(call))
  );
}

function getCartUpdateFetchCalls(fetchCalls) {
  return (Array.isArray(fetchCalls) ? fetchCalls : []).filter(call =>
    /\/cart\/update(?:\.js)?(?:[?#]|$)/i.test(getFetchInputUrl(call))
  );
}

function getTrackCalls(fetchCalls) {
  return (Array.isArray(fetchCalls) ? fetchCalls : []).filter(call =>
    /\/track(?:[?#]|$)/i.test(getFetchInputUrl(call))
  );
}

function createCartAddFormStub() {
  const hiddenInputs = [];
  return {
    getAttribute: jest.fn(name => (name === 'action' ? '/cart/add' : '')),
    hasAttribute: jest.fn(() => false),
    closest: jest.fn(() => null),
    querySelector: jest.fn(selector => {
      if (selector === 'input[name="id"]' || selector === '[name="id"]') {
        return { value: '123' };
      }
      return null;
    }),
    querySelectorAll: jest.fn(selector =>
      selector === 'input[type="hidden"]' ? hiddenInputs : []
    ),
    appendChild: jest.fn(input => {
      hiddenInputs.push(input);
      return input;
    }),
    __hiddenInputs: hiddenInputs,
  };
}

function createCheckoutFormStub() {
  return {
    getAttribute: jest.fn(name => (name === 'action' ? '/checkout' : '')),
    submit: jest.fn(),
    closest: jest.fn(() => null),
  };
}

async function waitForVariantRequestCount(fetchCalls, count) {
  for (let i = 0; i < 10; i++) {
    const variantRequests = fetchCalls.filter(call =>
      /\/track\/variants\?/.test(getFetchInputUrl(call))
    );
    if (variantRequests.length >= count) {
      return variantRequests;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return fetchCalls.filter(call => /\/track\/variants\?/.test(getFetchInputUrl(call)));
}

async function waitForTrackEvent(fetchCalls, eventName) {
  for (let i = 0; i < 20; i++) {
    const match = getTrackCalls(fetchCalls).find(call => {
      try {
        const body = JSON.parse(call.init?.body || '{}');
        return body.event_name === eventName;
      } catch (_error) {
        return false;
      }
    });
    if (match) {
      return match;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return undefined;
}

describe('storefront script cart/add interceptors', () => {
  it('exposes cart debug helpers on test hooks', () => {
    const { hooks } = bootStorefrontScriptHarness();
    expect(hooks.pathnameFromCartUrl('/en/cart/add.js')).toBe('/en/cart/add.js');
    expect(hooks.debugDescribeCartAddBody('{"a":1}')).toBe('body:string(JSON)');
    expect(hooks.debugDescribeCartAddBody(null)).toBe('body:none');
    expect(hooks.looksLikeCartAddNearMiss('/apps/proxy/cart-add-line')).toBe(true);
    expect(hooks.looksLikeCartAddNearMiss('/cart/add.js')).toBe(false);
    expect(typeof hooks.getRipxCartAttributeState).toBe('function');
  });

  it('waits for consent before starting eager live batch assignment', async () => {
    const testId = '24242424-2424-4242-8242-242424242424';
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        consentRequired: true,
        activeTests: [{ id: testId, type: 'price', targetType: 'all-products' }],
      },
      fetchImpl: input => {
        const url = getFetchInputUrl({ input });
        if (url.includes('/track/variants')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ variants: { [testId]: { variantId: 'v1' } } }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      },
    });

    expect(hooks.ensureBatchFetched()).toBe(false);
    expect(fetchCalls.some(call => getFetchInputUrl(call).includes('/track/variants'))).toBe(false);

    windowObj.ripx_consent = true;
    windowObj.ripx_consent_callback();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchCalls.some(call => getFetchInputUrl(call).includes('/track/variants'))).toBe(true);
  });

  it('defers PDP price apply until product id is available for selected product targets', () => {
    const intervals = [];
    const clearIntervalStub = jest.fn();
    const { hooks, windowObj } = bootStorefrontScriptHarness({
      setInterval: jest.fn(cb => {
        intervals.push(cb);
        return intervals.length;
      }),
      clearInterval: clearIntervalStub,
    });

    const deferred = hooks.deferPdpPriceApplyUntilProductId(
      {
        id: '25252525-2525-4252-8252-252525252525',
        type: 'price',
        targetVariantId: null,
      },
      { variantId: 'v1', config: { priceMode: 'percent', value: 10 } },
      'product',
      ['gid://shopify/Product/200'],
      true
    );

    expect(deferred).toBe(true);
    expect(intervals).toHaveLength(1);

    windowObj.ShopifyAnalytics = { meta: { product: { id: 200 } } };
    intervals[0]();

    expect(clearIntervalStub).toHaveBeenCalled();
    expect(
      windowObj.__RIPX_LIVE_DIAGNOSTICS__.events.some(
        event => event.event === 'price_apply:pdp_retry'
      )
    ).toBe(true);
    expect(hooks.getAntiFlickerDiagnostics()).toMatchObject({
      active: false,
      pending: 0,
    });
  });

  it('recognizes cart add paths (suffix match; any Markets / locale depth)', () => {
    const { hooks } = bootStorefrontScriptHarness();
    expect(hooks.isCartAddPath('/cart/add.js')).toBe(true);
    expect(hooks.isCartAddPath('/cart/add')).toBe(true);
    expect(hooks.isCartAddPath('/en/cart/add.js')).toBe(true);
    expect(hooks.isCartAddPath('/en-us/cart/add')).toBe(true);
    expect(hooks.isCartAddPath('/de/fr/cart/add.js')).toBe(true);
    expect(hooks.isCartAddPath('/collections/all')).toBe(false);
  });

  it('automatically tracks add_to_cart after a successful cart add fetch', async () => {
    const testId = 'add-cart-test';
    const { fetchCalls, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [{ id: testId, goalEvents: [{ eventName: 'add_to_cart' }] }],
        goalMetricDefinitions: [
          {
            id: 'builtin-add-to-cart',
            eventName: 'add_to_cart',
            triggerType: 'custom_event',
            triggerConfig: {},
          },
        ],
      },
      fetchImpl: input => {
        const url = getFetchInputUrl({ input });
        if (url.includes('/track/variants')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ variants: { [testId]: { variantId: 'variant-a' } } }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      },
    });

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    const addToCartCall = await waitForTrackEvent(fetchCalls, 'add_to_cart');
    expect(addToCartCall).toBeTruthy();
    expect(JSON.parse(addToCartCall.init.body)).toMatchObject({
      test_id: testId,
      variant_id: 'variant-a',
      event_type: 'custom',
      event_name: 'add_to_cart',
    });
  });

  it('automatically tracks view_cart when a cart control is clicked', async () => {
    const testId = 'view-cart-test';
    const cartLink = {
      href: 'https://example.com/cart',
      getAttribute: jest.fn(name => (name === 'href' ? '/cart' : '')),
    };
    const target = {
      closest: jest.fn(selector => (String(selector).includes('/cart') ? cartLink : null)),
    };
    const { fetchCalls, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [{ id: testId, goalEvents: [{ eventName: 'view_cart' }] }],
        goalMetricDefinitions: [
          {
            id: 'builtin-view-cart',
            eventName: 'view_cart',
            triggerType: 'url_match',
            triggerConfig: { urlPattern: '*/cart*' },
          },
        ],
      },
      fetchImpl: input => {
        const url = getFetchInputUrl({ input });
        if (url.includes('/track/variants')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ variants: { [testId]: { variantId: 'variant-a' } } }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      },
    });

    const clickListeners = windowObj.document.__listeners.click || [];
    clickListeners.forEach(listener => listener({ target }));

    const viewCartCall = await waitForTrackEvent(fetchCalls, 'view_cart');
    expect(viewCartCall).toBeTruthy();
    expect(JSON.parse(viewCartCall.init.body)).toMatchObject({
      test_id: testId,
      variant_id: 'variant-a',
      event_type: 'custom',
      event_name: 'view_cart',
    });
  });

  it('chunks live assignment requests so every active test can bucket', async () => {
    const activeTests = Array.from({ length: 51 }, (_, index) => ({
      id: `test-${index + 1}`,
      type: 'content',
      targetType: 'all',
      targetIds: null,
    }));
    const { fetchCalls } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests,
      },
      fetchImpl: input => {
        const url = new URL(String(input));
        const ids = (url.searchParams.get('test_ids') || '').split(',').filter(Boolean);
        const variants = {};
        ids.forEach(id => {
          variants[id] = { variantId: `${id}-variant`, variantName: 'Variant A', config: {} };
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              variants,
              diagnostics: {
                requestedTestIds: ids,
                assignedTestIds: Object.keys(variants),
              },
            }),
        });
      },
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(await waitForVariantRequestCount(fetchCalls, 2)).toHaveLength(2);

    const variantRequests = fetchCalls.filter(call =>
      /\/track\/variants\?/.test(getFetchInputUrl(call))
    );
    expect(variantRequests).toHaveLength(2);
    const chunkSizes = variantRequests.map(call => {
      const url = new URL(getFetchInputUrl(call));
      return (url.searchParams.get('test_ids') || '').split(',').filter(Boolean).length;
    });
    expect(chunkSizes).toEqual([50, 1]);
  });

  it('uses live session cache for first paint while refreshing assignment in background', async () => {
    const form = createCartAddFormStub();
    const testId = '51515151-5151-4151-8151-515151515151';
    const userId = 'user-session-cache';
    const cacheKey = `ripx_live_variant_cache_v1_makripon.myshopify.com__${userId}__1.0.46__${encodeURIComponent(
      testId
    )}`;
    const { fetchCalls } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        version: '1.0.46',
        activeTests: [
          {
            id: testId,
            type: 'price',
            targetType: 'all-products',
            targetIds: null,
          },
        ],
      },
      sessionStorage: {
        [cacheKey]: JSON.stringify({
          testId,
          shopDomain: 'makripon.myshopify.com',
          userId,
          scriptVersion: '1.0.46',
          persistedAtMs: Date.now(),
          variant: {
            variantId: 'variant-session-cache',
            variantName: 'Variant A',
            assignment_sig: 's'.repeat(64),
            assignment_ts: '1710000000000',
            assignment_user: 'user-session-cache',
            config: {
              priceMode: 'fixed',
              price: 55,
              priceApplicationMethod: 'direct_price_override',
            },
          },
        }),
      },
      localStorage: {
        __ripx_live_user_id_v1__: userId,
      },
      documentQuerySelector: () => null,
      documentQuerySelectorAll: selector =>
        String(selector || '').includes('form[action*="cart/add"]') ? [form] : [],
      fetchImpl: input => {
        const url = new URL(String(input), 'https://example.com');
        if (/\/track\/variants$/.test(url.pathname)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ variants: {} }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      },
    });

    for (let i = 0; i < 8 && form.__hiddenInputs.length === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const hiddenByName = new Map(form.__hiddenInputs.map(input => [input.name, input.value]));
    expect(hiddenByName.get('properties[_ripx_price_test]')).toBe(testId);
    expect(hiddenByName.get('properties[_ripx_variant]')).toBe('variant-session-cache');
    expect(hiddenByName.get('properties[_ripx_target_unit]')).toBe('55.00');
    expect(hiddenByName.get('properties[_ripx_assignment_sig]')).toBe('s'.repeat(64));
    expect(fetchCalls.some(call => /\/track\/variants\?/.test(getFetchInputUrl(call)))).toBe(true);
  });

  it('writes a short-lived inline price anti-flicker hint only for eligible price tests', () => {
    const testId = '61616161-6161-4161-8161-616161616161';
    const { sessionStore } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        version: '1.0.46',
        activeTests: [
          {
            id: testId,
            type: 'price',
            targetType: 'all-products',
            targetIds: null,
            priceSurfaceMappings: [{ surface: 'pdp', role: 'regular', selector: '.custom-price' }],
          },
        ],
      },
    });

    const raw = sessionStore.get('__ripx_price_af_hint_v1__');
    expect(raw).toBeTruthy();
    const hint = JSON.parse(raw);
    expect(hint).toMatchObject({
      shopHost: 'example.com',
      shopDomain: 'makripon.myshopify.com',
      version: '1.0.46',
    });
    expect(hint.expiresAtMs).toBeGreaterThan(Date.now());
    expect(hint.selectors).toContain('.custom-price');

    const noPrice = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        version: '1.0.46',
        activeTests: [{ id: 'content-test', type: 'content', targetType: 'all', targetIds: null }],
      },
    });
    expect(noPrice.sessionStore.get('__ripx_price_af_hint_v1__')).toBeUndefined();
  });

  it('keeps preview flag inert without explicit preview test context', () => {
    const { hooks } = bootStorefrontScriptHarness({ search: '?ab_preview=1' });
    expect(hooks.previewMode).toBe(true);
    expect(hooks.previewTestContext).toBe(false);
    expect(hooks.previewTestId).toBe(null);
  });

  it('keeps simple preview context persisted after startup', () => {
    const { hooks, sessionStore, windowObj } = bootStorefrontScriptHarness({
      search:
        '?ab_preview=1&ab_preview_simple=1&ab_preview_test=11111111-1111-4111-8111-111111111111&ab_preview_variant=Variant%20A',
    });

    expect(hooks.previewMode).toBe(true);
    expect(hooks.previewTestId).toBe('11111111-1111-4111-8111-111111111111');
    expect(windowObj.sessionStorage.removeItem).not.toHaveBeenCalledWith('__ripx_preview_ctx_v1__');
    const stored = JSON.parse(sessionStore.get('__ripx_preview_ctx_v1__'));
    expect(stored).toMatchObject({
      preview: true,
      testId: '11111111-1111-4111-8111-111111111111',
      variantId: 'Variant A',
      simple: true,
    });
    expect(windowObj.history.replaceState).toHaveBeenCalledWith(null, '', '/products/demo');
    expect(windowObj.__RIPX_SIMPLE_PREVIEW_CLEAN_URL__).toMatchObject({
      cleaned: true,
      href: 'https://example.com/products/demo',
    });
  });

  it('does not bulk-rewrite anchor hrefs for simple preview on startup', () => {
    const anchor = {
      getAttribute: jest.fn(name => (name === 'href' ? '/collections/all' : null)),
      setAttribute: jest.fn(),
    };

    const { windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      search:
        '?ab_preview=1&ab_preview_simple=1&ab_preview_test=11111111-1111-4111-8111-111111111111&ab_preview_variant=Variant%20A',
      documentQuerySelectorAll: selector => (selector === 'a[href]' ? [anchor] : []),
    });

    expect(anchor.setAttribute).not.toHaveBeenCalled();
    expect(windowObj.__RIPX_SIMPLE_PREVIEW_NAV__).toBe(true);
  });

  it('isolates preview bootstrap from unrelated live active tests', () => {
    const livePriceTestId = '99999999-9999-4999-8999-999999999999';
    const previewShippingTestId = '11111111-1111-4111-8111-111111111111';
    const { hooks } = bootStorefrontScriptHarness({
      search:
        '?ab_preview=1&ab_preview_simple=1&ab_preview_test_type=shipping&ab_preview_test=' +
        previewShippingTestId +
        '&ab_preview_variant=Variant%20A',
      runtimeConfig: {
        apiUrl: 'https://app.example.com/api',
        activeTests: [
          {
            id: livePriceTestId,
            type: 'price',
            targetType: 'all-products',
            antiFlickerMode: 'balanced',
          },
        ],
      },
    });

    expect(hooks.previewMode).toBe(true);
    expect(hooks.previewTestId).toBe(previewShippingTestId);
    expect(hooks.getAntiFlickerDiagnostics().active).toBe(false);
  });

  it('defers shipping preview cart sync on product pages until handoff is finalized', () => {
    const previewShippingTestId = '9450d503-7391-4e65-ba0a-7e742622f029';
    const { hooks, fetchCalls } = bootStorefrontScriptHarness({
      readyState: 'complete',
      pathname: '/products/the-videographer-snowboard',
      search:
        '?ab_preview=1&ab_preview_simple=1&ab_preview_test_type=shipping&ab_preview_test=' +
        previewShippingTestId +
        '&ab_preview_variant=Variant%20A&ab_preview_variant_name=Variant%20A',
      runtimeConfig: {
        apiUrl: 'https://app.example.com/api',
        activeTests: [],
        priceSurfaceRegistry: {
          shopMappings: [
            {
              id: 'mapping-1',
              surface: 'pdp',
              role: 'regular',
              selector: '.product__price .money',
              enabled: true,
              priority: 12,
            },
          ],
        },
      },
      fetchImpl: input => {
        if (String(input || '').includes('/track/preview')) {
          return new Promise(() => {});
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      },
    });

    expect(hooks.shouldUseLightweightShippingPreviewPdpHandoff()).toBe(true);
    expect(hooks.shippingPreviewHandoffDeferred()).toBe(true);
    expect(
      fetchCalls.some(call => /\/cart\/update(?:\.js)?(?:[?#]|$)/i.test(getFetchInputUrl(call)))
    ).toBe(false);
  });

  it('reads preview context from nested price-preview bootstrap url', () => {
    const { hooks, sessionStore, windowObj } = bootStorefrontScriptHarness({
      pathname: '/apps/ripx/price-preview-bootstrap-v1',
      search:
        '?url=https%3A%2F%2Fexample.com%2Fproducts%2Fdemo%3Fab_preview%3D1%26ab_preview_simple%3D1%26ab_preview_test%3D22222222-2222-4222-8222-222222222222%26ab_preview_variant%3DVariant%2520B',
      pricePreviewFrame: true,
    });

    expect(hooks.previewMode).toBe(true);
    expect(hooks.previewTestId).toBe('22222222-2222-4222-8222-222222222222');
    const stored = JSON.parse(sessionStore.get('__ripx_preview_ctx_v1__'));
    expect(stored).toMatchObject({
      preview: true,
      testId: '22222222-2222-4222-8222-222222222222',
      variantId: 'Variant B',
      simple: true,
    });
    expect(windowObj.history.replaceState).not.toHaveBeenCalled();
  });

  it('keeps preview-document navigation inside the proxy for customer previews', () => {
    const anchor = {
      getAttribute: jest.fn(name => (name === 'href' ? 'https://makripon.myshopify.com/' : null)),
      setAttribute: jest.fn(),
    };

    bootStorefrontScriptHarness({
      readyState: 'complete',
      pathname: '/api/track/preview-document',
      search:
        '?url=https%3A%2F%2Fmakripon.myshopify.com%2Fproducts%2Fdemo%3Fab_preview%3D1%26ab_preview_simple%3D1%26ab_preview_test%3D66666666-6666-4666-8666-666666666666%26ab_preview_variant%3DVariant%2520F&storefront_password=sp',
      documentQuerySelectorAll: selector => (selector === 'a[href]' ? [anchor] : []),
      runtimeConfig: {
        previewDocumentApiUrl: 'https://app.example.com/api/track/preview-document',
        previewLauncherParams: {
          ab_preview: '1',
          ab_preview_simple: '1',
          ab_preview_test: '66666666-6666-4666-8666-666666666666',
          ab_preview_variant: 'Variant F',
          storefront_password: 'sp',
        },
      },
    });

    expect(anchor.setAttribute).toHaveBeenCalled();
    const proxiedHref = anchor.setAttribute.mock.calls.find(call => call[0] === 'href')?.[1];
    const proxiedUrl = new URL(proxiedHref);
    const nestedUrl = new URL(proxiedUrl.searchParams.get('url'));
    expect(proxiedUrl.pathname).toBe('/api/track/preview-document');
    expect(proxiedUrl.searchParams.get('storefront_password')).toBe('sp');
    expect(nestedUrl.pathname).toBe('/');
    expect(nestedUrl.searchParams.get('ab_preview_test')).toBe(
      '66666666-6666-4666-8666-666666666666'
    );
    expect(nestedUrl.searchParams.get('ab_preview_variant')).toBe('Variant F');
  });

  it('keeps persisted simple previews chrome-free after navigation drops query params', () => {
    const { hooks, windowObj } = bootStorefrontScriptHarness({
      search: '',
      sessionStorage: {
        __ripx_preview_ctx_v1__: JSON.stringify({
          preview: true,
          testId: '33333333-3333-4333-8333-333333333333',
          variantId: 'Variant C',
          simple: true,
          persistedAtMs: Date.now(),
        }),
      },
    });

    expect(hooks.previewMode).toBe(true);
    expect(hooks.previewTestId).toBe('33333333-3333-4333-8333-333333333333');
    expect(hooks.previewSimpleMode).toBe(true);
    expect(windowObj.history.replaceState).not.toHaveBeenCalled();
  });

  it('uses cached preview variant before refreshing preview assignment in background', async () => {
    const testId = '77777777-7777-4777-8777-777777777777';
    const scopeKey = encodeURIComponent(['variant-a', 'Variant A'].join('\u0001'));
    const { windowObj, fetchCalls } = bootStorefrontScriptHarness({
      search:
        '?ab_preview=1&ab_preview_simple=1&ab_preview_test=77777777-7777-4777-8777-777777777777&ab_preview_variant=variant-a&ab_preview_variant_name=Variant%20A',
      runtimeConfig: {
        apiUrl: 'https://app.example.com/api',
      },
      sessionStorage: {
        [`ripx_preview_variant_cache_v2_${testId}__${scopeKey}`]: JSON.stringify({
          variant: {
            variantId: 'variant-a',
            variantName: 'Variant A',
            config: { price: 9.99, priceMode: 'fixed' },
          },
          persistedAtMs: Date.now(),
        }),
      },
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              variant: {
                variantId: 'variant-a',
                variantName: 'Variant A',
                config: { price: 8.99, priceMode: 'fixed' },
              },
            }),
        }),
    });

    const variant = await windowObj.RipX.getVariant(testId);

    expect(variant).toMatchObject({
      variantId: 'variant-a',
      config: { price: 9.99, priceMode: 'fixed' },
      isPreview: true,
    });
    expect(fetchCalls.some(call => String(call.input || '').includes('/track/preview?'))).toBe(
      true
    );
  });

  it('resets stale preview state when customer view requests a new preview session', () => {
    const { hooks, sessionStore, windowObj } = bootStorefrontScriptHarness({
      search:
        '?ab_preview=1&ab_preview_simple=1&ab_preview_reset=1&ab_preview_session=customer-abc&ab_preview_test=44444444-4444-4444-8444-444444444444&ab_preview_variant=Variant%20D',
      sessionStorage: {
        __ripx_preview_ctx_v1__: JSON.stringify({
          preview: true,
          testId: 'old-test',
          variantId: 'Old Variant',
          simple: true,
          persistedAtMs: Date.now(),
        }),
        'ripx_preview_variant_cache_44444444-4444-4444-8444-444444444444': JSON.stringify({
          variant: { variantId: 'Old Variant', config: { stale: true } },
          persistedAtMs: Date.now(),
        }),
        ripx_preview_variant_cache_other: JSON.stringify({
          variant: { variantId: 'Other Old Variant', config: { stale: true } },
          persistedAtMs: Date.now(),
        }),
      },
    });

    expect(hooks.previewMode).toBe(true);
    expect(hooks.previewTestId).toBe('44444444-4444-4444-8444-444444444444');
    expect(
      sessionStore.has('ripx_preview_variant_cache_44444444-4444-4444-8444-444444444444')
    ).toBe(false);
    expect(sessionStore.has('ripx_preview_variant_cache_other')).toBe(false);
    const stored = JSON.parse(sessionStore.get('__ripx_preview_ctx_v1__'));
    expect(stored).toMatchObject({
      preview: true,
      testId: '44444444-4444-4444-8444-444444444444',
      variantId: 'Variant D',
      simple: true,
      sessionId: 'customer-abc',
    });
    expect(windowObj.__RIPX_SIMPLE_PREVIEW_CLEAN_URL__).toMatchObject({
      cleaned: true,
      reset: true,
      sessionId: 'customer-abc',
    });
  });

  it('restores preview session id from persisted context after URL cleanup', () => {
    const { hooks } = bootStorefrontScriptHarness({
      search: '',
      sessionStorage: {
        __ripx_preview_ctx_v1__: JSON.stringify({
          preview: true,
          testId: '55555555-5555-4555-8555-555555555555',
          variantId: 'Variant E',
          simple: true,
          sessionId: 'customer-persisted',
          persistedAtMs: Date.now(),
        }),
      },
    });

    expect(hooks.previewMode).toBe(true);
    expect(hooks.previewSimpleMode).toBe(true);
    expect(hooks.previewSessionId).toBe('customer-persisted');
  });

  it('mirrors live user identity between first-party cookie and localStorage', () => {
    const { hooks, localStore, windowObj } = bootStorefrontScriptHarness();

    const userId = hooks.getUserId();

    expect(userId).toMatch(/^user_/);
    expect(localStore.get('__ripx_live_user_id_v1__')).toBe(userId);
    expect(windowObj.document.cookie).toContain(`ab_test_user_id=${encodeURIComponent(userId)}`);
    expect(windowObj.document.cookie).toContain('SameSite=Lax');
    expect(windowObj.document.cookie).toContain('Secure');
  });

  it('restores live user identity from localStorage when cookie is missing', () => {
    const { hooks, windowObj } = bootStorefrontScriptHarness({
      localStorage: {
        __ripx_live_user_id_v1__: 'user_existing_cross_tab',
      },
    });

    expect(hooks.getUserId()).toBe('user_existing_cross_tab');
    expect(windowObj.document.cookie).toContain('ab_test_user_id=user_existing_cross_tab');
  });

  it('runs selected-product shipping tests on cart surfaces and injects signed cart state', () => {
    const cartRoot = createCartRoot(['gid://shopify/Product/200']);
    const { hooks } = bootStorefrontScriptHarness({
      pathname: '/cart',
      documentQuerySelector: selector =>
        selector && selector.includes('.cart-drawer') ? { nodeType: 1 } : null,
      documentQuerySelectorAll: selector =>
        selector && selector.includes('.cart-drawer') ? [cartRoot] : [],
    });

    const test = {
      id: 'shipping-test-1',
      type: 'shipping',
      targetType: 'product',
      targetIds: ['gid://shopify/Product/200'],
    };

    expect(hooks.shouldShowShippingTestOnCart(test)).toBe(true);
    expect(hooks.shouldRunPriceTestOnCurrentPage(test)).toBe(true);

    hooks.injectShippingTestCartAttributes(test, {
      id: 'shipping-variant-a',
      assignment_sig: 'sig-123',
      assignment_ts: '1712600000000',
      assignment_user: 'user-1',
    });

    expect(hooks.getRipxCartAttributeState()).toMatchObject({
      _ripx_price_test: 'shipping-test-1',
      _ripx_variant: 'shipping-variant-a',
      _ripx_assignment_sig: 'sig-123',
      _ripx_assignment_ts: '1712600000000',
      _ripx_assignment_user: 'user-1',
    });
    expect(hooks.getRipxCartFormTargetProductIds()).toEqual(['gid://shopify/Product/200']);
  });

  it('injects shipping cart assignment for all-products shipping previews', () => {
    const { hooks } = bootStorefrontScriptHarness({
      pathname: '/cart',
    });

    hooks.injectShippingTestCartAttributes(
      {
        id: 'shipping-test-all-products',
        type: 'shipping',
        targetType: 'all-products',
      },
      {
        id: 'shipping-variant-all',
        assignment_sig: 'sig-all-products',
        assignment_ts: '1712600000000',
        assignment_user: 'user-all-products',
      }
    );

    expect(hooks.getRipxCartAttributeState()).toMatchObject({
      _ripx_price_test: 'shipping-test-all-products',
      _ripx_variant: 'shipping-variant-all',
      _ripx_assignment_sig: 'sig-all-products',
      _ripx_assignment_ts: '1712600000000',
      _ripx_assignment_user: 'user-all-products',
      __ripx_shipping_test: true,
    });
    expect(hooks.getRipxCartFormTargetProductIds()).toBeNull();
  });

  it('does not qualify excluded-only carts for all-products shipping tests', () => {
    const cartRoot = createCartRoot(['gid://shopify/Product/999']);
    const { hooks } = bootStorefrontScriptHarness({
      pathname: '/cart',
      documentQuerySelector: selector =>
        selector && selector.includes('.cart-drawer') ? { nodeType: 1 } : null,
      documentQuerySelectorAll: selector =>
        selector && selector.includes('.cart-drawer') ? [cartRoot] : [],
    });

    const test = {
      id: 'shipping-test-2',
      type: 'shipping',
      targetType: 'all-products',
      excludedProductIds: ['gid://shopify/Product/999'],
    };

    expect(hooks.shouldShowShippingTestOnCart(test)).toBe(false);
  });

  it('patches JSON fetch body for /cart/add.js with RipX properties', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '11111111-1111-4111-8111-111111111111',
      'variant-A',
      'makripon.myshopify.com',
      null,
      { targetUnit: 90, discountUnit: 10 }
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    const addCall = getCartAddFetchCall(fetchCalls);
    expect(addCall).toBeTruthy();
    expect(getCartSnapshotCalls(fetchCalls).length).toBeLessThanOrEqual(1);
    const body = JSON.parse(addCall.init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '11111111-1111-4111-8111-111111111111',
      _ripx_variant: 'variant-A',
      _ripx_shop: 'makripon.myshopify.com',
      _ripx_target_unit: '90.00',
      _ripx_discount_unit: '10.00',
    });
  });

  it('patches JSON fetch body for /en/cart/add.js (localized storefront)', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '11111111-1111-4111-8111-111111111111',
      'variant-A',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/en/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    const addCall = getCartAddFetchCall(fetchCalls);
    expect(addCall).toBeTruthy();
    expect(getCartSnapshotCalls(fetchCalls).length).toBeLessThanOrEqual(1);
    const body = JSON.parse(addCall.init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '11111111-1111-4111-8111-111111111111',
      _ripx_variant: 'variant-A',
      _ripx_shop: 'makripon.myshopify.com',
    });
  });

  it('swaps add-to-cart variant id for native variant pricing when source matches', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '77777777-7777-4777-8777-777777777777',
      'variant-native',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      __ripx_price_application_method: 'native_variant_price',
      __ripx_native_variant_id: '99999999999',
      __ripx_source_variant_id: '12345678901',
    });
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 12345678901, quantity: 1 }),
    });

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.id).toBe('99999999999');
    expect(body.properties).toMatchObject({
      _ripx_price_test: '77777777-7777-4777-8777-777777777777',
      _ripx_variant: 'variant-native',
    });
  });

  it('patches direct override price method onto cart line properties', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '99999999-9999-4999-8999-999999999999',
      'variant-direct',
      'makripon.myshopify.com',
      { sig: 'e'.repeat(64), ts: '1710000000000', user: 'user-direct' },
      { targetUnit: 84 }
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      _ripx_price_method: 'direct_price_override',
      __ripx_price_application_method: 'direct_price_override',
    });
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '99999999-9999-4999-8999-999999999999',
      _ripx_variant: 'variant-direct',
      _ripx_target_unit: '84.00',
      _ripx_price_method: 'direct_price_override',
      _ripx_assignment_sig: 'e'.repeat(64),
    });
  });

  it('stamps native form-submit cart adds just before submit', async () => {
    const form = createCartAddFormStub();
    const { hooks, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [],
      },
      documentQuerySelectorAll: selector =>
        String(selector || '').includes('form[action*="cart/add"]') ? [form] : [],
    });
    const attrs = hooks.getRipxCartAttrsPayload(
      '12121212-1212-4121-8121-121212121212',
      'variant-form-submit',
      'makripon.myshopify.com',
      { sig: 'h'.repeat(64), ts: '1710000000000', user: 'user-form-submit' },
      { targetUnit: 77 },
      null
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      _ripx_price_method: 'direct_price_override',
      __ripx_price_application_method: 'direct_price_override',
    });

    const submitRegistration = windowObj.document.addEventListener.mock.calls.find(
      call => call[0] === 'submit'
    );
    expect(submitRegistration).toBeTruthy();
    submitRegistration[1]({ target: form });

    const hiddenByName = new Map(form.__hiddenInputs.map(input => [input.name, input.value]));
    expect(hiddenByName.get('properties[_ripx_price_test]')).toBe(
      '12121212-1212-4121-8121-121212121212'
    );
    expect(hiddenByName.get('properties[_ripx_variant]')).toBe('variant-form-submit');
    expect(hiddenByName.get('properties[_ripx_target_unit]')).toBe('77.00');
    expect(hiddenByName.get('properties[_ripx_price_method]')).toBe('direct_price_override');
  });

  it('pauses native submit until simple-preview price state is ready', async () => {
    const testId = '24242424-2424-4242-8242-242424242424';
    const form = createCartAddFormStub();
    form.requestSubmit = jest.fn();
    const { windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      search:
        `?ab_preview=1&ab_preview_simple=1&ab_preview_test=${testId}` +
        '&ab_preview_variant=variant-form-preview',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [],
      },
      documentQuerySelectorAll: selector =>
        String(selector || '').includes('form[action*="cart/add"]') ? [form] : [],
      fetchImpl: input => {
        const url = new URL(String(input), 'https://example.com');
        if (/\/track\/preview$/.test(url.pathname)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                variant: {
                  variantId: 'variant-form-preview',
                  variantName: 'Variant A',
                  assignment_sig: 'g'.repeat(64),
                  assignment_ts: '1710000000000',
                  assignment_user: 'preview-user-form',
                  config: {
                    priceMode: 'fixed',
                    price: 45,
                    priceApplicationMethod: 'direct_price_override',
                  },
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });

    const submitRegistration = windowObj.document.addEventListener.mock.calls.find(
      call => call[0] === 'submit'
    );
    expect(submitRegistration).toBeTruthy();
    const event = {
      target: form,
      preventDefault: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    };
    submitRegistration[1](event);

    expect(event.preventDefault).toHaveBeenCalled();
    for (let i = 0; i < 8 && form.requestSubmit.mock.calls.length === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const hiddenByName = new Map(form.__hiddenInputs.map(input => [input.name, input.value]));
    expect(hiddenByName.get('properties[_ripx_price_test]')).toBe(testId);
    expect(hiddenByName.get('properties[_ripx_variant]')).toBe('variant-form-preview');
    expect(hiddenByName.get('properties[_ripx_target_unit]')).toBe('45.00');
    expect(hiddenByName.get('properties[_ripx_price_method]')).toBe('direct_price_override');
    expect(hiddenByName.get('properties[_ripx_assignment_sig]')).toBe('g'.repeat(64));
    expect(form.requestSubmit).toHaveBeenCalled();
  });

  it('hydrates simple-preview shipping state before native cart submit', async () => {
    const testId = '25252525-2525-4252-8252-252525252525';
    const form = createCartAddFormStub();
    form.requestSubmit = jest.fn();
    const { windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      search:
        `?ab_preview=1&ab_preview_simple=1&ab_preview_test=${testId}` +
        '&ab_preview_variant=Variant%20A',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [],
      },
      documentQuerySelectorAll: selector =>
        String(selector || '').includes('form[action*="cart/add"]') ? [form] : [],
      fetchImpl: input => {
        const url = new URL(String(input), 'https://example.com');
        if (/\/track\/preview$/.test(url.pathname)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                variant: {
                  variantId: 'Variant A',
                  variantName: 'Variant A',
                  assignment_sig: 'i'.repeat(64),
                  assignment_ts: '1710000000000',
                  assignment_user: 'preview-user-shipping',
                  config: {
                    strategy: 'flat_rate',
                    amount: 44,
                    replace_existing_rates: true,
                    delivery_method_names: ['Standard Delivery', 'Express'],
                  },
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });

    const submitRegistration = windowObj.document.addEventListener.mock.calls.find(
      call => call[0] === 'submit'
    );
    expect(submitRegistration).toBeTruthy();
    const event = {
      target: form,
      preventDefault: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    };
    submitRegistration[1](event);

    expect(event.preventDefault).toHaveBeenCalled();
    for (let i = 0; i < 8 && form.requestSubmit.mock.calls.length === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const hiddenByName = new Map(form.__hiddenInputs.map(input => [input.name, input.value]));
    expect(hiddenByName.get('properties[_ripx_price_test]')).toBe(testId);
    expect(hiddenByName.get('properties[_ripx_variant]')).toBe('Variant A');
    expect(hiddenByName.get('properties[_ripx_assignment_sig]')).toBe('i'.repeat(64));
    expect(hiddenByName.get('properties[_ripx_target_unit]')).toBeUndefined();
    expect(form.requestSubmit).toHaveBeenCalled();
  });

  it('does not pause native submit when no RipX cart handoff can hydrate', () => {
    const form = createCartAddFormStub();
    form.requestSubmit = jest.fn();
    const { windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [],
      },
      documentQuerySelectorAll: selector =>
        String(selector || '').includes('form[action*="cart/add"]') ? [form] : [],
    });

    const submitRegistration = windowObj.document.addEventListener.mock.calls.find(
      call => call[0] === 'submit'
    );
    expect(submitRegistration).toBeTruthy();
    const event = {
      target: form,
      preventDefault: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    };
    submitRegistration[1](event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(form.requestSubmit).not.toHaveBeenCalled();
    expect(form.__hiddenInputs).toHaveLength(0);
  });

  it('seeds fixed-price live cart attributes even when product id is unavailable', async () => {
    const form = createCartAddFormStub();
    const testId = '14141414-1414-4141-8141-141414141414';
    const { fetchCalls } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [
          {
            id: testId,
            type: 'price',
            targetType: 'all-products',
            targetIds: null,
          },
        ],
      },
      documentQuerySelector: () => null,
      documentQuerySelectorAll: selector =>
        String(selector || '').includes('form[action*="cart/add"]') ? [form] : [],
      fetchImpl: input => {
        const url = new URL(String(input));
        if (/\/track\/variants$/.test(url.pathname)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                variants: {
                  [testId]: {
                    variantId: 'variant-fixed-live',
                    variantName: 'Variant A',
                    assignment_sig: 'a'.repeat(64),
                    assignment_ts: '1710000000000',
                    assignment_user: 'user-123',
                    config: {
                      priceMode: 'fixed',
                      price: 42,
                      priceApplicationMethod: 'direct_price_override',
                    },
                  },
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });

    await waitForVariantRequestCount(fetchCalls, 1);
    for (let i = 0; i < 8 && form.__hiddenInputs.length === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const hiddenByName = new Map(form.__hiddenInputs.map(input => [input.name, input.value]));
    expect(hiddenByName.get('properties[_ripx_price_test]')).toBe(testId);
    expect(hiddenByName.get('properties[_ripx_variant]')).toBe('variant-fixed-live');
    expect(hiddenByName.get('properties[_ripx_target_unit]')).toBe('42.00');
    expect(hiddenByName.get('properties[_ripx_price_method]')).toBe('direct_price_override');
    expect(hiddenByName.get('properties[_ripx_assignment_sig]')).toBe('a'.repeat(64));
  });

  it('waits for fixed-price assignment before patching fast live fetch cart adds', async () => {
    const testId = '15151515-1515-4151-8151-151515151515';
    const { fetchCalls, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [
          {
            id: testId,
            type: 'price',
            targetType: 'all-products',
            targetIds: null,
          },
        ],
      },
      fetchImpl: input => {
        const url = new URL(String(input), 'https://example.com');
        if (/\/track\/variants$/.test(url.pathname)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                variants: {
                  [testId]: {
                    variantId: 'variant-fast-live',
                    variantName: 'Variant A',
                    assignment_sig: 'b'.repeat(64),
                    assignment_ts: '1710000000000',
                    assignment_user: 'user-123',
                    config: {
                      priceMode: 'fixed',
                      price: 37,
                      priceApplicationMethod: 'direct_price_override',
                    },
                  },
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    const cartAdd = getCartAddFetchCall(fetchCalls);
    const body = JSON.parse(cartAdd.init.body);
    expect(body.properties._ripx_price_test).toBe(testId);
    expect(body.properties._ripx_variant).toBe('variant-fast-live');
    expect(body.properties._ripx_target_unit).toBe('37.00');
    expect(body.properties._ripx_assignment_sig).toBe('b'.repeat(64));
  });

  it('waits past simple-preview placeholders before patching price cart adds', async () => {
    const testId = '18181818-1818-4181-8181-181818181818';
    const { fetchCalls, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      search:
        `?ab_preview=1&ab_preview_simple=1&ab_preview_test=${testId}` +
        '&ab_preview_variant=variant-preview',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [
          {
            id: testId,
            type: 'price',
            targetType: 'all-products',
            targetIds: null,
          },
        ],
      },
      fetchImpl: input => {
        const url = new URL(String(input), 'https://example.com');
        if (/\/track\/preview$/.test(url.pathname)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                variant: {
                  variantId: 'variant-preview',
                  variantName: 'Variant A',
                  assignment_sig: 'c'.repeat(64),
                  assignment_ts: '1710000000000',
                  assignment_user: 'preview-user-123',
                  config: {
                    priceMode: 'fixed',
                    price: 29,
                    priceApplicationMethod: 'direct_price_override',
                  },
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    const cartAdd = getCartAddFetchCall(fetchCalls);
    const body = JSON.parse(cartAdd.init.body);
    expect(body.properties._ripx_price_test).toBe(testId);
    expect(body.properties._ripx_variant).toBe('variant-preview');
    expect(body.properties._ripx_target_unit).toBe('29.00');
    expect(body.properties._ripx_price_method).toBe('direct_price_override');
    expect(body.properties._ripx_assignment_sig).toBe('c'.repeat(64));
  });

  it('hydrates simple-preview price cart adds before preview test merge completes', async () => {
    const testId = '19191919-1919-4191-8191-191919191919';
    const { fetchCalls, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      search:
        `?ab_preview=1&ab_preview_simple=1&ab_preview_test=${testId}` +
        '&ab_preview_variant=variant-premerge',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [],
      },
      fetchImpl: input => {
        const url = new URL(String(input), 'https://example.com');
        if (/\/track\/preview$/.test(url.pathname)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                variant: {
                  variantId: 'variant-premerge',
                  variantName: 'Variant A',
                  assignment_sig: 'd'.repeat(64),
                  assignment_ts: '1710000000000',
                  assignment_user: 'preview-user-456',
                  config: {
                    priceMode: 'fixed',
                    price: 31,
                    priceApplicationMethod: 'direct_price_override',
                  },
                },
              }),
          });
        }
        if (/\/track\/preview-storefront-test$/.test(url.pathname)) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({}),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    const cartAdd = getCartAddFetchCall(fetchCalls);
    const body = JSON.parse(cartAdd.init.body);
    expect(body.properties._ripx_price_test).toBe(testId);
    expect(body.properties._ripx_variant).toBe('variant-premerge');
    expect(body.properties._ripx_target_unit).toBe('31.00');
    expect(body.properties._ripx_price_method).toBe('direct_price_override');
    expect(body.properties._ripx_assignment_sig).toBe('d'.repeat(64));
  });

  it('patches Blob fetch cart adds with RipX line properties', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '16161616-1616-4161-8161-161616161616',
      'variant-blob',
      'makripon.myshopify.com',
      { sig: 'c'.repeat(64), ts: '1710000000000', user: 'user-123' },
      { targetUnit: 22 },
      null
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      _ripx_price_method: 'direct_price_override',
    });
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new Blob([JSON.stringify({ id: 123, quantity: 1 })], {
        type: 'application/json',
      }),
    });

    const cartAdd = getCartAddFetchCall(fetchCalls);
    const body = JSON.parse(cartAdd.init.body);
    expect(body.properties._ripx_price_test).toBe('16161616-1616-4161-8161-161616161616');
    expect(body.properties._ripx_variant).toBe('variant-blob');
    expect(body.properties._ripx_target_unit).toBe('22.00');
    expect(body.properties._ripx_price_method).toBe('direct_price_override');
  });

  it('uses variant-specific target units for multi-item JSON cart adds', () => {
    const { hooks } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '17171717-1717-4171-8171-171717171717',
      'variant-matrix',
      'makripon.myshopify.com',
      { sig: 'd'.repeat(64), ts: '1710000000000', user: 'user-123' },
      null,
      null
    );
    hooks.rememberRipxTargetUnitForVariant('222', 12.5);
    hooks.rememberRipxPriceMethodForVariant('222', 'direct_price_override');

    const patch = hooks.patchCartAddBodyForRipx(
      JSON.stringify({
        items: [
          { id: 222, quantity: 1 },
          { id: 333, quantity: 1 },
        ],
      }),
      { 'content-type': 'application/json' },
      attrs
    );
    const body = JSON.parse(patch.body);
    expect(body.items[0].properties._ripx_target_unit).toBe('12.50');
    expect(body.items[0].properties._ripx_price_method).toBe('direct_price_override');
    expect(body.items[1].properties._ripx_target_unit).toBeUndefined();
  });

  it('overwrites stale RipX assignment properties in JSON cart adds', () => {
    const { hooks } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '27272727-2727-4272-8272-272727272727',
      'variant-canonical-id',
      'ripx-plus.myshopify.com',
      { sig: 'k'.repeat(64), ts: '1710000000000', user: 'user-shipping' },
      null,
      null
    );
    attrs.__ripx_shipping_test = true;

    const patch = hooks.patchCartAddBodyForRipx(
      JSON.stringify({
        id: 222,
        quantity: 1,
        properties: {
          _ripx_price_test: '27272727-2727-4272-8272-272727272727',
          _ripx_variant: 'Variant A',
          _ripx_assignment_sig: 'old-signature',
          gift_note: 'keep me',
        },
      }),
      { 'content-type': 'application/json' },
      attrs
    );
    const body = JSON.parse(patch.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '27272727-2727-4272-8272-272727272727',
      _ripx_variant: 'variant-canonical-id',
      _ripx_assignment_sig: 'k'.repeat(64),
      gift_note: 'keep me',
    });
  });

  it('does not swap add-to-cart variant id when native swap source does not match', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '88888888-8888-4888-8888-888888888888',
      'variant-native',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      __ripx_price_application_method: 'native_variant_price',
      __ripx_native_variant_id: '99999999999',
      __ripx_source_variant_id: '12345678901',
    });
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 55555555555, quantity: 1 }),
    });

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.id).toBe(55555555555);
  });

  it('repairs the only missing-property cart line when variant metadata does not match', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness({
      fetchImpl: input => {
        const url = getFetchInputUrl({ input });
        if (/\/cart\.js(?:[?#]|$)/i.test(url)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                items: [{ variant_id: 123, quantity: 1, properties: {} }],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });
    const attrs = hooks.getRipxCartAttrsPayload(
      '13131313-1313-4131-8131-131313131313',
      'variant-repair',
      'makripon.myshopify.com',
      { sig: 'a'.repeat(64), ts: '1710000000000', user: 'user-123' },
      { targetUnit: 66 },
      null
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      _ripx_price_method: 'direct_price_override',
      __ripx_price_application_method: 'direct_price_override',
      __ripx_native_variant_id: '999',
      __ripx_source_variant_id: '123',
    });
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    await new Promise(resolve => setTimeout(resolve, 160));
    const changeCall = getCartChangeFetchCalls(fetchCalls)[0] || null;
    expect(changeCall).toBeTruthy();
    const body = JSON.parse(changeCall.init.body);
    expect(body.line).toBe(1);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '13131313-1313-4131-8131-131313131313',
      _ripx_variant: 'variant-repair',
      _ripx_target_unit: '66.00',
      _ripx_price_method: 'direct_price_override',
    });
  });

  it('repairs existing shipping cart line before checkout submit', async () => {
    const checkoutForm = createCheckoutFormStub();
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      documentQuerySelectorAll: () => [],
      fetchImpl: input => {
        const url = getFetchInputUrl({ input });
        if (/\/cart\.js(?:[?#]|$)/i.test(url)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                items: [{ variant_id: 123, quantity: 4, properties: {} }],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });
    const attrs = hooks.getRipxCartAttrsPayload(
      '26262626-2626-4262-8262-262626262626',
      'Variant A',
      'ripx-plus.myshopify.com',
      { sig: 'j'.repeat(64), ts: '1710000000000', user: 'user-shipping' },
      null,
      null
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      __ripx_shipping_test: true,
    });
    hooks.installRipxCartAddInterceptors();

    const submitRegistrations = windowObj.document.addEventListener.mock.calls.filter(
      call => call[0] === 'submit'
    );
    expect(submitRegistrations.length).toBeGreaterThan(0);
    const event = {
      target: checkoutForm,
      preventDefault: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    };
    submitRegistrations.forEach(call => call[1](event));

    expect(event.preventDefault).toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 180));
    const changeCall = getCartChangeFetchCalls(fetchCalls)[0] || null;
    expect(changeCall).toBeTruthy();
    const body = JSON.parse(changeCall.init.body);
    expect(body.line).toBe(1);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '26262626-2626-4262-8262-262626262626',
      _ripx_variant: 'Variant A',
      _ripx_assignment_sig: 'j'.repeat(64),
    });
    const updateCall = getCartUpdateFetchCalls(fetchCalls)[0] || null;
    expect(updateCall).toBeTruthy();
    expect(JSON.parse(updateCall.init.body).attributes).toMatchObject({
      _ripx_price_test: '26262626-2626-4262-8262-262626262626',
      _ripx_variant: 'Variant A',
    });
    expect(checkoutForm.submit).toHaveBeenCalled();
  });

  it('repairs stale shipping assignment values before checkout submit', async () => {
    const checkoutForm = createCheckoutFormStub();
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      documentQuerySelectorAll: () => [],
      fetchImpl: input => {
        const url = getFetchInputUrl({ input });
        if (/\/cart\.js(?:[?#]|$)/i.test(url)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                items: [
                  {
                    variant_id: 123,
                    quantity: 1,
                    properties: {
                      _ripx_price_test: '28282828-2828-4282-8282-282828282828',
                      _ripx_variant: 'Variant A',
                      _ripx_assignment_sig: 'old-signature',
                    },
                  },
                ],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });
    const attrs = hooks.getRipxCartAttrsPayload(
      '28282828-2828-4282-8282-282828282828',
      'variant-canonical-id',
      'ripx-plus.myshopify.com',
      { sig: 'm'.repeat(64), ts: '1710000000000', user: 'user-shipping' },
      null,
      null
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      __ripx_shipping_test: true,
    });
    hooks.installRipxCartAddInterceptors();

    const submitRegistrations = windowObj.document.addEventListener.mock.calls.filter(
      call => call[0] === 'submit'
    );
    const event = {
      target: checkoutForm,
      preventDefault: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    };
    submitRegistrations.forEach(call => call[1](event));

    expect(event.preventDefault).toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 180));
    const changeCall = getCartChangeFetchCalls(fetchCalls)[0] || null;
    expect(changeCall).toBeTruthy();
    const body = JSON.parse(changeCall.init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '28282828-2828-4282-8282-282828282828',
      _ripx_variant: 'variant-canonical-id',
      _ripx_assignment_sig: 'm'.repeat(64),
    });
    expect(checkoutForm.submit).toHaveBeenCalled();
  });

  it('continues checkout submit when cart repair rejects before checkout', async () => {
    const checkoutForm = createCheckoutFormStub();
    const { hooks, windowObj } = bootStorefrontScriptHarness({
      readyState: 'complete',
      documentQuerySelectorAll: () => [],
      fetchImpl: input => {
        const url = getFetchInputUrl({ input });
        if (/\/cart\.js(?:[?#]|$)/i.test(url)) {
          return Promise.reject(new Error('cart snapshot unavailable'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });
    const attrs = hooks.getRipxCartAttrsPayload(
      '29292929-2929-4292-9292-292929292929',
      'Variant A',
      'ripx-plus.myshopify.com',
      { sig: 'n'.repeat(64), ts: '1710000000000', user: 'user-shipping' },
      null,
      null
    );
    hooks.setRipxCartAttributeState({
      ...attrs,
      __ripx_shipping_test: true,
    });
    hooks.installRipxCartAddInterceptors();

    const submitRegistrations = windowObj.document.addEventListener.mock.calls.filter(
      call => call[0] === 'submit'
    );
    const event = {
      target: checkoutForm,
      preventDefault: jest.fn(),
      stopImmediatePropagation: jest.fn(),
    };
    submitRegistrations.forEach(call => call[1](event));

    expect(event.preventDefault).toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(checkoutForm.submit).toHaveBeenCalled();
  });

  it('auto-repairs existing cart line when shipping preview assignment hydrates', async () => {
    const testId = '27272727-2727-4272-8272-272727272727';
    const { hooks, fetchCalls } = bootStorefrontScriptHarness({
      readyState: 'complete',
      fetchImpl: input => {
        const url = getFetchInputUrl({ input });
        if (/\/cart\.js(?:[?#]|$)/i.test(url)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                items: [{ variant_id: 123, quantity: 4, properties: {} }],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });
    hooks.installRipxCartAddInterceptors();
    hooks.injectShippingTestCartAttributes(
      {
        id: testId,
        type: 'shipping',
        targetType: 'all-products',
      },
      {
        variantId: 'Variant A',
        assignment_sig: 'k'.repeat(64),
        assignment_ts: '1710000000000',
        assignment_user: 'user-preview-shipping',
      }
    );

    await new Promise(resolve => setTimeout(resolve, 180));
    const changeCall = getCartChangeFetchCalls(fetchCalls)[0] || null;
    expect(changeCall).toBeTruthy();
    const body = JSON.parse(changeCall.init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: testId,
      _ripx_variant: 'Variant A',
      _ripx_assignment_sig: 'k'.repeat(64),
    });
  });

  it('does not overwrite existing RipX properties in JSON body', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '11111111-1111-4111-8111-111111111111',
      'variant-A',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 123,
        quantity: 1,
        properties: {
          _ripx_price_test: 'existing-test',
          _ripx_variant: 'existing-variant',
          _ripx_shop: 'existing-shop.myshopify.com',
        },
      }),
    });

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: 'existing-test',
      _ripx_variant: 'existing-variant',
      _ripx_shop: 'existing-shop.myshopify.com',
    });
  });

  it('includes signed assignment attributes when payload provides proof', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '66666666-6666-4666-8666-666666666666',
      'variant-F',
      'makripon.myshopify.com',
      {
        sig: 'a'.repeat(64),
        ts: '1710000000000',
        user: 'user-123',
      }
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.properties).toMatchObject({
      _ripx_assignment_sig: 'a'.repeat(64),
      _ripx_assignment_ts: '1710000000000',
      _ripx_assignment_user: 'user-123',
    });
  });

  it('patches JSON fetch body with items[] shape for /cart/add.js', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '44444444-4444-4444-8444-444444444444',
      'variant-D',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { id: 123, quantity: 1 },
          { id: 456, quantity: 2, properties: { existing: 'yes' } },
        ],
      }),
    });

    const addCall = getCartAddFetchCall(fetchCalls);
    expect(addCall).toBeTruthy();
    expect(getCartSnapshotCalls(fetchCalls).length).toBeLessThanOrEqual(1);
    const body = JSON.parse(addCall.init.body);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0].properties).toMatchObject({
      _ripx_price_test: '44444444-4444-4444-8444-444444444444',
      _ripx_variant: 'variant-D',
      _ripx_shop: 'makripon.myshopify.com',
    });
    expect(body.items[1].properties).toMatchObject({
      existing: 'yes',
      _ripx_price_test: '44444444-4444-4444-8444-444444444444',
      _ripx_variant: 'variant-D',
      _ripx_shop: 'makripon.myshopify.com',
    });
  });

  it('patches JSON body line_items[] (legacy / alternate theme shape)', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '44444444-4444-4444-8444-444444444444',
      'variant-D',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line_items: [{ id: 123, quantity: 1 }],
      }),
    });

    const addCall = getCartAddFetchCall(fetchCalls);
    expect(addCall).toBeTruthy();
    expect(getCartSnapshotCalls(fetchCalls).length).toBeLessThanOrEqual(1);
    const body = JSON.parse(addCall.init.body);
    expect(body.line_items[0].properties).toMatchObject({
      _ripx_price_test: '44444444-4444-4444-8444-444444444444',
      _ripx_variant: 'variant-D',
      _ripx_shop: 'makripon.myshopify.com',
    });
  });

  it('patches URL-encoded XHR body for /cart/add', () => {
    const { hooks, FakeXMLHttpRequest } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '22222222-2222-4222-8222-222222222222',
      'variant-B',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    const xhr = new FakeXMLHttpRequest();
    xhr.open('POST', '/cart/add');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send('id=123&quantity=1');

    const params = new URLSearchParams(xhr.sentBody);
    expect(params.get('properties[_ripx_price_test]')).toBe('22222222-2222-4222-8222-222222222222');
    expect(params.get('properties[_ripx_variant]')).toBe('variant-B');
    expect(params.get('properties[_ripx_shop]')).toBe('makripon.myshopify.com');
  });

  it('does not overwrite existing RipX URL-encoded properties', () => {
    const { hooks, FakeXMLHttpRequest } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '22222222-2222-4222-8222-222222222222',
      'variant-B',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    const xhr = new FakeXMLHttpRequest();
    xhr.open('POST', '/cart/add');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send(
      'id=123&quantity=1&properties%5B_ripx_price_test%5D=existing-test&properties%5B_ripx_variant%5D=existing-variant'
    );

    const params = new URLSearchParams(xhr.sentBody);
    expect(params.get('properties[_ripx_price_test]')).toBe('existing-test');
    expect(params.get('properties[_ripx_variant]')).toBe('existing-variant');
  });

  it('waits for simple-preview state before sending XHR cart adds', async () => {
    const testId = '23232323-2323-4232-8232-232323232323';
    const { hooks, FakeXMLHttpRequest } = bootStorefrontScriptHarness({
      search:
        `?ab_preview=1&ab_preview_simple=1&ab_preview_test=${testId}` +
        '&ab_preview_variant=variant-xhr-preview',
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [],
      },
      fetchImpl: input => {
        const url = new URL(String(input), 'https://example.com');
        if (/\/track\/preview$/.test(url.pathname)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                variant: {
                  variantId: 'variant-xhr-preview',
                  variantName: 'Variant A',
                  assignment_sig: 'f'.repeat(64),
                  assignment_ts: '1710000000000',
                  assignment_user: 'preview-user-xhr',
                  config: {
                    priceMode: 'fixed',
                    price: 43,
                    priceApplicationMethod: 'direct_price_override',
                  },
                },
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        });
      },
    });
    hooks.installRipxCartAddInterceptors();

    const xhr = new FakeXMLHttpRequest();
    xhr.open('POST', '/cart/add');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send('id=123&quantity=1');

    expect(xhr.sentBody).toBe(null);
    for (let i = 0; i < 8 && xhr.sentBody === null; i++) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const params = new URLSearchParams(xhr.sentBody);
    expect(params.get('properties[_ripx_price_test]')).toBe(testId);
    expect(params.get('properties[_ripx_variant]')).toBe('variant-xhr-preview');
    expect(params.get('properties[_ripx_target_unit]')).toBe('43.00');
    expect(params.get('properties[_ripx_price_method]')).toBe('direct_price_override');
    expect(params.get('properties[_ripx_assignment_sig]')).toBe('f'.repeat(64));
  });

  it('does not delay XHR cart adds when no RipX cart handoff can hydrate', () => {
    const { hooks, FakeXMLHttpRequest } = bootStorefrontScriptHarness({
      runtimeConfig: {
        apiUrl: 'https://api.example.com/api',
        activeTests: [],
      },
    });
    hooks.installRipxCartAddInterceptors();

    const xhr = new FakeXMLHttpRequest();
    xhr.open('POST', '/cart/add');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send('id=123&quantity=1');

    expect(xhr.sentBody).toBe('id=123&quantity=1');
  });

  it('patches FormData fetch body for /cart/add.js', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '33333333-3333-4333-8333-333333333333',
      'variant-C',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    const body = new FormData();
    body.set('id', '123');
    body.set('quantity', '1');

    await windowObj.fetch('/cart/add.js', {
      method: 'POST',
      body,
    });

    const addCall = getCartAddFetchCall(fetchCalls);
    expect(addCall).toBeTruthy();
    expect(getCartSnapshotCalls(fetchCalls).length).toBeLessThanOrEqual(1);
    const patched = addCall.init.body;
    expect(patched).toBeInstanceOf(FormData);
    expect(patched.get('properties[_ripx_price_test]')).toBe(
      '33333333-3333-4333-8333-333333333333'
    );
    expect(patched.get('properties[_ripx_variant]')).toBe('variant-C');
    expect(patched.get('properties[_ripx_shop]')).toBe('makripon.myshopify.com');
  });

  it('patches request-like fetch input without init by reading cloned text body', async () => {
    const { hooks, fetchCalls, windowObj } = bootStorefrontScriptHarness();
    const attrs = hooks.getRipxCartAttrsPayload(
      '55555555-5555-4555-8555-555555555555',
      'variant-E',
      'makripon.myshopify.com'
    );
    hooks.setRipxCartAttributeState(attrs);
    hooks.installRipxCartAddInterceptors();

    const requestLike = {
      url: '/cart/add.js',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      clone() {
        return {
          text: () => Promise.resolve(JSON.stringify({ id: 123, quantity: 1 })),
        };
      },
      text: () => Promise.resolve(JSON.stringify({ id: 123, quantity: 1 })),
    };

    await windowObj.fetch(requestLike);

    const addCall = getCartAddFetchCall(fetchCalls);
    expect(addCall).toBeTruthy();
    expect(getCartSnapshotCalls(fetchCalls).length).toBeLessThanOrEqual(1);
    expect(addCall.init).toBeDefined();
    const body = JSON.parse(addCall.init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '55555555-5555-4555-8555-555555555555',
      _ripx_variant: 'variant-E',
      _ripx_shop: 'makripon.myshopify.com',
    });
  });

  it('normalizes sections_url for price-preview cart change fetch requests', async () => {
    const { fetchCalls, windowObj } = bootStorefrontScriptHarness({
      pathname: '/apps/ripx/price-preview-bootstrap-v1',
      search:
        '?url=https%3A%2F%2Fexample.com%2Fproducts%2Fdemo%3Fab_preview%3D1%26ab_preview_test%3D11111111-1111-4111-8111-111111111111',
      pricePreviewFrame: true,
    });
    windowObj.__RIPX_TEST_HOOKS__.installRipxCartAddInterceptors();

    await windowObj.fetch('/cart/change.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line: 1,
        quantity: 0,
        sections_url: '/apps/ripx/price-preview-bootstrap-v1',
      }),
    });

    const changeCall = fetchCalls.find(call => /\/cart\/change\.js/.test(getFetchInputUrl(call)));
    expect(changeCall).toBeTruthy();
    const body = JSON.parse(changeCall.init.body);
    expect(body.sections_url).toBe(
      '/products/demo?ab_preview=1&ab_preview_test=11111111-1111-4111-8111-111111111111'
    );
  });

  it('normalizes sections_url for price-preview cart update XHR requests', () => {
    const { hooks, FakeXMLHttpRequest } = bootStorefrontScriptHarness({
      pathname: '/apps/ripx/price-preview-bootstrap-v1',
      search:
        '?url=https%3A%2F%2Fexample.com%2Fproducts%2Fdemo%3Fab_preview%3D1%26ab_preview_test%3D11111111-1111-4111-8111-111111111111',
      pricePreviewFrame: true,
    });
    hooks.installRipxCartAddInterceptors();

    const xhr = new FakeXMLHttpRequest();
    xhr.open('POST', '/cart/update.js');
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send('updates%5B123%5D=0&sections_url=%2Fapps%2Fripx%2Fprice-preview-bootstrap-v1');

    const params = new URLSearchParams(xhr.sentBody);
    expect(params.get('sections_url')).toBe(
      '/products/demo?ab_preview=1&ab_preview_test=11111111-1111-4111-8111-111111111111'
    );
  });
});
