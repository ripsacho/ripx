-- Support ticket read states for customer/admin chat inbox indicators.
-- Migration: 056_support_ticket_read_states.sql

CREATE TABLE IF NOT EXISTS support_ticket_read_states (
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  audience VARCHAR(20) NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ticket_id, audience),
  CONSTRAINT chk_support_ticket_read_states_audience
    CHECK (audience IN ('user', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_read_states_audience
  ON support_ticket_read_states(audience, updated_at DESC);
