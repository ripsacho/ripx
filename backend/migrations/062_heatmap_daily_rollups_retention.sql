-- Heatmap rollup and retention foundation.
-- Reports still read raw heatmap_events for exact overlays; this table keeps daily aggregates ready
-- for long-range summaries and future archival without losing page/segment visibility.

CREATE TABLE IF NOT EXISTS heatmap_event_daily_rollups (
  event_date DATE NOT NULL,
  shop_domain VARCHAR(255) NOT NULL,
  test_id UUID NOT NULL,
  variant_id VARCHAR(255) NOT NULL,
  page_key TEXT NOT NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('click', 'scroll')),
  device VARCHAR(32),
  country VARCHAR(8),
  event_count BIGINT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_heatmap_daily_rollups_unique
  ON heatmap_event_daily_rollups (
    event_date,
    shop_domain,
    test_id,
    variant_id,
    page_key,
    event_type,
    COALESCE(device, ''),
    COALESCE(country, '')
  );

CREATE INDEX IF NOT EXISTS idx_heatmap_daily_rollups_test_page_date
  ON heatmap_event_daily_rollups (test_id, page_key, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_heatmap_daily_rollups_shop_date
  ON heatmap_event_daily_rollups (shop_domain, event_date DESC);

INSERT INTO heatmap_event_daily_rollups (
  event_date,
  shop_domain,
  test_id,
  variant_id,
  page_key,
  event_type,
  device,
  country,
  event_count,
  last_seen_at,
  updated_at
)
SELECT
  he.created_at::date AS event_date,
  LOWER(TRIM(he.shop_domain)) AS shop_domain,
  he.test_id,
  he.variant_id,
  COALESCE(
    he.page_key,
    NULLIF(regexp_replace(
      regexp_replace(split_part(split_part(he.page_url, '#', 1), '?', 1), '^https?://[^/]+', ''),
      '/+$',
      ''
    ), ''),
    '/'
  ) AS page_key,
  he.event_type,
  he.device,
  he.country,
  COUNT(*)::bigint AS event_count,
  MAX(he.created_at) AS last_seen_at,
  NOW() AS updated_at
FROM heatmap_events he
WHERE he.page_url IS NOT NULL
GROUP BY
  he.created_at::date,
  LOWER(TRIM(he.shop_domain)),
  he.test_id,
  he.variant_id,
  COALESCE(
    he.page_key,
    NULLIF(regexp_replace(
      regexp_replace(split_part(split_part(he.page_url, '#', 1), '?', 1), '^https?://[^/]+', ''),
      '/+$',
      ''
    ), ''),
    '/'
  ),
  he.event_type,
  he.device,
  he.country
ON CONFLICT (event_date, shop_domain, test_id, variant_id, page_key, event_type, COALESCE(device, ''), COALESCE(country, ''))
DO UPDATE SET
  event_count = EXCLUDED.event_count,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION refresh_heatmap_event_daily_rollups(refresh_since DATE DEFAULT CURRENT_DATE - 7)
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  DELETE FROM heatmap_event_daily_rollups WHERE event_date >= refresh_since;

  INSERT INTO heatmap_event_daily_rollups (
    event_date,
    shop_domain,
    test_id,
    variant_id,
    page_key,
    event_type,
    device,
    country,
    event_count,
    last_seen_at,
    updated_at
  )
  SELECT
    he.created_at::date AS event_date,
    LOWER(TRIM(he.shop_domain)) AS shop_domain,
    he.test_id,
    he.variant_id,
    COALESCE(
      he.page_key,
      NULLIF(regexp_replace(
        regexp_replace(split_part(split_part(he.page_url, '#', 1), '?', 1), '^https?://[^/]+', ''),
        '/+$',
        ''
      ), ''),
      '/'
    ) AS page_key,
    he.event_type,
    he.device,
    he.country,
    COUNT(*)::bigint AS event_count,
    MAX(he.created_at) AS last_seen_at,
    NOW() AS updated_at
  FROM heatmap_events he
  WHERE he.page_url IS NOT NULL
    AND he.created_at::date >= refresh_since
  GROUP BY
    he.created_at::date,
    LOWER(TRIM(he.shop_domain)),
    he.test_id,
    he.variant_id,
    COALESCE(
      he.page_key,
      NULLIF(regexp_replace(
        regexp_replace(split_part(split_part(he.page_url, '#', 1), '?', 1), '^https?://[^/]+', ''),
        '/+$',
        ''
      ), ''),
      '/'
    ),
    he.event_type,
    he.device,
    he.country;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prune_heatmap_events_older_than(retention_days INTEGER DEFAULT 180)
RETURNS INTEGER AS $$
DECLARE
  deleted_rows INTEGER;
BEGIN
  IF retention_days IS NULL OR retention_days < 30 THEN
    RAISE EXCEPTION 'retention_days must be at least 30';
  END IF;

  PERFORM refresh_heatmap_event_daily_rollups((CURRENT_DATE - (retention_days || ' days')::interval)::date);

  DELETE FROM heatmap_events
  WHERE created_at < NOW() - (retention_days || ' days')::interval;

  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END;
$$ LANGUAGE plpgsql;
