/**
 * Heatmap Model
 *
 * Stores and aggregates click/scroll heatmap data per test variant
 */

const { query } = require('../utils/database');

function normalizeHeatmapPageKey(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '/';
  }
  try {
    const parsed = new URL(raw, 'https://ripx.local');
    return normalizeHeatmapPath(parsed.pathname);
  } catch {
    const withoutHash = raw.split('#')[0];
    const withoutQuery = withoutHash.split('?')[0];
    const withoutHost = withoutQuery.replace(/^https?:\/\/[^/]+/i, '');
    return normalizeHeatmapPath(withoutHost);
  }
}

function normalizeHeatmapPath(value) {
  const path = String(value || '').trim() || '/';
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : '/';
}

function normalizeHeatmapStoredPageUrl(value) {
  return normalizeHeatmapPageKey(value);
}

function normalizeHeatmapSegmentValue(value, maxLength) {
  const text = String(value || '')
    .trim()
    .toLowerCase();
  if (!text || text.length > maxLength) {
    return null;
  }
  return /^[a-z0-9_-]+$/.test(text) ? text : null;
}

const PAGE_KEY_EXPR =
  "CASE WHEN COALESCE(page_key, NULLIF(regexp_replace(split_part(split_part(page_url, '#', 1), '?', 1), '^https?://[^/]+', ''), ''), '/') = '/' THEN '/' ELSE regexp_replace(COALESCE(page_key, NULLIF(regexp_replace(split_part(split_part(page_url, '#', 1), '?', 1), '^https?://[^/]+', ''), ''), '/'), '/+$', '') END";

function normalizeHeatmapShopDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

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
    page_x,
    page_y,
    page_width,
    page_height,
    page_key,
    device,
    country,
    capture_version,
    page_height_source,
    scroll_container_detected,
  } = data;

  const sql = `
    INSERT INTO heatmap_events (
      test_id, variant_id, shop_domain, page_url, event_type,
      x, y, scroll_depth, viewport_width, viewport_height,
      page_x, page_y, page_width, page_height, page_key, device, country,
      capture_version, page_height_source, scroll_container_detected, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
    RETURNING id
  `;

  const result = await query(sql, [
    test_id,
    variant_id,
    normalizeHeatmapShopDomain(shop_domain),
    normalizeHeatmapStoredPageUrl(page_url),
    event_type,
    x ?? null,
    y ?? null,
    scroll_depth ?? null,
    viewport_width ?? null,
    viewport_height ?? null,
    page_x ?? null,
    page_y ?? null,
    page_width ?? null,
    page_height ?? null,
    page_key || normalizeHeatmapPageKey(page_url),
    normalizeHeatmapSegmentValue(device, 32),
    normalizeHeatmapSegmentValue(country, 8),
    normalizeHeatmapSegmentValue(capture_version, 32),
    normalizeHeatmapSegmentValue(page_height_source, 32),
    scroll_container_detected === true ? true : scroll_container_detected === false ? false : null,
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
      `($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8}, $${i + 9}, $${i + 10}, $${i + 11}, $${i + 12}, $${i + 13}, $${i + 14}, $${i + 15}, $${i + 16}, $${i + 17}, $${i + 18}, $${i + 19}, NOW())`
    );
    values.push(
      ev.test_id,
      ev.variant_id,
      normalizeHeatmapShopDomain(ev.shop_domain),
      normalizeHeatmapStoredPageUrl(ev.page_url),
      ev.event_type,
      ev.x ?? null,
      ev.y ?? null,
      ev.scroll_depth ?? null,
      ev.viewport_width ?? null,
      ev.viewport_height ?? null,
      ev.page_x ?? null,
      ev.page_y ?? null,
      ev.page_width ?? null,
      ev.page_height ?? null,
      ev.page_key || normalizeHeatmapPageKey(ev.page_url),
      normalizeHeatmapSegmentValue(ev.device, 32),
      normalizeHeatmapSegmentValue(ev.country, 8),
      normalizeHeatmapSegmentValue(ev.capture_version, 32),
      normalizeHeatmapSegmentValue(ev.page_height_source, 32),
      ev.scroll_container_detected === true
        ? true
        : ev.scroll_container_detected === false
          ? false
          : null
    );
    i += 20;
  });

  const sql = `
    INSERT INTO heatmap_events (
      test_id, variant_id, shop_domain, page_url, event_type,
      x, y, scroll_depth, viewport_width, viewport_height,
      page_x, page_y, page_width, page_height, page_key, device, country,
      capture_version, page_height_source, scroll_container_detected, created_at
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
  const { variantId = null, since = null, pageKey = null, device = null, country = null } = options;
  const normalizedShopDomain = normalizeHeatmapShopDomain(shopDomain);
  const normalizedPageKey = pageKey ? normalizeHeatmapPageKey(pageKey) : null;
  const normalizedDevice = normalizeHeatmapSegmentValue(device, 32);
  const normalizedCountry = normalizeHeatmapSegmentValue(country, 8);

  let where =
    'test_id = $1 AND LOWER(TRIM(shop_domain)) = LOWER(TRIM($2)) AND event_type = $3 AND x IS NOT NULL AND y IS NOT NULL';
  const params = [testId, normalizedShopDomain, 'click'];

  if (pageUrl) {
    where += ' AND page_url = $4';
    params.push(pageUrl);
  }
  if (normalizedPageKey) {
    params.push(normalizedPageKey);
    where += ` AND ${PAGE_KEY_EXPR} = $${params.length}`;
  }
  if (variantId) {
    params.push(variantId);
    where += ` AND variant_id = $${params.length}`;
  }
  if (since) {
    params.push(since);
    where += ` AND created_at > $${params.length}`;
  }
  if (normalizedDevice) {
    params.push(normalizedDevice);
    where += ` AND device = $${params.length}`;
  }
  if (normalizedCountry) {
    params.push(normalizedCountry);
    where += ` AND country = $${params.length}`;
  }

  const sql = `
    SELECT
      variant_id,
      LEAST(9, GREATEST(0, FLOOR(x::numeric / 10)::int)) as x_bucket,
      LEAST(9, GREATEST(0, FLOOR(y::numeric / 10)::int)) as y_bucket,
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
  const { variantId = null, since = null, pageKey = null, device = null, country = null } = options;
  const normalizedShopDomain = normalizeHeatmapShopDomain(shopDomain);
  const normalizedPageKey = pageKey ? normalizeHeatmapPageKey(pageKey) : null;
  const normalizedDevice = normalizeHeatmapSegmentValue(device, 32);
  const normalizedCountry = normalizeHeatmapSegmentValue(country, 8);

  let where =
    'test_id = $1 AND LOWER(TRIM(shop_domain)) = LOWER(TRIM($2)) AND event_type = $3 AND scroll_depth IS NOT NULL';
  const params = [testId, normalizedShopDomain, 'scroll'];

  if (pageUrl) {
    where += ' AND page_url = $4';
    params.push(pageUrl);
  }
  if (normalizedPageKey) {
    params.push(normalizedPageKey);
    where += ` AND ${PAGE_KEY_EXPR} = $${params.length}`;
  }
  if (variantId) {
    params.push(variantId);
    where += ` AND variant_id = $${params.length}`;
  }
  if (since) {
    params.push(since);
    where += ` AND created_at > $${params.length}`;
  }
  if (normalizedDevice) {
    params.push(normalizedDevice);
    where += ` AND device = $${params.length}`;
  }
  if (normalizedCountry) {
    params.push(normalizedCountry);
    where += ` AND country = $${params.length}`;
  }

  const sql = `
    SELECT
      variant_id,
      LEAST(100, GREATEST(0, FLOOR(scroll_depth::numeric / 10)::int * 10)) as depth_bucket,
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
async function getHeatmapPages(testId, shopDomain, options = {}) {
  const { variantId = null, since = null, device = null, country = null } = options;
  const normalizedShopDomain = normalizeHeatmapShopDomain(shopDomain);
  const normalizedDevice = normalizeHeatmapSegmentValue(device, 32);
  const normalizedCountry = normalizeHeatmapSegmentValue(country, 8);
  const params = [testId, normalizedShopDomain];
  let where =
    "test_id = $1 AND LOWER(TRIM(shop_domain)) = LOWER(TRIM($2)) AND page_url IS NOT NULL AND page_url <> ''";
  if (variantId) {
    params.push(variantId);
    where += ` AND variant_id = $${params.length}`;
  }
  if (since) {
    params.push(since);
    where += ` AND created_at > $${params.length}`;
  }
  if (normalizedDevice) {
    params.push(normalizedDevice);
    where += ` AND device = $${params.length}`;
  }
  if (normalizedCountry) {
    params.push(normalizedCountry);
    where += ` AND country = $${params.length}`;
  }

  const sql = `
    SELECT
      ${PAGE_KEY_EXPR} as page_key,
      MIN(page_url) as page_url,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE event_type = 'click') as click_count,
      COUNT(*) FILTER (WHERE event_type = 'scroll') as scroll_count,
      COUNT(DISTINCT variant_id) as variant_count,
      MIN(created_at) as first_seen,
      MAX(created_at) as last_seen
    FROM heatmap_events
    WHERE ${where}
    GROUP BY ${PAGE_KEY_EXPR}
    ORDER BY count DESC, last_seen DESC, page_url ASC
    LIMIT 50
  `;
  const result = await query(sql, params);
  return result.rows.map(r => ({
    page_key: r.page_key || normalizeHeatmapPageKey(r.page_url),
    page_url: r.page_url,
    count: parseInt(r.count, 10) || 0,
    click_count: parseInt(r.click_count, 10) || 0,
    scroll_count: parseInt(r.scroll_count, 10) || 0,
    variant_count: parseInt(r.variant_count, 10) || 0,
    first_seen: r.first_seen || null,
    last_seen: r.last_seen || null,
  }));
}

async function getHeatmapCollectionStats(testId, shopDomain, options = {}) {
  const { variantId = null, since = null, pageKey = null, device = null, country = null } = options;
  const normalizedShopDomain = normalizeHeatmapShopDomain(shopDomain);
  const normalizedPageKey = pageKey ? normalizeHeatmapPageKey(pageKey) : null;
  const normalizedDevice = normalizeHeatmapSegmentValue(device, 32);
  const normalizedCountry = normalizeHeatmapSegmentValue(country, 8);
  const params = [testId, normalizedShopDomain];
  let where = 'test_id = $1 AND LOWER(TRIM(shop_domain)) = LOWER(TRIM($2))';

  if (normalizedPageKey) {
    params.push(normalizedPageKey);
    where += ` AND ${PAGE_KEY_EXPR} = $${params.length}`;
  }
  if (variantId) {
    params.push(variantId);
    where += ` AND variant_id = $${params.length}`;
  }
  if (since) {
    params.push(since);
    where += ` AND created_at > $${params.length}`;
  }
  if (normalizedDevice) {
    params.push(normalizedDevice);
    where += ` AND device = $${params.length}`;
  }
  if (normalizedCountry) {
    params.push(normalizedCountry);
    where += ` AND country = $${params.length}`;
  }

  const sql = `
    SELECT
      COUNT(*) as total_events,
      COUNT(*) FILTER (WHERE event_type = 'click') as click_events,
      COUNT(*) FILTER (WHERE event_type = 'scroll') as scroll_events,
      COUNT(DISTINCT ${PAGE_KEY_EXPR}) as page_count,
      COUNT(DISTINCT variant_id) as variant_count,
      COUNT(DISTINCT device) FILTER (WHERE device IS NOT NULL) as device_count,
      COUNT(DISTINCT country) FILTER (WHERE country IS NOT NULL) as country_count,
      MIN(created_at) as first_seen,
      MAX(created_at) as last_seen,
      ROUND(AVG(viewport_width) FILTER (WHERE viewport_width > 0)) as avg_viewport_width,
      ROUND(AVG(viewport_height) FILTER (WHERE viewport_height > 0)) as avg_viewport_height
    FROM heatmap_events
    WHERE ${where}
  `;
  const result = await query(sql, params);
  const row = result.rows[0] || {};
  return {
    totalEvents: parseInt(row.total_events, 10) || 0,
    clickEvents: parseInt(row.click_events, 10) || 0,
    scrollEvents: parseInt(row.scroll_events, 10) || 0,
    pageCount: parseInt(row.page_count, 10) || 0,
    variantCount: parseInt(row.variant_count, 10) || 0,
    deviceCount: parseInt(row.device_count, 10) || 0,
    countryCount: parseInt(row.country_count, 10) || 0,
    firstSeen: row.first_seen || null,
    lastSeen: row.last_seen || null,
    avgViewportWidth: Number(row.avg_viewport_width) || null,
    avgViewportHeight: Number(row.avg_viewport_height) || null,
  };
}

async function getHeatmapSegmentOptions(testId, shopDomain, options = {}) {
  const { variantId = null, since = null, pageKey = null } = options;
  const normalizedShopDomain = normalizeHeatmapShopDomain(shopDomain);
  const normalizedPageKey = pageKey ? normalizeHeatmapPageKey(pageKey) : null;
  const params = [testId, normalizedShopDomain];
  const where = ['test_id = $1', 'LOWER(TRIM(shop_domain)) = LOWER(TRIM($2))'];

  if (normalizedPageKey) {
    params.push(normalizedPageKey);
    where.push(`${PAGE_KEY_EXPR} = $${params.length}`);
  }
  if (variantId) {
    params.push(variantId);
    where.push(`variant_id = $${params.length}`);
  }
  if (since) {
    params.push(since);
    where.push(`created_at > $${params.length}`);
  }

  const baseWhere = where.join(' AND ');
  const sql = `
    SELECT 'device' as segment_type, device as value, COUNT(*) as count, MAX(created_at) as last_seen
    FROM heatmap_events
    WHERE ${baseWhere} AND device IS NOT NULL AND device <> ''
    GROUP BY device
    UNION ALL
    SELECT 'country' as segment_type, country as value, COUNT(*) as count, MAX(created_at) as last_seen
    FROM heatmap_events
    WHERE ${baseWhere} AND country IS NOT NULL AND country <> ''
    GROUP BY country
    ORDER BY segment_type, count DESC, value ASC
  `;

  const result = await query(sql, params);
  const shape = row => ({
    value: row.value,
    count: parseInt(row.count, 10) || 0,
    lastSeen: row.last_seen || null,
  });
  return {
    devices: result.rows.filter(row => row.segment_type === 'device').map(shape),
    countries: result.rows.filter(row => row.segment_type === 'country').map(shape),
  };
}

async function getHeatmapRollupSummary(testId, shopDomain, options = {}) {
  const { variantId = null, since = null, pageKey = null, device = null, country = null } = options;
  const normalizedShopDomain = normalizeHeatmapShopDomain(shopDomain);
  const normalizedPageKey = pageKey ? normalizeHeatmapPageKey(pageKey) : null;
  const normalizedDevice = normalizeHeatmapSegmentValue(device, 32);
  const normalizedCountry = normalizeHeatmapSegmentValue(country, 8);
  const params = [testId, normalizedShopDomain];
  const where = ['test_id = $1', 'LOWER(TRIM(shop_domain)) = LOWER(TRIM($2))'];

  if (normalizedPageKey) {
    params.push(normalizedPageKey);
    where.push(`page_key = $${params.length}`);
  }
  if (variantId) {
    params.push(variantId);
    where.push(`variant_id = $${params.length}`);
  }
  if (since) {
    params.push(since);
    where.push(`event_date >= $${params.length}`);
  }
  if (normalizedDevice) {
    params.push(normalizedDevice);
    where.push(`device = $${params.length}`);
  }
  if (normalizedCountry) {
    params.push(normalizedCountry);
    where.push(`country = $${params.length}`);
  }

  const sql = `
    SELECT
      COALESCE(SUM(event_count), 0) as total_events,
      COALESCE(SUM(event_count) FILTER (WHERE event_type = 'click'), 0) as click_events,
      COALESCE(SUM(event_count) FILTER (WHERE event_type = 'scroll'), 0) as scroll_events,
      COUNT(DISTINCT page_key) as page_count,
      COUNT(DISTINCT variant_id) as variant_count,
      COUNT(DISTINCT device) FILTER (WHERE device IS NOT NULL) as device_count,
      COUNT(DISTINCT country) FILTER (WHERE country IS NOT NULL) as country_count,
      MIN(event_date) as first_date,
      MAX(event_date) as last_date,
      MAX(last_seen_at) as last_seen_at,
      COUNT(*) as rollup_rows
    FROM heatmap_event_daily_rollups
    WHERE ${where.join(' AND ')}
  `;

  try {
    const result = await query(sql, params);
    const row = result.rows[0] || {};
    const rollupRows = parseInt(row.rollup_rows, 10) || 0;
    return {
      available: true,
      populated: rollupRows > 0,
      source: rollupRows > 0 ? 'heatmap_event_daily_rollups' : 'empty_rollup',
      rollupRows,
      totalEvents: parseInt(row.total_events, 10) || 0,
      clickEvents: parseInt(row.click_events, 10) || 0,
      scrollEvents: parseInt(row.scroll_events, 10) || 0,
      pageCount: parseInt(row.page_count, 10) || 0,
      variantCount: parseInt(row.variant_count, 10) || 0,
      deviceCount: parseInt(row.device_count, 10) || 0,
      countryCount: parseInt(row.country_count, 10) || 0,
      firstDate: row.first_date || null,
      lastDate: row.last_date || null,
      lastSeenAt: row.last_seen_at || null,
    };
  } catch {
    return { available: false, populated: false, source: 'unavailable', rollupRows: 0 };
  }
}

async function refreshHeatmapDailyRollups(refreshSince = null) {
  const params = refreshSince ? [refreshSince] : [];
  const sql = refreshSince
    ? 'SELECT refresh_heatmap_event_daily_rollups($1::date) as affected_rows'
    : 'SELECT refresh_heatmap_event_daily_rollups() as affected_rows';
  const result = await query(sql, params);
  return parseInt(result.rows[0]?.affected_rows, 10) || 0;
}

async function pruneHeatmapEventsOlderThan(retentionDays = 180) {
  const result = await query(
    'SELECT prune_heatmap_events_older_than($1::integer) as deleted_rows',
    [retentionDays]
  );
  return parseInt(result.rows[0]?.deleted_rows, 10) || 0;
}

const REFERENCE_VIEWPORT = { width: 1280, height: 720 };

/**
 * Get click heatmap data normalized for screenshot overlays.
 * New rows use document-level coordinates and full document dimensions. Legacy rows still render
 * in the first viewport using old viewport percentages.
 */
async function getClickHeatmapForOverlay(testId, shopDomain, pageUrl, options = {}) {
  const { variantId = null, since = null, pageKey = null, device = null, country = null } = options;
  const normalizedShopDomain = normalizeHeatmapShopDomain(shopDomain);
  const normalizedPageKey = pageKey ? normalizeHeatmapPageKey(pageKey) : null;
  const normalizedDevice = normalizeHeatmapSegmentValue(device, 32);
  const normalizedCountry = normalizeHeatmapSegmentValue(country, 8);
  const w = REFERENCE_VIEWPORT.width;
  const h = REFERENCE_VIEWPORT.height;

  let where = 'test_id = $1 AND LOWER(TRIM(shop_domain)) = LOWER(TRIM($2)) AND event_type = $3';
  const params = [testId, normalizedShopDomain, 'click'];

  if (pageUrl) {
    where += ' AND page_url = $4';
    params.push(pageUrl);
  }
  if (normalizedPageKey) {
    params.push(normalizedPageKey);
    where += ` AND ${PAGE_KEY_EXPR} = $${params.length}`;
  }
  if (variantId) {
    params.push(variantId);
    where += ` AND variant_id = $${params.length}`;
  }
  if (since) {
    params.push(since);
    where += ` AND created_at > $${params.length}`;
  }
  if (normalizedDevice) {
    params.push(normalizedDevice);
    where += ` AND device = $${params.length}`;
  }
  if (normalizedCountry) {
    params.push(normalizedCountry);
    where += ` AND country = $${params.length}`;
  }

  const sql = `
    WITH scoped AS (
      SELECT
        x,
        y,
        viewport_width,
        viewport_height,
        page_x,
        page_y,
        page_width,
        page_height
      FROM heatmap_events
      WHERE ${where}
    ),
    stats AS (
      SELECT
        COUNT(*) AS scoped_count,
        COUNT(*) FILTER (
          WHERE page_x IS NOT NULL
            AND page_y IS NOT NULL
            AND page_width > 0
            AND page_height > 0
        ) AS full_count,
        COUNT(*) FILTER (
          WHERE x IS NOT NULL
            AND y IS NOT NULL
            AND viewport_width > 0
            AND viewport_height > 0
            AND NOT (
              page_x IS NOT NULL
              AND page_y IS NOT NULL
              AND page_width > 0
              AND page_height > 0
            )
        ) AS legacy_count,
        COALESCE(
          percentile_disc(0.5) WITHIN GROUP (ORDER BY page_width) FILTER (
            WHERE page_x IS NOT NULL
              AND page_y IS NOT NULL
              AND page_width > 0
              AND page_height > 0
          ),
          ${w}
        )::int AS reference_width,
        COALESCE(
          percentile_disc(0.5) WITHIN GROUP (ORDER BY page_height) FILTER (
            WHERE page_x IS NOT NULL
              AND page_y IS NOT NULL
              AND page_width > 0
              AND page_height > 0
          ),
          ${h}
        )::int AS reference_height,
        MIN(page_width) FILTER (
          WHERE page_x IS NOT NULL
            AND page_y IS NOT NULL
            AND page_width > 0
            AND page_height > 0
        )::int AS min_page_width,
        MAX(page_width) FILTER (
          WHERE page_x IS NOT NULL
            AND page_y IS NOT NULL
            AND page_width > 0
            AND page_height > 0
        )::int AS max_page_width,
        MIN(page_height) FILTER (
          WHERE page_x IS NOT NULL
            AND page_y IS NOT NULL
            AND page_width > 0
            AND page_height > 0
        )::int AS min_page_height,
        MAX(page_height) FILTER (
          WHERE page_x IS NOT NULL
            AND page_y IS NOT NULL
            AND page_width > 0
            AND page_height > 0
        )::int AS max_page_height
      FROM scoped
    ),
    normalized AS (
      SELECT
        CASE
          WHEN scoped.page_x IS NOT NULL
            AND scoped.page_y IS NOT NULL
            AND scoped.page_width > 0
            AND scoped.page_height > 0
            THEN LEAST(stats.reference_width, GREATEST(0, FLOOR((scoped.page_x::numeric / scoped.page_width) * stats.reference_width)::int))
          ELSE LEAST(stats.reference_width, GREATEST(0, FLOOR((scoped.x::numeric / 100) * stats.reference_width)::int))
        END AS x_norm,
        CASE
          WHEN scoped.page_x IS NOT NULL
            AND scoped.page_y IS NOT NULL
            AND scoped.page_width > 0
            AND scoped.page_height > 0
            THEN LEAST(stats.reference_height, GREATEST(0, FLOOR((scoped.page_y::numeric / scoped.page_height) * stats.reference_height)::int))
          ELSE LEAST(LEAST(stats.reference_height, ${h}), GREATEST(0, FLOOR((scoped.y::numeric / 100) * LEAST(stats.reference_height, ${h}))::int))
        END AS y_norm,
        stats.reference_width,
        stats.reference_height,
        stats.scoped_count,
        stats.full_count,
        stats.legacy_count,
        stats.min_page_width,
        stats.max_page_width,
        stats.min_page_height,
        stats.max_page_height
      FROM scoped
      CROSS JOIN stats
      WHERE (
        scoped.page_x IS NOT NULL
        AND scoped.page_y IS NOT NULL
        AND scoped.page_width > 0
        AND scoped.page_height > 0
      ) OR (
        scoped.x IS NOT NULL
        AND scoped.y IS NOT NULL
        AND scoped.viewport_width > 0
        AND scoped.viewport_height > 0
      )
    )
    SELECT
      x_norm,
      y_norm,
      COUNT(*) AS count,
      MAX(reference_width) AS reference_width,
      MAX(reference_height) AS reference_height,
      MAX(scoped_count) AS scoped_count,
      MAX(full_count) AS full_count,
      MAX(legacy_count) AS legacy_count,
      MAX(min_page_width) AS min_page_width,
      MAX(max_page_width) AS max_page_width,
      MAX(min_page_height) AS min_page_height,
      MAX(max_page_height) AS max_page_height
    FROM normalized
    GROUP BY x_norm, y_norm
    ORDER BY count DESC
    LIMIT 2000
  `;

  const result = await query(sql, params);
  const firstRow = result.rows[0] || {};
  const fullPointCount = Number(firstRow.full_count) || 0;
  const legacyPointCount = Number(firstRow.legacy_count) || 0;
  const scopedPointCount = Number(firstRow.scoped_count) || fullPointCount + legacyPointCount;
  const skippedPointCount = Math.max(0, scopedPointCount - fullPointCount - legacyPointCount);
  const minPageWidth = Number(firstRow.min_page_width) || null;
  const maxPageWidth = Number(firstRow.max_page_width) || null;
  const minPageHeight = Number(firstRow.min_page_height) || null;
  const maxPageHeight = Number(firstRow.max_page_height) || null;
  const overlayMode =
    fullPointCount > 0 && legacyPointCount > 0
      ? 'partial-full-page'
      : fullPointCount > 0
        ? 'full-page'
        : 'legacy-viewport';
  return {
    points: result.rows.map(r => ({ x: r.x_norm, y: r.y_norm, count: Number(r.count) })),
    referenceWidth: Number(firstRow.reference_width) || w,
    referenceHeight: Number(firstRow.reference_height) || h,
    overlayMode,
    fullPagePointCount: fullPointCount,
    legacyPointCount,
    skippedPointCount,
    quality: {
      overlayMode,
      fullPagePointCount: fullPointCount,
      legacyPointCount,
      skippedPointCount,
      referenceDimensionStrategy:
        fullPointCount > 0 ? 'median-captured-document' : 'legacy-reference-viewport',
      pageWidthRange: { min: minPageWidth, max: maxPageWidth },
      pageHeightRange: { min: minPageHeight, max: maxPageHeight },
      dimensionMismatch:
        Boolean(minPageHeight && maxPageHeight && maxPageHeight / minPageHeight > 1.35) ||
        Boolean(minPageWidth && maxPageWidth && maxPageWidth / minPageWidth > 1.25),
    },
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
  const lookupValues = [];
  const pushLookupValue = value => {
    const normalized = String(value || '').trim();
    if (normalized && !lookupValues.includes(normalized)) {
      lookupValues.push(normalized);
    }
  };
  pushLookupValue(pageUrl);
  const pageKey = normalizeHeatmapPageKey(pageUrl);
  pushLookupValue(pageKey);
  if (pageKey && pageKey.startsWith('/') && shopDomain) {
    pushLookupValue(`https://${normalizeHeatmapShopDomain(shopDomain)}${pageKey}`);
  }
  const keys = lookupValues
    .flatMap(value => [
      heatmapScreenshotKey(shopDomain, value),
      heatmapScreenshotKeyAlt(shopDomain, value),
    ])
    .filter(Boolean);
  if (keys.length === 0) {
    return null;
  }
  try {
    for (const key of [...new Set(keys)]) {
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

/**
 * Save screenshot URL for a shop/page pair in key_value_store.
 * Uses primary normalized key (with leading underscore when path starts with '/').
 */
async function setHeatmapScreenshotUrl(shopDomain, pageUrl, screenshotUrl) {
  const key = heatmapScreenshotKey(shopDomain, pageUrl);
  if (!key) {
    return { ok: false, reason: 'invalid_key' };
  }
  const value = String(screenshotUrl || '').trim();
  if (!value) {
    await query('DELETE FROM key_value_store WHERE key = $1', [key]);
    return { ok: true, key, deleted: true };
  }
  await query(
    `INSERT INTO key_value_store (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  );
  return { ok: true, key, deleted: false };
}

module.exports = {
  insertHeatmapEvent,
  insertHeatmapEventsBatch,
  getClickHeatmap,
  getScrollHeatmap,
  getHeatmapPages,
  getHeatmapCollectionStats,
  getHeatmapSegmentOptions,
  getHeatmapRollupSummary,
  getClickHeatmapForOverlay,
  getHeatmapScreenshotUrl,
  setHeatmapScreenshotUrl,
  refreshHeatmapDailyRollups,
  pruneHeatmapEventsOlderThan,
  heatmapScreenshotKey,
  normalizeHeatmapPageKey,
  normalizeHeatmapStoredPageUrl,
  normalizeHeatmapSegmentValue,
  REFERENCE_VIEWPORT,
};
