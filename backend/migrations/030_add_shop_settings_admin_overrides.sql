-- Admin overrides for shop settings (Phase 2). When set, app settings API returns these instead of merchant values.
-- Migration: 030_add_shop_settings_admin_overrides.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shop_settings') THEN
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS overridden_by_admin_min_sample_size INTEGER;
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS overridden_by_admin_confidence_level DECIMAL(3, 2);
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS overridden_by_admin_auto_stop_enabled BOOLEAN;
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS overridden_by_admin_webhook_url TEXT;
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS overridden_by_admin_webhook_events JSONB;
  END IF;
END $$;
