/**
 * API integration tests
 *
 * Uses supertest against the Express app. Mocks database and maintenanceMode
 * so /health and /api/health return without a real DB.
 */

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

// Load app after mocks so health handler uses mocked modules
const app = require('../../app');

describe('API integration', () => {
  describe('GET /health', () => {
    it('returns 200 and status when not shutting down', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('db');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('returns JSON with version and uptime', async () => {
      const res = await request(app).get('/health');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('uptime');
      expect(typeof res.body.uptime).toBe('number');
    });

    it('returns 404 for POST (GET-only endpoint)', async () => {
      const res = await request(app).post('/health').send({});
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/health', () => {
    it('returns same shape as /health', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /live and /api/live', () => {
    it('returns 200 and minimal liveness JSON', async () => {
      const res = await request(app).get('/live');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'ok' });
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).not.toHaveProperty('checks');
    });

    it('mirrors on /api/live', async () => {
      const res = await request(app).get('/api/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /ready and /api/ready', () => {
    it('returns checks without version or uptime', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('db');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).not.toHaveProperty('version');
      expect(res.body).not.toHaveProperty('uptime');
    });

    it('mirrors on /api/ready', async () => {
      const res = await request(app).get('/api/ready');
      expect(res.status).toBe(200);
      expect(res.body.checks.db).toBe('ok');
    });
  });

  describe('GET /api non-existent', () => {
    it('returns 404 JSON for unknown API path', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/track/price-checkout-diagnostics', () => {
    it('returns 200 with redacted public payload (no shop)', async () => {
      const res = await request(app).get('/api/track/price-checkout-diagnostics');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('public_redacted', true);
      expect(res.body).toHaveProperty('checklist');
      expect(Array.isArray(res.body.checklist)).toBe(true);
      expect(res.body.shop).toBe(null);
      expect(res.body).not.toHaveProperty('infrastructure');
      expect(res.body.summary).toMatchObject({
        overall_status: expect.any(String),
        overall_ok: expect.any(Boolean),
        checks_passed: expect.any(Number),
        checks_total: expect.any(Number),
      });
    });
  });

  describe('GET /api/config/legal', () => {
    it('returns 200 and legal config shape (termsUrl, privacyUrl)', async () => {
      const res = await request(app).get('/api/config/legal');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('termsUrl');
      expect(res.body).toHaveProperty('privacyUrl');
      expect([null, 'string']).toContain(
        res.body.termsUrl === null ? null : typeof res.body.termsUrl
      );
      expect([null, 'string']).toContain(
        res.body.privacyUrl === null ? null : typeof res.body.privacyUrl
      );
    });

    it('returns 404 for POST (GET-only endpoint)', async () => {
      const res = await request(app).post('/api/config/legal').send({});
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/track', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/api/track').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/test_id|user_id|shop_domain/i);
    });

    it('returns 400 for invalid test_id format when other fields present', async () => {
      const res = await request(app).post('/api/track').send({
        test_id: 'not-a-uuid',
        user_id: 'user-1',
        shop_domain: 'test.myshopify.com',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toMatch(/test_id|invalid/i);
    });
  });

  describe('POST /api/track/checkout-assignment', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/api/track/checkout-assignment').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toMatch(/test_id|checkout_id|shop|site|invalid/i);
    });

    it('returns 400 when test_id is invalid', async () => {
      const res = await request(app).post('/api/track/checkout-assignment').send({
        shop: 'test.myshopify.com',
        test_id: 'bad-id',
        checkout_id: 'checkout-123',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toMatch(/test_id|invalid/i);
    });
  });

  describe('POST /api/track/checkout-conversion', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app).post('/api/track/checkout-conversion').send({});
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toMatch(/test_id|checkout_id|shop|site|invalid/i);
    });

    it('returns 400 when test_id is invalid', async () => {
      const res = await request(app).post('/api/track/checkout-conversion').send({
        shop: 'test.myshopify.com',
        test_id: 'bad-id',
        checkout_id: 'checkout-123',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toMatch(/test_id|invalid/i);
    });
  });

  describe('Protected routes (require auth)', () => {
    it('GET /api/tests returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/tests');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/ui-events returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/ui-events').send({
        event: 'topbar_new_test_click',
        source: 'topbar',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/tests/:id/price-rollout-csv returns 401 when no credentials', async () => {
      const res = await request(app).get(
        '/api/tests/00000000-0000-4000-8000-000000000001/price-rollout-csv'
      );
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/settings/checkout-price-function-config returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/settings/checkout-price-function-config');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('PUT /api/settings/checkout-price-function-config returns 401 when no credentials', async () => {
      const res = await request(app).put('/api/settings/checkout-price-function-config').send({
        syncFromEnv: true,
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/track/client-error', () => {
    it('returns 400 when error message is missing', async () => {
      const res = await request(app)
        .post('/api/track/client-error')
        .send({ stack: 'at foo', url: 'https://example.com' });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toMatch(/error|missing/i);
    });

    it('returns 200 when error is present', async () => {
      const res = await request(app)
        .post('/api/track/client-error')
        .send({ error: 'Test error from integration test' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });
  });
});
