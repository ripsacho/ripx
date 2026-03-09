-- Allow 'archived' in tests.status so archiveProcessor can set status = 'archived'.
-- Constraint in 001_initial_schema.sql only allowed draft, running, stopped, completed.

ALTER TABLE tests DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE tests ADD CONSTRAINT valid_status CHECK (
  status IN ('draft', 'running', 'stopped', 'completed', 'archived')
);
