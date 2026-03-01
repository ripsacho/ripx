-- Add tenant_id to tests for referential integrity (normalization).
-- shop_domain kept for backward compatibility; tenant_id is the FK to tenants.
-- Migration: 039_tests_tenant_id_fk.sql

-- 1) Add column (nullable: backfill may miss if domain not in tenants)
ALTER TABLE tests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- 2) Backfill: set tenant_id where tests.shop_domain matches tenants.domain (normalized)
UPDATE tests t
SET tenant_id = th.id
FROM tenants th
WHERE LOWER(TRIM(t.shop_domain)) = LOWER(TRIM(th.domain))
  AND t.tenant_id IS NULL;

-- 3) Index for list/filter by tenant and status
CREATE INDEX IF NOT EXISTS idx_tests_tenant_id ON tests(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tests_tenant_status ON tests(tenant_id, status) WHERE tenant_id IS NOT NULL;

COMMENT ON COLUMN tests.tenant_id IS 'FK to tenants; enforces test belongs to a known domain. shop_domain kept for compatibility.';

-- 4) Optional: constrain tenant status values (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'status') THEN
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_status_check;
    ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
      CHECK (status IS NULL OR status IN ('active', 'suspended', 'blocked'));
  END IF;
END $$;
