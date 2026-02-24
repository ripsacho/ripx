-- Admin panel support: user roles/status, tenant status, admin audit
-- Migration: 029_add_admin_support.sql

-- Users: role (admin/superadmin) and status (active/locked/suspended)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'status') THEN
    ALTER TABLE users ADD COLUMN status VARCHAR(50) DEFAULT 'active';
  END IF;
END $$;

-- Tenants: status for suspend/block
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'status') THEN
    ALTER TABLE tenants ADD COLUMN status VARCHAR(50) DEFAULT 'active';
  END IF;
END $$;

-- Audit log: optional actor columns for admin actions (who performed the action)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'actor_type') THEN
    ALTER TABLE audit_log ADD COLUMN actor_type VARCHAR(20) DEFAULT 'user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'actor_id') THEN
    ALTER TABLE audit_log ADD COLUMN actor_id VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_log' AND column_name = 'ip_address') THEN
    ALTER TABLE audit_log ADD COLUMN ip_address VARCHAR(45);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role) WHERE role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
