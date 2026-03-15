-- Support tickets and related tables (Phase 1: tickets; Phase 2+: replies, canned, feedback)
-- Migration: 047_support_tickets.sql
-- See docs/CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md and docs/SUPPORT_UI_AND_ROLES_RESEARCH.md

-- support_tickets: optional user_id for logged-in users (RipX users.id is UUID)
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  category VARCHAR(100),
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,
  -- Phase 2+ columns (nullable for backfill)
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  shop_domain VARCHAR(255),
  first_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  assigned_to VARCHAR(255),
  priority VARCHAR(50) DEFAULT 'normal'
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant_id ON support_tickets(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_shop_domain ON support_tickets(LOWER(shop_domain)) WHERE shop_domain IS NOT NULL;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_tickets_updated_at();
