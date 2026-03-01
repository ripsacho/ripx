-- User–domain separation: link standalone_users to accounts, add user_domain_access, session revocation, domain verification
-- Migration: 035_user_domain_access_and_account_link.sql

-- Add account_id, primary_domain_id, and primary_domain (string at registration) to standalone_users
ALTER TABLE standalone_users ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE standalone_users ADD COLUMN IF NOT EXISTS primary_domain_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE standalone_users ADD COLUMN IF NOT EXISTS primary_domain VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_standalone_users_account_id ON standalone_users(account_id);

-- Token version for session revocation (admin revoke all sessions for user)
ALTER TABLE standalone_users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- user_domain_access: many-to-many between standalone_users and tenants (permitted users per domain)
CREATE TABLE IF NOT EXISTS user_domain_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES standalone_users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member', 'viewer')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_domain_access_user_id ON user_domain_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_domain_access_tenant_id ON user_domain_access(tenant_id);

DROP TRIGGER IF EXISTS update_user_domain_access_updated_at ON user_domain_access;
CREATE TRIGGER update_user_domain_access_updated_at BEFORE UPDATE ON user_domain_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE user_domain_access IS 'Which standalone users can access which domains (tenants); used for domain list and permitted users';

-- Optional: domain verification (for Phase 5)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS domain_verified_at TIMESTAMP;
