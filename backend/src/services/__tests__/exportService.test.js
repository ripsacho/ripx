jest.mock('../analytics', () => ({
  getTestAnalytics: jest.fn(),
}));

jest.mock('../../models/analytics', () => ({
  getFunnelMetrics: jest.fn(),
}));

jest.mock('../../models/heatmap', () => ({
  getHeatmapRollupSummary: jest.fn(),
}));

jest.mock('../../models/test', () => ({
  getTestById: jest.fn(),
}));

jest.mock('../experimentDecisionService', () => ({
  getExperimentDecisionOverview: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

const analyticsService = require('../analytics');
const { getFunnelMetrics } = require('../../models/analytics');
const { getHeatmapRollupSummary } = require('../../models/heatmap');
const { getTestById } = require('../../models/test');
const { getExperimentDecisionOverview } = require('../experimentDecisionService');
const exportService = require('../exportService');

describe('exportService analytics exports', () => {
  beforeEach(() => {
    analyticsService.getTestAnalytics.mockReset();
    getFunnelMetrics.mockReset();
    getHeatmapRollupSummary.mockReset();
    getTestById.mockReset();
    getExperimentDecisionOverview.mockReset();
  });

  function mockBaseTest(goal = {}) {
    getTestById.mockResolvedValue({
      id: 'test-1',
      name: 'Homepage Test',
      type: 'product',
      status: 'running',
      created_at: '2026-05-01T00:00:00.000Z',
      goal: JSON.stringify(goal),
    });
    analyticsService.getTestAnalytics.mockResolvedValue({
      variants: [
        {
          name: 'Control',
          visitors: 100,
          conversions: 10,
          conversionRate: 10,
          revenue: 200,
          avgOrderValue: 20,
        },
      ],
    });
    getExperimentDecisionOverview.mockResolvedValue({
      promotionReadiness: { status: 'ready', canPromote: true, blockers: [], warnings: [] },
    });
    getHeatmapRollupSummary.mockResolvedValue({ available: false });
  }

  it('exports dynamic funnel steps to CSV and passes goal/date options', async () => {
    mockBaseTest({
      funnel_mode: 'ordered',
      conversion_window_days: 7,
      conversion_url: '/thanks',
      funnel_steps: [
        { id: 'visitors', label: 'Visitors' },
        { id: 'add_to_cart', label: 'Add To Cart' },
        { id: 'purchase', label: 'Purchase' },
      ],
    });
    getFunnelMetrics.mockResolvedValue({
      mode: 'ordered_sequence',
      steps: [
        { id: 'assigned_users', label: 'Assigned Users', type: 'visitors' },
        { id: 'add_to_cart', label: 'Add To Cart' },
        { id: 'purchase', label: 'Purchase' },
      ],
      variantNames: { control: 'Control' },
      byVariant: {
        control: { visitors: 100, assigned_users: 100, add_to_cart: 40, purchase: 12 },
      },
    });

    const csv = await exportService.exportToCSV('test-1', 'shop.myshopify.com', {
      start_date: '2026-05-01',
      end_date: '2026-05-08',
    });

    expect(getFunnelMetrics).toHaveBeenCalledWith('test-1', 'shop.myshopify.com', {
      start_date: '2026-05-01',
      end_date: '2026-05-08',
      funnel_steps: [
        { id: 'visitors', label: 'Visitors' },
        { id: 'add_to_cart', label: 'Add To Cart' },
        { id: 'purchase', label: 'Purchase' },
      ],
      funnel_mode: 'ordered',
      conversionWindowDays: 7,
      conversionUrl: '/thanks',
    });
    expect(csv).toContain('"Mode","ordered_sequence"');
    expect(csv).toContain('"Denominator","Assigned Users"');
    expect(csv).toContain(
      '"Variant","Assigned Users","Add To Cart","Purchase","Visitor-to-Final Rate %"'
    );
    expect(csv).toContain('"Control","100","40","12","12.00"');
  });

  it('keeps JSON export resilient when funnel metrics are unavailable', async () => {
    mockBaseTest();
    getFunnelMetrics.mockRejectedValue(new Error('funnel unavailable'));

    const result = await exportService.exportToJSON('test-1', 'shop.myshopify.com', {
      start_date: '2026-05-01',
      end_date: '2026-05-08',
      device: 'mobile',
    });

    expect(result.schema_version).toBe('analytics-export/v2');
    expect(result.analytics).toBeDefined();
    expect(result.funnel).toBeUndefined();
    expect(analyticsService.getTestAnalytics).toHaveBeenCalledWith('test-1', 'shop.myshopify.com', {
      device: 'mobile',
      start_date: '2026-05-01',
      end_date: '2026-05-08',
    });
    expect(getExperimentDecisionOverview).toHaveBeenCalledWith('test-1', 'shop.myshopify.com', {
      device: 'mobile',
      start_date: '2026-05-01',
      end_date: '2026-05-08',
    });
    expect(result.export_warnings).toEqual([
      {
        code: 'funnel_unavailable',
        message: 'Funnel metrics could not be included in this export.',
      },
    ]);
  });

  it('reports JSON warnings when optional decision and heatmap blocks fail', async () => {
    mockBaseTest();
    getFunnelMetrics.mockResolvedValue(null);
    getExperimentDecisionOverview.mockRejectedValue(new Error('decision unavailable'));
    getHeatmapRollupSummary.mockRejectedValue(new Error('heatmap unavailable'));

    const result = await exportService.exportToJSON('test-1', 'shop.myshopify.com');

    expect(result.export_warnings).toEqual([
      {
        code: 'decision_unavailable',
        message: 'Decision readiness could not be included in this export.',
      },
      {
        code: 'heatmap_summary_unavailable',
        message: 'Heatmap summary could not be included in this export.',
      },
    ]);
  });

  it('adds CSV warning rows when optional export blocks fail', async () => {
    mockBaseTest();
    getFunnelMetrics.mockRejectedValue(new Error('funnel unavailable'));
    getExperimentDecisionOverview.mockRejectedValue(new Error('decision unavailable'));
    getHeatmapRollupSummary.mockRejectedValue(new Error('heatmap unavailable'));

    const csv = await exportService.exportToCSV('test-1', 'shop.myshopify.com');

    expect(csv).toContain('Export Warnings');
    expect(csv).toContain(
      '"decision_unavailable","Decision readiness could not be included in this export."'
    );
    expect(csv).toContain(
      '"heatmap_summary_unavailable","Heatmap summary could not be included in this export."'
    );
    expect(csv).toContain(
      '"funnel_unavailable","Funnel metrics could not be included in this export."'
    );
  });

  it('escapes CSV cells and neutralizes spreadsheet formulas', async () => {
    mockBaseTest();
    analyticsService.getTestAnalytics.mockResolvedValue({
      variants: [
        {
          name: '=cmd|" /C calc"!A0',
          visitors: 1,
          conversions: 0,
          conversionRate: 0,
          revenue: 0,
          avgOrderValue: 0,
        },
      ],
    });
    getFunnelMetrics.mockResolvedValue(null);

    const csv = await exportService.exportToCSV('test-1', 'shop.myshopify.com');

    expect(csv).toContain('"\'=cmd|"" /C calc""!A0"');
  });

  it('returns 404 errors for missing tests', async () => {
    getTestById.mockResolvedValue(null);

    await expect(exportService.exportToJSON('missing', 'shop.myshopify.com')).rejects.toMatchObject(
      {
        status: 404,
      }
    );
  });

  it('generates stable export filenames', () => {
    expect(exportService.generateFilename('test-1', 'Homepage Test!', 'csv')).toMatch(
      /^ab_test_homepage_test__\d{4}-\d{2}-\d{2}\.csv$/
    );
  });
});
