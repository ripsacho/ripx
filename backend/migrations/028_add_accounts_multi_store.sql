-- Multi-store: accounts table for grouping multiple websites under one API key
-- Migration: 028_add_accounts_multi_store.sql

-- Accounts: one API key can manage multiple stores (tenants)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) DEFAULT 'My Account',
  api_key_hash VARCHAR(64),
  api_key_prefix VARCHAR(12),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_api_key_prefix ON accounts(api_key_prefix);

-- Add account_id to tenants (nullable for backward compat)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tenants_account_id ON tenants(account_id);

-- Trigger for accounts updated_at (function exists from earlier migrations)
DROP TRIGGER IF EXISTS update_accounts_updated_at ON accounts;
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
