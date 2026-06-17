process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/ripx_test';
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test_key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test_secret';
process.env.SHOPIFY_API_SECRET_KEY = process.env.SHOPIFY_API_SECRET_KEY || 'test_secret';
process.env.SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || 'read_products,write_products';
process.env.SCOPES = process.env.SCOPES || 'read_products,write_products';

const express = require('express');
const request = require('supertest');

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../models/test', () => ({
  createTest: jest.fn(),
  getTestById: jest.fn(),
  getTestsByShop: jest.fn(),
  updateTest: jest.fn(),
  deleteTest: jest.fn(),
}));

jest.mock('../../services/abTestEngine', () => ({
  validateTest: jest.fn(() => ({ isValid: true, errors: [] })),
}));

jest.mock('../../services/testTypeControlService', () => ({
  resolveTemplateKeyFromPayload: jest.fn(payload => payload?.goal?.template_key || null),
  getResolvedTestTypeRule: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../jobs/scheduledTestsProcessor', () => ({
  scheduleTestJobs: jest.fn(),
}));

jest.mock('../../services/auditLogService', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/conflictDetectionService', () => ({
  findConflicts: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../services/notificationService', () => ({}));
jest.mock('../../services/outboundWebhookService', () => ({}));
jest.mock('../../services/shopifyService', () => ({}));

const testModel = require('../../models/test');
const abTestEngine = require('../../services/abTestEngine');
const { scheduleTestJobs } = require('../../jobs/scheduledTestsProcessor');
const testRoutes = require('../testRoutes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.shopDomain = 'test.myshopify.com';
    req.user = { id: 'user-1' };
    next();
  });
  app.use('/api/tests', testRoutes);
  return app;
}

describe('test draft routes', () => {
  const draftId = '00000000-0000-4000-8000-000000000111';
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    testModel.createTest.mockImplementation(async data => ({ id: draftId, ...data }));
    testModel.updateTest.mockImplementation(async (_id, _shop, updates) => ({
      id: draftId,
      ...updates,
    }));
  });

  it('creates incomplete drafts without launch validation and preserves scheduling fields', async () => {
    const res = await request(app)
      .post('/api/tests/drafts')
      .send({
        name: '',
        type: 'price',
        auto_start: true,
        scheduled_start_at: '2026-07-01T10:00:00.000Z',
        variants: [{ name: 'Control' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.test).toMatchObject({
      id: draftId,
      status: 'draft',
      name: 'Untitled price test',
      type: 'price',
      auto_start: true,
      scheduled_start_at: '2026-07-01T10:00:00.000Z',
    });
    expect(testModel.createTest).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'draft',
        auto_start: true,
        scheduled_start_at: '2026-07-01T10:00:00.000Z',
      })
    );
    expect(abTestEngine.validateTest).not.toHaveBeenCalled();
    expect(scheduleTestJobs).not.toHaveBeenCalled();
  });

  it('rejects unsupported non-empty draft test types', async () => {
    const res = await request(app)
      .post('/api/tests/drafts')
      .send({
        type: 'unknown-template',
        variants: [{ name: 'Control' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining(['Unsupported draft test type: unknown-template'])
    );
    expect(testModel.createTest).not.toHaveBeenCalled();
  });

  it('updates only existing draft tests through the relaxed draft endpoint', async () => {
    testModel.getTestById.mockResolvedValueOnce({
      id: draftId,
      status: 'draft',
      type: 'content',
      goal: {},
      variants: [{ id: 'control', name: 'Control', config: {} }],
    });

    const res = await request(app).put(`/api/tests/${draftId}/draft`).send({
      name: 'Draft copy',
      type: 'content',
      auto_stop: true,
      scheduled_stop_at: '2026-07-05T10:00:00.000Z',
    });

    expect(res.status).toBe(200);
    expect(testModel.updateTest).toHaveBeenCalledWith(
      draftId,
      'test.myshopify.com',
      expect.objectContaining({
        status: 'draft',
        auto_stop: true,
        scheduled_stop_at: '2026-07-05T10:00:00.000Z',
      })
    );
    expect(abTestEngine.validateTest).not.toHaveBeenCalled();
  });

  it('rejects relaxed draft updates for non-draft tests', async () => {
    testModel.getTestById.mockResolvedValueOnce({
      id: draftId,
      status: 'running',
      type: 'content',
      goal: {},
      variants: [],
    });

    const res = await request(app).put(`/api/tests/${draftId}/draft`).send({
      name: 'Should not save',
      type: 'content',
    });

    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(
      expect.arrayContaining(['Only draft tests can be saved as drafts'])
    );
    expect(testModel.updateTest).not.toHaveBeenCalled();
  });

  it('blocks generic status updates so lifecycle validation cannot be bypassed', async () => {
    const res = await request(app).put(`/api/tests/${draftId}`).send({ status: 'running' });

    expect(res.status).toBe(400);
    expect(res.body.details?.[0]).toMatch(/dedicated start, stop, rollout, or personalization/i);
    expect(testModel.updateTest).not.toHaveBeenCalled();
  });
});
