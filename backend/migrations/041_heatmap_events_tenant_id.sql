-- Add tenant_id to heatmap_events for consistency with events/test_assignments (tenant-scoped queries, future RLS).
-- Migration: 041_heatmap_events_tenant_id.sql

ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

UPDATE heatmap_events h
SET tenant_id = t.tenant_id
FROM tests t
WHERE h.test_id = t.id AND h.tenant_id IS NULL AND t.tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_heatmap_events_tenant_id ON heatmap_events(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_heatmap_events_tenant_created ON heatmap_events(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

COMMENT ON COLUMN heatmap_events.tenant_id IS 'FK to tenants; derived from test. Enables tenant-scoped heatmap queries.';

CREATE OR REPLACE FUNCTION set_heatmap_events_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM tests WHERE id = NEW.test_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_heatmap_events_tenant_id ON heatmap_events;
CREATE TRIGGER trigger_heatmap_events_tenant_id
  BEFORE INSERT ON heatmap_events
  FOR EACH ROW EXECUTE FUNCTION set_heatmap_events_tenant_id();
