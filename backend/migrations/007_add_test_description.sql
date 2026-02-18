-- Add description column to tests table
ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS description TEXT;
