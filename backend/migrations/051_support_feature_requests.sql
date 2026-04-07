-- Feature request board + voting (support feedback loop)
-- Migration: 051_support_feature_requests.sql

CREATE TABLE IF NOT EXISTS support_feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  shop_domain VARCHAR(255),
  email VARCHAR(255),
  title VARCHAR(180) NOT NULL,
  details TEXT,
  status VARCHAR(50) DEFAULT 'open',
  vote_count INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_feature_requests_status
  ON support_feature_requests (status);
CREATE INDEX IF NOT EXISTS idx_support_feature_requests_vote_count
  ON support_feature_requests (vote_count DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_feature_requests_tenant_id
  ON support_feature_requests (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_feature_requests_shop_domain
  ON support_feature_requests (LOWER(shop_domain)) WHERE shop_domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_feature_request_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES support_feature_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  voter_key VARCHAR(255) NOT NULL,
  value SMALLINT NOT NULL DEFAULT 1 CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (request_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_support_feature_request_votes_request_id
  ON support_feature_request_votes (request_id);
CREATE INDEX IF NOT EXISTS idx_support_feature_request_votes_voter_key
  ON support_feature_request_votes (voter_key);

CREATE OR REPLACE FUNCTION update_support_feature_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_support_feature_requests_updated_at ON support_feature_requests;
CREATE TRIGGER trg_update_support_feature_requests_updated_at
  BEFORE UPDATE ON support_feature_requests
  FOR EACH ROW EXECUTE FUNCTION update_support_feature_requests_updated_at();

CREATE OR REPLACE FUNCTION update_support_feature_request_votes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_support_feature_request_votes_updated_at ON support_feature_request_votes;
CREATE TRIGGER trg_update_support_feature_request_votes_updated_at
  BEFORE UPDATE ON support_feature_request_votes
  FOR EACH ROW EXECUTE FUNCTION update_support_feature_request_votes_updated_at();
