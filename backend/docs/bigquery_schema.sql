-- BigQuery schema for RipX analytics export
-- Run these in your GCP BigQuery console to create tables if they don't exist.
-- Replace YOUR_PROJECT with GCP_PROJECT_ID and ripx_analytics with GCP_DATASET.
--
-- Source of truth in the app:
--   backend/src/services/warehouseExportSchemaService.js
-- Runtime schema endpoint:
--   GET /api/analytics/export/schema

-- Test assignments snapshot (full export only)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.assignments` (
  test_id STRING NOT NULL,
  variant_id STRING,
  user_id STRING,
  shop_domain STRING,
  assigned_at TIMESTAMP,
  device STRING,
  country STRING
)
PARTITION BY DATE(assigned_at)
CLUSTER BY shop_domain, test_id, variant_id;

-- Events table (incremental conversion, view, click, and custom events)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.events` (
  id STRING NOT NULL,
  test_id STRING,
  variant_id STRING,
  user_id STRING,
  shop_domain STRING,
  event_type STRING,
  event_name STRING,
  event_value FLOAT64,
  metadata STRING,
  created_at TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY shop_domain, test_id, variant_id, event_name;

-- Tests snapshot (full export only)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.tests` (
  id STRING NOT NULL,
  shop_domain STRING,
  name STRING,
  description STRING,
  type STRING,
  status STRING,
  goal STRING,
  variants STRING,
  holdout_percent FLOAT64,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
CLUSTER BY shop_domain, status, type;

-- Heatmap events (incremental clicks, scroll depth, full-page coordinates, and capture diagnostics)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.heatmap_events` (
  id STRING NOT NULL,
  tenant_id STRING,
  test_id STRING,
  variant_id STRING,
  shop_domain STRING,
  page_url STRING,
  page_key STRING,
  event_type STRING,
  x FLOAT64,
  y FLOAT64,
  scroll_depth FLOAT64,
  viewport_width INT64,
  viewport_height INT64,
  page_x FLOAT64,
  page_y FLOAT64,
  page_width INT64,
  page_height INT64,
  capture_version STRING,
  page_height_source STRING,
  scroll_container_detected BOOLEAN,
  device STRING,
  country STRING,
  created_at TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY shop_domain, test_id, page_key, event_type;

-- Guardrail metric summaries (full export only)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.guardrails` (
  test_id STRING NOT NULL,
  metric STRING,
  threshold FLOAT64,
  status STRING,
  evaluated_at TIMESTAMP
)
PARTITION BY DATE(evaluated_at)
CLUSTER BY test_id, status;

-- Derived funnel metrics (full export only)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.funnels` (
  test_id STRING NOT NULL,
  variant_id STRING,
  shop_domain STRING,
  funnel_mode STRING,
  step_id STRING,
  step_order INT64,
  users INT64,
  start_date DATE,
  end_date DATE,
  device STRING,
  country STRING,
  computed_at TIMESTAMP
)
PARTITION BY DATE(computed_at)
CLUSTER BY shop_domain, test_id, variant_id, funnel_mode;

-- Event health rollups (full export only)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.event_health` (
  test_id STRING NOT NULL,
  event_name STRING,
  role STRING,
  total_events INT64,
  unique_users INT64,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP
)
PARTITION BY DATE(last_seen)
CLUSTER BY test_id, event_name, role;

-- Heatmap daily rollups (full export only)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.heatmap_daily_rollups` (
  event_date DATE NOT NULL,
  shop_domain STRING,
  test_id STRING NOT NULL,
  variant_id STRING,
  page_key STRING,
  event_type STRING,
  device STRING,
  country STRING,
  event_count INT64,
  last_seen_at TIMESTAMP
)
PARTITION BY event_date
CLUSTER BY shop_domain, test_id, page_key, event_type;

-- Analytics daily segments (full export only)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.analytics_daily_segments` (
  date DATE NOT NULL,
  test_id STRING NOT NULL,
  shop_domain STRING,
  variant_id STRING,
  variant_name STRING,
  device STRING,
  country STRING,
  visitors INT64,
  conversions INT64,
  revenue FLOAT64
)
PARTITION BY date
CLUSTER BY shop_domain, test_id, variant_id, device;

-- Checkout diagnostics (reserved export table)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.checkout_diagnostics` (
  test_id STRING NOT NULL,
  variant_id STRING,
  diagnostic_code STRING,
  checkout_phase STRING,
  metadata STRING,
  created_at TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY test_id, variant_id, diagnostic_code;
