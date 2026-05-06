-- Fix analytics_daily aggregation so assignment visitors and conversion events are
-- independently bounded to the target day. Older assignments with same-day
-- conversions should count conversions/revenue, but not inflate same-day visitors.

CREATE OR REPLACE FUNCTION aggregate_daily_analytics()
RETURNS void AS $$
DECLARE
  target_date DATE := CURRENT_DATE - 1;
  target_start TIMESTAMP := (CURRENT_DATE - INTERVAL '1 day')::timestamp;
  target_end TIMESTAMP := CURRENT_DATE::timestamp;
BEGIN
  INSERT INTO analytics_daily (test_id, variant_id, variant_name, date, visitors, conversions, revenue)
  WITH scoped_rows AS (
    SELECT
      ta.test_id,
      ta.variant_id,
      ta.variant_name,
      ta.user_id AS visitor_user_id,
      NULL::TEXT AS conversion_user_id,
      0::DECIMAL AS revenue
    FROM test_assignments ta
    WHERE ta.assigned_at >= target_start
      AND ta.assigned_at < target_end

    UNION ALL

    SELECT
      e.test_id,
      e.variant_id,
      ta.variant_name,
      NULL::TEXT AS visitor_user_id,
      e.user_id AS conversion_user_id,
      COALESCE(e.event_value, 0)::DECIMAL AS revenue
    FROM events e
    INNER JOIN test_assignments ta ON ta.test_id = e.test_id
      AND ta.variant_id = e.variant_id
      AND ta.user_id = e.user_id
      AND e.shop_domain = ta.shop_domain
    WHERE e.event_type = 'conversion'
      AND e.created_at >= target_start
      AND e.created_at < target_end
  )
  SELECT
    test_id,
    variant_id,
    MAX(variant_name) AS variant_name,
    target_date,
    COUNT(DISTINCT visitor_user_id) AS visitors,
    COUNT(DISTINCT conversion_user_id) AS conversions,
    COALESCE(SUM(revenue), 0) AS revenue
  FROM scoped_rows
  GROUP BY test_id, variant_id
  ON CONFLICT (test_id, variant_id, date)
  DO UPDATE SET
    visitors = EXCLUDED.visitors,
    conversions = EXCLUDED.conversions,
    revenue = EXCLUDED.revenue,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
