-- Outbound webhooks, audit log, and shop settings for webhooks
-- Migration: 014_add_outbound_webhooks_and_audit.sql

-- Outbound webhooks (tenant config: URLs to notify on test complete/significance)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shop_settings') THEN
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS outbound_webhook_url TEXT;
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS outbound_webhook_events JSONB DEFAULT '["test_complete","significance"]'::jsonb;
  END IF;
END $$;

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  user_id VARCHAR(255),
  changes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_shop ON audit_log(shop_domain);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
