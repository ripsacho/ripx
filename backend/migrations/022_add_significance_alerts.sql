-- Track significance alerts to avoid duplicate webhooks
CREATE TABLE IF NOT EXISTS significance_alerts (
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  shop_domain VARCHAR(255) NOT NULL,
  winner_variant_id VARCHAR(255),
  winner_variant_name VARCHAR(255),
  lift DECIMAL(10, 4),
  p_value DECIMAL(10, 6),
  alerted_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (test_id, shop_domain)
);

CREATE INDEX IF NOT EXISTS idx_significance_alerts_shop ON significance_alerts(shop_domain);
