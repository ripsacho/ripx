-- Shop-level settings for AB testing configuration
CREATE TABLE IF NOT EXISTS shop_settings (
  shop_domain VARCHAR(255) PRIMARY KEY,
  min_sample_size INTEGER DEFAULT 100,
  confidence_level DECIMAL(3, 2) DEFAULT 0.95,
  auto_stop_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
