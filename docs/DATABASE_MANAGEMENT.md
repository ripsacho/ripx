# Database Management

PostgreSQL is the primary database. This doc covers migrations, connection pool, health checks, and operational practices.

## Migrations

### How they work

- **Location:** `backend/migrations/*.sql` (numbered, e.g. `001_initial_schema.sql`, `042_audit_log_entity_type_created_index.sql`).
- **Runner:** `node backend/migrations/run.js` (or `npm run migrate` if configured).
- **Tracking:** The runner ensures a table `schema_migrations` exists (`name` PRIMARY KEY, `applied_at`). It records each applied migration by **filename**. On each run it:
  1. Creates `schema_migrations` if not exists.
  2. Loads the set of already-applied migration names.
  3. Runs only `.sql` files that are **not** in that set, in sorted order (by leading number, then name).
  4. After each successful run, inserts the filename into `schema_migrations`.

Re-running the runner is **safe**: already-applied migrations are skipped.

### Running migrations

```bash
# From repo root (DATABASE_URL from .env)
node backend/migrations/run.js
```

Ensure `DATABASE_URL` is set (e.g. in `.env`). The runner loads `.env` from the project root.

### Existing databases (before migration tracking)

If the database already had all migrations applied **before** migration tracking was added, run this **once** so the runner won’t re-apply them:

```bash
node backend/migrations/mark-applied.js
```

This inserts all current `.sql` filenames into `schema_migrations` with `ON CONFLICT DO NOTHING`. After that, `run.js` will only run new migrations.

### Adding a new migration

1. Add a new file: `backend/migrations/NNN_description.sql` (next number after the latest).
2. Prefer **idempotent** SQL: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc.
3. Run the migration runner; it will apply only the new file.

### Rollbacks

There is no automatic rollback. Document reverse steps in the migration file or in a separate rollback script if needed. For additive changes (new tables, new columns, new indexes), rollback is rarely required.

---

## Connection pool

- **Config:** `backend/src/utils/database.js` uses `pg.Pool` with:
  - **max:** From `DATABASE_POOL_MAX` (1–100), or default 20 (production) / 10 (development).
  - **idleTimeoutMillis:** `DATABASE_POOL_IDLE_TIMEOUT_MS` or 30000.
  - **connectionTimeoutMillis:** `DATABASE_POOL_CONNECT_TIMEOUT_MS` or 2000.
- **SSL:** In production, SSL is used unless disabled; optional `DATABASE_SSL_CA` and `DATABASE_SSL_REJECT_UNAUTHORIZED` (see `.env.example`).

---

## Health check

- **Endpoints:** `GET /health` and `GET /api/health` (unauthenticated).
- **DB check:** The handler runs `SELECT 1` via the shared `query()` helper. On failure, response is 503 and `checks.db: 'error'`.
- **Optional:** The database module exports `ping()` which runs `SELECT 1` and rejects on failure (e.g. for programmatic checks).

---

## Transactions

- **getClient():** Returns a pooled client; **you must call `client.release()`** when done (e.g. in a `finally` block).
- **withTransaction(fn):** Runs `fn(client)` inside a transaction (BEGIN … COMMIT, or ROLLBACK on error) and releases the client. Use for multi-statement atomic work:

```js
const { withTransaction } = require('./utils/database');
await withTransaction(async (client) => {
  await client.query('INSERT INTO ...', [...]);
  await client.query('UPDATE ...', [...]);
  return result;
});
```

---

## Slow query logging

- **Threshold:** `SLOW_QUERY_MS` (default 1000 ms). Queries slower than this are logged (in development always; in production only if `SLOW_QUERY_LOG_PROD=true`).
- See `.env.example` and `backend/src/utils/database.js`.

---

## Backups and recovery

- Use your provider’s backup (e.g. RDS, Cloud SQL) or `pg_dump` on a schedule.
- Point-in-time recovery depends on your PostgreSQL setup (WAL archiving, replicas). Not managed by the app.
- Restore to a new DB, then run `node backend/migrations/run.js` (or run `mark-applied.js` if the restored DB already has the same schema).

---

## Admin list pagination

Admin list endpoints that accept `limit` and `offset` should cap them to avoid overload and ensure consistent behavior:

- **limit:** Parse from query, apply a minimum (e.g. 1) and maximum (e.g. 200–500 depending on endpoint). Use the same cap for the SQL `LIMIT` and for the response `limit` field.
- **offset:** Parse from query, ensure `>= 0` (e.g. `Math.max(0, parseInt(offset, 10) || 0)`).

Audit list uses `limit` 1–500; export uses a separate cap (e.g. 10_000). Other admin lists follow similar patterns (see `adminRoutes.js`).

---

## Production / operational checklist

- **Env:** All required vars set (see app startup validation); strong `JWT_SECRET` (32+ chars); `APP_URL` set to production domain.
- **Migrations:** Run `npm run migrate` after deploy; for existing DBs that predate tracking, run `npm run migrate:mark-applied` once.
- **Health:** `GET /health` and `GET /api/health` return 503 when DB is down or when the process is shutting down (so load balancers can drain).
- **Graceful shutdown:** Server handles SIGTERM/SIGINT: stops accepting new requests, closes DB pool, then exits. Force exit after 10s if hang.
- **Backups:** Use provider backups or `pg_dump`; test restore and re-run migrations if needed.
- **Rate limits:** See `.env.example` and `constants/index.js` for `RATE_LIMIT_*`; admin sensitive actions use `RATE_LIMIT_SENSITIVE_ADMIN_MAX` (see `docs/PERMISSIONS.md`).

---

## Related docs

- **Schema and scaling:** `docs/EVENT_SCALABILITY.md` (tenant_id, indexes, partitioning path).
- **ORM vs raw SQL:** `docs/DATABASE_ORM_ANALYSIS.md`.
- **Env vars:** `.env.example` (DATABASE*\*, SLOW_QUERY*\*, etc.).
