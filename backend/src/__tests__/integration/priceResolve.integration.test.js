const request = require('supertest');

jest.mock('../../utils/database', () => ({
  ping: jest.fn().mockResolvedValue(),
  query: jest.fn().mockResolvedValue({ rows: [] }),
  getClient: jest.fn(),
}));

jest.mock('../../utils/maintenanceMode', () => ({
  getMaintenanceMode: jest.fn().mockResolvedValue(null),
  getBlockListMessage: jest.fn().mockResolvedValue(null),
  isMaintenanceActiveForDomain: jest.fn().mockReturnValue(false),
}));

const mockTenantExists = jest.fn(domain =>
  ['test.myshopify.com', 'makripon.myshopify.com'].includes(String(domain || '').toLowerCase())
);
const mockGetTenantByDomain = jest.fn(domain =>
  domain ? { domain: String(domain).toLowerCase(), status: 'active' } : null
);

jest.mock('../../models/tenant', () => ({
  tenantExists: (...args) => mockTenantExists(...args),
  getTenantByDomain: (...args) => mockGetTenantByDomain(...args),
  normalizeDomain: domain =>
    String(domain || '')
      .trim()
      .toLowerCase(),
  setDomainVerifiedAt: jest.fn(),
}));

const mockGetTestById = jest.fn();

jest.mock('../../models/test', () => ({
  getActiveTestsForStorefront: jest.fn().mockResolvedValue([]),
  getTestsByIds: jest.fn().mockResolvedValue(new Map()),
  getTestById: (...args) => mockGetTestById(...args),
}));

const mockResolvePriceTestLineDiscount = jest.fn();
const mockResolveCheckoutPriceBatchForDomain = jest.fn();

jest.mock('../../services/priceTestCheckoutResolve', () => ({
  resolvePriceTestLineDiscount: (...args) => mockResolvePriceTestLineDiscount(...args),
  resolveCheckoutPriceBatchForDomain: (...args) => mockResolveCheckoutPriceBatchForDomain(...args),
}));

// Prevent background intervals/processors from starting in integration tests.
jest.mock('../../jobs/scheduledTestsProcessor', () => ({}));
jest.mock('../../jobs/archiveProcessor', () => ({}));
jest.mock('../../jobs/guardrailProcessor', () => ({
  startGuardrailProcessor: jest.fn(),
}));
jest.mock('../../jobs/autoStopProcessor', () => ({
  startAutoStopProcessor: jest.fn(),
}));
jest.mock('../../jobs/significanceAlertProcessor', () => ({
  startSignificanceAlertProcessor: jest.fn(),
}));
jest.mock('../../jobs/productSyncProcessor', () => ({
  startProductSyncProcessor: jest.fn(),
}));

const app = require('../../app');

const originalEnv = { ...process.env };

describe('GET /api/track/price-resolve', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    mockGetTestById.mockReset();
    mockResolvePriceTestLineDiscount.mockReset();
    mockResolveCheckoutPriceBatchForDomain.mockReset();
    mockTenantExists.mockClear();
    mockGetTenantByDomain.mockClear();
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it('accepts shop_domain query alias (not only shop/site)', async () => {
    const res = await request(app).get('/api/track/price-resolve').query({
      shop_domain: 'test.myshopify.com',
      assignment_variant: 'A',
      product_id: 'gid://shopify/Product/123',
      line_total: '10',
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringMatching(/test_id/i),
    });
  });

  it('returns resolved payload for valid input via shop_domain alias', async () => {
    const testId = '11111111-1111-4111-8111-111111111111';
    mockGetTestById.mockResolvedValueOnce({
      id: testId,
      type: 'price',
      status: 'running',
      target_type: 'product',
      target_ids: ['gid://shopify/Product/123'],
      variants: [],
    });
    mockResolvePriceTestLineDiscount.mockReturnValueOnce({
      applies: true,
      discountDecimal: '2.50',
      targetLineDecimal: '7.50',
      reason: null,
    });

    const res = await request(app).get('/api/track/price-resolve').query({
      shop_domain: 'test.myshopify.com',
      test_id: testId,
      assignment_variant: 'A',
      product_id: 'gid://shopify/Product/123',
      line_total: '10',
      qty: '1',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      applies: true,
      discountDecimal: '2.50',
      targetLineDecimal: '7.50',
      reason: null,
    });
    expect(mockGetTestById).toHaveBeenCalledWith(testId, 'test.myshopify.com');
    expect(mockResolvePriceTestLineDiscount).toHaveBeenCalled();
  });

  it('returns 403 when checkout secret is required and missing', async () => {
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'super-secret';

    const res = await request(app).get('/api/track/price-resolve').query({
      shop_domain: 'test.myshopify.com',
      test_id: '11111111-1111-4111-8111-111111111111',
      assignment_variant: 'A',
      product_id: 'gid://shopify/Product/123',
      line_total: '10',
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: 'Forbidden' });
  });

  it('returns 503 in production when checkout secret is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RIPX_CHECKOUT_PRICE_SECRET;

    const res = await request(app).get('/api/track/price-resolve').query({
      shop_domain: 'test.myshopify.com',
      test_id: '11111111-1111-4111-8111-111111111111',
      assignment_variant: 'A',
      product_id: 'gid://shopify/Product/123',
      line_total: '10',
    });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringMatching(/RIPX_CHECKOUT_PRICE_SECRET/i),
    });
  });
});

describe('POST /api/track/price-resolve-batch', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    mockResolveCheckoutPriceBatchForDomain.mockReset();
    mockTenantExists.mockClear();
    mockGetTenantByDomain.mockClear();
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it('returns 403 when checkout secret is required and missing', async () => {
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'super-secret';
    const res = await request(app)
      .post('/api/track/price-resolve-batch')
      .send({
        shop_domain: 'test.myshopify.com',
        lines: [
          {
            line_id: 'line-1',
            test_id: '11111111-1111-4111-8111-111111111111',
            assignment_variant: 'A',
            product_id: 'gid://shopify/Product/123',
            line_total: '10',
          },
        ],
      });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: 'Forbidden' });
  });

  it('returns 503 in production when checkout secret is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RIPX_CHECKOUT_PRICE_SECRET;
    const res = await request(app)
      .post('/api/track/price-resolve-batch')
      .send({
        shop_domain: 'test.myshopify.com',
        lines: [
          {
            line_id: 'line-1',
            test_id: '11111111-1111-4111-8111-111111111111',
            assignment_variant: 'A',
            product_id: 'gid://shopify/Product/123',
            line_total: '10',
          },
        ],
      });
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringMatching(/RIPX_CHECKOUT_PRICE_SECRET/i),
    });
  });

  it('returns 400 when line_id exceeds maximum length', async () => {
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'super-secret';
    const tooLong = 'x'.repeat(300);
    const res = await request(app)
      .post('/api/track/price-resolve-batch')
      .set('x-ripx-price-secret', 'super-secret')
      .send({
        shop_domain: 'test.myshopify.com',
        lines: [
          {
            line_id: tooLong,
            test_id: '11111111-1111-4111-8111-111111111111',
            assignment_variant: 'A',
            product_id: 'gid://shopify/Product/123',
            line_total: '10',
          },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: expect.stringMatching(/line_id too long/i),
    });
  });

  it('returns batch payload for valid request with secret header', async () => {
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'super-secret';
    mockResolveCheckoutPriceBatchForDomain.mockResolvedValueOnce([
      { line_id: 'line-1', applies: true, discountDecimal: '2.00', targetLineDecimal: '8.00' },
    ]);
    const res = await request(app)
      .post('/api/track/price-resolve-batch')
      .set('x-ripx-price-secret', 'super-secret')
      .send({
        shop_domain: 'test.myshopify.com',
        lines: [
          {
            line_id: 'line-1',
            test_id: '11111111-1111-4111-8111-111111111111',
            assignment_variant: 'A',
            product_id: 'gid://shopify/Product/123',
            line_total: '10',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      lines: [{ line_id: 'line-1', applies: true, discountDecimal: '2.00' }],
    });
    expect(mockResolveCheckoutPriceBatchForDomain).toHaveBeenCalled();
  });

  it('returns full batch line details when debug is explicitly requested', async () => {
    process.env.RIPX_CHECKOUT_PRICE_SECRET = 'super-secret';
    mockResolveCheckoutPriceBatchForDomain.mockResolvedValueOnce([
      {
        line_id: 'line-1',
        applies: false,
        discountDecimal: null,
        targetLineDecimal: null,
        reason: 'test_not_running',
        debug: { testId: '11111111-1111-4111-8111-111111111111', resultReason: 'test_not_running' },
      },
    ]);
    const res = await request(app)
      .post('/api/track/price-resolve-batch')
      .set('x-ripx-price-secret', 'super-secret')
      .set('x-ripx-debug', '1')
      .send({
        shop_domain: 'test.myshopify.com',
        lines: [
          {
            line_id: 'line-1',
            test_id: '11111111-1111-4111-8111-111111111111',
            assignment_variant: 'A',
            product_id: 'gid://shopify/Product/123',
            line_total: '10',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      lines: [
        {
          line_id: 'line-1',
          applies: false,
          discountDecimal: null,
          targetLineDecimal: null,
          reason: 'test_not_running',
          debug: {
            testId: '11111111-1111-4111-8111-111111111111',
            resultReason: 'test_not_running',
          },
        },
      ],
    });
    expect(mockResolveCheckoutPriceBatchForDomain).toHaveBeenCalledWith(
      'test.myshopify.com',
      expect.any(Array),
      expect.any(Function),
      expect.any(Function),
      { debug: true }
    );
  });
});
