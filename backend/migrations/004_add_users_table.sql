-- Add Users Table for Profile, Account, and Preferences
-- Migration: 004_add_users_table.sql
-- Idempotent: safe when users already exists (e.g. from later migration that dropped shop_domain).

-- Users table (stores user profile, account, and preferences)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain VARCHAR(255) NOT NULL UNIQUE,
    profile JSONB DEFAULT '{}',
    account JSONB DEFAULT '{}',
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for shop_domain lookups (only if column exists; later migrations may drop shop_domain)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'shop_domain'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_users_shop_domain ON users(shop_domain);
  END IF;
END $$;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

