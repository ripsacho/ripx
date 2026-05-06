-- Funnel analytics query performance
-- Supports assignment-window cohorts and ordered/event-step joins used by getFunnelMetrics.

CREATE INDEX IF NOT EXISTS idx_test_assignments_funnel_scope
  ON test_assignments (test_id, shop_domain, assigned_at, user_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_test_assignments_funnel_segments
  ON test_assignments (test_id, shop_domain, device, country, assigned_at, user_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_events_funnel_steps
  ON events (test_id, shop_domain, event_type, event_name, user_id, variant_id, created_at);

CREATE INDEX IF NOT EXISTS idx_events_funnel_conversions
  ON events (test_id, shop_domain, user_id, variant_id, created_at)
  WHERE event_type = 'conversion';
