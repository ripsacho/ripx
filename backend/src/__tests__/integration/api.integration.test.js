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
const database = require('../../utils/database');
const abTestEngine = require('../../services/abTestEngine');
const { SCRIPT_VERSION } = require('../../utils/storefrontScriptRuntime');

const CHECKOUT_CONTRACT_TEST_ID = '00000000-0000-4000-8000-000000000321';
const CHECKOUT_CONTRACT_SHOP = 'test.myshopify.com';

function mockCheckoutContractData(phase = 'payment_method') {
  database.query.mockImplementation(sql => {
    const normalizedSql = String(sql || '').toLowerCase();
    if (normalizedSql.includes('from tenants')) {
      return { rows: [{ domain: CHECKOUT_CONTRACT_SHOP, status: 'active' }] };
    }
    if (normalizedSql.includes('from tests')) {
      return {
        rows: [
          {
            id: CHECKOUT_CONTRACT_TEST_ID,
            shop_domain: CHECKOUT_CONTRACT_SHOP,
            type: 'checkout',
            status: 'running',
            goal: JSON.stringify({ checkout_phase: phase }),
            variants: JSON.stringify([
              { id: 'control', name: 'Control', config: {} },
              { id: 'variant-a', name: 'Variant A', config: { payment_method_names: ['PayPal'] } },
            ]),
            segments: '{}',
            target_ids: null,
          },
        ],
      };
    }
    if (normalizedSql.includes('insert into events')) {
      return { rows: [{ id: 'event-1' }] };
    }
    return { rows: [] };
  });
  jest.spyOn(abTestEngine, 'getVariant').mockResolvedValue({
    variantId: 'variant-a',
    variantName: 'Variant A',
    isNewAssignment: true,
    config: { payment_method_names: ['PayPal'] },
  });
}

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

  describe('POST /api/support/chat', () => {
    it('returns 200 and normalizes requested language', async () => {
      const res = await request(app).post('/api/support/chat').send({
        message: 'Can you help me with setup?',
        language: 'ES',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('reply');
      expect(res.body).toHaveProperty('language', 'es');
    });
  });

  describe('POST /api/support/agent', () => {
    it('requires authentication for the action-capable agent endpoint', async () => {
      const res = await request(app).post('/api/support/agent').send({
        message: 'Check my store setup',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
    });
  });

  describe('POST /api/support/chat-feedback', () => {
    it('returns 400 when conversation_id is missing', async () => {
      const res = await request(app).post('/api/support/chat-feedback').send({
        helpful: true,
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toMatch(/conversation_id/i);
    });

    it('returns 400 when helpful is invalid', async () => {
      const res = await request(app).post('/api/support/chat-feedback').send({
        conversation_id: '00000000-0000-4000-8000-000000000001',
        helpful: 'maybe',
      });
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toMatch(/helpful/i);
    });
  });

  describe('GET /api/support/contextual-help', () => {
    it('returns 200 with contextual suggestions', async () => {
      const res = await request(app).get('/api/support/contextual-help').query({
        pathname: '/app/test.myshopify.com/setup',
        app_domain: 'test.myshopify.com',
      });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('context_key', 'setup_wizard');
      expect(res.body).toHaveProperty('title');
      expect(Array.isArray(res.body.suggestions)).toBe(true);
      expect(res.body.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Support ticket thread auth', () => {
    const ticketId = '00000000-0000-4000-8000-000000000111';
    it('GET /api/support/tickets/:id/thread returns 401 when no credentials', async () => {
      const res = await request(app).get(`/api/support/tickets/${ticketId}/thread`);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/support/tickets/:id/thread/reply returns 401 when no credentials', async () => {
      const res = await request(app).post(`/api/support/tickets/${ticketId}/thread/reply`).send({
        message: 'Any update?',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/support/tickets/:id/thread/stream returns 401 when no credentials', async () => {
      const res = await request(app).get(`/api/support/tickets/${ticketId}/thread/stream`);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('POST /api/track/checkout-assignment', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      database.query.mockResolvedValue({ rows: [] });
    });

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

    it('returns explicit checkout phase in the assignment contract', async () => {
      mockCheckoutContractData('payment_method');

      const res = await request(app).post('/api/track/checkout-assignment').send({
        shop: CHECKOUT_CONTRACT_SHOP,
        test_id: CHECKOUT_CONTRACT_TEST_ID,
        checkout_id: 'checkout-123',
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        assignment: {
          test_id: CHECKOUT_CONTRACT_TEST_ID,
          user_id: 'checkout:checkout-123',
          variant_id: 'variant-a',
          variant_name: 'Variant A',
          checkout_phase: 'payment_method',
          assignment_source: 'bucket',
          config: { payment_method_names: ['PayPal'] },
        },
      });
    });
  });

  describe('POST /api/track/checkout-conversion', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      database.query.mockResolvedValue({ rows: [] });
    });

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

    it('returns explicit checkout phase and stores it in conversion metadata', async () => {
      mockCheckoutContractData('delivery_method');

      const res = await request(app)
        .post('/api/track/checkout-conversion')
        .send({
          shop: CHECKOUT_CONTRACT_SHOP,
          test_id: CHECKOUT_CONTRACT_TEST_ID,
          checkout_id: 'checkout-456',
          event_name: 'checkout_delivery_method_action',
          metadata: { checkout_phase: 'delivery_method', action: 'hide' },
        });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        variant_id: 'variant-a',
        checkout_phase: 'delivery_method',
        event_name: 'checkout_delivery_method_action',
      });
      const insertCall = database.query.mock.calls.find(call =>
        String(call[0]).toLowerCase().includes('insert into events')
      );
      expect(insertCall).toBeTruthy();
      const metadataJson = insertCall[1].find(value => {
        try {
          return JSON.parse(value)?.checkout_phase === 'delivery_method';
        } catch (_) {
          return false;
        }
      });
      expect(JSON.parse(metadataJson)).toMatchObject({
        source: 'checkout_ui_extension',
        checkout_id: 'checkout-456',
        checkout_phase: 'delivery_method',
        action: 'hide',
      });
    });
  });

  describe('POST /api/track/shipping-carrier-rates', () => {
    it('returns a flat-rate carrier quote when amount is provided', async () => {
      const res = await request(app)
        .post('/api/track/shipping-carrier-rates?strategy=flat_rate&amount=6.5&test_id=test-1')
        .send({ rate: { currency: 'USD' } });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('rates');
      expect(Array.isArray(res.body.rates)).toBe(true);
      expect(res.body.rates.length).toBe(1);
      expect(res.body.rates[0]).toMatchObject({
        service_name: expect.any(String),
        service_code: expect.stringContaining('ripx_flat_'),
        total_price: '650',
        currency: 'USD',
      });
    });

    it('returns provider-backed carrier_quote rates when quote_provider is configured', async () => {
      const res = await request(app)
        .post(
          '/api/track/shipping-carrier-rates?strategy=carrier_quote&quote_provider=static_rate&amount=9.25&test_id=test-1'
        )
        .send({ rate: { currency: 'USD' } });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        rates: [
          {
            service_name: expect.any(String),
            service_code: expect.stringContaining('ripx_quote_'),
            total_price: '925',
            currency: 'USD',
          },
        ],
      });
    });

    it('returns empty rates array for carrier_quote strategy (manual quote source)', async () => {
      const res = await request(app)
        .post('/api/track/shipping-carrier-rates?strategy=carrier_quote&test_id=test-1')
        .send({ rate: { currency: 'USD' } });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ rates: [] });
    });
  });

  describe('GET /api/track variant assignment cache policy', () => {
    it('marks batched variant assignment responses as no-store even on validation errors', async () => {
      const res = await request(app).get('/api/track/variants');
      expect(res.status).toBe(400);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('marks single variant assignment responses as no-store even on validation errors', async () => {
      const res = await request(app).get('/api/track/variant');
      expect(res.status).toBe(400);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('GET /api/track/script.js', () => {
    afterEach(() => {
      database.query.mockResolvedValue({ rows: [] });
    });

    it('serves runtime config with script headers and anti-flicker fields', async () => {
      const testId = '26262626-2626-4262-8262-262626262626';
      database.query.mockImplementation(sql => {
        const normalizedSql = String(sql || '').toLowerCase();
        if (normalizedSql.includes('from tenants')) {
          return { rows: [{ domain: 'test.myshopify.com', status: 'active' }] };
        }
        if (normalizedSql.includes('from tests')) {
          return {
            rows: [
              {
                id: testId,
                shop_domain: 'test.myshopify.com',
                type: 'pricing',
                status: 'running',
                target_type: 'all',
                target_id: null,
                target_ids: null,
                goal: '{}',
                variants: '[]',
                segments: JSON.stringify({
                  anti_flicker_mode: 'strict',
                  anti_flicker_timeout_ms: 1234,
                }),
              },
            ],
          };
        }
        if (normalizedSql.includes('goal_metric_definitions')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      const res = await request(app).get('/api/track/script.js?shop=test.myshopify.com');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/javascript/);
      expect(res.headers['cache-control']).toMatch(/must-revalidate/);
      expect(res.headers['x-script-version']).toBe(SCRIPT_VERSION);
      expect(res.text).toContain('window.AB_TEST_RUNTIME_CONFIG=');

      const runtimeJson = res.text.split('window.AB_TEST_RUNTIME_CONFIG=')[1].split(';\n')[0];
      const runtime = JSON.parse(runtimeJson);

      expect(runtime.version).toBe(SCRIPT_VERSION);
      expect(runtime.shopDomain).toBe('test.myshopify.com');
      expect(runtime.activeTests).toHaveLength(1);
      expect(runtime.activeTests[0]).toMatchObject({
        id: testId,
        type: 'price',
        targetType: 'all-products',
        antiFlickerMode: 'strict',
        antiFlickerTimeoutMs: 1234,
      });
      expect(Array.isArray(runtime.goalMetricDefinitions)).toBe(true);
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

    it('GET /api/tests/:id/shipping/capabilities returns 401 when no credentials', async () => {
      const res = await request(app).get(
        '/api/tests/00000000-0000-4000-8000-000000000001/shipping/capabilities'
      );
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/tests/:id/shipping/execution-plan returns 401 when no credentials', async () => {
      const res = await request(app).get(
        '/api/tests/00000000-0000-4000-8000-000000000001/shipping/execution-plan'
      );
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/tests/:id/shipping/diagnostics returns 401 when no credentials', async () => {
      const res = await request(app).get(
        '/api/tests/00000000-0000-4000-8000-000000000001/shipping/diagnostics'
      );
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/tests/:id/shipping/execute returns 401 when no credentials', async () => {
      const res = await request(app)
        .post('/api/tests/00000000-0000-4000-8000-000000000001/shipping/execute')
        .send({ apply: false, dry_run: true });
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

    it('PUT /api/analytics/tests/:id/heatmap/screenshot returns 401 when no credentials', async () => {
      const res = await request(app)
        .put('/api/analytics/tests/00000000-0000-4000-8000-000000000001/heatmap/screenshot')
        .send({
          page_url: '/products/example',
          screenshot_url: 'https://cdn.example.com/shot.png',
        });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support-tickets/analytics returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/admin/support-tickets/analytics');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/resend-acceptance-email/:id returns 401 when no credentials', async () => {
      const res = await request(app).post(
        '/api/admin/resend-acceptance-email/00000000-0000-4000-8000-000000000001'
      );
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/mail-test-send returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/admin/mail-test-send').send({ email: 'a@b.co' });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/aggregation/trigger returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/admin/aggregation/trigger').send({
        date: '2026-05-01',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/aggregation/heatmap-rollups returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/admin/aggregation/heatmap-rollups').send({
        refresh_since: '2026-05-01',
        prune: true,
        retention_days: 30,
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/aggregation/goal-event-rollups returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/admin/aggregation/goal-event-rollups').send({
        shop_domain: 'shop.myshopify.com',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/support-tickets/:id/suggest-reply returns 401 when no credentials', async () => {
      const res = await request(app).post(
        '/api/admin/support-tickets/00000000-0000-4000-8000-000000000001/suggest-reply'
      );
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/support-tickets/:id/route returns 401 when no credentials', async () => {
      const res = await request(app)
        .post('/api/admin/support-tickets/00000000-0000-4000-8000-000000000001/route')
        .send({
          escalate: true,
          auto_assign: true,
        });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/support-tickets/escalate returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/admin/support-tickets/escalate').send({
        limit: 10,
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support-macros returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/admin/support-macros');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('PUT /api/admin/support-macros/:key returns 401 when no credentials', async () => {
      const res = await request(app)
        .put('/api/admin/support-macros/welcome')
        .send({ title: 'Welcome', body: 'Hello there' });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('DELETE /api/admin/support-macros/:key returns 401 when no credentials', async () => {
      const res = await request(app).delete('/api/admin/support-macros/welcome');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support-unified-inbox returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/admin/support-unified-inbox');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support-inbox-integration returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/admin/support-inbox-integration');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('PUT /api/admin/support-inbox-integration returns 401 when no credentials', async () => {
      const res = await request(app).put('/api/admin/support-inbox-integration').send({
        provider: 'zendesk',
        enabled: true,
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support/proactive-signals returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/admin/support/proactive-signals');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/support/proactive-signals/outreach returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/admin/support/proactive-signals/outreach').send({
        shop_domain: 'test.myshopify.com',
        signal_type: 'usage_drop',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support-status returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/admin/support-status');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('PUT /api/admin/support-status returns 401 when no credentials', async () => {
      const res = await request(app).put('/api/admin/support-status').send({
        status: 'maintenance',
        message: 'Planned deployment window',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support-changelog returns 401 when no credentials', async () => {
      const res = await request(app).get('/api/admin/support-changelog');
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/support-changelog returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/admin/support-changelog').send({
        title: 'Shipping update',
        summary: 'Small improvement shipped',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('PATCH /api/admin/support-changelog/:id returns 401 when no credentials', async () => {
      const res = await request(app)
        .patch('/api/admin/support-changelog/00000000-0000-4000-8000-000000000001')
        .send({
          visibility: 'published',
          publish_now: true,
        });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/support/feature-requests returns 401 when no credentials', async () => {
      const res = await request(app).post('/api/support/feature-requests').send({
        title: 'Example feature',
        details: 'Please add this',
      });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/support/feature-requests/:id/vote returns 401 when no credentials', async () => {
      const res = await request(app)
        .post('/api/support/feature-requests/00000000-0000-4000-8000-000000000001/vote')
        .send({
          value: 1,
        });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support-tickets/:id/thread returns 401 when no credentials', async () => {
      const res = await request(app).get(
        '/api/admin/support-tickets/00000000-0000-4000-8000-000000000111/thread'
      );
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('POST /api/admin/support-tickets/:id/reply returns 401 when no credentials', async () => {
      const res = await request(app)
        .post('/api/admin/support-tickets/00000000-0000-4000-8000-000000000111/reply')
        .send({
          message: 'Thanks, we are checking this now.',
        });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
    });

    it('GET /api/admin/support-tickets/:id/thread/stream returns 401 when no credentials', async () => {
      const res = await request(app).get(
        '/api/admin/support-tickets/00000000-0000-4000-8000-000000000111/thread/stream'
      );
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
