/**
 * Heatmap Model
 *
 * Stores and aggregates click/scroll heatmap data per test variant
 */

const { query } = require('../utils/database');

async function insertHeatmapEvent(data) {
  const {
    test_id,
    variant_id,
    shop_domain,
    page_url,
    event_type,
    x,
    y,
    scroll_depth,
    viewport_width,
    viewport_height,
  } = data;

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
  if (!events || events.length === 0) {
    return { inserted: 0 };
  }

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

const REFERENCE_VIEWPORT = { width: 1280, height: 720 };

/**
 * Get click heatmap data normalized to reference viewport (1280×720) for overlay on screenshot.
 * Returns points with x, y in 0..1280 and 0..720 (binned to int) and count per bin.
 */
async function getClickHeatmapForOverlay(testId, shopDomain, pageUrl, options = {}) {
  const { variantId = null, since = null } = options;
  const w = REFERENCE_VIEWPORT.width;
  const h = REFERENCE_VIEWPORT.height;

  let where =
    'test_id = $1 AND shop_domain = $2 AND event_type = $3 AND x IS NOT NULL AND y IS NOT NULL AND viewport_width > 0 AND viewport_height > 0';
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
    WITH normalized AS (
      SELECT
        LEAST(${w}, GREATEST(0, FLOOR((x::numeric / NULLIF(viewport_width, 0)) * ${w})::int)) AS x_norm,
        LEAST(${h}, GREATEST(0, FLOOR((y::numeric / NULLIF(viewport_height, 0)) * ${h})::int)) AS y_norm
      FROM heatmap_events
      WHERE ${where}
    )
    SELECT x_norm, y_norm, COUNT(*) AS count
    FROM normalized
    GROUP BY x_norm, y_norm
    ORDER BY count DESC
    LIMIT 2000
  `;

  const result = await query(sql, params);
  return {
    points: result.rows.map(r => ({ x: r.x_norm, y: r.y_norm, count: Number(r.count) })),
    referenceWidth: w,
    referenceHeight: h,
  };
}

const HEATMAP_SCREENSHOT_KEY_PREFIX = 'heatmap_screenshot.';

/**
 * Build key for heatmap screenshot in key_value_store: heatmap_screenshot.{shop_domain}.{page_url}
 * Page URL is normalized for key (slash and query safe).
 */
function heatmapScreenshotKey(shopDomain, pageUrl) {
  if (!shopDomain || !pageUrl) {
    return null;
  }
  const safe = String(pageUrl).trim().replace(/\//g, '_').replace(/\?/g, '_').substring(0, 200);
  return `${HEATMAP_SCREENSHOT_KEY_PREFIX}${shopDomain}.${safe}`;
}

/** Alternate key without leading underscore (e.g. products_abc for /products/abc) for key_value_store lookup */
function heatmapScreenshotKeyAlt(shopDomain, pageUrl) {
  if (!shopDomain || !pageUrl) {
    return null;
  }
  const trimmed = String(pageUrl).trim();
  const withoutLeading = trimmed.replace(/^\//, '');
  const safe = withoutLeading.replace(/\//g, '_').replace(/\?/g, '_').substring(0, 200);
  return `${HEATMAP_SCREENSHOT_KEY_PREFIX}${shopDomain}.${safe}`;
}

function parseScreenshotValue(v) {
  if (v === null || v === undefined) {
    return null;
  }
  const raw = String(v).trim();
  if (raw === '') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.url === 'string' && parsed.url.trim() !== '') {
      return parsed.url.trim();
    }
  } catch (_) {
    /* not JSON, use as plain URL */
  }
  return raw;
}

/**
 * Get stored screenshot URL for heatmap overlay (from key_value_store).
 * Key format: heatmap_screenshot.{shop_domain}.{page_url_normalized}
 * Page URL is normalized: slashes and ? become underscores (e.g. /products/abc -> _products_abc).
 * Tries primary key and alternate (no leading _) so admin can use either.
 * Value can be a plain URL string or JSON like {"url": "https://..."}.
 */
async function getHeatmapScreenshotUrl(shopDomain, pageUrl) {
  const key1 = heatmapScreenshotKey(shopDomain, pageUrl);
  const key2 = heatmapScreenshotKeyAlt(shopDomain, pageUrl);
  if (!key1 && !key2) {
    return null;
  }
  try {
    for (const key of [key1, key2].filter(Boolean)) {
      const result = await query('SELECT value FROM key_value_store WHERE key = $1', [key]);
      const v = result.rows[0]?.value;
      const url = parseScreenshotValue(v);
      if (url) {
        return url;
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  insertHeatmapEvent,
  insertHeatmapEventsBatch,
  getClickHeatmap,
  getScrollHeatmap,
  getHeatmapPages,
  getClickHeatmapForOverlay,
  getHeatmapScreenshotUrl,
  heatmapScreenshotKey,
  REFERENCE_VIEWPORT,
};
