-- Support status/changelog entries for public status page and incident communication
-- Migration: 052_support_changelog_entries.sql

CREATE TABLE IF NOT EXISTS support_changelog_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(180) NOT NULL,
  summary VARCHAR(500),
  body TEXT,
  level VARCHAR(50) DEFAULT 'info',
  visibility VARCHAR(50) DEFAULT 'draft',
  created_by VARCHAR(255),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_changelog_visibility
  ON support_changelog_entries (visibility);
CREATE INDEX IF NOT EXISTS idx_support_changelog_published_at
  ON support_changelog_entries (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_changelog_created_at
  ON support_changelog_entries (created_at DESC);

CREATE OR REPLACE FUNCTION update_support_changelog_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_support_changelog_entries_updated_at ON support_changelog_entries;
CREATE TRIGGER trg_update_support_changelog_entries_updated_at
  BEFORE UPDATE ON support_changelog_entries
  FOR EACH ROW EXECUTE FUNCTION update_support_changelog_entries_updated_at();
