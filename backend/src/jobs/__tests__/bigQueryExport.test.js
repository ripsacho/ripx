jest.mock('../../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../services/integrationConfigService', () => ({
  getBigQueryConfig: jest.fn(),
}));

jest.mock('../../services/analytics', () => ({
  getTestAnalytics: jest.fn(),
}));

jest.mock('../../models/analytics', () => ({
  getFunnelMetrics: jest.fn(),
}));

jest.mock('../../services/experimentDecisionService', () => ({
  buildGuardrailMetricSummary: jest.fn(() => ({ metrics: [] })),
}));

const { query } = require('../../utils/database');
const { BIGQUERY_EXPORT_FIELDS, addExportWarning, markIfTruncated } = require('../bigQueryExport');

describe('bigQueryExport helpers', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('adds structured export warnings', () => {
    const results = { exported: 0, tables: [] };

    addExportWarning(results, 'snapshot_tables_require_full_export', 'Run a full export.', {
      table: 'event_health',
    });

    expect(results.warnings).toEqual([
      {
        code: 'snapshot_tables_require_full_export',
        message: 'Run a full export.',
        table: 'event_health',
      },
    ]);
  });

  it('marks exports as partial when query results hit the row limit', () => {
    const results = { exported: 0, tables: [], warnings: [] };

    markIfTruncated(results, 'events', 100000, 100000);

    expect(results.warnings[0]).toMatchObject({
      code: 'export_limit_reached',
      table: 'events',
      limit: 100000,
      rowCount: 100000,
    });
  });

  it('exports heatmap raw fields needed for page and segment analysis', () => {
    expect(BIGQUERY_EXPORT_FIELDS.heatmap_events).toEqual(
      expect.arrayContaining(['tenant_id', 'page_key', 'device', 'country'])
    );
  });

  it('exports funnel context needed to reproduce dashboard rows', () => {
    expect(BIGQUERY_EXPORT_FIELDS.funnels).toEqual(
      expect.arrayContaining([
        'shop_domain',
        'funnel_mode',
        'start_date',
        'end_date',
        'device',
        'country',
      ])
    );
  });
});
