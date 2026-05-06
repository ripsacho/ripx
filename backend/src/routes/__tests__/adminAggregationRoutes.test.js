const express = require('express');
const request = require('supertest');

jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../services/timeSeriesService', () => ({
  aggregateDailyAnalytics: jest.fn(),
}));

jest.mock('../../models/heatmap', () => ({
  refreshHeatmapDailyRollups: jest.fn(),
  pruneHeatmapEventsOlderThan: jest.fn(),
}));

jest.mock('../../models/goalMetricDefinition', () => ({
  refreshGoalMetricEventRollups: jest.fn(),
}));

jest.mock('../../services/auditLogService', () => ({
  logAdminAction: jest.fn(),
}));

jest.mock('../../middleware/sensitiveAdminLimiter', () => ({
  sensitiveAdminLimiter: (_req, _res, next) => next(),
}));

jest.mock('../../middleware/mailTestSendLimiter', () => ({
  mailTestSendLimiter: (_req, _res, next) => next(),
}));

const { query } = require('../../utils/database');
const timeSeriesService = require('../../services/timeSeriesService');
const { refreshHeatmapDailyRollups, pruneHeatmapEventsOlderThan } = require('../../models/heatmap');
const { refreshGoalMetricEventRollups } = require('../../models/goalMetricDefinition');
const auditLogService = require('../../services/auditLogService');
const adminRoutes = require('../adminRoutes');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  return app;
}

describe('admin aggregation routes', () => {
  const originalAdminApiKey = process.env.ADMIN_API_KEY;
  let app;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    timeSeriesService.aggregateDailyAnalytics.mockReset();
    timeSeriesService.aggregateDailyAnalytics.mockResolvedValue();
    refreshHeatmapDailyRollups.mockReset();
    refreshHeatmapDailyRollups.mockResolvedValue(12);
    pruneHeatmapEventsOlderThan.mockReset();
    pruneHeatmapEventsOlderThan.mockResolvedValue(4);
    refreshGoalMetricEventRollups.mockReset();
    refreshGoalMetricEventRollups.mockResolvedValue({
      shopDomain: 'shop.myshopify.com',
      allTimeRows: 8,
      dailyRows: 3,
    });
    auditLogService.logAdminAction.mockReset();
    auditLogService.logAdminAction.mockResolvedValue();
    app = createApp();
  });

  afterAll(() => {
    if (originalAdminApiKey === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = originalAdminApiKey;
    }
  });

  function adminPost(path) {
    return request(app).post(`/api/admin${path}`).set('x-admin-api-key', 'test-admin-key');
  }

  it('triggers daily analytics aggregation and audits the request date', async () => {
    const res = await adminPost('/aggregation/trigger').send({ date: '2026-05-01' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, triggered: true });
    expect(timeSeriesService.aggregateDailyAnalytics).toHaveBeenCalledWith(
      new Date('2026-05-01T12:00:00Z')
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('analytics_aggregation.last_run'), [
      expect.any(String),
    ]);
    expect(auditLogService.logAdminAction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        entityType: 'aggregation',
        entityId: 'daily',
        action: 'trigger',
        changes: { date: '2026-05-01' },
      })
    );
  });

  it('refreshes heatmap rollups, clamps prune retention, and audits affected rows', async () => {
    const res = await adminPost('/aggregation/heatmap-rollups').send({
      refresh_since: '2026-05-01',
      prune: true,
      retention_days: 7,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      refreshed: true,
      affectedRows: 12,
      pruned: true,
      deletedRows: 4,
    });
    expect(refreshHeatmapDailyRollups).toHaveBeenCalledWith('2026-05-01');
    expect(pruneHeatmapEventsOlderThan).toHaveBeenCalledWith(30);
    expect(auditLogService.logAdminAction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        entityType: 'aggregation',
        entityId: 'heatmap_rollups',
        action: 'refresh_and_prune',
        changes: expect.objectContaining({
          refreshSince: '2026-05-01',
          prune: true,
          retentionDays: 30,
          affectedRows: 12,
          deletedRows: 4,
        }),
      })
    );
  });

  it('refreshes goal event rollups for a normalized shop and audits the row counts', async () => {
    const res = await adminPost('/aggregation/goal-event-rollups').send({
      shop_domain: ' Shop.MyShopify.com ',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      refreshed: true,
      shopDomain: 'shop.myshopify.com',
      allTimeRows: 8,
      dailyRows: 3,
    });
    expect(refreshGoalMetricEventRollups).toHaveBeenCalledWith('shop.myshopify.com');
    expect(auditLogService.logAdminAction).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        entityType: 'aggregation',
        entityId: 'goal_event_rollups',
        action: 'refresh',
        changes: {
          shopDomain: 'shop.myshopify.com',
          allTimeRows: 8,
          dailyRows: 3,
        },
      })
    );
  });
});
