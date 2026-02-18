-- Add segmentation and holdout fields to tests table
ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS segments JSONB,
  ADD COLUMN IF NOT EXISTS holdout_percent INTEGER;
