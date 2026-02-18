-- Add personalization and rollout columns for applying winning variant when test completes
-- When a test wins, merchants can: 1) Personalize (apply winner to 100%) or 2) Rollout (gradual % increase)

ALTER TABLE tests
  ADD COLUMN IF NOT EXISTS winner_variant_index INTEGER,
  ADD COLUMN IF NOT EXISTS winner_variant_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS personalization_mode VARCHAR(50) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS rollout_percent DECIMAL(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rollout_schedule JSONB,
  ADD COLUMN IF NOT EXISTS rollout_started_at TIMESTAMP;

COMMENT ON COLUMN tests.winner_variant_index IS 'Index of winning variant (0-based) when test completed with significance';
COMMENT ON COLUMN tests.winner_variant_id IS 'ID of winning variant for quick lookup';
COMMENT ON COLUMN tests.personalization_mode IS 'none | personalized | rollout - whether to serve winner after test stops';
COMMENT ON COLUMN tests.rollout_percent IS 'Current rollout percentage (0-100) when personalization_mode=rollout';
COMMENT ON COLUMN tests.rollout_schedule IS 'Optional schedule: [{day: 0, percent: 25}, {day: 3, percent: 50}, {day: 7, percent: 100}]';
COMMENT ON COLUMN tests.rollout_started_at IS 'When rollout started for schedule calculation';
