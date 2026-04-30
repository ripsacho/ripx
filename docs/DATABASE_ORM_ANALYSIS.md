# Database Access: ORM vs Raw SQL — Analysis & Recommendation

This document answers: (1) whether RipX uses an ORM; (2) whether you **should** use one for this project; and (3) how to align the database layer with the goal of making RipX a **most-advanced AB testing tool**.

---

## What makes an AB testing platform “most advanced”? (Research summary)

Research on production experimentation platforms (Statsig, PostHog, Optimizely, VWO, Airbnb, Grab) shows that “advanced” is driven by **architecture and data design**, not by ORM choice.

| Dimension                 | What matters                                                                                                                            | ORM relevance                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Assignment service**    | Low latency (<10ms), high availability, consistent variant assignment.                                                                  | Hot path should be minimal, predictable queries. Raw SQL or a thin query layer is ideal; ORMs add overhead and N+1 risk.                                                                                 |
| **Event volume**          | Events can scale to billions; ingestion and aggregation need a clear pipeline.                                                          | Event writes are often batched or streamed; metadata (tests, tenants) stays relational. ORMs are not used on the event-ingestion path in large platforms.                                                |
| **Data storage**          | Many platforms separate **relational app data** (PostgreSQL) from **analytics/events** (ClickHouse, data warehouse, Kafka → warehouse). | PostHog: PostgreSQL for app data, ClickHouse for events. Statsig: warehouse-native pipelines. RipX today keeps both in PostgreSQL; scaling events may later mean partitioning or a separate event store. |
| **Schema and migrations** | Strong constraints, indexes, and safe migration patterns (e.g. add nullable column → backfill → add NOT NULL).                          | Your 39 SQL migrations already follow this. ORMs don’t replace the need for careful schema design; they add a second migration system to reconcile.                                                      |
| **Multi-tenancy**         | Consistent tenant isolation (tenant_id, RLS), clear FKs.                                                                                | Schema and indexing choices matter; ORM vs raw SQL is secondary.                                                                                                                                         |

**Takeaway:** “Most advanced” comes from **assignment latency**, **event pipeline and schema**, **tenant-aware design**, and **operational reliability**. ORM vs raw SQL is a **tooling choice** that affects developer experience and, at the margins, performance—not the main lever for being best-in-class.

---

## Recommendation for RipX: Should you use an ORM?

**No — do not introduce an ORM for the core product.** Keep **pg + raw SQL** as the primary database layer. Optionally add a **query builder (Knex)** or **ORM (Drizzle)** only for **admin/app CRUD** if you want better DX there, without touching the track/event path or migrations.

### Why this is the best approach for a most-advanced AB testing tool

1. **Hot path (assignment + track)**
   Your track routes and assignment logic need fast, predictable queries. Raw SQL gives full control over indexes and query shape and avoids ORM N+1 and serialization overhead. Keeping this path on `pg` + raw SQL is the right choice.
2. **Event and analytics tables**
   As event volume grows, the right moves are **schema and infrastructure** (partitioning by time, tenant_id, optional future move to a columnar store or warehouse), not an ORM. Event writes should stay simple (parameterized INSERTs); ORMs don’t help here and can hurt.
3. **Admin and app CRUD**
   Complex admin queries (filters, joins, aggregates) are easier to tune and debug as explicit SQL. If you want slightly better readability for dynamic filters, a **query builder (Knex)** can be used only there, without changing migrations or the rest of the stack.
4. **Migrations and schema ownership**
   You already have 39 hand-written migrations and a clear pattern (nullable → backfill → NOT NULL, FKs, expression indexes). Keeping migrations as the single source of truth and continuing in SQL is the least risky and most controllable path. Introducing an ORM migration system would duplicate and complicate this.
5. **What to prioritize instead of an ORM**
   To make RipX more advanced, focus on:

- **Schema and indexing**: tenant_id everywhere it’s missing, composite indexes for list/filter queries, RLS when you need hard tenant isolation.
- **Event scalability**: time-based (or tenant-based) partitioning for `events` (and similar tables), and a documented path to batch export or stream to a warehouse if you outgrow Postgres for analytics.
- **Assignment path**: keep it lean (caching, minimal queries); avoid adding ORM or heavy abstraction on this path.
- **Operational clarity**: connection pooling (you have it), slow-query logging (you have it), and clear ownership of migrations.

So: **do not use an ORM for the sake of “advanced”**; use it only if you explicitly want DX for non–hot-path CRUD, and then in a limited way (see options below).

### Best approach: priorities (no ORM)

| Priority            | Action                                                                                                        | Where                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Schema**          | Add `tenant_id` + FKs and composite indexes where missing; consider RLS for tenant isolation.                 | Migration `040_tenant_id_events_assignments_audit.sql`; see `docs/DATABASE_DESIGN.md` for future RLS. |
| **Events at scale** | Partition `events` (and similar) by time or tenant; document path to batch/stream to warehouse if needed.     | `docs/EVENT_SCALABILITY.md`; migration 040 adds tenant + time indexes.                                |
| **Hot path**        | Keep assignment and track routes on raw SQL; avoid extra layers and N+1.                                      | `trackRoutes`, `abTestEngine`, analytics/heatmap models.                                              |
| **Migrations**      | Keep single source of truth: SQL migrations; no ORM migration takeover. Track applied in `schema_migrations`. | `backend/migrations/`; see `docs/DATABASE_MANAGEMENT.md`.                                             |
| **Optional DX**     | If desired, add Knex or Drizzle only for admin/app CRUD, not for track/events.                                | Admin routes, app-facing models.                                                                      |

**Implemented:** Migration `040_tenant_id_events_assignments_audit.sql` adds `tenant_id` to `events`, `test_assignments`, and `audit_log` (with backfill, FKs, and triggers). Migration `041_heatmap_events_tenant_id.sql` adds `tenant_id` to `heatmap_events` the same way. Audit log service now sets `tenant_id` on insert for tenant-scoped rows (via `getTenantByDomain`); admin audit list and export support optional `tenant_id` query filter. Slow-query threshold is configurable via `SLOW_QUERY_MS` and optional production logging via `SLOW_QUERY_LOG_PROD`. See `docs/EVENT_SCALABILITY.md` for the event scaling path (partitioning, warehouse).

---

## Current State: No ORM

RipX **does not use an ORM**. Database access is:

- **Driver**: `[pg](https://nodejs.org/)` (node-postgres) only.
- **Layer**: A thin wrapper in `backend/src/utils/database.js` that exposes:
  - `query(sql, params)` — parameterized queries (safe from SQL injection when params are used).
  - `getClient()` — for transactions (used in seed scripts).
- **Migrations**: Hand-written SQL in `backend/migrations/`, run by a custom runner (`migrations/run.js`). Applied migrations are recorded in `schema_migrations` so re-runs skip them. See `docs/DATABASE_MANAGEMENT.md`.
- **Models**: **11 model files** under `backend/src/models/` (user, tenant, account, test, analytics, etc.). Each encapsulates raw SQL and JSON parsing; there is no schema definition in code.
- **Language**: **JavaScript** (not TypeScript).

So the stack is: **pg + raw SQL + custom migrations + model modules**. No Sequelize, Prisma, TypeORM, Drizzle, or Knex.

---

## Is This a Good Fit?

For this project, **yes**.

| Factor          | Why it fits                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Control**     | Complex admin and reporting queries (filters, aggregates, joins) are easier to tune and debug as explicit SQL.                                                                              |
| **Migrations**  | You already have a clear migration story and production-safe patterns (e.g. nullable columns first, backfill, then NOT NULL). An ORM would add a second migration system to reconcile with. |
| **Performance** | Raw parameterized SQL avoids ORM overhead and N+1 patterns; you keep full control over indexes and query shape.                                                                             |
| **Security**    | Using `query(sql, params)` with `$1, $2, ...` is parameterized and safe; the main risk is string-concatenating SQL, which the codebase avoids.                                              |
| **Maturity**    | The schema and access patterns are established; a full rewrite onto an ORM would be high effort and risk for limited short-term gain.                                                       |

So **sticking with pg + raw SQL is a valid and often preferable choice** for this codebase.

---

## If You Later Want an ORM or Query Builder

Use this as a decision guide, not a requirement to change.

### Option A: Stay with pg + raw SQL (recommended for now)

- **Pros**: No new deps, no migration rewrite, full control, team already used to it.
- **Cons**: No generated types, more manual mapping and boilerplate.
- **Best for**: Current team and priorities; complex queries and existing migrations stay as-is.

### Option B: Add Knex as a query builder only

- **What it is**: Query builder (not a full ORM). You still write SQL-like code; Knex builds the SQL. No schema-in-code or migration takeover.
- **Pros**: Can adopt incrementally for dynamic queries (e.g. `where('status', status).where('domain', domain)`); works with existing migrations and `pg` pool.
- **Cons**: Doesn’t give you schema or relations; you still map rows to objects yourself.
- **Best for**: Gradually improving readability of complex dynamic filters (e.g. in `adminRoutes`) without changing the rest of the stack.

### Option C: Drizzle ORM (if you want a real ORM later)

- **What it is**: Lightweight, SQL-first ORM; TypeScript-first but usable in JavaScript.
- **Pros**: Small footprint, good performance, “database-first” via `drizzle-kit pull` (introspect existing PostgreSQL and generate schema). You can keep existing migrations and use Drizzle only for new or refactored code.
- **Cons**: Requires defining or introspecting schema; team needs to learn it; mixing raw SQL and Drizzle in the same app is fine but adds two patterns.
- **Best for**: A future where you want type-safe, schema-backed access for new features or a gradual refactor, without re-running all 39 migrations through the ORM.

### Option D: Prisma

- **What it is**: Full ORM with schema in a DSL, migrations generated from schema, Prisma Studio.
- **Pros**: Strong DX, type safety, migrations and schema in one place.
- **Cons**: Heavier; migration story conflicts with your 39 existing SQL migrations unless you “baseline” and then use Prisma only for new changes. More opinionated.
- **Best for**: Greenfield or when you’re willing to baseline the DB and move all migration workflow to Prisma.

---

## Recommendation Summary

1. **For making RipX a most-advanced AB testing tool:** Keep **pg + raw SQL** as the main database layer. Prioritize **schema** (tenant_id, partitioning, indexes, RLS), **event pipeline** design, and **assignment-path** performance over introducing an ORM.
2. **Do not adopt an ORM for the core.** The track/event path and migrations should stay on raw SQL. If you want better DX only for admin/app CRUD:

- **Minimal change**: Add **Knex** as a query builder only for selected dynamic query sites (e.g. admin list filters); keep migrations and all hot paths as-is.
- **Larger shift**: Use **Drizzle** with a database-first workflow (introspect existing DB, generate schema) only for new or refactored app/admin code; keep existing SQL migrations as the source of truth and do not run the event/assignment path through the ORM.

---

## Quick Comparison (for reference)

| Tool          | Type            | Works with existing migrations?      | TypeScript         | Bundle / overhead | Best suited for RipX         |
| ------------- | --------------- | ------------------------------------ | ------------------ | ----------------- | ---------------------------- |
| **pg only**   | Driver          | Yes (you own migrations)             | N/A                | Minimal           | **Current choice**           |
| **Knex**      | Query builder   | Yes (same migrations)                | Optional           | Small             | Optional incremental use     |
| **Drizzle**   | ORM (SQL-first) | Yes (introspect + keep migrations)   | Yes (JS supported) | Small             | If you add an ORM later      |
| **Prisma**    | ORM             | Requires baseline/migration strategy | Yes                | Larger            | New projects or full move    |
| **Sequelize** | ORM             | Yes (but older ecosystem)            | Optional           | Medium            | Less recommended for new use |

---

## Conclusion

- **No ORM is used today**, and that is the **right choice** for RipX as an advanced AB testing tool: control over the hot path, no ORM overhead or N+1 risk, and a single migration story.
- **Best approach**: **Do not use an ORM for the core.** Keep **pg + raw SQL** and your current migrations. Invest in **schema and event pipeline** (tenant_id, partitioning, indexes, optional warehouse path) and keep the **assignment/track path** lean. Optionally add **Knex** (query builder) or **Drizzle** (ORM) only for **admin/app CRUD** if you want better DX there, without changing the track/event path or migration ownership.
