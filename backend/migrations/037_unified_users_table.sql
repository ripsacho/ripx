-- Unified users table: merge standalone_users into users; one table for both Shopify and email (standalone) users.
-- Best-practice: single table with type discriminator (auth_type), CHECK constraints for data integrity, partial unique indexes.
-- Migration: 037_unified_users_table.sql
-- Idempotent: safe when users has no shop_domain column (e.g. already evolved by 038 or different schema).

-- 1) Add new columns to users for unified model
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_type VARCHAR(20) DEFAULT 'shopify';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_domain_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_domain VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_by VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- Ensure existing rows are marked as shopify (before adding CHECK)
UPDATE users SET auth_type = 'shopify' WHERE auth_type IS NULL;

-- 2) shop_domain steps only when column exists (skip when users already email-only)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'shop_domain') THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_shop_domain_key;
    ALTER TABLE users ALTER COLUMN shop_domain DROP NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_shop_domain_unique ON users(shop_domain) WHERE shop_domain IS NOT NULL;
  END IF;
END $$;

-- 3) Email lookup index only (do NOT enforce uniqueness yet).
--    standalone_users can contain duplicate normalized emails, and 037 migrates rows by original id.
--    Uniqueness is enforced in 038 after duplicate merge.
CREATE INDEX IF NOT EXISTS idx_users_email_lookup ON users(LOWER(TRIM(email))) WHERE email IS NOT NULL;

-- 4) CHECK constraints for data integrity
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_type_check;
ALTER TABLE users ADD CONSTRAINT users_auth_type_check CHECK (auth_type IN ('shopify', 'standalone'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_identifier_check;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'shop_domain') THEN
    ALTER TABLE users ADD CONSTRAINT users_auth_identifier_check CHECK (
      (auth_type = 'shopify' AND shop_domain IS NOT NULL) OR (auth_type = 'standalone' AND email IS NOT NULL)
    );
  ELSE
    ALTER TABLE users ADD CONSTRAINT users_auth_identifier_check CHECK (email IS NOT NULL);
  END IF;
END $$;

-- Valid status values only (standalone: pending|accepted|rejected; shopify: active|locked|suspended)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (
  status IS NULL OR status IN ('pending', 'accepted', 'rejected', 'active', 'locked', 'suspended')
);

-- 5) Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_type ON users(auth_type);
CREATE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id) WHERE account_id IS NOT NULL;
-- Standalone list: ORDER BY created_at DESC filtered by auth_type
CREATE INDEX IF NOT EXISTS idx_users_standalone_created ON users(created_at DESC) WHERE auth_type = 'standalone';

-- 6) Migrate data and FK only if standalone_users still exists (idempotent-safe)
DO $$
DECLARE
  cname TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'standalone_users') THEN
    INSERT INTO users (
      id, auth_type, email, status, account_id, primary_domain_id, primary_domain,
      email_verified_at, accepted_at, accepted_by, token_version, profile, preferences, created_at, updated_at
    )
    SELECT
      su.id, 'standalone', LOWER(TRIM(su.email)), su.status, su.account_id, su.primary_domain_id, su.primary_domain,
      su.email_verified_at, su.accepted_at, su.accepted_by, COALESCE(su.token_version, 0), '{}', '{}', su.created_at, su.updated_at
    FROM standalone_users su
    ON CONFLICT (id) DO NOTHING;

    SELECT conname INTO cname FROM pg_constraint
    WHERE conrelid = 'user_domain_access'::regclass AND confrelid = 'standalone_users'::regclass
    LIMIT 1;
    IF cname IS NOT NULL THEN
      EXECUTE format('ALTER TABLE user_domain_access DROP CONSTRAINT %I', cname);
    END IF;

    DROP TABLE standalone_users;
  END IF;
END $$;

-- 7) Ensure user_domain_access references users (safe to run if already done)
ALTER TABLE user_domain_access DROP CONSTRAINT IF EXISTS user_domain_access_user_id_fkey;
ALTER TABLE user_domain_access ADD CONSTRAINT user_domain_access_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

COMMENT ON COLUMN users.auth_type IS 'shopify = identified by shop_domain; standalone = identified by email';
COMMENT ON COLUMN users.email IS 'Required when auth_type=standalone; stored lowercase; uniqueness enforced in 038 after dedupe.';
COMMENT ON COLUMN users.account_id IS 'Links to accounts (API key); both types can have one';
COMMENT ON COLUMN users.status IS 'Standalone: pending|accepted|rejected. Shopify: active|locked|suspended.';
