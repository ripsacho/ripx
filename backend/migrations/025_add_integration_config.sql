-- Integration config stored per shop (GA4, BigQuery) - alternative to .env
-- Secrets stored in DB; consider encrypting in production.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shop_settings') THEN
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS ga4_measurement_id TEXT;
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS ga4_api_secret TEXT;
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS bigquery_project_id TEXT;
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS bigquery_dataset TEXT DEFAULT 'ripx_analytics';
    ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS bigquery_credentials TEXT;
  END IF;
END $$;
