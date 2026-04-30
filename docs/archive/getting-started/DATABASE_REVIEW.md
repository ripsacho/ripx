# RipX Database Model Review

## Executive Summary

The database schema is generally well-structured with good use of JSONB for flexible config, proper indexes, and cascade deletes. Several improvements and missing pieces were identified.

---

## Current Schema Overview

### Core Tables

| Table              | Purpose                                                      |
| ------------------ | ------------------------------------------------------------ |
| `tests`            | AB test definitions (config, variants, segments, scheduling) |
| `test_assignments` | User → variant assignment (cookie-based persistence)         |
| `events`           | Conversion/view/click events                                 |
| `analytics_daily`  | Pre-aggregated daily metrics per variant                     |
| `shop_sessions`    | Shopify access tokens per shop                               |
| `shop_settings`    | Shop-level AB test config (min sample, confidence)           |
| `users`            | Shop profile, account, preferences                           |
| `promo_links`      | Promo link tokens for offer tests                            |
| `notifications`    | In-app notifications                                         |
| `webhook_events`   | Webhook idempotency (deduplication)                          |

---

## Issues Found & Fixes Applied

### 1. **started_at / stopped_at never populated** ✅ FIXED

**Problem:** `updateTestStatus` only updated `status` and `updated_at`. The `started_at` and `stopped_at` columns existed but were never set.

**Impact:** Test health score, export, and analytics could not accurately report test duration.

**Fix:** Updated `updateTestStatus` in `models/test.js` to:

- Set `started_at = COALESCE(started_at, NOW())` when status → `running`
- Set `stopped_at = NOW()` when status → `stopped` or `completed`

### 2. **analytics_daily.variant_id type mismatch** ✅ FIXED

**Problem:** `analytics_daily.variant_id` was `UUID`, but `test_assignments.variant_id` is `VARCHAR` (holds `'holdout'` or custom IDs).

**Impact:** Time-series aggregation would fail when inserting holdout assignments.

**Fix:** Migration `010_fix_analytics_daily_variant_type.sql` changes `variant_id` to `VARCHAR(255)`.

### 3. **Conversion deduplication** ✅ FIXED

**Problem:** Storefront and webhook can both fire for the same order, causing double-counted conversions.

**Fix:** In `models/analytics.js` `trackEvent`, before insert, check for existing conversion with same `test_id`, `user_id`, and `metadata.order_id`. Skip if duplicate. Migration `012_events_conversion_dedup_index.sql` adds partial index for the check.

### 4. **promo_links free_shipping** ✅ FIXED

**Problem:** CHECK constraint only allowed `percentage` and `fixed`. Frontend offers `free_shipping`.

**Fix:** Migration `011_promo_links_free_shipping.sql` adds `free_shipping` to the constraint.

---

## Recommendations (Not Yet Implemented)

### High Priority

#### 1. **Event currency**

**Problem:** `event_value` (revenue) has no currency. Shopify multi-currency stores need this.

**Recommendation:**

```sql
ALTER TABLE events ADD COLUMN currency VARCHAR(3) DEFAULT 'USD';
```

#### 2. **test_assignments session context for debugging**

**Problem:** No device, traffic_source, or first-seen URL stored. Hard to debug targeting issues.

**Recommendation:** Add optional JSONB column:

```sql
ALTER TABLE test_assignments ADD COLUMN context JSONB;
-- Store: { device, traffic_source, current_url, session_count } when assigned
```

### Medium Priority

#### 3. **tests table: add archived status**

**Problem:** Status CHECK only allows `draft`, `running`, `stopped`, `completed`. No `archived` for soft-delete.

**Recommendation:** Add `archived` to CHECK constraint if you want archival.

#### 4. **Shop settings soft delete**

**Problem:** `shop_settings` has no `deleted_at`. When uninstalling, we might want to keep settings for reinstall.

**Recommendation:** Add `deleted_at TIMESTAMP` for soft delete.

### Low Priority

#### 5. **Partitioning for events**

**Problem:** `events` will grow large. Query performance may degrade.

**Recommendation:** Partition by `created_at` (monthly) for high-volume shops.

#### 6. **users table naming**

**Observation:** `users` is 1 row per shop (shop_domain UNIQUE). Consider renaming to `shop_profiles` for clarity.

---

## Data Flow Summary

| Data                | Source                                   | Storage                                       |
| ------------------- | ---------------------------------------- | --------------------------------------------- |
| Test config         | Frontend POST/PUT                        | `tests` (JSONB: goal, variants, segments)     |
| Assignments         | Storefront /track/variant                | `test_assignments`                            |
| Conversions         | Storefront /track, Webhook orders/create | `events`                                      |
| Daily metrics       | Cron / aggregate job                     | `analytics_daily`                             |
| Shop tokens         | OAuth flow                               | `shop_sessions`                               |
| User prefs          | Profile API                              | `users` (profile, account, preferences JSONB) |
| Promo links         | Promo link API                           | `promo_links`                                 |
| Webhook idempotency | Webhook handlers                         | `webhook_events`                              |

---

## Missing Data (Currently Not Stored)

1. **Conversion attribution** – Which touchpoint led to conversion (first touch, last touch) – not stored.
2. **A/B test results snapshot** – When a test is stopped, no snapshot of final metrics is stored; only raw events.
3. **API request logs** – No audit table for rate limits or abuse tracking.
4. **Storefront script version** – No tracking of which script version was used per assignment.
5. **Experiment run metadata** – No `created_by` or `modified_by` for tests (Shopify app is single-user per shop).

---

## Run New Migrations

```bash
npm run migrate
```

Migrations applied in order:

- `010_fix_analytics_daily_variant_type.sql` – variant_id type fix
- `011_promo_links_free_shipping.sql` – allow free_shipping discount type
- `012_events_conversion_dedup_index.sql` – index for deduplication check
