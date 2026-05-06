-- Store lightweight client capture diagnostics for heatmap quality reporting.

ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS capture_version VARCHAR(32);
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS page_height_source VARCHAR(32);
ALTER TABLE heatmap_events ADD COLUMN IF NOT EXISTS scroll_container_detected BOOLEAN;

ALTER TABLE heatmap_events_partitioned ADD COLUMN IF NOT EXISTS capture_version VARCHAR(32);
ALTER TABLE heatmap_events_partitioned ADD COLUMN IF NOT EXISTS page_height_source VARCHAR(32);
ALTER TABLE heatmap_events_partitioned ADD COLUMN IF NOT EXISTS scroll_container_detected BOOLEAN;

COMMENT ON COLUMN heatmap_events.capture_version IS 'Storefront heatmap capture contract version.';
COMMENT ON COLUMN heatmap_events.page_height_source IS 'Client-reported source used to determine full document height.';
COMMENT ON COLUMN heatmap_events.scroll_container_detected IS 'Whether the client detected a likely scrollable element container.';
