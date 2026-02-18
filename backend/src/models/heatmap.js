/**
 * Heatmap Model
 *
 * Stores and aggregates click/scroll heatmap data per test variant
 */

const { query } = require('../utils/database');

async function insertHeatmapEvent(data) {
  const { test_id, variant_id, shop_domain, page_url, event_type, x, y, scroll_depth, viewport_width, viewport_height } =
    data;

  const sql = `
    INSERT INTO heatmap_events (
      test_id, variant_id, shop_domain, page_url, event_type,
      x, y, scroll_depth, viewport_width, viewport_height, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    RETURNING id
  `;

  const result = await query(sql, [
    test_id,
    variant_id,
    shop_domain,
    page_url,
    event_type,
    x ?? null,
    y ?? null,
    scroll_depth ?? null,
    viewport_width ?? null,
    viewport_height ?? null,
  ]);

  return result.rows[0];
}

async function insertHeatmapEventsBatch(events) {
  if (!events || events.length === 0) {return { inserted: 0 };}

  const values = [];
  const placeholders = [];
  let i = 1;

  events.forEach(ev => {
    placeholders.push(
      `($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8}, $${i + 9}, NOW())`
    );
    values.push(
      ev.test_id,
      ev.variant_id,
      ev.shop_domain,
      ev.page_url,
      ev.event_type,
      ev.x ?? null,
      ev.y ?? null,
      ev.scroll_depth ?? null,
      ev.viewport_width ?? null,
      ev.viewport_height ?? null
    );
    i += 10;
  });

  const sql = `
    INSERT INTO heatmap_events (
      test_id, variant_id, shop_domain, page_url, event_type,
      x, y, scroll_depth, viewport_width, viewport_height, created_at
    )
    VALUES ${placeholders.join(', ')}
  `;

  await query(sql, values);
  return { inserted: events.length };
}

/**
 * Get aggregated click heatmap data for a test
 * Returns grid buckets (10x10) with counts per variant
 */
async function getClickHeatmap(testId, shopDomain, pageUrl, options = {}) {
  const { variantId = null, since = null } = options;

  let where = 'test_id = $1 AND shop_domain = $2 AND event_type = $3';
  const params = [testId, shopDomain, 'click'];

  if (pageUrl) {
    where += ' AND page_url = $4';
    params.push(pageUrl);
  }
  if (variantId) {
    params.push(variantId);
    where += ` AND variant_id = $${params.length}`;
  }
  if (since) {
    params.push(since);
    where += ` AND created_at > $${params.length}`;
  }

  const sql = `
    SELECT
      variant_id,
      FLOOR(COALESCE(x, 0) / 10)::int as x_bucket,
      FLOOR(COALESCE(y, 0) / 10)::int as y_bucket,
      COUNT(*) as count
    FROM heatmap_events
    WHERE ${where}
    GROUP BY variant_id, x_bucket, y_bucket
    ORDER BY variant_id, x_bucket, y_bucket
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get scroll depth distribution per variant
 */
async function getScrollHeatmap(testId, shopDomain, pageUrl, options = {}) {
  const { variantId = null, since = null } = options;

  let where = 'test_id = $1 AND shop_domain = $2 AND event_type = $3';
  const params = [testId, shopDomain, 'scroll'];

  if (pageUrl) {
    where += ' AND page_url = $4';
    params.push(pageUrl);
  }
  if (variantId) {
    params.push(variantId);
    where += ` AND variant_id = $${params.length}`;
  }
  if (since) {
    params.push(since);
    where += ` AND created_at > $${params.length}`;
  }

  const sql = `
    SELECT
      variant_id,
      FLOOR(COALESCE(scroll_depth, 0) / 10)::int * 10 as depth_bucket,
      COUNT(*) as count
    FROM heatmap_events
    WHERE ${where}
    GROUP BY variant_id, depth_bucket
    ORDER BY variant_id, depth_bucket
  `;

  const result = await query(sql, params);
  return result.rows;
}

/**
 * Get distinct page URLs for a test (for dropdown)
 */
async function getHeatmapPages(testId, shopDomain) {
  const sql = `
    SELECT DISTINCT page_url
    FROM heatmap_events
    WHERE test_id = $1 AND shop_domain = $2
    ORDER BY page_url
    LIMIT 50
  `;
  const result = await query(sql, [testId, shopDomain]);
  return result.rows.map(r => r.page_url);
}

module.exports = {
  insertHeatmapEvent,
  insertHeatmapEventsBatch,
  getClickHeatmap,
  getScrollHeatmap,
  getHeatmapPages,
};
