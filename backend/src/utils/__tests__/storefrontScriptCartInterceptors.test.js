const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createDocumentStub(opts = {}) {
  return {
    readyState: 'loading',
    cookie: '',
    body: {
      addEventListener: jest.fn(),
      querySelectorAll: jest.fn(() =>
        typeof opts.bodyQuerySelectorAll === 'function' ? opts.bodyQuerySelectorAll() : []
      ),
    },
    addEventListener: jest.fn(),
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
    pathname,
    search,
    hostname: 'example.com',
  };
  const document = createDocumentStub({
    querySelector: opts.documentQuerySelector,
    querySelectorAll: opts.documentQuerySelectorAll,
    bodyQuerySelectorAll: opts.bodyQuerySelectorAll,
  });
  const sessionStore = new Map(Object.entries(opts.sessionStorage || {}));
  const sessionStorage = {
    getItem: jest.fn(key => (sessionStore.has(String(key)) ? sessionStore.get(String(key)) : null)),
    setItem: jest.fn((key, value) => {
      sessionStore.set(String(key), String(value));
    }),
    removeItem: jest.fn(key => {
      sessionStore.delete(String(key));
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

  const windowObj = {
    __RIPX_TEST_HOOKS__: {},
    __RIPX_DEBUG__: false,
    __RIPX_PRICE_PREVIEW_FRAME__: Boolean(opts.pricePreviewFrame),
    location,
    sessionStorage,
    navigator: { userAgent: 'node-test' },
    document,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    FormData,
    Headers,
    fetch: jest.fn((input, init) => {
      fetchCalls.push({ input, init });
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    }),
    XMLHttpRequest: FakeXMLHttpRequest,
    Shopify: { shop: 'makripon.myshopify.com' },
    AB_TEST_RUNTIME_CONFIG: {
      apiUrl: '',
      shopDomain: 'makripon.myshopify.com',
      activeTests: [],
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
    URL,
    URLSearchParams,
    FormData,
    Headers,
    XMLHttpRequest: FakeXMLHttpRequest,
    fetch: windowObj.fetch,
    setTimeout,
    clearTimeout,
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

  it('recognizes cart add paths (suffix match; any Markets / locale depth)', () => {
    const { hooks } = bootStorefrontScriptHarness();
    expect(hooks.isCartAddPath('/cart/add.js')).toBe(true);
    expect(hooks.isCartAddPath('/cart/add')).toBe(true);
    expect(hooks.isCartAddPath('/en/cart/add.js')).toBe(true);
    expect(hooks.isCartAddPath('/en-us/cart/add')).toBe(true);
    expect(hooks.isCartAddPath('/de/fr/cart/add.js')).toBe(true);
    expect(hooks.isCartAddPath('/collections/all')).toBe(false);
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
    });
  });

  it('reads preview context from nested price-preview bootstrap url', () => {
    const { hooks, sessionStore } = bootStorefrontScriptHarness({
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
    });
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
      null,
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
