-- Fix tenant isolation for goal metric event rollups.
--
-- Migration 058 added tenant_id to these rollup tables, but the primary keys and
-- ON CONFLICT targets still used only shop_domain/event_name/test_id. That can
-- merge counts across tenants when the same shop domain and event/test tuple
-- exists under more than one tenant. Use a sentinel tenant id only for legacy
-- rows/events where tenant_id is genuinely unknown.

ALTER TABLE goal_metric_event_rollups ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE goal_metric_event_daily_rollups ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE goal_metric_event_rollups
  ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
ALTER TABLE goal_metric_event_daily_rollups
  ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;

UPDATE goal_metric_event_rollups
SET tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE tenant_id IS NULL;

UPDATE goal_metric_event_daily_rollups
SET tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE tenant_id IS NULL;

ALTER TABLE goal_metric_event_rollups
  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE goal_metric_event_daily_rollups
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE goal_metric_event_rollups
  DROP CONSTRAINT IF EXISTS goal_metric_event_rollups_pkey;
ALTER TABLE goal_metric_event_rollups
  ADD CONSTRAINT goal_metric_event_rollups_pkey
  PRIMARY KEY (tenant_id, shop_domain, event_name, test_id);

ALTER TABLE goal_metric_event_daily_rollups
  DROP CONSTRAINT IF EXISTS goal_metric_event_daily_rollups_pkey;
ALTER TABLE goal_metric_event_daily_rollups
  ADD CONSTRAINT goal_metric_event_daily_rollups_pkey
  PRIMARY KEY (event_date, tenant_id, shop_domain, event_name, test_id);

CREATE OR REPLACE FUNCTION ripx_increment_goal_metric_event_rollups()
RETURNS TRIGGER AS $$
DECLARE
  normalized_event_name VARCHAR(100);
  event_seen_at TIMESTAMP;
  event_tenant_id UUID;
BEGIN
  normalized_event_name := LEFT(BTRIM(NEW.event_name), 100);
  IF normalized_event_name IS NULL OR normalized_event_name = '' THEN
    RETURN NEW;
  END IF;

  event_seen_at := COALESCE(NEW.created_at, NOW());
  event_tenant_id := COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid);

  INSERT INTO goal_metric_event_rollups (
    tenant_id,
    shop_domain,
    event_name,
    test_id,
    event_count,
    last_seen_at,
    updated_at
  )
  VALUES (
    event_tenant_id,
    LOWER(TRIM(NEW.shop_domain)),
    normalized_event_name,
    NEW.test_id,
    1,
    event_seen_at,
    NOW()
  )
  ON CONFLICT (tenant_id, shop_domain, event_name, test_id)
  DO UPDATE SET
    event_count = goal_metric_event_rollups.event_count + 1,
    last_seen_at = GREATEST(
      COALESCE(goal_metric_event_rollups.last_seen_at, EXCLUDED.last_seen_at),
      EXCLUDED.last_seen_at
    ),
    updated_at = NOW();

  INSERT INTO goal_metric_event_daily_rollups (
    event_date,
    tenant_id,
    shop_domain,
    event_name,
    test_id,
    event_count,
    last_seen_at,
    updated_at
  )
  VALUES (
    event_seen_at::date,
    event_tenant_id,
    LOWER(TRIM(NEW.shop_domain)),
    normalized_event_name,
    NEW.test_id,
    1,
    event_seen_at,
    NOW()
  )
  ON CONFLICT (event_date, tenant_id, shop_domain, event_name, test_id)
  DO UPDATE SET
    event_count = goal_metric_event_daily_rollups.event_count + 1,
    last_seen_at = GREATEST(
      COALESCE(goal_metric_event_daily_rollups.last_seen_at, EXCLUDED.last_seen_at),
      EXCLUDED.last_seen_at
    ),
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_goal_metric_event_rollups(target_shop_domain TEXT DEFAULT NULL)
RETURNS TABLE(all_time_rows INTEGER, daily_rows INTEGER) AS $$
DECLARE
  normalized_shop_domain TEXT := NULLIF(LOWER(TRIM(target_shop_domain)), '');
  inserted_all_time INTEGER := 0;
  inserted_daily INTEGER := 0;
BEGIN
  IF normalized_shop_domain IS NULL THEN
    DELETE FROM goal_metric_event_rollups;
    DELETE FROM goal_metric_event_daily_rollups;
  ELSE
    DELETE FROM goal_metric_event_rollups
    WHERE shop_domain = normalized_shop_domain;
    DELETE FROM goal_metric_event_daily_rollups
    WHERE shop_domain = normalized_shop_domain;
  END IF;

  INSERT INTO goal_metric_event_rollups (
    tenant_id,
    shop_domain,
    event_name,
    test_id,
    event_count,
    last_seen_at,
    updated_at
  )
  SELECT
    COALESCE(e.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id,
    LOWER(TRIM(e.shop_domain)) AS shop_domain,
    LEFT(BTRIM(e.event_name), 100) AS event_name,
    e.test_id,
    COUNT(*)::bigint AS event_count,
    MAX(e.created_at) AS last_seen_at,
    NOW() AS updated_at
  FROM events e
  WHERE e.event_name IS NOT NULL
    AND BTRIM(e.event_name) <> ''
    AND COALESCE(TRIM(e.shop_domain), '') <> ''
    AND (normalized_shop_domain IS NULL OR LOWER(TRIM(e.shop_domain)) = normalized_shop_domain)
  GROUP BY
    COALESCE(e.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    LOWER(TRIM(e.shop_domain)),
    LEFT(BTRIM(e.event_name), 100),
    e.test_id;
  GET DIAGNOSTICS inserted_all_time = ROW_COUNT;

  INSERT INTO goal_metric_event_daily_rollups (
    event_date,
    tenant_id,
    shop_domain,
    event_name,
    test_id,
    event_count,
    last_seen_at,
    updated_at
  )
  SELECT
    e.created_at::date AS event_date,
    COALESCE(e.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid) AS tenant_id,
    LOWER(TRIM(e.shop_domain)) AS shop_domain,
    LEFT(BTRIM(e.event_name), 100) AS event_name,
    e.test_id,
    COUNT(*)::bigint AS event_count,
    MAX(e.created_at) AS last_seen_at,
    NOW() AS updated_at
  FROM events e
  WHERE e.event_name IS NOT NULL
    AND BTRIM(e.event_name) <> ''
    AND COALESCE(TRIM(e.shop_domain), '') <> ''
    AND (normalized_shop_domain IS NULL OR LOWER(TRIM(e.shop_domain)) = normalized_shop_domain)
  GROUP BY
    e.created_at::date,
    COALESCE(e.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    LOWER(TRIM(e.shop_domain)),
    LEFT(BTRIM(e.event_name), 100),
    e.test_id;
  GET DIAGNOSTICS inserted_daily = ROW_COUNT;

  RETURN QUERY SELECT inserted_all_time, inserted_daily;
END;
$$ LANGUAGE plpgsql;

SELECT * FROM refresh_goal_metric_event_rollups(NULL);
