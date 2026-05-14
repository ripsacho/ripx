-- Shop-level price surface selector registry (PDP / PLP / cart roles).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'shop_settings') THEN
    ALTER TABLE shop_settings
      ADD COLUMN IF NOT EXISTS price_surface_mappings JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
