-- Fix analytics_daily.variant_id to match test_assignments
-- variant_id can be 'holdout' or custom IDs, not always UUID
ALTER TABLE analytics_daily
  ALTER COLUMN variant_id TYPE VARCHAR(255) USING variant_id::TEXT;
