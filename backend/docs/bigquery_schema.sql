-- BigQuery schema for RipX analytics export
-- Run these in your GCP BigQuery console to create tables if they don't exist.
-- Replace YOUR_PROJECT with GCP_PROJECT_ID and ripx_analytics with GCP_DATASET.

-- Events table (conversion, view, click, custom events)
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
);

-- Heatmap events (clicks, scroll depth per test/variant)
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.ripx_analytics.heatmap_events` (
  id STRING NOT NULL,
  test_id STRING,
  variant_id STRING,
  shop_domain STRING,
  page_url STRING,
  event_type STRING,
  x FLOAT64,
  y FLOAT64,
  scroll_depth FLOAT64,
  viewport_width INT64,
  viewport_height INT64,
  created_at TIMESTAMP
);

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
);
