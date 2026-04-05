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

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => {
    req.shopDomain = 'test.myshopify.com';
    req.authType = 'test';
    next();
  },
  authenticateShopify: (req, _res, next) => {
    req.shopDomain = 'test.myshopify.com';
    req.authType = 'test_shopify';
    next();
  },
  optionalAuthenticate: (req, _res, next) => {
    req.shopDomain = 'test.myshopify.com';
    req.authType = 'test_optional';
    next();
  },
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

describe('checkout diagnostics route contracts', () => {
  it('returns full diagnostics on authenticated settings route', async () => {
    const res = await request(app).get('/api/settings/checkout-price-diagnostics');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(res.body).toHaveProperty('infrastructure');
    expect(res.body.infrastructure).toHaveProperty('batch_resolve_url');
    expect(res.body.infrastructure).toHaveProperty('price_resolve_batch_max');
    expect(res.body).not.toHaveProperty('public_redacted');
  });

  it('returns redacted diagnostics on public track route by default', async () => {
    const res = await request(app).get('/api/track/price-checkout-diagnostics');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, public_redacted: true });
    expect(res.body).not.toHaveProperty('infrastructure');
  });
});
