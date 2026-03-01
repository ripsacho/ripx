-- Tenant_id on events, test_assignments, and audit_log (best-practice schema for advanced AB testing).
-- Enables tenant-scoped queries, future RLS, and consistent FKs. Backfill from existing data; triggers set tenant_id on new rows.
-- Migration: 040_tenant_id_events_assignments_audit.sql

-- ========== EVENTS ==========
ALTER TABLE events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

UPDATE events e
SET tenant_id = t.tenant_id
FROM tests t
WHERE e.test_id = t.id AND e.tenant_id IS NULL AND t.tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_tenant_created ON events(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

COMMENT ON COLUMN events.tenant_id IS 'FK to tenants; derived from test. Enables tenant-scoped queries and future partitioning.';

-- Trigger: set tenant_id on INSERT from tests
CREATE OR REPLACE FUNCTION set_events_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM tests WHERE id = NEW.test_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_events_tenant_id ON events;
CREATE TRIGGER trigger_events_tenant_id
  BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION set_events_tenant_id();


-- ========== TEST_ASSIGNMENTS ==========
ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

UPDATE test_assignments ta
SET tenant_id = t.tenant_id
FROM tests t
WHERE ta.test_id = t.id AND ta.tenant_id IS NULL AND t.tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_test_assignments_tenant_id ON test_assignments(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_assignments_tenant_assigned ON test_assignments(tenant_id, assigned_at DESC) WHERE tenant_id IS NOT NULL;

COMMENT ON COLUMN test_assignments.tenant_id IS 'FK to tenants; derived from test. Enables tenant-scoped queries.';

CREATE OR REPLACE FUNCTION set_test_assignments_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM tests WHERE id = NEW.test_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_test_assignments_tenant_id ON test_assignments;
CREATE TRIGGER trigger_test_assignments_tenant_id
  BEFORE INSERT ON test_assignments
  FOR EACH ROW EXECUTE FUNCTION set_test_assignments_tenant_id();


-- ========== AUDIT_LOG ==========
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;

UPDATE audit_log a
SET tenant_id = t.id
FROM tenants t
WHERE LOWER(TRIM(a.shop_domain)) = LOWER(TRIM(t.domain))
  AND a.tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_id ON audit_log(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created ON audit_log(tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;

COMMENT ON COLUMN audit_log.tenant_id IS 'FK to tenants; resolved from shop_domain. Enables tenant-scoped audit queries.';
