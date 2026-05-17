jest.mock('../shopifyService', () => ({
  requestAdminGraphql: jest.fn(),
}));

const shopifyService = require('../shopifyService');
const {
  evaluateShopifyConnectionHealth,
  clearConnectionHealthCache,
} = require('../shopifyConnectionHealth');

describe('evaluateShopifyConnectionHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearConnectionHealthCache();
    process.env.SHOPIFY_SCOPES = 'read_products,write_products';
  });

  it('quick mode does not claim token is live-valid when scopes are stale', async () => {
    const result = await evaluateShopifyConnectionHealth({
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpca_test',
      sessionScope: 'read_products',
      quick: true,
    });
    expect(result.connection.code).toBe('SCOPES_STALE');
    expect(result.tokenHealth.valid).toBeNull();
    expect(shopifyService.requestAdminGraphql).not.toHaveBeenCalled();
  });

  it('quick mode skips Shopify GraphQL when session token and scopes are present', async () => {
    const result = await evaluateShopifyConnectionHealth({
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpca_test',
      sessionScope: 'read_products,write_products',
      quick: true,
    });
    expect(result.connected).toBe(true);
    expect(result.connection.code).toBe('SESSION_OK');
    expect(shopifyService.requestAdminGraphql).not.toHaveBeenCalled();
  });

  it('returns needs_install when access token is missing', async () => {
    const result = await evaluateShopifyConnectionHealth({
      shopDomain: 'demo.myshopify.com',
      accessToken: '',
    });
    expect(result.connected).toBe(false);
    expect(result.connection.state).toBe('needs_install');
    expect(result.tokenHealth.valid).toBe(false);
    expect(shopifyService.requestAdminGraphql).not.toHaveBeenCalled();
  });

  it('returns connected when Shopify accepts the token and scopes match', async () => {
    shopifyService.requestAdminGraphql.mockResolvedValue({
      data: { shop: { name: 'Demo Shop' } },
    });
    const result = await evaluateShopifyConnectionHealth({
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpca_test',
      sessionScope: 'read_products,write_products',
    });
    expect(result.connected).toBe(true);
    expect(result.connection.state).toBe('connected');
    expect(result.tokenHealth.valid).toBe(true);
    expect(result.tokenHealth.shopName).toBe('Demo Shop');
  });

  it('returns needs_install when required scopes are missing', async () => {
    shopifyService.requestAdminGraphql.mockResolvedValue({
      data: { shop: { name: 'Demo Shop' } },
    });
    const result = await evaluateShopifyConnectionHealth({
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpca_test',
      sessionScope: 'read_products',
    });
    expect(result.connected).toBe(false);
    expect(result.connection.state).toBe('needs_install');
    expect(result.tokenHealth.missingScopes).toContain('write_products');
  });

  it('returns verify_unavailable when Shopify check fails transiently', async () => {
    shopifyService.requestAdminGraphql.mockRejectedValue(new Error('503 Service Unavailable'));
    const result = await evaluateShopifyConnectionHealth({
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpca_test',
      sessionScope: 'read_products,write_products',
    });
    expect(result.connected).toBe(false);
    expect(result.connection.state).toBe('verify_unavailable');
    expect(result.connection.code).toBe('VERIFY_UNAVAILABLE');
    expect(result.tokenHealth.checkFailed).toBe(true);
  });

  it('returns needs_install when Shopify rejects the token', async () => {
    shopifyService.requestAdminGraphql.mockRejectedValue(new Error('401 Unauthorized'));
    const result = await evaluateShopifyConnectionHealth({
      shopDomain: 'demo.myshopify.com',
      accessToken: 'shpca_stale',
      sessionScope: 'read_products,write_products',
    });
    expect(result.connected).toBe(false);
    expect(result.connection.state).toBe('needs_install');
    expect(result.tokenHealth.valid).toBe(false);
    expect(result.connection.message).toMatch(/rejected/i);
  });
});
