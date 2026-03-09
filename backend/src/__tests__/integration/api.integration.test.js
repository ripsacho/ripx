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

  describe('GET /api non-existent', () => {
    it('returns 404 JSON for unknown API path', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
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

  describe('Protected routes (require auth)', () => {
    it('GET /api/tests returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/tests');
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
