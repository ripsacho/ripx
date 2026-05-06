/**
 * BigQuery Export Job
 *
 * Exports RipX analytics data to Google BigQuery for advanced analysis.
 * Run via cron: 0 2 * * * (daily at 2am) or on-demand via API.
 *
 * Setup:
 * 1. npm install @google-cloud/bigquery
 * 2. Set GCP_PROJECT_ID, GCP_DATASET, GOOGLE_APPLICATION_CREDENTIALS in .env
 * 3. Create dataset in BigQuery: ripx_analytics
 *
 * Tables: events, tests, heatmap_events (auto-created if missing)
 * Uses incremental sync (last export timestamp) for events and heatmap_events.
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const integrationConfig = require('../services/integrationConfigService');
const { validateExportSchemaManifest } = require('../services/warehouseExportSchemaService');
const analyticsService = require('../services/analytics');
const { getFunnelMetrics } = require('../models/analytics');
const { buildGuardrailMetricSummary } = require('../services/experimentDecisionService');
const { parseGoalConfig } = require('../utils/goalConfig');

const EXPORT_STATE_KEY = 'bigquery_last_export_at';
const HEATMAP_EXPORT_STATE_KEY = 'bigquery_heatmap_last_export_at';
const EVENT_EXPORT_LIMIT = 100000;
const HEATMAP_EXPORT_LIMIT = 50000;
const SNAPSHOT_EXPORT_LIMIT = 100000;
const DERIVED_TEST_EXPORT_LIMIT = 500;
const BIGQUERY_EXPORT_FIELDS = Object.freeze({
  assignments: [
    'test_id',
    'variant_id',
    'user_id',
    'shop_domain',
    'assigned_at',
    'device',
    'country',
  ],
  events: [
    'id',
    'test_id',
    'variant_id',
    'user_id',
    'shop_domain',
    'event_type',
    'event_name',
    'event_value',
    'metadata',
    'created_at',
  ],
  heatmap_events: [
    'id',
    'tenant_id',
    'test_id',
    'variant_id',
    'shop_domain',
    'page_url',
    'page_key',
    'event_type',
    'x',
    'y',
    'scroll_depth',
    'viewport_width',
    'viewport_height',
    'page_x',
    'page_y',
    'page_width',
    'page_height',
    'capture_version',
    'page_height_source',
    'scroll_container_detected',
    'device',
    'country',
    'created_at',
  ],
  tests: [
    'id',
    'shop_domain',
    'name',
    'description',
    'type',
    'status',
    'goal',
    'variants',
    'holdout_percent',
    'created_at',
    'updated_at',
  ],
  analytics_daily_segments: [
    'date',
    'test_id',
    'shop_domain',
    'variant_id',
    'variant_name',
    'device',
    'country',
    'visitors',
    'conversions',
    'revenue',
  ],
  event_health: [
    'test_id',
    'event_name',
    'role',
    'total_events',
    'unique_users',
    'first_seen',
    'last_seen',
  ],
  funnels: [
    'test_id',
    'variant_id',
    'shop_domain',
    'funnel_mode',
    'step_id',
    'step_order',
    'users',
    'start_date',
    'end_date',
    'device',
    'country',
    'computed_at',
  ],
  guardrails: ['test_id', 'metric', 'threshold', 'status', 'evaluated_at'],
  heatmap_daily_rollups: [
    'event_date',
    'shop_domain',
    'test_id',
    'variant_id',
    'page_key',
    'event_type',
    'device',
    'country',
    'event_count',
    'last_seen_at',
  ],
});

async function getLastExportTime(key = EXPORT_STATE_KEY) {
  try {
    const result = await query('SELECT value FROM key_value_store WHERE key = $1', [key]);
    if (result.rows.length > 0 && result.rows[0].value) {
      return new Date(result.rows[0].value);
    }
  } catch (e) {
    // key_value_store may not exist
  }
  return null;
}

async function setLastExportTime(ts, key = EXPORT_STATE_KEY) {
  try {
    await query(
      `INSERT INTO key_value_store (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, ts.toISOString()]
    );
  } catch (e) {
    logger.warn('Could not persist BigQuery export state', { error: e.message });
  }
}

async function ensureKeyValueStore() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS key_value_store (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) {
    logger.warn('key_value_store not available', { error: e.message });
  }
}

async function safeQueryRows(sql, params = []) {
  try {
    const result = await query(sql, params);
    return result.rows || [];
  } catch (error) {
    logger.warn('BigQuery optional analytics export skipped', { error: error.message });
    return [];
  }
}

async function insertRows(dataset, tableName, rows, results) {
  if (!rows.length) {
    return;
  }
  await dataset.table(tableName).insert(rows);
  results.exported += rows.length;
  results.tables.push(tableName);
}

function addExportWarning(results, code, message, metadata = {}) {
  if (!results.warnings) {
    results.warnings = [];
  }
  results.warnings.push({ code, message, ...metadata });
}

function markIfTruncated(results, tableName, rowCount, limit) {
  if (rowCount >= limit) {
    addExportWarning(
      results,
      'export_limit_reached',
      `${tableName} export reached the ${limit.toLocaleString()} row limit and may be partial.`,
      { table: tableName, limit, rowCount }
    );
  }
}

async function exportAnalyticsDailySegments(dataset, results) {
  const rows = await safeQueryRows(`
    SELECT date, test_id, shop_domain, variant_id, variant_name, device, country, visitors, conversions, revenue
    FROM analytics_daily_segments
    ORDER BY date DESC
    LIMIT ${SNAPSHOT_EXPORT_LIMIT}
  `);
  markIfTruncated(results, 'analytics_daily_segments', rows.length, SNAPSHOT_EXPORT_LIMIT);
  await insertRows(
    dataset,
    'analytics_daily_segments',
    rows.map(r => ({
      date: r.date,
      test_id: r.test_id ? String(r.test_id) : null,
      shop_domain: r.shop_domain || null,
      variant_id: r.variant_id || null,
      variant_name: r.variant_name || null,
      device: r.device || null,
      country: r.country || null,
      visitors: Number(r.visitors) || 0,
      conversions: Number(r.conversions) || 0,
      revenue: parseFloat(r.revenue) || 0,
    })),
    results
  );
}

async function exportHeatmapDailyRollups(dataset, results) {
  const rows = await safeQueryRows(`
    SELECT event_date, shop_domain, test_id, variant_id, page_key, event_type, device, country, event_count, last_seen_at
    FROM heatmap_event_daily_rollups
    ORDER BY event_date DESC
    LIMIT ${SNAPSHOT_EXPORT_LIMIT}
  `);
  markIfTruncated(results, 'heatmap_daily_rollups', rows.length, SNAPSHOT_EXPORT_LIMIT);
  await insertRows(
    dataset,
    'heatmap_daily_rollups',
    rows.map(r => ({
      event_date: r.event_date,
      shop_domain: r.shop_domain || null,
      test_id: r.test_id ? String(r.test_id) : null,
      variant_id: r.variant_id || null,
      page_key: r.page_key || null,
      event_type: r.event_type || null,
      device: r.device || null,
      country: r.country || null,
      event_count: Number(r.event_count) || 0,
      last_seen_at: r.last_seen_at || null,
    })),
    results
  );
}

async function exportEventHealth(dataset, results) {
  const rows = await safeQueryRows(`
    SELECT
      test_id,
      event_name,
      COUNT(*)::bigint AS total_events,
      COUNT(DISTINCT user_id)::bigint AS unique_users,
      MIN(created_at) AS first_seen,
      MAX(created_at) AS last_seen
    FROM events
    WHERE event_name IS NOT NULL
      AND event_name <> ''
    GROUP BY test_id, event_name
    ORDER BY last_seen DESC NULLS LAST
    LIMIT ${SNAPSHOT_EXPORT_LIMIT}
  `);
  markIfTruncated(results, 'event_health', rows.length, SNAPSHOT_EXPORT_LIMIT);
  await insertRows(
    dataset,
    'event_health',
    rows.map(r => ({
      test_id: r.test_id ? String(r.test_id) : null,
      event_name: r.event_name || null,
      role: null,
      total_events: Number(r.total_events) || 0,
      unique_users: Number(r.unique_users) || 0,
      first_seen: r.first_seen || null,
      last_seen: r.last_seen || null,
    })),
    results
  );
}

async function exportDerivedFunnelRows(dataset, results, tests = []) {
  const rows = [];
  const scopedTests = tests.slice(0, DERIVED_TEST_EXPORT_LIMIT);
  if (tests.length > scopedTests.length) {
    addExportWarning(
      results,
      'derived_test_limit_reached',
      `Funnel export processed ${scopedTests.length.toLocaleString()} tests and skipped the remaining tests.`,
      { table: 'funnels', limit: DERIVED_TEST_EXPORT_LIMIT, testCount: tests.length }
    );
  }
  for (const test of scopedTests) {
    try {
      const goal = parseGoalConfig(test.goal);
      const funnel = await getFunnelMetrics(test.id, test.shop_domain, {
        funnel_steps: goal?.funnel_steps,
        funnel_mode: goal?.funnel_mode,
        conversionWindowDays: goal?.conversion_window_days,
        conversionUrl: goal?.conversion_url,
      });
      const steps = Array.isArray(funnel?.steps) ? funnel.steps : [];
      const funnelMode = funnel?.mode || goal?.funnel_mode || 'step_reach';
      Object.entries(funnel?.byVariant || {}).forEach(([variantId, stepCounts]) => {
        steps.forEach((step, index) => {
          rows.push({
            test_id: String(test.id),
            variant_id: variantId,
            shop_domain: test.shop_domain || null,
            funnel_mode: funnelMode,
            step_id: step.id || null,
            step_order: index + 1,
            users: Number(stepCounts?.[step.id]) || 0,
            start_date: null,
            end_date: null,
            device: null,
            country: null,
            computed_at: new Date(),
          });
        });
      });
    } catch (error) {
      logger.warn('BigQuery funnel export skipped for test', {
        testId: test.id,
        error: error.message,
      });
    }
  }
  await insertRows(dataset, 'funnels', rows, results);
}

async function exportDerivedGuardrails(dataset, results, tests = []) {
  const rows = [];
  const scopedTests = tests.slice(0, DERIVED_TEST_EXPORT_LIMIT);
  if (tests.length > scopedTests.length) {
    addExportWarning(
      results,
      'derived_test_limit_reached',
      `Guardrail export processed ${scopedTests.length.toLocaleString()} tests and skipped the remaining tests.`,
      { table: 'guardrails', limit: DERIVED_TEST_EXPORT_LIMIT, testCount: tests.length }
    );
  }
  for (const test of scopedTests) {
    try {
      const analytics = await analyticsService.getTestAnalytics(test.id, test.shop_domain);
      const summary = buildGuardrailMetricSummary(test, analytics);
      (summary.metrics || []).forEach(metric => {
        rows.push({
          test_id: String(test.id),
          metric: metric.metric || metric.label || null,
          threshold: Number(metric.threshold ?? metric.minRelativeLift) || null,
          status: metric.status || summary.status || null,
          evaluated_at: new Date(),
        });
      });
    } catch (error) {
      logger.warn('BigQuery guardrail export skipped for test', {
        testId: test.id,
        error: error.message,
      });
    }
  }
  await insertRows(dataset, 'guardrails', rows, results);
}

async function exportToBigQuery(options = {}) {
  const shopDomain = options.shopDomain;
  const bqConfig = shopDomain
    ? await integrationConfig.getBigQueryConfig(shopDomain)
    : {
        projectId: process.env.GCP_PROJECT_ID?.trim(),
        dataset: process.env.GCP_DATASET?.trim() || 'ripx_analytics',
        credentials: null,
      };

  const projectId = bqConfig?.projectId;
  const datasetId = bqConfig?.dataset || 'ripx_analytics';
  const fullExport = options.full === true;

  if (!projectId) {
    logger.warn('BigQuery export skipped: GCP_PROJECT_ID not set');
    return { skipped: true, reason: 'GCP_PROJECT_ID not set' };
  }

  try {
    const BigQuery = require('@google-cloud/bigquery').BigQuery;
    const bqOptions = { projectId };
    if (bqConfig?.credentials && typeof bqConfig.credentials === 'object') {
      bqOptions.credentials = bqConfig.credentials;
    }
    const bq = new BigQuery(bqOptions);
    const dataset = bq.dataset(datasetId);

    await ensureKeyValueStore();
    const lastExport = fullExport ? null : await getLastExportTime();
    const since = lastExport || new Date(Date.now() - 25 * 60 * 60 * 1000);

    const results = {
      exported: 0,
      tables: [],
      warnings: [],
      schemaValidation: validateExportSchemaManifest(),
    };
    if (!fullExport) {
      addExportWarning(
        results,
        'snapshot_tables_require_full_export',
        'Rollup and derived warehouse tables are only refreshed during full BigQuery exports.'
      );
    }

    // 1. Export events (incremental)
    const eventsResult = await query(
      `SELECT id, test_id, variant_id, user_id, shop_domain,
              event_type, event_name, event_value, metadata, created_at
       FROM events
       WHERE created_at > $1
       ORDER BY created_at
       LIMIT ${EVENT_EXPORT_LIMIT}`,
      [since]
    );
    markIfTruncated(results, 'events', eventsResult.rows.length, EVENT_EXPORT_LIMIT);

    if (eventsResult.rows.length > 0) {
      const eventsTable = dataset.table('events');
      const rows = eventsResult.rows.map(r => ({
        id: String(r.id),
        test_id: r.test_id ? String(r.test_id) : null,
        variant_id: r.variant_id || null,
        user_id: r.user_id || null,
        shop_domain: r.shop_domain || null,
        event_type: r.event_type || null,
        event_name: r.event_name || null,
        event_value: parseFloat(r.event_value) || 0,
        metadata: typeof r.metadata === 'object' ? JSON.stringify(r.metadata) : r.metadata || '{}',
        created_at: r.created_at,
      }));
      await eventsTable.insert(rows);
      results.exported += rows.length;
      results.tables.push('events');
      logger.info(`BigQuery: exported ${rows.length} events`);
    }

    let exportedTests = [];

    // 2. Full export of tests (snapshot)
    if (fullExport) {
      const testsResult = await query(`
        SELECT id, shop_domain, name, description, type, status, goal, variants,
               holdout_percent, created_at, updated_at
        FROM tests
        LIMIT ${SNAPSHOT_EXPORT_LIMIT}
      `);
      exportedTests = testsResult.rows || [];
      markIfTruncated(results, 'tests', exportedTests.length, SNAPSHOT_EXPORT_LIMIT);
      if (testsResult.rows.length > 0) {
        const testsTable = dataset.table('tests');
        const rows = testsResult.rows.map(r => ({
          id: String(r.id),
          shop_domain: r.shop_domain || null,
          name: r.name || null,
          description: r.description || null,
          type: r.type || null,
          status: r.status || null,
          goal: typeof r.goal === 'object' ? JSON.stringify(r.goal) : r.goal || '{}',
          variants:
            typeof r.variants === 'object' ? JSON.stringify(r.variants) : r.variants || '[]',
          holdout_percent: r.holdout_percent ?? 0,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));
        await testsTable.insert(rows);
        results.tables.push('tests');
      }

      await exportAnalyticsDailySegments(dataset, results);
      await exportHeatmapDailyRollups(dataset, results);
      await exportEventHealth(dataset, results);
      await exportDerivedFunnelRows(dataset, results, exportedTests);
      await exportDerivedGuardrails(dataset, results, exportedTests);

      const assignmentsResult = await query(`
        SELECT test_id, variant_id, user_id, shop_domain, assigned_at, device, country
        FROM test_assignments
        ORDER BY assigned_at DESC
        LIMIT ${SNAPSHOT_EXPORT_LIMIT}
      `);
      markIfTruncated(results, 'assignments', assignmentsResult.rows.length, SNAPSHOT_EXPORT_LIMIT);
      if (assignmentsResult.rows.length > 0) {
        const assignmentsTable = dataset.table('assignments');
        const rows = assignmentsResult.rows.map(r => ({
          test_id: r.test_id ? String(r.test_id) : null,
          variant_id: r.variant_id || null,
          user_id: r.user_id || null,
          shop_domain: r.shop_domain || null,
          assigned_at: r.assigned_at,
          device: r.device || null,
          country: r.country || null,
        }));
        await assignmentsTable.insert(rows);
        results.exported += rows.length;
        results.tables.push('assignments');
      }
    }

    // 3. Export heatmap_events (incremental)
    const heatmapSince = fullExport ? null : await getLastExportTime(HEATMAP_EXPORT_STATE_KEY);
    const heatmapFrom = heatmapSince || since;
    const heatmapResult = await query(
      `SELECT id, tenant_id, test_id, variant_id, shop_domain, page_url, page_key, event_type,
              x, y, scroll_depth, viewport_width, viewport_height,
              page_x, page_y, page_width, page_height,
              capture_version, page_height_source, scroll_container_detected,
              device, country, created_at
       FROM heatmap_events
       WHERE created_at > $1
       ORDER BY created_at
       LIMIT ${HEATMAP_EXPORT_LIMIT}`,
      [heatmapFrom]
    );
    markIfTruncated(results, 'heatmap_events', heatmapResult.rows.length, HEATMAP_EXPORT_LIMIT);

    if (heatmapResult.rows.length > 0) {
      try {
        const heatmapTable = dataset.table('heatmap_events');
        const heatmapRows = heatmapResult.rows.map(r => ({
          id: String(r.id),
          tenant_id: r.tenant_id ? String(r.tenant_id) : null,
          test_id: r.test_id ? String(r.test_id) : null,
          variant_id: r.variant_id || null,
          shop_domain: r.shop_domain || null,
          page_url: (r.page_url || '').substring(0, 2048),
          page_key: r.page_key || null,
          event_type: r.event_type || null,
          x: r.x !== null && r.x !== undefined ? r.x : null,
          y: r.y !== null && r.y !== undefined ? r.y : null,
          scroll_depth:
            r.scroll_depth !== null && r.scroll_depth !== undefined ? r.scroll_depth : null,
          viewport_width:
            r.viewport_width !== null && r.viewport_width !== undefined ? r.viewport_width : null,
          viewport_height:
            r.viewport_height !== null && r.viewport_height !== undefined
              ? r.viewport_height
              : null,
          page_x: r.page_x !== null && r.page_x !== undefined ? r.page_x : null,
          page_y: r.page_y !== null && r.page_y !== undefined ? r.page_y : null,
          page_width: r.page_width !== null && r.page_width !== undefined ? r.page_width : null,
          page_height: r.page_height !== null && r.page_height !== undefined ? r.page_height : null,
          capture_version: r.capture_version || null,
          page_height_source: r.page_height_source || null,
          scroll_container_detected:
            r.scroll_container_detected !== null && r.scroll_container_detected !== undefined
              ? r.scroll_container_detected
              : null,
          device: r.device || null,
          country: r.country || null,
          created_at: r.created_at,
        }));
        await heatmapTable.insert(heatmapRows);
        results.exported += heatmapRows.length;
        results.tables.push('heatmap_events');
        logger.info(`BigQuery: exported ${heatmapRows.length} heatmap_events`);
      } catch (heatmapErr) {
        if (heatmapErr.message?.includes('Not found') || heatmapErr.code === 404) {
          logger.warn('BigQuery heatmap_events table not found. Create it with schema from docs.');
        } else {
          throw heatmapErr;
        }
      }
      await setLastExportTime(new Date(), HEATMAP_EXPORT_STATE_KEY);
    }

    const now = new Date();
    await setLastExportTime(now);

    return {
      ...results,
      lastExportAt: now.toISOString(),
    };
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      logger.warn('BigQuery export skipped: @google-cloud/bigquery not installed');
      return { skipped: true, reason: 'Install @google-cloud/bigquery' };
    }
    const msg = String(err.message || '');
    if (msg.includes('Could not load the default credentials') || msg.includes('credential')) {
      logger.warn('BigQuery export skipped: credentials not configured');
      return {
        skipped: true,
        reason: 'Set GOOGLE_APPLICATION_CREDENTIALS or run on GCP with default credentials',
      };
    }
    logger.error('BigQuery export failed', { error: err.message });
    throw err;
  }
}

module.exports = {
  BIGQUERY_EXPORT_FIELDS,
  addExportWarning,
  exportToBigQuery,
  getLastExportTime,
  markIfTruncated,
};
