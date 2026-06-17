-- Goal metric event rollups:
-- Keep all-time named-event counts compact for Goals & Metrics catalog reads.

CREATE TABLE IF NOT EXISTS goal_metric_event_rollups (
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  shop_domain VARCHAR(255) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  test_id UUID NOT NULL,
  event_count BIGINT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (tenant_id, shop_domain, event_name, test_id)
);

ALTER TABLE goal_metric_event_rollups ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE goal_metric_event_rollups
  ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
UPDATE goal_metric_event_rollups
SET tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE tenant_id IS NULL;
ALTER TABLE goal_metric_event_rollups
  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE goal_metric_event_rollups
  DROP CONSTRAINT IF EXISTS goal_metric_event_rollups_pkey;
ALTER TABLE goal_metric_event_rollups
  ADD CONSTRAINT goal_metric_event_rollups_pkey
  PRIMARY KEY (tenant_id, shop_domain, event_name, test_id);

CREATE INDEX IF NOT EXISTS idx_goal_metric_event_rollups_shop_event
  ON goal_metric_event_rollups (shop_domain, event_name);

CREATE INDEX IF NOT EXISTS idx_goal_metric_event_rollups_tenant_event
  ON goal_metric_event_rollups (tenant_id, event_name)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goal_metric_event_rollups_test
  ON goal_metric_event_rollups (test_id);

CREATE TABLE IF NOT EXISTS goal_metric_event_daily_rollups (
  event_date DATE NOT NULL,
  tenant_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  shop_domain VARCHAR(255) NOT NULL,
  event_name VARCHAR(100) NOT NULL,
  test_id UUID NOT NULL,
  event_count BIGINT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (event_date, tenant_id, shop_domain, event_name, test_id)
);

ALTER TABLE goal_metric_event_daily_rollups ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE goal_metric_event_daily_rollups
  ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
UPDATE goal_metric_event_daily_rollups
SET tenant_id = '00000000-0000-0000-0000-000000000000'::uuid
WHERE tenant_id IS NULL;
ALTER TABLE goal_metric_event_daily_rollups
  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE goal_metric_event_daily_rollups
  DROP CONSTRAINT IF EXISTS goal_metric_event_daily_rollups_pkey;
ALTER TABLE goal_metric_event_daily_rollups
  ADD CONSTRAINT goal_metric_event_daily_rollups_pkey
  PRIMARY KEY (event_date, tenant_id, shop_domain, event_name, test_id);

CREATE INDEX IF NOT EXISTS idx_goal_metric_event_daily_rollups_shop_event_date
  ON goal_metric_event_daily_rollups (shop_domain, event_name, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_goal_metric_event_daily_rollups_tenant_event_date
  ON goal_metric_event_daily_rollups (tenant_id, event_name, event_date DESC)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_goal_metric_event_daily_rollups_test_date
  ON goal_metric_event_daily_rollups (test_id, event_date DESC);

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
GROUP BY COALESCE(e.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(TRIM(e.shop_domain)), LEFT(BTRIM(e.event_name), 100), e.test_id
ON CONFLICT (tenant_id, shop_domain, event_name, test_id)
DO UPDATE SET
  event_count = EXCLUDED.event_count,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION ripx_increment_goal_metric_event_rollups()
RETURNS TRIGGER AS $$
DECLARE
  normalized_event_name VARCHAR(100);
  event_seen_at TIMESTAMP;
BEGIN
  normalized_event_name := LEFT(BTRIM(NEW.event_name), 100);
  IF normalized_event_name IS NULL OR normalized_event_name = '' THEN
    RETURN NEW;
  END IF;

  event_seen_at := COALESCE(NEW.created_at, NOW());

  INSERT INTO goal_metric_event_rollups (
    tenant_id,
    shop_domain,
    event_name,
    test_id,
    event_count,
    last_seen_at,
    updated_at
  )
  VALUES (COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(TRIM(NEW.shop_domain)), normalized_event_name, NEW.test_id, 1, event_seen_at, NOW())
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
  VALUES (event_seen_at::date, COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(TRIM(NEW.shop_domain)), normalized_event_name, NEW.test_id, 1, event_seen_at, NOW())
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

DROP TRIGGER IF EXISTS trg_events_goal_metric_rollups ON events;
CREATE TRIGGER trg_events_goal_metric_rollups
  AFTER INSERT ON events
  FOR EACH ROW
  EXECUTE FUNCTION ripx_increment_goal_metric_event_rollups();

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
GROUP BY e.created_at::date, COALESCE(e.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(TRIM(e.shop_domain)), LEFT(BTRIM(e.event_name), 100), e.test_id
ON CONFLICT (event_date, tenant_id, shop_domain, event_name, test_id)
DO UPDATE SET
  event_count = EXCLUDED.event_count,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = NOW();

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
  GROUP BY COALESCE(e.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(TRIM(e.shop_domain)), LEFT(BTRIM(e.event_name), 100), e.test_id;
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
  GROUP BY e.created_at::date, COALESCE(e.tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), LOWER(TRIM(e.shop_domain)), LEFT(BTRIM(e.event_name), 100), e.test_id;
  GET DIAGNOSTICS inserted_daily = ROW_COUNT;

  RETURN QUERY SELECT inserted_all_time, inserted_daily;
END;
$$ LANGUAGE plpgsql;
