-- Race-safe conversion dedupe:
-- Enforce one conversion per test/user/order_id at the database level so
-- concurrent storefront + webhook writes cannot pass a SELECT-then-INSERT race.

DROP INDEX IF EXISTS idx_events_conversion_order_dedup;

WITH duplicate_order_conversions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY test_id, user_id, metadata->>'order_id'
      ORDER BY event_value DESC, created_at ASC, id ASC
    ) AS row_number
  FROM events
  WHERE event_type = 'conversion'
    AND metadata ? 'order_id'
    AND metadata->>'order_id' <> ''
)
DELETE FROM events e
USING duplicate_order_conversions duplicates
WHERE e.id = duplicates.id
  AND duplicates.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_conversion_order_unique
  ON events (test_id, user_id, (metadata->>'order_id'))
  WHERE event_type = 'conversion' AND metadata ? 'order_id' AND metadata->>'order_id' <> '';
