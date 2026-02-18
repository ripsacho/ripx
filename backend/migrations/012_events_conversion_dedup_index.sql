-- Index for conversion deduplication check (order_id in metadata)
CREATE INDEX IF NOT EXISTS idx_events_conversion_dedup
  ON events (test_id, user_id)
  WHERE event_type = 'conversion';
