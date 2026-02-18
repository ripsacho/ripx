-- Migration: 018_add_target_ids_and_custom_rules.sql
-- Multiple targets (target_ids array) and custom targeting rules

-- target_ids: JSONB array of IDs for multi-target tests (e.g. multiple products)
-- When set, test runs on any matching target (target_id kept for backward compat)
ALTER TABLE tests ADD COLUMN IF NOT EXISTS target_ids JSONB;

-- custom_rules in segments: stored in segments JSONB, no schema change needed
-- Format: segments.custom_rules = [{ field, operator, value }, ...]
-- Supports: url, referrer, device, country, traffic_source, utm_source, utm_medium
