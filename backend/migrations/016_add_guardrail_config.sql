-- Migration: 016_add_guardrail_config.sql
-- Add guardrail config for auto-stop when conversion drops

ALTER TABLE tests ADD COLUMN IF NOT EXISTS guardrail_config JSONB;

-- Example: { "enabled": true, "minDropPercent": 10 }
-- Auto-stops when any variant's conversion rate drops more than minDropPercent from control
