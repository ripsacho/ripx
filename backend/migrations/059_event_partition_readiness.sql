-- Event partition readiness:
-- Non-disruptive indexes and metadata comments that prepare raw event tables for
-- future range partitioning by created_at without rewriting existing tables now.

CREATE INDEX IF NOT EXISTS idx_events_created_id
  ON events (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_events_tenant_created_id
  ON events (tenant_id, created_at DESC, id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_shop_created_id
  ON events (shop_domain, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_heatmap_events_created_id
  ON heatmap_events (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_heatmap_events_tenant_created_id
  ON heatmap_events (tenant_id, created_at DESC, id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_heatmap_events_shop_created_id
  ON heatmap_events (shop_domain, created_at DESC, id);

COMMENT ON TABLE events IS
  'Raw analytics events. Prepared for future created_at range partitioning; keep created_at populated and tenant_id backfilled before table rewrite.';

COMMENT ON TABLE heatmap_events IS
  'Raw heatmap events. Prepared for future created_at range partitioning; keep created_at populated and tenant_id backfilled before table rewrite.';
