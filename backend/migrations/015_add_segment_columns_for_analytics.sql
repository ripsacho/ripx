-- Migration: 015_add_segment_columns_for_analytics.sql
-- Add device and country to test_assignments for segment breakdown in analytics

ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS device VARCHAR(50);
ALTER TABLE test_assignments ADD COLUMN IF NOT EXISTS country VARCHAR(10);

CREATE INDEX IF NOT EXISTS idx_test_assignments_device ON test_assignments(test_id, device);
CREATE INDEX IF NOT EXISTS idx_test_assignments_country ON test_assignments(test_id, country);
