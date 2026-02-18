# RipX Integrations Guide

## Overview

This document covers event management, heatmap, funnel, GA4, and BigQuery integrations in RipX.

> **Tip:** Configure GA4 and BigQuery from the app at **Settings → Integrations**. See [Settings Guide](./guides/SETTINGS_GUIDE.md) for full configuration options.

---

## Event Management

### Current Approach

- **Events table**: `event_type`, `event_name`, `event_value`, `metadata`
- **Event types**: `conversion`, `view`, `click`, custom (via `event_name`)
- **Track API**: `POST /api/track` with `event_type`, `event_name`, `event_value`, `metadata`
- **Multi-goal**: Migration 019 adds `event_name` for custom events (e.g. `add_to_cart`, `newsletter_signup`)
- **Deduplication**: Index on `(test_id, variant_id, user_id, event_type, event_name)` for conversion dedup

### Best Practices

- Use `event_name` for custom goals (e.g. `add_to_cart`, `purchase`, `newsletter_signup`)
- Use `event_value` for revenue or numeric metrics
- Use `metadata` for extra context (e.g. `{ product_id, quantity }`)

### Future Enhancements (Optional)

- Event schema validation
- Event taxonomy / naming conventions
- Batch event ingestion API

---

## Heatmap

### Current Features

- **Click heatmap**: 10×10 grid of click density per page/variant
- **Scroll heatmap**: Scroll depth distribution (0–100%)
- **Storefront**: Sends click (x, y) and scroll (depth) via `POST /api/track/heatmap`
- **Filters**: Page URL, variant, date range
- **Data**: `heatmap_events` table with `test_id`, `variant_id`, `page_url`, `event_type`, `x`, `y`, `scroll_depth`

### Best Practices

- Heatmap data is captured automatically when the storefront script is loaded
- Use page URL filter to focus on specific pages (e.g. product, cart)
- Compare variants to see where users click/scroll differently

### BigQuery Export

Heatmap events are exported to BigQuery when configured. See BigQuery section below.

---

## Funnel

### Current Features

- **Custom funnel steps**: From test goal `funnel_steps` (e.g. Visitors → Add to Cart → Purchase)
- **Default steps**: Visitors, Add to Cart, Purchase
- **Segmentation**: Device, country filters
- **Compare mode**: Single variant vs compare variants
- **Metrics**: Conversion rate, drop-off per step

### Best Practices

- Define `funnel_steps` in test goal for custom funnels
- Use device/country filters for segment analysis

---

## GA4 (Google Analytics 4)

### Setup

1. In GA4: **Admin → Data Streams → Web stream → Measurement Protocol API secrets**
2. Create an API secret and copy the value
3. Add to `.env`:
   ```
   GA4_MEASUREMENT_ID=G-XXXXXXXXXX
   GA4_API_SECRET=your_measurement_protocol_api_secret
   ```

### What Gets Sent

- **Conversion events** → `purchase` (with value, currency)
- **Custom events** → Mapped by `event_name` (e.g. `add_to_cart`)
- **User properties** (for segmentation):
  - `ab_test_id` – test ID
  - `ab_variant_id` – variant ID
  - `ab_shop` – shop domain

### GA4 Reports

- Create custom dimensions in GA4 for `ab_test_id`, `ab_variant_id` to segment by A/B test
- Use Exploration reports to compare conversion by variant

---

## BigQuery

### Setup

1. Create a GCP project and enable BigQuery
2. Create a service account with BigQuery Data Editor role
3. Download JSON key and set path:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
   ```
4. Add to `.env`:
   ```
   GCP_PROJECT_ID=your-gcp-project
   GCP_DATASET=ripx_analytics
   ```
5. Create dataset and tables (see `backend/docs/bigquery_schema.sql`)

### Tables

| Table           | Export Type   | Description                          |
|----------------|---------------|--------------------------------------|
| `events`       | Incremental   | Conversion, view, click, custom events |
| `heatmap_events` | Incremental | Click and scroll heatmap data        |
| `tests`        | Full only     | Test snapshots (when `full=true`)    |

### Triggering Export

- **API**: `POST /api/analytics/bigquery/export` (incremental)
- **API**: `POST /api/analytics/bigquery/export?full=true` (includes tests)
- **Settings UI**: Settings → Integrations → Export to BigQuery
- **Cron**: Schedule `0 2 * * *` (daily at 2am) to call the API

### Schema

See `backend/docs/bigquery_schema.sql` for CREATE TABLE statements.

---

## Summary

| Feature        | Status   | Config / Notes                                      |
|----------------|----------|-----------------------------------------------------|
| Event management | ✅ Solid | Use `event_name` for custom events                  |
| Heatmap        | ✅ Solid | Auto-captured, exported to BigQuery                 |
| Funnel         | ✅ Solid | Custom steps from test goal                         |
| GA4            | ✅ Active | Set `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`          |
| BigQuery       | ✅ Active | Set `GCP_PROJECT_ID`, create tables, use Settings UI |
