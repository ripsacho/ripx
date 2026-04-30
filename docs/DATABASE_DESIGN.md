# Database Design – Schema, Normalization & Best Practices

## Overview

The schema uses a **shared-tables (pool) multi-tenant model**: one database, domain-scoped data identified by tenant (domain). Identity is **email-only** (see [UNIFIED_USERS_DESIGN.md](./UNIFIED_USERS_DESIGN.md)); domain type and verification live on **tenants**.

---

## Core entity relationship

```
users (email, account_id)  ──┬── accounts (id, api_key_*)
                             │
                             └── tenants (domain, platform, account_id)
                                      │
user_domain_access (user_id, tenant_id)  (many-to-many: which users can access which domains)
```

- **users**: One row per person; identified by `email` (unique, lowercase). `account_id` → accounts.
- **accounts**: One per “workspace”; holds API key (hash/prefix). Groups tenants.
- **tenants**: One row per domain (store/site). `account_id` links to the account that owns it. `platform` = `shopify` | `standalone`; `domain_verified_at` for verification.
- **user_domain_access**: Which users can access which tenants (roles: owner, member, viewer).

**Normalization**: User → Account ← Tenants; user_domain_access links users to tenants. No duplicate identity (single `users` table, email-only).

---

## Domain-scoped tables (tenant identifier)

These tables are scoped “per domain” and currently use the **string** `shop_domain` as the tenant identifier (legacy). Where added, `tenant_id` provides **referential integrity** to `tenants(id)`.

| Table               | Tenant identifier | FK to tenants                  | Notes                                                    |
| ------------------- | ----------------- | ------------------------------ | -------------------------------------------------------- |
| **tests**           | shop_domain       | tenant_id (from migration 039) | Core entity; FK enforces tests belong to a known tenant. |
| test_assignments    | shop_domain       | —                              | Derivable via test_id → tests.tenant_id.                 |
| events              | shop_domain       | —                              | Derivable via test_id → tests.                           |
| analytics_daily     | (test_id)         | —                              | Via test.                                                |
| shop_sessions       | shop_domain       | —                              | Shopify OAuth; 1:1 with store.                           |
| shop_settings       | shop_domain (PK)  | —                              | Per-store config.                                        |
| webhook_events      | shop_domain       | —                              | Idempotency per shop.                                    |
| audit_log           | shop_domain       | —                              | Optional future: tenant_id.                              |
| notifications       | shop_domain       | —                              | Scope: shop or all.                                      |
| significance_alerts | (test_id)         | —                              | Via test.                                                |
| promo_links         | shop_domain       | —                              | Via test.                                                |
| targeting_presets   | shop_domain       | —                              | Per-store presets.                                       |
| client_errors       | shop_domain       | —                              | Per-store.                                               |
| heatmap_events      | (test_id)         | —                              | Via test.                                                |

**Best practice**: Prefer `tenant_id UUID REFERENCES tenants(id)` for new domain-scoped tables so the DB enforces that every row belongs to an existing tenant. Existing tables can be gradually extended with `tenant_id` + backfill + FK (see migration 039 for `tests`).

---

## Indexes and constraints

### Users

- **Unique**: `LOWER(TRIM(email))` (expression index).
- **CHECK**: `users_status_check` — status in (pending, accepted, rejected, active, locked, suspended).
- **Indexes**: `account_id` (partial, where not null), `idx_users_email_unique`.

### Tenants

- **Unique**: `domain`.
- **CHECK**: `platform IN ('shopify', 'standalone')`.
- **Indexes**: domain, platform, account_id.

### Tests (after 039)

- **FK**: `tenant_id` → tenants(id) ON DELETE CASCADE (nullable until backfill; then can be NOT NULL for new rows).
- **CHECK**: `valid_status` (draft, running, stopped, completed).
- **Indexes**: shop_domain, status, tenant_id (composite with status for list-by-tenant).

### user_domain_access

- **Unique**: (user_id, tenant_id).
- **CHECK**: role IN ('owner', 'member', 'viewer').
- **FK**: user_id → users(id), tenant_id → tenants(id).

### Accounts

- **Index**: api_key_prefix (for API key lookups).

---

## Normalization decisions

1. **Single users table, email-only identity**  
   No separate “Shopify” vs “standalone” user table; one row per person, identified by email. Domain/context resolved via tenants and accounts.

2. **Tenant = domain**  
   `tenants.domain` is the canonical tenant key. Domain-scoped tables use either `shop_domain` (string, legacy) or `tenant_id` (FK). Consistency: same domain string as in `tenants.domain` (normalized lowercase, no scheme).

3. **Account groups tenants**  
   One account can own many tenants (multi-store). API key is at account level; tenants inherit.

4. **Denormalization kept where useful**
   - `users.primary_domain`, `users.primary_domain_id`: quick access to “first” domain.
   - `tests.shop_domain`: kept for backward compatibility and app code; `tenant_id` added for integrity.
   - `audit_log.shop_domain`, `events.shop_domain`: avoid joins for filtering; can add tenant_id later.

5. **JSONB where structure varies**  
   `profile`, `preferences`, `goal`, `variants`, `segments`, etc. are JSONB to allow flexible schema without frequent migrations. Critical identifiers (email, domain, status) stay as columns with CHECK/unique where needed.

---

## Data integrity checklist

- [x] users.email unique (expression index), NOT NULL.
- [x] users.status constrained.
- [x] tenants.domain unique; platform constrained.
- [x] user_domain_access (user_id, tenant_id) unique; FKs to users and tenants.
- [x] tests.tenant_id FK to tenants (migration 039); shop_domain kept for compatibility.
- [ ] events / test_assignments: tenant derivable via test_id; optional future tenant_id for direct queries.
- [ ] shop_settings, audit_log, etc.: optional future tenant_id for consistency and RLS.

---

## Migration order (relevant)

1. 001 (tests, events, test_assignments), 004 (users), 006 (shop_sessions, webhook_events), 009 (shop_settings), 013 (tenants), 014 (audit_log), 028 (accounts, tenants.account_id), 029 (users.role/status, tenants.status), 034 (standalone_users), 035 (user_domain_access, tenants.domain_verified_at), 037 (unified users, merge standalone_users), 038 (email-only users, drop auth_type/shop_domain), **039 (tests.tenant_id + FK)**.

---

## Future improvements

- **tenant_id on more tables**: Add and backfill `tenant_id` to events, test_assignments, shop_settings, audit_log, notifications for consistent FKs and possible RLS.
- **Row-Level Security (RLS)**: Policy per table so that `tenant_id` (or equivalent) is enforced at read/write.
- **Composite indexes**: (tenant_id, status), (tenant_id, created_at) for list/filter queries where tenant_id is used.
- **Consistent naming**: Prefer `tenant_id` for new columns; keep `shop_domain` only where required for backward compatibility.
