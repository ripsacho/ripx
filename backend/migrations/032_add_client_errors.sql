-- Storefront client error reports for admin visibility (Phase 4 §2.16)
-- Migration: 032_add_client_errors.sql

CREATE TABLE IF NOT EXISTS client_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL,
  error_message TEXT NOT NULL,
  stack TEXT,
  component_stack TEXT,
  url TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_errors_shop_domain ON client_errors(shop_domain);
CREATE INDEX IF NOT EXISTS idx_client_errors_created_at ON client_errors(created_at DESC);
