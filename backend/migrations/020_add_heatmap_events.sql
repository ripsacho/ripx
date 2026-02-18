-- Heatmap events: click and scroll tracking per test/variant
CREATE TABLE IF NOT EXISTS heatmap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  variant_id VARCHAR(255) NOT NULL,
  shop_domain VARCHAR(255) NOT NULL,
  page_url TEXT NOT NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('click', 'scroll')),
  x FLOAT,
  y FLOAT,
  scroll_depth FLOAT,
  viewport_width INT,
  viewport_height INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_heatmap_test_variant ON heatmap_events(test_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_heatmap_page ON heatmap_events(test_id, variant_id, page_url);
CREATE INDEX IF NOT EXISTS idx_heatmap_created ON heatmap_events(created_at);
