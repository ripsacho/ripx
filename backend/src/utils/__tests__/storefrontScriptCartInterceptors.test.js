const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createDocumentStub() {
  return {
    readyState: 'loading',
    cookie: '',
    body: {
      addEventListener: jest.fn(),
      querySelectorAll: jest.fn(() => []),
    },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
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

  const location = {
    href: `https://example.com/products/demo${search}`,
    origin: 'https://example.com',
    pathname: '/products/demo',
    search,
    hostname: 'example.com',
  };
  const document = createDocumentStub();

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
    location,
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
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
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
  };
}

describe('storefront script cart/add interceptors', () => {
  it('exposes cart debug helpers on test hooks', () => {
    const { hooks } = bootStorefrontScriptHarness();
    expect(hooks.pathnameFromCartUrl('/en/cart/add.js')).toBe('/en/cart/add.js');
    expect(hooks.debugDescribeCartAddBody('{"a":1}')).toBe('body:string(JSON)');
    expect(hooks.debugDescribeCartAddBody(null)).toBe('body:none');
    expect(hooks.looksLikeCartAddNearMiss('/apps/proxy/cart-add-line')).toBe(true);
    expect(hooks.looksLikeCartAddNearMiss('/cart/add.js')).toBe(false);
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

  it('patches JSON fetch body for /cart/add.js with RipX properties', async () => {
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
      body: JSON.stringify({ id: 123, quantity: 1 }),
    });

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '11111111-1111-4111-8111-111111111111',
      _ripx_variant: 'variant-A',
      _ripx_shop: 'makripon.myshopify.com',
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

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '11111111-1111-4111-8111-111111111111',
      _ripx_variant: 'variant-A',
      _ripx_shop: 'makripon.myshopify.com',
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

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body);
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

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body);
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

    expect(fetchCalls).toHaveLength(1);
    const patched = fetchCalls[0].init.body;
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
          text: async () => JSON.stringify({ id: 123, quantity: 1 }),
        };
      },
      text: async () => JSON.stringify({ id: 123, quantity: 1 }),
    };

    await windowObj.fetch(requestLike);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].init).toBeDefined();
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.properties).toMatchObject({
      _ripx_price_test: '55555555-5555-4555-8555-555555555555',
      _ripx_variant: 'variant-E',
      _ripx_shop: 'makripon.myshopify.com',
    });
  });
});
