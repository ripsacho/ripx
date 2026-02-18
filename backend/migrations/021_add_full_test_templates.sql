-- Full test templates: extend targeting_presets with goal and variants
-- When both are set, preset becomes a full test template (goal + variants + segments)

ALTER TABLE targeting_presets
  ADD COLUMN IF NOT EXISTS goal JSONB,
  ADD COLUMN IF NOT EXISTS variants JSONB;

COMMENT ON COLUMN targeting_presets.goal IS 'Optional goal config for full test templates';
COMMENT ON COLUMN targeting_presets.variants IS 'Optional variants for full test templates';
