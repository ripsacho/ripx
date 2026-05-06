-- Event partition shadow tables:
-- Creates partitioned table shapes and monthly partition helpers without changing
-- live writes. Cutover must remain explicit because global unique constraints on
-- partitioned tables require the partition key.

CREATE TABLE IF NOT EXISTS events_partitioned (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  variant_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  shop_domain VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_value DECIMAL(10, 2) DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  event_name VARCHAR(100),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS events_partitioned_default
  PARTITION OF events_partitioned DEFAULT;

CREATE INDEX IF NOT EXISTS idx_events_partitioned_test_id
  ON events_partitioned (test_id);

CREATE INDEX IF NOT EXISTS idx_events_partitioned_variant_id
  ON events_partitioned (variant_id);

CREATE INDEX IF NOT EXISTS idx_events_partitioned_user_shop
  ON events_partitioned (user_id, shop_domain);

CREATE INDEX IF NOT EXISTS idx_events_partitioned_type
  ON events_partitioned (event_type);

CREATE INDEX IF NOT EXISTS idx_events_partitioned_created_id
  ON events_partitioned (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_events_partitioned_tenant_created_id
  ON events_partitioned (tenant_id, created_at DESC, id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_partitioned_shop_created_id
  ON events_partitioned (shop_domain, created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_events_partitioned_shop_event_created
  ON events_partitioned (shop_domain, event_name, created_at DESC)
  WHERE event_name IS NOT NULL AND event_name <> '';

CREATE INDEX IF NOT EXISTS idx_events_partitioned_custom_metrics_lookup
  ON events_partitioned (test_id, shop_domain, event_name, variant_id, user_id)
  WHERE event_type = 'custom' AND event_name IS NOT NULL AND event_name <> '';

CREATE INDEX IF NOT EXISTS idx_events_partitioned_conversion_order_lookup
  ON events_partitioned (test_id, user_id, (metadata->>'order_id'), created_at)
  WHERE event_type = 'conversion' AND metadata ? 'order_id' AND metadata->>'order_id' <> '';

COMMENT ON TABLE events_partitioned IS
  'Shadow partitioned copy target for events. Not used by live writes until an explicit cutover/backfill is performed.';

COMMENT ON INDEX idx_events_partitioned_conversion_order_lookup IS
  'Lookup-only shadow index. It is not a global unique constraint because PostgreSQL partitioned unique indexes must include created_at.';

CREATE OR REPLACE FUNCTION set_events_partitioned_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM tests WHERE id = NEW.test_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_events_partitioned_tenant_id ON events_partitioned;
CREATE TRIGGER trigger_events_partitioned_tenant_id
  BEFORE INSERT ON events_partitioned
  FOR EACH ROW EXECUTE FUNCTION set_events_partitioned_tenant_id();

CREATE TABLE IF NOT EXISTS heatmap_events_partitioned (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  variant_id VARCHAR(255) NOT NULL,
  shop_domain VARCHAR(255) NOT NULL,
  page_url TEXT NOT NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('click', 'scroll')),
  x FLOAT,
  y FLOAT,
  scroll_depth FLOAT,
  viewport_width INT,
  viewport_height INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS heatmap_events_partitioned_default
  PARTITION OF heatmap_events_partitioned DEFAULT;

CREATE INDEX IF NOT EXISTS idx_heatmap_partitioned_test_variant
  ON heatmap_events_partitioned (test_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_heatmap_partitioned_page
  ON heatmap_events_partitioned (test_id, variant_id, page_url);

CREATE INDEX IF NOT EXISTS idx_heatmap_partitioned_created_id
  ON heatmap_events_partitioned (created_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_heatmap_partitioned_tenant_created_id
  ON heatmap_events_partitioned (tenant_id, created_at DESC, id)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_heatmap_partitioned_shop_created_id
  ON heatmap_events_partitioned (shop_domain, created_at DESC, id);

COMMENT ON TABLE heatmap_events_partitioned IS
  'Shadow partitioned copy target for heatmap_events. Not used by live writes until an explicit cutover/backfill is performed.';

CREATE OR REPLACE FUNCTION set_heatmap_events_partitioned_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM tests WHERE id = NEW.test_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_heatmap_events_partitioned_tenant_id ON heatmap_events_partitioned;
CREATE TRIGGER trigger_heatmap_events_partitioned_tenant_id
  BEFORE INSERT ON heatmap_events_partitioned
  FOR EACH ROW EXECUTE FUNCTION set_heatmap_events_partitioned_tenant_id();

CREATE OR REPLACE FUNCTION ripx_create_monthly_event_partitions(
  start_month DATE DEFAULT date_trunc('month', NOW())::date,
  months_ahead INTEGER DEFAULT 6
)
RETURNS VOID AS $$
DECLARE
  partition_start DATE;
  partition_end DATE;
  partition_suffix TEXT;
BEGIN
  IF months_ahead < 0 OR months_ahead > 60 THEN
    RAISE EXCEPTION 'months_ahead must be between 0 and 60';
  END IF;

  FOR month_offset IN 0..months_ahead LOOP
    partition_start := (date_trunc('month', start_month)::date + (month_offset || ' months')::interval)::date;
    partition_end := (partition_start + interval '1 month')::date;
    partition_suffix := to_char(partition_start, 'YYYY_MM');

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF events_partitioned FOR VALUES FROM (%L) TO (%L)',
      'events_partitioned_' || partition_suffix,
      partition_start,
      partition_end
    );

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF heatmap_events_partitioned FOR VALUES FROM (%L) TO (%L)',
      'heatmap_events_partitioned_' || partition_suffix,
      partition_start,
      partition_end
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

SELECT ripx_create_monthly_event_partitions(date_trunc('month', NOW())::date, 6);
