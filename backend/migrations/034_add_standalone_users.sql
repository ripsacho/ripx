-- Standalone (email-based) users: registration with admin acceptance required before login.
-- Admin users (RIPX_ADMIN_EMAIL) can log in without acceptance.

CREATE TABLE IF NOT EXISTS standalone_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  email_verified_at TIMESTAMP,
  accepted_at TIMESTAMP,
  accepted_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT standalone_users_status_check CHECK (status IN ('pending', 'accepted', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_standalone_users_email ON standalone_users(email);
CREATE INDEX IF NOT EXISTS idx_standalone_users_status ON standalone_users(status);

DROP TRIGGER IF EXISTS update_standalone_users_updated_at ON standalone_users;
CREATE TRIGGER update_standalone_users_updated_at BEFORE UPDATE ON standalone_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE standalone_users IS 'Email-based users; must be accepted by admin before login (except RIPX_ADMIN_EMAIL)';
