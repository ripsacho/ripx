jest.mock('../utils/database', () => ({
  query: jest.fn(),
}));

jest.mock('../services/abTestEngine', () => ({
  validateTest: jest.fn(() => ({ valid: true, errors: [] })),
}));

const { query } = require('../utils/database');
const {
  buildGuardrailMetricSummary,
  buildOrderedFunnelScaffold,
  buildStatisticsReadiness,
} = require('../services/experimentDecisionService');
const { evaluateFlag, parseFlagValue } = require('../services/featureFlagService');
const { createPlannerDraft } = require('../services/experimentPlannerService');
const {
  createVisualEditorSession,
  validateVisualEdit,
} = require('../services/visualEditorContractService');
const {
  buildRecommendationBlockConfig,
  RECOMMENDATION_EVENT_NAMES,
} = require('../services/recommendationExperimentService');
const {
  getExportSchemaManifest,
  validateExportSchemaManifest,
} = require('../services/warehouseExportSchemaService');
const { BIGQUERY_EXPORT_FIELDS } = require('../jobs/bigQueryExport');
const { PERMISSIONS, ROUTE_PERMISSION_MAP, hasPermission } = require('../permissions');
const { resolveWinningVariant } = require('../jobs/analyticsAutomation');

describe('platform expansion contracts', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('summarizes guardrail breaches from secondary goal schema', () => {
    const test = {
      goal: {
        guardrails: [{ id: 'rpv', metric: 'revenue_per_visitor', min_relative_lift: -5 }],
      },
    };
    const analytics = {
      variants: [
        { id: 'a', name: 'Control', visitors: 100, revenue: 200 },
        { id: 'b', name: 'B', visitors: 100, revenue: 170 },
      ],
    };
    const result = buildGuardrailMetricSummary(test, analytics);
    expect(result.status).toBe('breached');
    expect(result.metrics[0].variants[0].breached).toBe(true);
  });

  it('summarizes catalog event guardrail breaches from secondary events', () => {
    const test = {
      goal: {
        secondary: [
          {
            event_name: 'support_click',
            label: 'Support click',
            metric_role: 'guardrail',
            aggregation: 'count',
            direction: 'decrease',
            min_relative_lift: 10,
          },
        ],
      },
    };
    const analytics = {
      variants: [
        {
          id: 'a',
          name: 'Control',
          visitors: 100,
          secondaryEvents: { support_click: { count: 5, sum: 0, rate: 5 } },
        },
        {
          id: 'b',
          name: 'B',
          visitors: 100,
          secondaryEvents: { support_click: { count: 8, sum: 0, rate: 8 } },
        },
      ],
    };
    const result = buildGuardrailMetricSummary(test, analytics);
    expect(result.status).toBe('breached');
    expect(result.metrics[0].source).toBe('catalog_event');
    expect(result.metrics[0].variants[0].breached).toBe(true);
  });

  it('builds ordered funnel sequencing scaffolding without changing current counts', () => {
    const result = buildOrderedFunnelScaffold({
      mode: 'ordered_sequence',
      semantics: { ordered: true },
      steps: [{ id: 'visitors' }, { id: 'conversion' }],
    });
    expect(result.mode).toBe('ordered_sequence');
    expect(result.steps[1].order).toBe(2);
  });

  it('reports statistics readiness for SRM and CUPED future inputs', () => {
    const result = buildStatisticsReadiness({
      srm: { detected: false },
      variants: [{ visitors: 250 }, { visitors: 300 }],
    });
    expect(result.frequentist.available).toBe(true);
    expect(result.cuped.status).toBe('needs_pre_experiment_covariates');
    expect(result.sampleSize.status).toBe('healthy');
  });

  it('evaluates feature flags from KV with domain override precedence', async () => {
    query.mockResolvedValue({
      rows: [
        { key: 'flag.ai_planner', value: 'false' },
        { key: 'flag.ai_planner.shop.myshopify.com', value: 'true' },
      ],
    });
    const flag = await evaluateFlag('ai_planner', { domain: 'shop.myshopify.com' });
    expect(flag.enabled).toBe(true);
    expect(flag.source).toBe('domain');
  });

  it('parses boolean, JSON, and fallback flag values', () => {
    expect(parseFlagValue('enabled')).toBe(true);
    expect(parseFlagValue('{"enabled":false}', true)).toBe(false);
    expect(parseFlagValue('unknown', true)).toBe(true);
  });

  it('creates AI planner drafts as validation-only contracts', async () => {
    const result = await createPlannerDraft({ brief: 'Improve product page CTA', type: 'content' });
    expect(result.persisted).toBe(false);
    expect(result.launchable).toBe(false);
    expect(result.draft.variants).toHaveLength(2);
  });

  it('creates origin-bound visual editor sessions and validates edits', () => {
    const session = createVisualEditorSession({
      shopDomain: 'shop.myshopify.com',
      previewUrl: 'https://shop.myshopify.com/products/example',
      appOrigin: 'https://app.example.com',
    });
    expect(session.allowedOrigins).toContain('https://shop.myshopify.com');
    expect(validateVisualEdit({ action: 'text', selector: '#hero', value: 'New copy' }).valid).toBe(
      true
    );
  });

  it('builds recommendation block configs with tracked event names', () => {
    const config = buildRecommendationBlockConfig({ strategy: 'collection_fed' });
    expect(config.tracking.eventNames).toEqual(RECOMMENDATION_EVENT_NAMES);
    expect(config.readiness.requiresShopifyData).toBe(true);
  });

  it('validates warehouse export schema manifest', () => {
    const manifest = getExportSchemaManifest();
    expect(manifest.schemas.events).toBeTruthy();
    expect(validateExportSchemaManifest(manifest).valid).toBe(true);
  });

  it('keeps BigQuery exported fields aligned with warehouse manifest fields', () => {
    const manifest = getExportSchemaManifest();
    Object.entries(BIGQUERY_EXPORT_FIELDS).forEach(([tableName, exportedFields]) => {
      const manifestFields = (manifest.schemas[tableName] || []).map(field => field.name);
      expect(manifestFields).toEqual(expect.arrayContaining(exportedFields));
    });
  });

  it('gates analytics aggregation operations behind explicit admin permission', () => {
    expect(ROUTE_PERMISSION_MAP['POST /api/admin/aggregation/trigger']).toBe(
      PERMISSIONS.ANALYTICS_AGGREGATION
    );
    expect(ROUTE_PERMISSION_MAP['POST /api/admin/aggregation/heatmap-rollups']).toBe(
      PERMISSIONS.ANALYTICS_AGGREGATION
    );
    expect(ROUTE_PERMISSION_MAP['POST /api/admin/aggregation/goal-event-rollups']).toBe(
      PERMISSIONS.ANALYTICS_AGGREGATION
    );
    expect(hasPermission('admin', PERMISSIONS.ANALYTICS_AGGREGATION)).toBe(true);
  });

  it('resolves automation winners from winner ids before positional fallbacks', () => {
    const winner = resolveWinningVariant({
      variants: [
        { id: 'control', name: 'Control' },
        { id: 'variant-a', name: 'Variant A' },
        { id: 'variant-b', name: 'Variant B' },
      ],
      significance: {
        winner: 'best',
        winnerVariantId: 'variant-b',
      },
    });
    expect(winner.name).toBe('Variant B');
  });
});
