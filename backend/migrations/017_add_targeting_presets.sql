-- Migration: 017_add_targeting_presets.sql
-- Saved targeting presets for reuse across tests

CREATE TABLE IF NOT EXISTS targeting_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  segments JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(shop_domain, name)
);

CREATE INDEX IF NOT EXISTS idx_targeting_presets_shop ON targeting_presets(shop_domain);
