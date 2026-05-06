-- Add document-level coordinates for full-page heatmap overlays.
-- Existing x/y viewport percentages are kept for legacy reports and fallback rendering.

ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS page_x DOUBLE PRECISION;
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS page_y DOUBLE PRECISION;
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS page_width INT;
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS page_height INT;

ALTER TABLE heatmap_events_partitioned ADD COLUMN IF NOT EXISTS page_x DOUBLE PRECISION;
ALTER TABLE heatmap_events_partitioned ADD COLUMN IF NOT EXISTS page_y DOUBLE PRECISION;
ALTER TABLE heatmap_events_partitioned ADD COLUMN IF NOT EXISTS page_width INT;
ALTER TABLE heatmap_events_partitioned ADD COLUMN IF NOT EXISTS page_height INT;
ALTER TABLE heatmap_events_partitioned ADD COLUMN IF NOT EXISTS page_key TEXT;

CREATE INDEX IF NOT EXISTS idx_heatmap_full_page_overlay
  ON heatmap_events (test_id, shop_domain, page_key, created_at DESC)
  WHERE page_x IS NOT NULL
    AND page_y IS NOT NULL
    AND page_width > 0
    AND page_height > 0;

CREATE INDEX IF NOT EXISTS idx_heatmap_partitioned_full_page_overlay
  ON heatmap_events_partitioned (test_id, shop_domain, page_key, created_at DESC)
  WHERE page_x IS NOT NULL
    AND page_y IS NOT NULL
    AND page_width > 0
    AND page_height > 0;

COMMENT ON COLUMN heatmap_events.page_x IS 'Document-level click x coordinate in CSS pixels.';
COMMENT ON COLUMN heatmap_events.page_y IS 'Document-level click y coordinate in CSS pixels.';
COMMENT ON COLUMN heatmap_events.page_width IS 'Full document width in CSS pixels at heatmap capture time.';
COMMENT ON COLUMN heatmap_events.page_height IS 'Full document height in CSS pixels at heatmap capture time.';
COMMENT ON COLUMN heatmap_events_partitioned.page_key IS 'Normalized page path for heatmap reporting in the shadow partitioned table.';
