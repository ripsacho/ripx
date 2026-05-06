const fs = require('fs');
const path = require('path');

describe('database first-wave migration', () => {
  const migrationPath = path.join(
    __dirname,
    '../../migrations/055_database_first_wave_improvements.sql'
  );

  it('keeps indexes aligned with optimized event query predicates', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('e.shop_domain = ta.shop_domain');
    expect(sql).toContain('WITH scoped_rows AS');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('COUNT(DISTINCT visitor_user_id) AS visitors');
    expect(sql).not.toContain('OR e.id IS NOT NULL');
    expect(sql).toContain('DROP INDEX IF EXISTS idx_events_analytics');
    expect(sql).toContain('idx_events_custom_metrics_lookup');
    expect(sql).toContain("WHERE event_type = 'custom' AND event_name IS NOT NULL");
    expect(sql).toContain('idx_events_conversion_order_dedup');
    expect(sql).toContain("WHERE event_type = 'conversion' AND metadata ? 'order_id'");
  });

  it('adds a follow-up aggregate_daily_analytics fix for migrated databases', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/067_fix_aggregate_daily_analytics_window.sql'),
      'utf8'
    );

    expect(sql).toContain('CREATE OR REPLACE FUNCTION aggregate_daily_analytics()');
    expect(sql).toContain('WITH scoped_rows AS');
    expect(sql).toContain('UNION ALL');
    expect(sql).toContain('COUNT(DISTINCT visitor_user_id) AS visitors');
    expect(sql).toContain("WHERE e.event_type = 'conversion'");
    expect(sql).toContain('AND e.created_at >= target_start');
    expect(sql).toContain('AND e.created_at < target_end');
    expect(sql).not.toContain('OR e.id IS NOT NULL');
  });

  it('adds a follow-up unique index for race-safe conversion dedupe', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/057_race_safe_conversion_dedupe.sql'),
      'utf8'
    );

    expect(sql).toContain('DROP INDEX IF EXISTS idx_events_conversion_order_dedup');
    expect(sql).toContain('WITH duplicate_order_conversions AS');
    expect(sql).toContain('DELETE FROM events e');
    expect(sql).toContain('ORDER BY event_value DESC, created_at ASC, id ASC');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_events_conversion_order_unique');
    expect(sql).toContain("ON events (test_id, user_id, (metadata->>'order_id'))");
    expect(sql).toContain(
      "WHERE event_type = 'conversion' AND metadata ? 'order_id' AND metadata->>'order_id' <> ''"
    );
  });

  it('adds goal metric event rollups for catalog reads', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/058_goal_metric_event_rollups.sql'),
      'utf8'
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS goal_metric_event_rollups');
    expect(sql).toContain('PRIMARY KEY (shop_domain, event_name, test_id)');
    expect(sql).toContain('idx_goal_metric_event_rollups_shop_event');
    expect(sql).toContain(
      'ALTER TABLE goal_metric_event_rollups ADD COLUMN IF NOT EXISTS tenant_id UUID'
    );
    expect(sql).toContain('idx_goal_metric_event_rollups_tenant_event');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS goal_metric_event_daily_rollups');
    expect(sql).toContain('PRIMARY KEY (event_date, shop_domain, event_name, test_id)');
    expect(sql).toContain(
      'ALTER TABLE goal_metric_event_daily_rollups ADD COLUMN IF NOT EXISTS tenant_id UUID'
    );
    expect(sql).toContain('idx_goal_metric_event_daily_rollups_shop_event_date');
    expect(sql).toContain('idx_goal_metric_event_daily_rollups_tenant_event_date');
    expect(sql).toContain('INSERT INTO goal_metric_event_rollups');
    expect(sql).toContain('INSERT INTO goal_metric_event_daily_rollups');
    expect(sql).toContain('FROM events e');
    expect(sql).toContain('WHERE e.event_name IS NOT NULL');
    expect(sql).toContain(
      'GROUP BY e.tenant_id, LOWER(TRIM(e.shop_domain)), LEFT(BTRIM(e.event_name), 100), e.test_id'
    );
    expect(sql).toContain(
      'GROUP BY e.created_at::date, e.tenant_id, LOWER(TRIM(e.shop_domain)), LEFT(BTRIM(e.event_name), 100), e.test_id'
    );
    expect(sql).toContain('ON CONFLICT (shop_domain, event_name, test_id)');
    expect(sql).toContain('ON CONFLICT (event_date, shop_domain, event_name, test_id)');
    expect(sql).toContain('tenant_id = COALESCE(EXCLUDED.tenant_id');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION ripx_increment_goal_metric_event_rollups()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION refresh_goal_metric_event_rollups');
    expect(sql).toContain('LOWER(TRIM(NEW.shop_domain))');
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_events_goal_metric_rollups ON events');
    expect(sql).toContain('AFTER INSERT ON events');
    expect(sql).toContain('EXECUTE FUNCTION ripx_increment_goal_metric_event_rollups()');
  });

  it('adds non-disruptive event partition readiness indexes', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/059_event_partition_readiness.sql'),
      'utf8'
    );

    expect(sql).toContain('idx_events_created_id');
    expect(sql).toContain('idx_events_tenant_created_id');
    expect(sql).toContain('idx_events_shop_created_id');
    expect(sql).toContain('idx_heatmap_events_created_id');
    expect(sql).toContain('idx_heatmap_events_tenant_created_id');
    expect(sql).toContain('idx_heatmap_events_shop_created_id');
    expect(sql).toContain('future created_at range partitioning');
  });

  it('adds shadow partition tables without cutting over live event writes', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/060_event_partition_shadow_tables.sql'),
      'utf8'
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS events_partitioned');
    expect(sql).toContain('PARTITION BY RANGE (created_at)');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS events_partitioned_default');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS heatmap_events_partitioned');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS heatmap_events_partitioned_default');
    expect(sql).toContain('PRIMARY KEY (id, created_at)');
    expect(sql).toContain('idx_events_partitioned_custom_metrics_lookup');
    expect(sql).toContain('idx_events_partitioned_conversion_order_lookup');
    expect(sql).toContain('not a global unique constraint');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION set_events_partitioned_tenant_id()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION set_heatmap_events_partitioned_tenant_id()');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION ripx_create_monthly_event_partitions');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF events_partitioned FOR VALUES'
    );
    expect(sql).toContain("'events_partitioned_' || partition_suffix");
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF heatmap_events_partitioned FOR VALUES'
    );
    expect(sql).toContain("'heatmap_events_partitioned_' || partition_suffix");
    expect(sql).toContain('SELECT ripx_create_monthly_event_partitions');
    expect(sql).not.toContain('ALTER TABLE events RENAME');
    expect(sql).not.toContain('DROP TABLE events');
  });

  it('adds heatmap daily rollups and retention helpers', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/062_heatmap_daily_rollups_retention.sql'),
      'utf8'
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS heatmap_event_daily_rollups');
    expect(sql).toContain('idx_heatmap_daily_rollups_unique');
    expect(sql).toContain('event_date');
    expect(sql).toContain('page_key');
    expect(sql).toContain('COALESCE(device');
    expect(sql).toContain('LOWER(TRIM(he.shop_domain)) AS shop_domain');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION refresh_heatmap_event_daily_rollups');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION prune_heatmap_events_older_than');
    expect(sql).toContain('retention_days must be at least 30');
  });

  it('adds segmented analytics daily rollups for scoped time-series reads', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../migrations/063_segmented_analytics_daily_rollups.sql'),
      'utf8'
    );

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS analytics_daily_segments');
    expect(sql).toContain('idx_analytics_daily_segments_unique');
    expect(sql).toContain('device VARCHAR(32)');
    expect(sql).toContain('country VARCHAR(8)');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION refresh_analytics_daily_segments');
    expect(sql).toContain('LOWER(TRIM(ta.shop_domain))');
    expect(sql).toContain('WITH scoped_rows AS');
    expect(sql).toContain("(ta.assigned_at AT TIME ZONE 'UTC')::date = target_date");
    expect(sql).not.toContain('OR e.id IS NOT NULL');
  });
});
