# Analytics Hardening Runbook

This runbook covers rollout steps for analytics migrations and rollup operations.

## Migration Order

Apply analytics migrations in order from `054` through `063`. Do not skip the shadow partition or rollup migrations because later dashboards and exports rely on those schemas being present.

## Pre-Deploy Checks

- Take a database backup or confirm point-in-time recovery before running `057_race_safe_conversion_dedupe.sql`, because it deletes duplicate conversion rows.
- Record `COUNT(*)` from `events`, duplicate conversion counts, and `heatmap_events` row counts before migration.
- Run migration SQL in staging and confirm the goal metric rollup trigger from `058_goal_metric_event_rollups.sql` does not materially increase event insert latency.

## Post-Deploy Rollups

- Run `POST /api/admin/aggregation/trigger` to refresh `analytics_daily` and `analytics_daily_segments`.
- Run `POST /api/admin/aggregation/heatmap-rollups` with `prune: false` first to populate `heatmap_event_daily_rollups`.
- Run `POST /api/admin/aggregation/goal-event-rollups` after any event dedupe, delete, or backfill maintenance so goal catalog counts match raw events.
- Use `prune: true` only after confirming heatmap rollups have non-zero rows for the intended retention window.

## Timezone Policy

Daily analytics buckets use UTC dates. Storefront-local reporting should be implemented as a separate feature with explicit shop timezone configuration rather than changing existing rollup semantics.

## Warehouse Validation

- Fetch `GET /api/analytics/export/schema` and confirm warehouse schema validation is `valid`.
- Confirm BigQuery destination tables include `analytics_daily_segments`, `heatmap_daily_rollups`, `event_health`, `funnels`, and `guardrails`.
- Run a full BigQuery export after rollup migrations so derived tables are populated before relying on warehouse dashboards.
- Confirm manifest fields match exporter fields before changing warehouse schemas.

## Monitoring

- Watch logs for segmented rollup refresh warnings after deployment.
- Investigate any funnel calculation warnings in decision exports before using promotion readiness as the source of truth.
- Watch BigQuery optional export warnings for missing rollup tables; those warnings should clear after migrations and full rollup refreshes complete.
