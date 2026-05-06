-- Database improvement first wave:
-- - Fix daily analytics aggregation to use test_assignments.assigned_at.
-- - Remove a duplicate events index.
-- - Add focused indexes for goal metric observed counts and conversion dedupe.

CREATE OR REPLACE FUNCTION aggregate_daily_analytics()
RETURNS void AS $$
DECLARE
  target_date DATE := CURRENT_DATE - 1;
  target_start TIMESTAMP := (CURRENT_DATE - INTERVAL '1 day')::timestamp;
  target_end TIMESTAMP := CURRENT_DATE::timestamp;
BEGIN
  INSERT INTO analytics_daily (test_id, variant_id, variant_name, date, visitors, conversions, revenue)
  SELECT
    ta.test_id,
    ta.variant_id,
    ta.variant_name,
    target_date,
    COUNT(DISTINCT ta.user_id) AS visitors,
    COUNT(DISTINCT CASE WHEN e.event_type = 'conversion' THEN e.user_id END) AS conversions,
    COALESCE(SUM(CASE WHEN e.event_type = 'conversion' THEN e.event_value ELSE 0 END), 0) AS revenue
  FROM test_assignments ta
  LEFT JOIN events e ON e.test_id = ta.test_id
    AND e.variant_id = ta.variant_id
    AND e.user_id = ta.user_id
    AND e.shop_domain = ta.shop_domain
    AND e.created_at >= target_start
    AND e.created_at < target_end
  WHERE (ta.assigned_at >= target_start AND ta.assigned_at < target_end)
    OR e.id IS NOT NULL
  GROUP BY ta.test_id, ta.variant_id, ta.variant_name
  ON CONFLICT (test_id, variant_id, date)
  DO UPDATE SET
    visitors = EXCLUDED.visitors,
    conversions = EXCLUDED.conversions,
    revenue = EXCLUDED.revenue,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

DROP INDEX IF EXISTS idx_events_analytics;

CREATE INDEX IF NOT EXISTS idx_events_shop_event_name_created_at
  ON events (shop_domain, event_name, created_at DESC)
  WHERE event_name IS NOT NULL AND event_name <> '';

CREATE INDEX IF NOT EXISTS idx_events_custom_metrics_lookup
  ON events (test_id, shop_domain, event_name, variant_id, user_id)
  WHERE event_type = 'custom' AND event_name IS NOT NULL AND event_name <> '';

CREATE INDEX IF NOT EXISTS idx_events_conversion_order_dedup
  ON events (test_id, user_id, (metadata->>'order_id'))
  WHERE event_type = 'conversion' AND metadata ? 'order_id';
