-- Soft delete for support tickets (retention / GDPR). Optional job uses SUPPORT_TICKET_RETENTION_DAYS.
-- Migration: 049_support_tickets_deleted_at.sql
-- See docs/SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md §1.1 Retention and deletion

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_support_tickets_deleted_at
  ON support_tickets (deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN support_tickets.deleted_at IS 'Soft delete; set by retention job or manual anonymise. Queries should filter WHERE deleted_at IS NULL for active tickets.';
