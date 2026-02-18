-- Multi-platform: tenants table for Shopify and standalone sites
-- Migration: 013_add_tenants_table.sql

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('shopify', 'standalone')),
  domain VARCHAR(255) NOT NULL UNIQUE,
  api_key_hash VARCHAR(64),
  api_key_prefix VARCHAR(12),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_domain ON tenants(domain);
CREATE INDEX IF NOT EXISTS idx_tenants_platform ON tenants(platform);
CREATE INDEX IF NOT EXISTS idx_tenants_api_key_prefix ON tenants(api_key_prefix);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_tenants_updated_at ON tenants;
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Backfill existing Shopify shops from shop_sessions
INSERT INTO tenants (platform, domain)
SELECT 'shopify', shop_domain FROM shop_sessions
ON CONFLICT (domain) DO NOTHING;
