# Unified Users – Email-Only Identity & Domain-Level Verification

## Design principle

**Users are not differentiated by type.** Everyone registers and logs in the same way (email). The only difference is **which domains they add** and **how each domain is verified**:

- **Shopify domain**: Verified when adding by being inside that store (first-time add from store context, e.g. OAuth or embedded app).
- **Standalone domain**: Verified by adding the head script (ownership proof).

So: one identity (email), one login/registration flow; domain type and verification live at the **tenant (domain)** level, not on the user.

---

## Data structure

### 1. Single identity: email

- **users** table: one row per person, identified by **email** (unique, normalized lowercase).
- No `auth_type`. No `shop_domain` on the user row. No “Shopify user” vs “standalone user” in the schema.
- Optional: `primary_domain_id` / `primary_domain` for UX (first or default domain).

### 2. Domains (tenants)

- **tenants**: `domain`, `platform` (`shopify` | `standalone`), `account_id`, `domain_verified_at`, etc.
- **Verification** (per tenant):
  - **Shopify**: verified when added from store context (e.g. install/OAuth or “add this store” while in that store). Set `domain_verified_at` when linking store to the user’s account.
  - **Standalone**: verified via head script (existing flow); set `domain_verified_at` when script is confirmed.
- **accounts**: One account per user (billing/API key). All of a user’s domains (tenants) share `account_id` = `user.account_id`.

### 3. Resolution

- **By email (login)**: `user = getByEmail(email)`. Used for session/JWT and for /me and domain list.
- **By domain (store context)**: `tenant = getTenantByDomain(domain)` → `user = getByAccountId(tenant.account_id)`. Used when the request is scoped to a shop (e.g. embedded app, API key with store, admin impersonation). If the tenant has no `account_id`, there is no user for that domain yet (store not linked to any account).

---

## Target schema (users)

| Column                 | Type                         | Purpose                                                         |
| ---------------------- | ---------------------------- | --------------------------------------------------------------- |
| id                     | UUID PK                      | Same as today.                                                  |
| email                  | VARCHAR(255) NOT NULL UNIQUE | Single identity; stored lowercase.                              |
| status                 | VARCHAR(32)                  | pending, accepted, rejected, active, locked, suspended.         |
| account_id             | UUID FK accounts             | Used for API key and domain list.                               |
| primary_domain_id      | UUID FK tenants              | Optional first/default domain.                                  |
| primary_domain         | VARCHAR(255)                 | Denormalized.                                                   |
| profile                | JSONB                        | Optional profile (e.g. from Shopify or minimal for email-only). |
| preferences            | JSONB                        | UI preferences.                                                 |
| role                   | VARCHAR(50)                  | Admin/superadmin.                                               |
| token_version          | INT DEFAULT 0                | Session revocation.                                             |
| email_verified_at      | TIMESTAMP NULL               | Email verification.                                             |
| accepted_at            | TIMESTAMP NULL               | Admin acceptance (for pending→accepted).                        |
| accepted_by            | VARCHAR(255) NULL            | Admin who accepted.                                             |
| created_at, updated_at | TIMESTAMP                    |                                                                 |

**Removed from users**: `auth_type`, `shop_domain` (identity lives on email and on tenants/accounts).

**Indexes**: Unique on `LOWER(TRIM(email))`; index on `account_id` for “user by account” lookups.

---

### User status flow

- **pending**: New registration; admin has not accepted. Cannot use /me (list/add domains, regenerate key) until accepted.
- **accepted** / **active**: Can log in and use /me. Enforce in code: /me routes require `status IN ('accepted', 'active')`.
- **rejected**: Registration rejected; cannot log in.
- **locked** / **suspended**: Admin action; access restricted.

**Implementation**: Backend uses `USER_STATUS` in `constants/index.js`: `isUserStatusAllowedForSession(status)` for /me and session issuance (accepts `accepted`, `active`); `isUserStatusBlocked(status)` for auth middleware (rejects `locked`, `suspended`). Session issuance (magic link, OTP) and Shopify/API-key auth all reject blocked status before issuing or accepting the request.

---

## Login and registration (same for everyone)

1. **Registration**: User submits email → magic link → confirm email → user row created with `status = 'pending'`; admin accepts → `status = 'accepted'`. Optional: on first login after accept, require **primary domain** (or skip and let them add domains later).
2. **Login**: Email (magic link or OTP) → resolve `user = getByEmail(email)` → session/JWT with email. No separate “Shopify login” vs “standalone login”.

When a user opens the app **from inside a Shopify store** (e.g. embedded app with `?shop=xyz.myshopify.com`):

- If they already have a session (email), they’re logged in; “current domain” can be that store if it’s already in their account, or we can offer “Add this store” (verified by store context).
- If no session, show email login; after login, offer “Add this store” so the store is linked to their account (tenant created/updated with their `account_id`, verified by store).

---

## Domain add rules (same user, different verification per domain type)

- **Standalone domain**: User adds domain string → tenant created under their account with `platform = 'standalone'` → verification by **head script**; set `domain_verified_at` when script is confirmed.
- **Shopify domain**: User can add only when the request is **in that store’s context** (e.g. `shop=xyz.myshopify.com` in query/session). Verification = “added from store” (OAuth/install or “Add this store” while in store). Create/update tenant with `platform = 'shopify'`, set `account_id` to user’s account, set `domain_verified_at`.

So: one user (email), one account; many domains (tenants); each domain has a type and a verification method. No user-level “type”.

---

## Auth resolution (code)

- **Email session (JWT)**: `req.email` or `req.shopDomain` (legacy name) = email → `user = getByEmail(email)`.
- **Shop/domain context** (e.g. embedded app, API key with store, impersonation): `req.shopDomain` = domain → `tenant = getTenantByDomain(domain)` → `user = getByAccountId(tenant.account_id)` (if `tenant.account_id` is set).
- **API key**: Resolve account → tenants; no direct user needed for public API. For “is this account locked?” use `user = getByAccountId(accountId)` and check `user.status`.

---

## Migration strategy

- **037** (run first): Adds `email`, `account_id`, etc., merges `standalone_users` into `users`, keeps `auth_type` and `shop_domain` for transition.
- **038** (run after 037): (1) Backfill `user.email` where null (from `profile->>'email'` or `'migrated-<id>@legacy.local'`). (2) If column `shop_domain` exists, for users with `shop_domain` and no `account_id`, create account, set `user.account_id`, set `tenant.account_id` for that domain. (3) Merge duplicate users by email (keep one row per email, point `user_domain_access` to it). (4) Make `email` NOT NULL and UNIQUE. (5) Drop `auth_type` and `shop_domain`. (6) Re-apply `users_status_check`; keep index on `users(account_id)`.

**038 idempotency**: Step 2 checks `information_schema.columns` for `shop_domain` and skips if the column is already dropped (safe re-run). Placeholder emails use `@legacy.local` to avoid colliding with real addresses.

---

## Code changes (summary)

- **User model**: `getByEmail`, `getByAccountId`; remove `getProfile(shopDomain)` / `getRoleAndStatus(shopDomain)` that look up by `shop_domain`. Add `getByDomain(domain)` = tenant by domain → user by `tenant.account_id` (or keep getRoleAndStatus/getProfile but implement them via tenant→account→user).
- **Auth middleware**: For “shop” context, resolve user via tenant→account→user instead of user by `shop_domain`. Keep `req.shopDomain` as the current domain (tenant domain) for downstream routes.
- **Auth routes**: Use `userModel.getByEmail` for all "get user by email" (register, send-login-link, verify-email, verify-login-code). Session issuance rejects blocked/not-allowed status and logs `login_rejected` with `changes: { reason, status }` for audit.
- **Me routes**: Already email-based; ensure “add domain” enforces: standalone = script verification; Shopify = only when request is in that store’s context.
- **Admin / profile**: When operating “per shop”, resolve user by domain via tenant→user; use `user.email` and tenants for display.
- **Frontend**: Single Connect/login flow (email); domain list and “Add domain” same for everyone; messaging differs only by domain type (e.g. “Add this store” when in Shopify, “Add website” + script for standalone).

This keeps the database and product consistent: one identity (email), one login; domain type and verification are attributes of each domain (tenant), not of the user.

For full schema, normalization, and domain-scoped tables (tests, events, etc.), see [DATABASE_DESIGN.md](./DATABASE_DESIGN.md).
