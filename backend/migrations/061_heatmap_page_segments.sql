-- Add normalized page identity and lightweight segment fields for heatmap reporting.
-- page_key groups the same page across host/query/hash variations while preserving raw page_url.

ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS page_key TEXT;
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS device VARCHAR(32);
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS country VARCHAR(8);

UPDATE heatmap_events
SET page_key = COALESCE(
  NULLIF(regexp_replace(
    regexp_replace(split_part(split_part(page_url, '#', 1), '?', 1), '^https?://[^/]+', ''),
    '/+$',
    ''
  ), ''),
  '/'
)
WHERE page_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_heatmap_page_key
  ON heatmap_events(test_id, variant_id, page_key);

CREATE INDEX IF NOT EXISTS idx_heatmap_segments
  ON heatmap_events(test_id, device, country, created_at DESC)
  WHERE device IS NOT NULL OR country IS NOT NULL;

COMMENT ON COLUMN heatmap_events.page_key IS 'Normalized page path for heatmap reporting; raw page_url is preserved for debugging and screenshot lookup.';
COMMENT ON COLUMN heatmap_events.device IS 'Client-reported device type at heatmap capture time.';
COMMENT ON COLUMN heatmap_events.country IS 'Client-reported country code when available from storefront context.';
