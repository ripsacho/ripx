# Event Scalability for Advanced AB Testing

This document describes the current event schema, indexing strategy, and the path to scale events (partitioning, warehouse) as RipX grows.

## Current state (after migrations 040 and 041)

- **`events`** has:
  - `tenant_id` (FK to `tenants`) — backfilled from `tests.tenant_id`; new rows get it via trigger from `tests`.
  - Indexes: `idx_events_tenant_id`, `idx_events_tenant_created` (tenant + time) for tenant-scoped and time-scoped queries.
- **`test_assignments`** has `tenant_id` and `idx_test_assignments_tenant_id`, `idx_test_assignments_tenant_assigned`.
- **`audit_log`** has `tenant_id` (backfilled from `shop_domain`; new rows get it in app via `getTenantByDomain` in audit log service) and tenant + time indexes.
- **`heatmap_events`** has `tenant_id` (migration 041): backfilled from tests; trigger sets it on INSERT. Indexes: `idx_heatmap_events_tenant_id`, `idx_heatmap_events_tenant_created`.

Hot path (track/assignment/heatmap) stays on raw SQL with minimal, predictable queries. No ORM on the event path.

## Time-scoped and tenant-scoped queries

- **By tenant**: Use `WHERE tenant_id = $1` (and existing `shop_domain` filters where needed).
- **By time**: Use `WHERE created_at >= $1 AND created_at < $2`; `idx_events_tenant_created` and `idx_events_created_at` support these.
- **Analytics**: Existing joins (events + test_assignments) remain; `tenant_id` can be used for tenant isolation in admin/export.

## Future: partitioning (when event volume grows)

When `events` or `heatmap_events` grow large:

1. **Time-based partitioning (PostgreSQL 10+)**  
   Convert `events` to a partitioned table by range on `created_at` (e.g. monthly):
   - Create new partitioned table with same columns + partition key.
   - Migrate data in batches (e.g. by month).
   - Swap tables and update FKs/triggers; application INSERTs stay the same (Postgres routes to the correct partition).

2. **Composite (tenant + time)**  
   For strong tenant isolation and time-based retention, partition by `(tenant_id, created_at)` or use list partitions by `tenant_id` and sub-partition by time. Adds operational complexity; adopt only if multi-tenant query patterns justify it.

3. **Index strategy**  
   Keep global indexes minimal on the partitioned table; use local indexes per partition if needed. The existing `tenant_id` + `created_at` design aligns with partition pruning by time and tenant.

## Future: warehouse / stream

If Postgres is no longer the right store for raw events (e.g. billions of events, heavy analytics):

- **Batch export**: Nightly or hourly dump of `events` (and optionally `test_assignments`) to object storage (e.g. S3) or a data warehouse (BigQuery, Snowflake, Redshift). Use `tenant_id` and `created_at` for incremental exports.
- **Streaming**: Publish events to Kafka/Kinesis and consume into a columnar store or warehouse. Application would dual-write (Postgres for low-latency reads + stream for analytics) or write to stream only and sync metadata from Postgres.
- **Assignment service**: Keep assignment and test metadata in Postgres; only event ingestion and historical analytics move to the warehouse.

## Summary

| Today      | Action                                                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema     | `tenant_id` on `events`, `test_assignments`, `audit_log` (040), `heatmap_events` (041).                                                                                      |
| Indexes    | Tenant and tenant+time indexes; `audit_log` has `idx_audit_log_entity_type_created` (042) for entity_type + created_at list queries.                                         |
| Audit      | New audit log rows for tenant actions get `tenant_id` set in app; admin audit list/export support `tenant_id` filter (UUID-validated). List limit capped at 500, offset ≥ 0. |
| Hot path   | Unchanged; raw SQL, no ORM.                                                                                                                                                  |
| Next steps | When needed: partition `events` (and optionally `heatmap_events`) by `created_at`; add batch/stream to warehouse and document in this file.                                  |

## Migration and pool management

Migrations are tracked in `schema_migrations`; only new files are run. Pool size and timeouts are configurable via env. See **`docs/DATABASE_MANAGEMENT.md`** for running migrations, backfilling applied set, transactions, and health checks.

---

## Future schema: more tenant_id candidates

For full tenant normalization and possible RLS later, these tables could get `tenant_id` in a later migration (same pattern: add column, backfill from domain/tenants, optional trigger):

- `shop_settings` (keyed by shop_domain)
- `webhook_events`, `significance_alerts`, `notifications`, `client_errors` (all have shop_domain)
- `targeting_presets`, `promo_links` (shop_domain)

Lower priority than event/audit tables; add when you need tenant-scoped admin lists or RLS.
