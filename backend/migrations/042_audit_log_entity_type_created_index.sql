-- Composite index for admin audit list: filter by entity_type + ORDER BY created_at DESC.
-- Migration: 042_audit_log_entity_type_created_index.sql

CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type_created
  ON audit_log (entity_type, created_at DESC);
