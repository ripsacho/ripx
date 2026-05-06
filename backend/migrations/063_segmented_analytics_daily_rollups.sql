-- Segmented analytics daily rollups for dashboard time-series views.
-- The Node timeSeriesService remains the official app aggregation entry point;
-- this function gives the admin trigger and scheduled jobs a single SQL refresh target.

CREATE TABLE IF NOT EXISTS analytics_daily_segments (
  date DATE NOT NULL,
  test_id UUID NOT NULL,
  shop_domain VARCHAR(255) NOT NULL,
  variant_id VARCHAR(255) NOT NULL,
  variant_name VARCHAR(255),
  device VARCHAR(32),
  country VARCHAR(8),
  visitors INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily_segments_unique
  ON analytics_daily_segments (
    date,
    test_id,
    shop_domain,
    variant_id,
    COALESCE(device, ''),
    COALESCE(country, '')
  );

CREATE INDEX IF NOT EXISTS idx_analytics_daily_segments_test_date
  ON analytics_daily_segments (test_id, shop_domain, date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_segments_scope
  ON analytics_daily_segments (test_id, shop_domain, device, country, date DESC);

CREATE OR REPLACE FUNCTION refresh_analytics_daily_segments(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
  target_start TIMESTAMP := target_date::timestamp;
  target_end TIMESTAMP := (target_date + 1)::timestamp;
BEGIN
  DELETE FROM analytics_daily_segments WHERE date = target_date;

  INSERT INTO analytics_daily_segments (
    date,
    test_id,
    shop_domain,
    variant_id,
    variant_name,
    device,
    country,
    visitors,
    conversions,
    revenue,
    updated_at
  )
  WITH scoped_rows AS (
    SELECT
      ta.test_id,
      LOWER(TRIM(ta.shop_domain)) AS shop_domain,
      ta.variant_id,
      ta.variant_name,
      NULLIF(LOWER(TRIM(ta.device)), '') AS device,
      NULLIF(LOWER(TRIM(ta.country)), '') AS country,
      ta.user_id AS visitor_user_id,
      NULL::TEXT AS conversion_user_id,
      0::DECIMAL AS revenue
    FROM test_assignments ta
    WHERE (ta.assigned_at AT TIME ZONE 'UTC')::date = target_date

    UNION ALL

    SELECT
      e.test_id,
      LOWER(TRIM(e.shop_domain)) AS shop_domain,
      e.variant_id,
      ta.variant_name,
      NULLIF(LOWER(TRIM(ta.device)), '') AS device,
      NULLIF(LOWER(TRIM(ta.country)), '') AS country,
      NULL::TEXT AS visitor_user_id,
      e.user_id AS conversion_user_id,
      COALESCE(e.event_value, 0)::DECIMAL AS revenue
    FROM events e
    INNER JOIN test_assignments ta ON ta.test_id = e.test_id
      AND ta.variant_id = e.variant_id
      AND ta.user_id = e.user_id
      AND LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM(e.shop_domain))
    WHERE e.event_type = 'conversion'
      AND (e.created_at AT TIME ZONE 'UTC')::date = target_date
  )
  SELECT
    target_date,
    test_id,
    shop_domain,
    variant_id,
    MAX(variant_name) AS variant_name,
    device,
    country,
    COUNT(DISTINCT visitor_user_id)::integer AS visitors,
    COUNT(DISTINCT conversion_user_id)::integer AS conversions,
    COALESCE(SUM(revenue), 0) AS revenue,
    NOW()
  FROM scoped_rows
  GROUP BY
    test_id,
    shop_domain,
    variant_id,
    device,
    country
  ON CONFLICT (date, test_id, shop_domain, variant_id, COALESCE(device, ''), COALESCE(country, ''))
  DO UPDATE SET
    variant_name = EXCLUDED.variant_name,
    visitors = EXCLUDED.visitors,
    conversions = EXCLUDED.conversions,
    revenue = EXCLUDED.revenue,
    updated_at = NOW();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;
