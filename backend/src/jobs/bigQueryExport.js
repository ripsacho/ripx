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

const EXPORT_STATE_KEY = 'bigquery_last_export_at';
const HEATMAP_EXPORT_STATE_KEY = 'bigquery_heatmap_last_export_at';

async function getLastExportTime(key = EXPORT_STATE_KEY) {
  try {
    const result = await query(
      'SELECT value FROM key_value_store WHERE key = $1',
      [key]
    );
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

    const results = { exported: 0, tables: [] };

    // 1. Export events (incremental)
    const eventsResult = await query(
      `SELECT id, test_id, variant_id, user_id, shop_domain,
              event_type, event_name, event_value, metadata, created_at
       FROM events
       WHERE created_at > $1
       ORDER BY created_at
       LIMIT 100000`,
      [since]
    );

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
        metadata: typeof r.metadata === 'object' ? JSON.stringify(r.metadata) : (r.metadata || '{}'),
        created_at: r.created_at,
      }));
      await eventsTable.insert(rows);
      results.exported += rows.length;
      results.tables.push('events');
      logger.info(`BigQuery: exported ${rows.length} events`);
    }

    // 2. Full export of tests (snapshot)
    if (fullExport) {
      const testsResult = await query(`
        SELECT id, shop_domain, name, description, type, status, goal, variants,
               holdout_percent, created_at, updated_at
        FROM tests
      `);
      if (testsResult.rows.length > 0) {
        const testsTable = dataset.table('tests');
        const rows = testsResult.rows.map(r => ({
          id: String(r.id),
          shop_domain: r.shop_domain || null,
          name: r.name || null,
          description: r.description || null,
          type: r.type || null,
          status: r.status || null,
          goal: typeof r.goal === 'object' ? JSON.stringify(r.goal) : (r.goal || '{}'),
          variants: typeof r.variants === 'object' ? JSON.stringify(r.variants) : (r.variants || '[]'),
          holdout_percent: r.holdout_percent ?? 0,
          created_at: r.created_at,
          updated_at: r.updated_at,
        }));
        await testsTable.insert(rows);
        results.tables.push('tests');
      }
    }

    // 3. Export heatmap_events (incremental)
    const heatmapSince = fullExport ? null : await getLastExportTime(HEATMAP_EXPORT_STATE_KEY);
    const heatmapFrom = heatmapSince || since;
    const heatmapResult = await query(
      `SELECT id, test_id, variant_id, shop_domain, page_url, event_type,
              x, y, scroll_depth, viewport_width, viewport_height, created_at
       FROM heatmap_events
       WHERE created_at > $1
       ORDER BY created_at
       LIMIT 50000`,
      [heatmapFrom]
    );

    if (heatmapResult.rows.length > 0) {
      try {
        const heatmapTable = dataset.table('heatmap_events');
        const heatmapRows = heatmapResult.rows.map(r => ({
          id: String(r.id),
          test_id: r.test_id ? String(r.test_id) : null,
          variant_id: r.variant_id || null,
          shop_domain: r.shop_domain || null,
          page_url: (r.page_url || '').substring(0, 2048),
          event_type: r.event_type || null,
          x: r.x !== null && r.x !== undefined ? r.x : null,
          y: r.y !== null && r.y !== undefined ? r.y : null,
          scroll_depth: r.scroll_depth !== null && r.scroll_depth !== undefined ? r.scroll_depth : null,
          viewport_width: r.viewport_width !== null && r.viewport_width !== undefined ? r.viewport_width : null,
          viewport_height: r.viewport_height !== null && r.viewport_height !== undefined ? r.viewport_height : null,
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
      return { skipped: true, reason: 'Set GOOGLE_APPLICATION_CREDENTIALS or run on GCP with default credentials' };
    }
    logger.error('BigQuery export failed', { error: err.message });
    throw err;
  }
}

module.exports = { exportToBigQuery, getLastExportTime };
