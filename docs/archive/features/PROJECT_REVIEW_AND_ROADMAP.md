# RipX Project Review & Strategic Roadmap

**Comprehensive analysis: code improvements, new features, BigQuery, heatmaps, and multi-event goals**

---

## Part 1: Code & Architecture Improvements

### 1.1 High-Priority Code Improvements

| Area                    | Current State                                                               | Improvement                                                                           | Effort |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| **Goal structure**      | Single `goal.metric` (revenue/conversion_rate/aov)                          | Support `goal.metrics[]` array for multiple primary + secondary goals                 | Medium |
| **Custom events in UI** | `customMetricsService` exists but no UI to configure custom events per test | Add goal config step: primary + secondary events, custom event names                  | Medium |
| **Events table**        | `event_type` VARCHAR(50), no `event_name` for custom events                 | Add `event_name` column; keep `event_type` for system types (conversion, view, click) | Low    |
| **Analytics model**     | Only queries `event_type = 'conversion'`                                    | Extend to support multiple event types per test; aggregate by event_name              | Medium |
| **Storefront script**   | Only `trackConversion()` exposed                                            | Add `trackEvent(testId, eventName, value, metadata)` for custom events                | Low    |
| **Error handling**      | Some TODOs in webhookRoutes (product sync, cleanup)                         | Implement or document; add structured error codes                                     | Low    |
| **Test model**          | `goal` JSONB with single metric                                             | Extend schema for `goal.metrics[]` array                                              | Low    |

### 1.2 Architecture & Consistency

- **Database**: PostgreSQL is solid; consider adding `CHECK` constraints for `event_type` enum if you standardize event types.
- **API**: REST is consistent; consider adding OpenAPI/Swagger spec if not already complete.
- **Frontend**: Polaris + React is consistent; consider extracting repeated wizard logic into reusable hooks.
- **Storefront script**: IIFE pattern is good; no external deps. Consider adding `trackEvent` for custom events.

### 1.3 Security & Performance

- **Input validation**: Use `validators.js` consistently; add rate limiting on `/api/track` for abuse prevention.
- **Indexes**: `events` has good indexes; consider composite index `(test_id, variant_id, event_type)` for analytics queries.
- **Caching**: Variant assignments could be cached (Redis) for high-traffic stores.

---

## Part 2: New Features to Reach Top Tools

### 2.1 Must-Have (P0) – Competitive Parity

- **Multiple goals per test** – Primary + secondary metrics (e.g., revenue + add-to-cart rate)
- **Custom events** – Add-to-cart, signup, video play, form submit, etc.
- **Funnel analysis** – Multi-step conversion funnels
- **Auto-stop on significance** – Stop test when winner is statistically clear
- **Scheduled reports** – Email summaries

### 2.2 Should-Have (P1) – Differentiation

- **Heatmaps** – Click, scroll, move (see Part 4)
- **Session recordings** – Replay user sessions
- **BigQuery export** – Raw data for advanced analysis (see Part 3)
- **Visual editor** – No-code page builder
- **AI test ideas** – Hypothesis suggestions

### 2.3 Nice-to-Have (P2)

- **Cohort analysis**
- **Benchmark comparisons**
- **A/B/n with more than 4 variants**
- **Server-side testing**

---

## Part 3: BigQuery Implementation – All Options

### Option A: Direct BigQuery Export (Easiest)

**How it works**

- ETL job (cron/scheduler) reads from PostgreSQL and writes to BigQuery.
- Uses `@google-cloud/bigquery` Node SDK.
- Tables: `tests`, `events`, `test_assignments`, `analytics_daily`.

**Pros**

- Full control over schema and transformations
- No external dependencies beyond GCP
- Works with existing PostgreSQL

**Cons**

- Need to build and maintain ETL pipeline
- Incremental sync logic (delta loads) required
- GCP credentials and billing setup

**Difficulty**: Medium

**Implementation sketch**

```javascript
// backend/jobs/bigQueryExport.js
const { BigQuery } = require('@google-cloud/bigquery');
const { query } = require('../utils/database');

async function exportToBigQuery() {
  const bq = new BigQuery({ projectId: process.env.GCP_PROJECT_ID });
  const dataset = bq.dataset('ripx_analytics');

  // Stream events in batches
  const events = await query('SELECT * FROM events WHERE created_at > $1', [lastExport]);
  await dataset.table('events').insert(events.rows);
}
```

---

### Option B: BigQuery via Google Analytics 4 / Firebase

**How it works**

- Send events to GA4; enable BigQuery export in GA4/Firebase.
- RipX stores events in GA4; BigQuery gets raw GA4 data.

**Pros**

- No ETL pipeline; GA4 handles export
- Free BigQuery export for GA4
- GA4 UI for exploration

**Cons**

- Requires GA4 integration
- GA4 schema, not RipX schema
- Need to map RipX events to GA4 events
- Extra dependency (GA4)

**Difficulty**: Medium

---

### Option C: BigQuery as Primary Analytics Store

**How it works**

- Write events directly to BigQuery instead of (or in addition to) PostgreSQL.
- Use BigQuery for analytics queries; PostgreSQL for app config.

**Pros**

- No ETL; real-time data
- BigQuery handles scale
- SQL for analytics

**Cons**

- BigQuery writes cost
- Requires schema changes
- More complex architecture

**Difficulty**: High

---

### Option D: Third-Party ETL (Fivetran, Stitch, Airbyte)

**How it works**

- Use Fivetran or Airbyte to sync PostgreSQL → BigQuery.

**Pros**

- No custom ETL code
- Managed sync, incremental
- Supports many destinations

**Cons**

- Monthly cost
- Less control over transformations
- Another vendor

**Difficulty**: Low (setup only)

---

### Recommendation

- **Short term**: Option A (custom ETL) – full control, fits your stack.
- **Long term**: Option D (Airbyte) if you want to avoid maintaining ETL.

---

## Part 4: Heatmap Implementation – All Options

### Option A: Build In-House (Click + Scroll)

**How it works**

- Storefront script: capture `click` (x, y, element, page) and `scroll` events.
- Send to backend; aggregate by `(test_id, variant_id, page_url)`.
- Render heatmap overlay on canvas/SVG from aggregated data.

**Pros**

- Full control
- No third-party cost
- Integrates with variant assignment

**Cons**

- Need to build aggregation, storage, rendering
- Session recordings require more work (DOM + canvas recording)

**Difficulty**: Medium

**Data model**

```sql
CREATE TABLE heatmap_events (
  id UUID PRIMARY KEY,
  test_id UUID REFERENCES tests(id),
  variant_id VARCHAR(255),
  shop_domain VARCHAR(255),
  page_url TEXT,
  event_type VARCHAR(20), -- 'click', 'scroll', 'move'
  x FLOAT,
  y FLOAT,
  element_selector TEXT,
  viewport_width INT,
  viewport_height INT,
  created_at TIMESTAMP
);
```

---

### Option B: Integrate Hotjar / FullStory / Matomo

**How it works**

- Add Hotjar/FullStory snippet; optionally pass variant via `dataLayer` or custom attributes.
- Filter heatmaps by variant in their UI.

**Pros**

- Mature feature set
- Session replay, form analytics
- Fast to ship

**Cons**

- Per-site cost
- Data lives outside RipX
- Variant integration is manual

**Difficulty**: Low

---

### Option C: Open Source (Matomo Heatmap, OpenReplay)

**How it works**

- Use Matomo Heatmap & Session Recording or OpenReplay (self-hosted).
- Integrate via API or JS snippet.

**Pros**

- No per-seat cost; self-hosted
- Open source

**Cons**

- Need to host and maintain
- Integration effort

**Difficulty**: Medium

---

### Option D: Hybrid – RipX for Clicks, Third-Party for Sessions

**How it works**

- RipX: click/scroll aggregation for test pages (variant-aware).
- Hotjar/FullStory: full session replay for deeper analysis.

**Pros**

- Best of both
- RipX owns test-specific heatmaps

**Cons**

- Two systems

**Difficulty**: Medium

---

### Recommendation

- **Phase 1**: Option A – click aggregation only.
- **Phase 2**: Add scroll depth.
- **Phase 3**: Optional integration with Hotjar/FullStory for session replay.

---

## Part 5: Multiple Custom Events Per Test

### 5.1 How Other Tools Do It

| Tool                | Primary        | Secondary          | Custom Events                 |
| ------------------- | -------------- | ------------------ | ----------------------------- |
| **Optimizely**      | 1 primary goal | Multiple secondary | Custom events with properties |
| **VWO**             | 1 primary      | Multiple           | Custom events with properties |
| **Google Optimize** | 1 goal         | N/A                | GA4 events                    |
| **AB Tasty**        | 1 primary      | Multiple           | Custom events                 |

**Common pattern**

- **Primary goal**: Main conversion (e.g., purchase).
- **Secondary goals**: Add-to-cart, signup, video play, etc.
- **Custom events**: User-defined names, optional value, optional properties.

### 5.2 Schema Changes for RipX

**Current (single goal)**

```json
{
  "goal": {
    "metric": "revenue",
    "cogs": { "enabled": true, "type": "percentage", "value": 30 }
  }
}
```

**Proposed (multi-goal)**

```json
{
  "goal": {
    "primary": {
      "type": "conversion",
      "metric": "revenue",
      "cogs": { "enabled": true, "type": "percentage", "value": 30 }
    },
    "secondary": [
      { "type": "custom_event", "event_name": "add_to_cart", "aggregation": "count" },
      { "type": "custom_event", "event_name": "newsletter_signup", "aggregation": "count" }
    ]
  }
}
```

**Backward compatibility**

- If `goal.metric` exists and `goal.primary` does not, treat `goal.metric` as primary.

### 5.3 Event Types to Support

| Event Type          | Description       | Value               | Aggregation     |
| ------------------- | ----------------- | ------------------- | --------------- |
| `conversion`        | Purchase/order    | Revenue             | count, sum      |
| `add_to_cart`       | Add to cart       | Optional cart value | count, sum      |
| `add_to_wishlist`   | Wishlist          | 0                   | count           |
| `view_content`      | Product/page view | 0                   | count           |
| `signup`            | Signup            | 0                   | count           |
| `newsletter_signup` | Newsletter        | 0                   | count           |
| `form_submit`       | Form submit       | 0                   | count           |
| `video_play`        | Video play        | 0 or %              | count, sum      |
| `click`             | Click             | 0                   | count           |
| `custom`            | User-defined      | Optional            | count, sum, avg |

### 5.4 Implementation Plan

**Phase 1: Backend**

1. Add `events.event_name` (nullable).
2. Extend `goal` JSONB to support `primary` + `secondary`.
3. Add `trackEvent` in storefront that accepts `event_name`.
4. Update analytics to aggregate by `event_type` + `event_name` per test.

**Phase 2: Frontend**

1. Goal config UI: primary metric + secondary events.
2. Event picker: predefined + custom event name.
3. Analytics: secondary metrics in cards/tables.

**Phase 3: Storefront**

1. Expose `window.RipX.trackEvent(testId, eventName, value, metadata)`.
2. Document: `RipX.trackEvent('test-uuid', 'add_to_cart', 29.99, { productId: '123' })`.

---

## Part 6: Quick Wins Summary

| Item                                      | Effort   | Impact                     |
| ----------------------------------------- | -------- | -------------------------- |
| Add `trackEvent` to storefront API        | 1 day    | Enables custom events      |
| Add `event_name` to events table          | 0.5 day  | Supports custom events     |
| Index `(test_id, variant_id, event_type)` | 0.5 day  | Faster analytics           |
| Implement webhook TODOs or document       | 1 day    | Cleaner codebase           |
| Add custom event config in Test Wizard    | 2–3 days | Full custom events support |

---

## Implementation Status (Updated)

| Feature                        | Status  | Notes                                                 |
| ------------------------------ | ------- | ----------------------------------------------------- |
| `event_name` column + index    | ✅ Done | Migration 019                                         |
| `trackEvent` storefront API    | ✅ Done | `RipX.trackEvent(testId, eventName, value, metadata)` |
| Track API `event_name` support | ✅ Done | POST /api/track accepts event_name                    |
| Goal secondary events          | ✅ Done | goal.secondary[] in Test Wizard                       |
| Analytics secondary metrics    | ✅ Done | getSecondaryEventMetrics, Analytics UI                |
| BigQuery export scaffold       | ✅ Done | backend/src/jobs/bigQueryExport.js                    |

---

## Appendix: File References

- **Goal config UI**: `frontend/src/components/TestWizard/TestWizard.jsx` – `renderTestConfiguration` (around line 1399)
- **Analytics model**: `backend/src/models/analytics.js`
- **Custom metrics**: `backend/src/services/customMetricsService.js`
- **Track API**: `backend/src/routes/trackRoutes.js`
- **Storefront**: `shopify/storefront-script.js`
- **Events schema**: `backend/migrations/001_initial_schema.sql`
