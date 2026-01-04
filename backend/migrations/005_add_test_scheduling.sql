-- Add Test Scheduling Columns
-- Migration: 005_add_test_scheduling.sql

-- Add scheduling columns to tests table
ALTER TABLE tests 
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS scheduled_stop_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS auto_start BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_stop BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';

-- Index for scheduled tests lookup
CREATE INDEX IF NOT EXISTS idx_tests_scheduled_start ON tests(scheduled_start_at) 
  WHERE scheduled_start_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tests_scheduled_stop ON tests(scheduled_stop_at) 
  WHERE scheduled_stop_at IS NOT NULL;

-- Comments
COMMENT ON COLUMN tests.scheduled_start_at IS 'When to automatically start the test';
COMMENT ON COLUMN tests.scheduled_stop_at IS 'When to automatically stop the test';
COMMENT ON COLUMN tests.auto_start IS 'Enable automatic start at scheduled time';
COMMENT ON COLUMN tests.auto_stop IS 'Enable automatic stop at scheduled time';
COMMENT ON COLUMN tests.timezone IS 'Timezone for scheduled times';

