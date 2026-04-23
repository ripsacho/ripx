const mockVerify = jest.fn();

jest.mock('jsonwebtoken', () => ({
  verify: (...args) => mockVerify(...args),
}));

const mockGetByEmail = jest.fn();
const mockEnsureAccountForUser = jest.fn();
jest.mock('../../models/standaloneUser', () => ({
  getByEmail: (...args) => mockGetByEmail(...args),
  ensureAccountForUser: (...args) => mockEnsureAccountForUser(...args),
}));

const mockGetTenantByApiKey = jest.fn();
const mockGetTenantByDomain = jest.fn();
const mockIsShopifyDomain = jest.fn(() => false);
const mockNormalizeDomain = jest.fn(value =>
  value === null || value === undefined ? null : String(value).toLowerCase().trim()
);
jest.mock('../../models/tenant', () => ({
  getTenantByApiKey: (...args) => mockGetTenantByApiKey(...args),
  getTenantByDomain: (...args) => mockGetTenantByDomain(...args),
  isShopifyDomain: (...args) => mockIsShopifyDomain(...args),
  normalizeDomain: (...args) => mockNormalizeDomain(...args),
}));

const mockGetAccountByApiKey = jest.fn();
const mockGetTenantByAccountAndDomain = jest.fn();
const mockGetFirstTenantForAccount = jest.fn();
jest.mock('../../models/account', () => ({
  getAccountByApiKey: (...args) => mockGetAccountByApiKey(...args),
  getTenantByAccountAndDomain: (...args) => mockGetTenantByAccountAndDomain(...args),
  getFirstTenantForAccount: (...args) => mockGetFirstTenantForAccount(...args),
}));

const mockHasAccess = jest.fn();
const mockGetTenantIdsForUser = jest.fn();
jest.mock('../../models/userDomainAccess', () => ({
  hasAccess: (...args) => mockHasAccess(...args),
  getTenantIdsForUser: (...args) => mockGetTenantIdsForUser(...args),
}));

const mockQuery = jest.fn();
jest.mock('../../utils/database', () => ({
  query: (...args) => mockQuery(...args),
}));

const mockGetRoleAndStatus = jest.fn();
jest.mock('../../models/user', () => ({
  getRoleAndStatus: (...args) => mockGetRoleAndStatus(...args),
}));

const mockIsUserStatusBlocked = jest.fn(() => false);
jest.mock('../../constants', () => ({
  ERROR_MESSAGES: { UNAUTHORIZED: 'Unauthorized' },
  isUserStatusBlocked: (...args) => mockIsUserStatusBlocked(...args),
}));

const mockSendUnauthorized = jest.fn((res, message) => {
  res.statusCode = 401;
  res.body = { success: false, error: message };
  return res;
});
jest.mock('../../utils/response', () => ({
  sendUnauthorized: (...args) => mockSendUnauthorized(...args),
}));

const mockGetShopSession = jest.fn();
jest.mock('../../models/shopSession', () => ({
  getShopSession: (...args) => mockGetShopSession(...args),
}));

jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { authenticate, optionalAuthenticate, authenticateShopify } = require('../auth');

describe('auth middleware email store context', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, JWT_SECRET: 'test-secret' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function makeReq(overrides = {}) {
    return {
      headers: { authorization: 'Bearer email-token', ...(overrides.headers || {}) },
      cookies: { ...(overrides.cookies || {}) },
      query: { ...(overrides.query || {}) },
      path: overrides.path || '/api/tests',
      method: overrides.method || 'GET',
      ...overrides,
    };
  }

  it('uses explicit user-domain access for requested store', async () => {
    const req = makeReq({ query: { shop: 'splitter-plus.myshopify.com' } });
    const res = {};
    const next = jest.fn();

    mockVerify.mockReturnValue({
      ripxtype: 'email_session',
      email: 'user@example.com',
      token_version: 0,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockEnsureAccountForUser.mockResolvedValue({ accountId: null });
    mockGetTenantByDomain.mockResolvedValue({
      id: 'tenant-1',
      domain: 'splitter-plus.myshopify.com',
      platform: 'shopify',
    });
    mockHasAccess.mockResolvedValue(true);

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.authType).toBe('email');
    expect(req.shopDomain).toBe('splitter-plus.myshopify.com');
    expect(req.tenantId).toBe('tenant-1');
  });

  it('does not silently fall back to first tenant when requested store is unauthorized', async () => {
    const req = makeReq({ query: { shop: 'splitter-plus.myshopify.com' } });
    const res = {};
    const next = jest.fn();

    mockVerify.mockReturnValue({
      ripxtype: 'email_session',
      email: 'user@example.com',
      token_version: 0,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: 'acc-1',
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: 'acc-1',
    });
    mockGetTenantByAccountAndDomain.mockResolvedValue(null);
    mockGetTenantByDomain.mockResolvedValue({
      id: 'tenant-2',
      domain: 'splitter-plus.myshopify.com',
      platform: 'shopify',
    });
    mockHasAccess.mockResolvedValue(false);

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.shopDomain).toBeUndefined();
    expect(mockGetFirstTenantForAccount).not.toHaveBeenCalled();
  });

  it('falls back to first accessible tenant when no requested store is provided', async () => {
    const req = makeReq();
    const res = {};
    const next = jest.fn();

    mockVerify.mockReturnValue({
      ripxtype: 'email_session',
      email: 'user@example.com',
      token_version: 0,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockEnsureAccountForUser.mockResolvedValue({ accountId: null });
    mockGetTenantIdsForUser.mockResolvedValue(['tenant-3']);
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'tenant-3',
          account_id: null,
          platform: 'shopify',
          domain: 'fallback.myshopify.com',
        },
      ],
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.shopDomain).toBe('fallback.myshopify.com');
    expect(req.tenantId).toBe('tenant-3');
  });

  it('accepts email session from cookie when Authorization header is missing', async () => {
    const req = makeReq({
      headers: {},
      cookies: { ripx_email_session: 'cookie-token' },
      query: { shop: 'splitter-plus.myshopify.com' },
    });
    const res = {};
    const next = jest.fn();

    mockVerify.mockReturnValue({
      ripxtype: 'email_session',
      email: 'user@example.com',
      token_version: 0,
    });
    mockGetByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: 'acc-1',
    });
    mockGetTenantByAccountAndDomain.mockResolvedValue({
      id: 'tenant-1',
      domain: 'splitter-plus.myshopify.com',
      platform: 'shopify',
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.authType).toBe('email');
    expect(req.shopDomain).toBe('splitter-plus.myshopify.com');
  });

  it('does not silently fall back to first tenant for API key when explicit store is wrong', async () => {
    const req = makeReq({
      headers: { 'x-ripx-api-key': 'sk_ripx_test_key', 'x-ripx-store': 'wrong-shop.myshopify.com' },
      cookies: {},
    });
    const res = {};
    const next = jest.fn();

    mockGetTenantByApiKey.mockResolvedValue(null);
    mockGetAccountByApiKey.mockResolvedValue({ id: 'acc-1' });
    mockGetTenantByAccountAndDomain.mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockSendUnauthorized).toHaveBeenCalledWith(
      res,
      expect.stringContaining('Store not found in account')
    );
    expect(mockGetFirstTenantForAccount).not.toHaveBeenCalled();
  });
});

describe('optionalAuthenticate account API key scoping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeReq(overrides = {}) {
    return {
      headers: { ...(overrides.headers || {}) },
      cookies: { ...(overrides.cookies || {}) },
      query: { ...(overrides.query || {}) },
      path: overrides.path || '/api/ui-events',
      method: overrides.method || 'POST',
      ...overrides,
    };
  }

  it('resolves explicit store for account API key', async () => {
    const req = makeReq({
      headers: {
        'x-ripx-api-key': 'sk_ripx_test_key',
        'x-ripx-store': 'splitter-plus.myshopify.com',
      },
    });
    const res = {};
    const next = jest.fn();

    mockGetTenantByApiKey.mockResolvedValue(null);
    mockGetAccountByApiKey.mockResolvedValue({ id: 'acc-1' });
    mockGetTenantByAccountAndDomain.mockResolvedValue({
      id: 'tenant-1',
      domain: 'splitter-plus.myshopify.com',
      platform: 'shopify',
    });

    await optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.accountId).toBe('acc-1');
    expect(req.shopDomain).toBe('splitter-plus.myshopify.com');
    expect(req.tenantId).toBe('tenant-1');
  });

  it('prefers explicit query store over Shopify host header', async () => {
    const req = makeReq({
      headers: {
        'x-ripx-api-key': 'sk_ripx_test_key',
        'x-shopify-shop-domain': 'wrong-shop.myshopify.com',
      },
      query: { store: 'splitter-plus.myshopify.com' },
    });
    const res = {};
    const next = jest.fn();

    mockGetTenantByApiKey.mockResolvedValue(null);
    mockGetAccountByApiKey.mockResolvedValue({ id: 'acc-1' });
    mockGetTenantByAccountAndDomain.mockResolvedValue({
      id: 'tenant-1',
      domain: 'splitter-plus.myshopify.com',
      platform: 'shopify',
    });

    await optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockGetTenantByAccountAndDomain).toHaveBeenCalledWith(
      'acc-1',
      'splitter-plus.myshopify.com'
    );
    expect(req.shopDomain).toBe('splitter-plus.myshopify.com');
  });

  it('does not attach arbitrary shop context when tenant is missing', async () => {
    const req = makeReq({
      query: { shop: 'unknown-shop.myshopify.com' },
    });
    const res = {};
    const next = jest.fn();

    mockIsShopifyDomain.mockReturnValue(true);
    mockGetTenantByDomain.mockResolvedValue(null);

    await optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.shopDomain).toBeUndefined();
    expect(req.tenantId).toBeUndefined();
  });

  it('attaches shop context only for linked tenant records', async () => {
    const req = makeReq({
      query: { shop: 'splitter-plus.myshopify.com' },
    });
    const res = {};
    const next = jest.fn();

    mockIsShopifyDomain.mockReturnValue(true);
    mockGetTenantByDomain.mockResolvedValue({
      id: 'tenant-1',
      domain: 'splitter-plus.myshopify.com',
      platform: 'shopify',
      account_id: 'acc-1',
    });

    await optionalAuthenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.shopDomain).toBe('splitter-plus.myshopify.com');
    expect(req.tenantId).toBe('tenant-1');
    expect(req.accountId).toBe('acc-1');
    expect(req.platform).toBe('shopify');
  });
});

describe('authenticateShopify email access enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsShopifyDomain.mockReturnValue(true);
    process.env.JWT_SECRET = 'test-secret';
    process.env.SHOPIFY_API_SECRET = 'test-shopify-secret';
  });

  function makeReq(overrides = {}) {
    return {
      headers: { authorization: 'Bearer email-token', ...(overrides.headers || {}) },
      cookies: { ...(overrides.cookies || {}) },
      query: { ...(overrides.query || {}) },
      body: overrides.body || null,
      path: overrides.path || '/api/shopify/connection-status',
      method: overrides.method || 'GET',
      ...overrides,
    };
  }

  function makeRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  it('rejects when email session user has no access to requested store', async () => {
    const req = makeReq({ query: { shop: 'blocked-store.myshopify.com' } });
    const res = makeRes();
    const next = jest.fn();

    mockVerify.mockReturnValue({
      ripxtype: 'email_session',
      email: 'user@example.com',
      token_version: 0,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockEnsureAccountForUser.mockResolvedValue({ accountId: null });
    mockGetTenantByDomain.mockResolvedValue({
      id: 'tenant-blocked',
      domain: 'blocked-store.myshopify.com',
      platform: 'shopify',
      account_id: 'acc-x',
    });
    mockHasAccess.mockResolvedValue(false);

    await authenticateShopify(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'STORE_ACCESS_DENIED',
      })
    );
    expect(res.json.mock.calls[0][0]?.connection).toEqual(
      expect.objectContaining({
        connected: false,
        state: 'needs_link',
        action: 'link',
      })
    );
  });

  it('returns needs_install when requested Shopify store has no tenant yet', async () => {
    const req = makeReq({ query: { shop: 'new-store.myshopify.com' } });
    const res = makeRes();
    const next = jest.fn();

    mockVerify.mockReturnValue({
      ripxtype: 'email_session',
      email: 'user@example.com',
      token_version: 0,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockGetByEmail.mockResolvedValueOnce({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockEnsureAccountForUser.mockResolvedValue({ accountId: null });
    mockGetTenantByDomain.mockResolvedValue(null);

    await authenticateShopify(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'SHOP_NOT_AUTHENTICATED',
      })
    );
    expect(res.json.mock.calls[0][0]?.connection).toEqual(
      expect.objectContaining({
        connected: false,
        state: 'needs_install',
        action: 'install',
      })
    );
  });

  it('allows email session user with access and resolves Shopify token', async () => {
    const req = makeReq({ query: { shop: 'splitter-plus.myshopify.com' } });
    const res = makeRes();
    const next = jest.fn();

    mockVerify.mockReturnValue({
      ripxtype: 'email_session',
      email: 'user@example.com',
      token_version: 0,
    });
    mockGetByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      token_version: 0,
      account_id: null,
    });
    mockEnsureAccountForUser.mockResolvedValue({ accountId: null });
    mockGetTenantByDomain.mockResolvedValue({
      id: 'tenant-1',
      domain: 'splitter-plus.myshopify.com',
      platform: 'shopify',
      account_id: 'acc-1',
    });
    mockHasAccess.mockResolvedValue(true);
    mockGetShopSession.mockResolvedValue({ access_token: 'shop-token' });
    mockGetRoleAndStatus.mockResolvedValue({ status: 'accepted' });

    await authenticateShopify(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.authType).toBe('email');
    expect(req.shopDomain).toBe('splitter-plus.myshopify.com');
    expect(req.shopifyAccessToken).toBe('shop-token');
  });
});
