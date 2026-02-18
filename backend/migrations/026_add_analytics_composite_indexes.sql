-- Composite indexes for analytics query performance
-- Speeds up: getTestAnalytics, funnel, time-series aggregation

CREATE INDEX IF NOT EXISTS idx_events_test_shop_type
  ON events (test_id, shop_domain, event_type);

CREATE INDEX IF NOT EXISTS idx_events_test_variant_type
  ON events (test_id, variant_id, event_type);

CREATE INDEX IF NOT EXISTS idx_test_assignments_test_shop
  ON test_assignments (test_id, shop_domain);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_test_date_variant
  ON analytics_daily (test_id, date, variant_id);
