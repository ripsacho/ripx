-- Shop sessions and webhook idempotency
-- Migration: 006_add_shop_sessions_and_webhook_events.sql

-- Shopify shop sessions (access tokens per shop)
CREATE TABLE IF NOT EXISTS shop_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  scope TEXT,
  installed_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_sessions_shop_domain ON shop_sessions(shop_domain);

-- Webhook idempotency tracking
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain VARCHAR(255) NOT NULL,
  webhook_id VARCHAR(255) NOT NULL,
  topic VARCHAR(255) NOT NULL,
  payload_hash VARCHAR(64),
  received_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(shop_domain, webhook_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_shop_topic ON webhook_events(shop_domain, topic);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);

-- Trigger for shop_sessions updated_at
DROP TRIGGER IF EXISTS update_shop_sessions_updated_at ON shop_sessions;
CREATE TRIGGER update_shop_sessions_updated_at BEFORE UPDATE ON shop_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
