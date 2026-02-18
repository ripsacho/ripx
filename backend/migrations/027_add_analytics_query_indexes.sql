-- Additional indexes for analytics accuracy and performance
-- Conversion attribution: events joined with test_assignments on (test_id, user_id, shop_domain, variant_id)

CREATE INDEX IF NOT EXISTS idx_events_test_shop_variant_type
  ON events (test_id, shop_domain, variant_id, event_type);

CREATE INDEX IF NOT EXISTS idx_test_assignments_test_shop_variant
  ON test_assignments (test_id, shop_domain, variant_id);
