# User vs Domain Separation & Auth – Design

This document reviews your requirements, recommends the best approach, and outlines implementation steps. It builds on the existing **standalone_users** (email, confirm, admin-accept) and **magic-link login** already in the backend. It has been updated with **security hardening**, **compliance**, and **best-in-class A/B testing platform** practices so RipX can be a leading, secure A/B testing tool.

---

## 1. Your Ideas (Summary)

| #   | Requirement                                                                                   | Status in codebase                                                                       |
| --- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | **Separate User view and Domain view**                                                        | Not yet: users table = shop_domain; no true “user” UI.                                   |
| 2   | **Registration by user + optional primary domain**                                            | Partial: register by email exists; no primary_domain.                                    |
| 3   | **After registration: success message → confirmation email with link**                        | ✅ Done (confirm-email flow).                                                            |
| 4   | **Account not allowed to login until admin accepts**                                          | ✅ Done (status pending → accepted).                                                     |
| 5   | **After admin accept → send acceptance email to user**                                        | ❌ Missing (accept endpoint doesn’t send email).                                         |
| 6   | **Every login: email → mail with token → 2nd step enter token then login**                    | Partial: magic-link exists; no “enter token on 2nd step” UI.                             |
| 7   | **Post-login: user sees domain list (or blank); only admin sees full admin panel**            | ❌ Missing: no domain-list route; AdminGuard only redirects non-admin to dashboard.      |
| 8   | **Domain list: connection details + permitted users per domain; open domain → AB test panel** | ❌ Missing.                                                                              |
| 9   | **Domain creation process for user**                                                          | Partial: Connect has “Register new site” (domain → API key); not tied to logged-in user. |

---

## 2. Recommended Approach (Best Path)

### 2.1 Keep User and Domain Concepts Separate (as you want)

- **User** = person (email, profile, primary_domain_id, status). Table: `standalone_users` (extend) or keep and add `primary_domain_id`, `account_id`.
- **Domain** = store/tenant (domain, platform, API key, etc.). Table: `tenants` (existing).
- **Relation**: “User has access to many domains” and “Domain has many permitted users” via a join table.

So:

- **User view**: Registration, profile, “my account”, primary domain.
- **Domain view**: List of domains the user can access, with connection details and permitted users; “Open” launches the app for that domain.

No merging users and domains into one “thing”; they stay separate with a clear many-to-many.

### 2.2 Registration Flow (align with your wording)

1. User submits **email** (+ optional **primary domain**).
2. Backend: create/update `standalone_users` (status = pending); create short-lived **confirmation token**; send **confirmation email** with link.
3. Response: **Success message only** (e.g. “Check your email to confirm. You’ll be able to sign in after admin approval.”). No login yet.
4. User clicks link → **GET /api/auth/confirm-email?token=...** → set `email_verified_at`; show “Email confirmed. Pending admin approval.”
5. **Login still blocked** until admin accepts (already enforced).
6. **On admin accept**: backend sets status = accepted, then **sends “acceptance email”** to user (new behavior).
7. User can then use **login** (magic link or token-in-email).

Recommendation: keep “success message only” and “no login until admin accept” exactly as you said; add the **acceptance email** on accept.

### 2.3 Login Flow (every time = email → token → then login)

You have two valid options:

- **A) Magic link (current)**
  - User enters email → we send email with **link** → user clicks link → logged in.
  - Pros: one click, no typing token. Cons: some mail clients strip links; user must open email.

- **B) Token in email + 2nd step**
  - User enters email → we send email with **short code (e.g. 6 digits)** → user enters code on 2nd step → we verify and issue session.
  - Pros: works when links are blocked; explicit “2nd step”. Cons: user must type code; codes can be phished if short.

**Recommendation:**

- **Primary: keep magic link** as the main flow (already implemented).
- **Optional: add “Enter code” 2nd step** as an alternative: same email sends both link and a short-lived code; UI has “Enter code instead” and a second screen for code. So “every time login = mail with token” is satisfied by “link (token in URL) or code (token in body)”.

If you want “every time” to be strictly “email with token, then user enters token on 2nd step”, we can make the **code path** the default: send 6-digit code, require 2nd step code entry before issuing session; magic link can remain as optional “click to log in”.

### 2.4 Post-Login: Domain List vs Admin Panel

- **Admin users** (e.g. from `RIPX_ADMIN_EMAIL` or DB role): after login, can access **full admin panel** (`/admin/*`) and optionally a “My domains” list.
- **Non-admin users**: after login, **only** see **Domain list** (no `/admin`). From domain list they can:
  - See connection details (e.g. domain, platform, API key masked, last used).
  - See “permitted users” per domain (list of emails allowed for that domain).
  - **Open** a domain → app switches context to that domain (e.g. set current domain/API key in session) and they see the normal app (Dashboard, Tests, etc.) for that domain.

So:

- **Separate views**: User view (profile, primary domain, “my domains” entry point) vs Domain view (list of domains + details + “Open”).
- **Only admin** sees full admin panel; others see domain list (and, after “Open”, the app for one domain).

### 2.5 Domain Creation (for logged-in user)

- **Domain creation** = “Add a domain to my account”:
  - **Standalone**: user submits domain → backend creates tenant (and account if needed), links to user, returns API key once; user stores it; domain appears in their list.
  - **Shopify** (if you support it for “user” path): OAuth connect flow; new tenant linked to user.
- Existing “Register new site” on Connect can stay for **anonymous** signup; **logged-in** users get “Add domain” from the **Domain list** page (domain creation process there).

Recommendation: add an explicit **“Add domain”** flow on the Domain list (and optionally from user profile), and link new tenants to the logged-in user’s account.

---

## 3. Data Model (Recommended)

### 3.1 Extend `standalone_users`

- Add optional **`primary_domain_id`** (FK to `tenants.id`) for “default domain” for this user.
- Add **`account_id`** (FK to `accounts.id`) so the user is tied to one account; that account’s tenants are “their” domains (for multi-store API key model you already have).

### 3.2 User–Domain access (many-to-many)

- New table: **`user_domain_access`** (or `domain_members`):
  - `user_id` (standalone_users.id)
  - `tenant_id` (tenants.id)
  - `role` (e.g. `owner` | `member` | `viewer`) – optional for later.
  - Unique (`user_id`, `tenant_id`).

So:

- A **user** can have access to many **domains** (tenants).
- A **domain** can have many **permitted users** (list you show on domain list).

When a user “creates” a domain (or is granted access), insert into `user_domain_access` and ensure tenant has `account_id` set to the user’s account when they’re the owner.

### 3.3 Accounts and tenants (existing)

- Keep **accounts** (API key, name); one account can own many **tenants**.
- For standalone users: either **one account per user** (user_id on accounts) or **one account per user** and tenants linked via account_id. Then **user_domain_access** still controls “which user can see which domain” and “permitted users” per domain.

Simplest: **standalone_users.account_id** → one account per user; **tenants.account_id** = that account for domains they own; **user_domain_access** for sharing (so “permitted users” = other users with a row for that tenant).

---

## 4. Implementation Checklist (Phased)

### Phase 1 – Auth and emails (minimal)

- [ ] **Acceptance email**: On `POST /api/admin/accept-user/:id`, after DB update, send “Your account has been approved” email to the user (use existing email service).
- [ ] **Registration primary domain**: Optional field `primary_domain` on register (string); store as `primary_domain_id` after you have tenant id, or store domain string and resolve later.
- [ ] **Login 2nd step (optional)**: Add optional 6-digit code in email and a “Verify code” step in frontend so “enter token on 2nd step” is supported; keep magic link as alternative.
- [ ] **Auth rate limiting**: Rate limit `POST /api/auth/register`, `POST /api/auth/send-login-link`, and (if added) verify-code endpoint per email and per IP; use same success message for send-login-link to avoid email enumeration.
- [ ] **Audit auth events**: Log registration, email confirm, admin accept/reject, and login success/failure to audit_log (actor, action, resource, IP, timestamp).

### Phase 2 – User–domain relation and Domain list

- [ ] **Migration**: Add `standalone_users.account_id`, `standalone_users.primary_domain_id`; create `user_domain_access` (user_id, tenant_id, role).
- [ ] **On first accepted user**: Create an `accounts` row and set `standalone_users.account_id` (or create account on first “add domain”).
- [ ] **API**: `GET /api/me/domains` – list domains the current user can access (via user_domain_access or account_id); include connection details (masked API key, platform) and **permitted users** (list of emails from user_domain_access for that tenant).
- [ ] **Frontend – Domain list page**: New route e.g. `/domains` (or `/my-domains`):
  - Show table: Domain, Platform, Connection (masked), Permitted users, Actions (Open, maybe Settings).
  - “Open” → set current domain/API key in storage and redirect to Dashboard (or first-time Setup).
  - Only reachable when logged in as email user; hide or redirect if not.
- [ ] **Routing / guards**:
  - After email login, redirect to **Domain list** (not Dashboard, not Admin).
  - **AdminGuard**: only allow `/admin/*` if user is admin; else redirect to **Domain list** (not Dashboard).
  - If user has no domains yet, show Domain list empty state + “Add your first domain”.

### Phase 3 – Domain creation and “Open”

- [ ] **Domain creation**: “Add domain” on Domain list:
  - Standalone: form (domain) → backend creates tenant under user’s account, returns API key once; add `user_domain_access` for this user; show in list.
  - Optionally: “Invite user” to a domain (create user_domain_access for another email after they have an account).
- [ ] **Open domain**: From Domain list, “Open” sets the chosen domain (and its API key if stored server-side or returned once) as current context and redirects to `/` (Dashboard) so the rest of the app (Tests, Analytics, etc.) runs in that domain’s context.

- [ ] **Audit domain lifecycle**: Log add domain, open domain, invite user, API key issue/rotate to audit_log.

### Phase 4 – Polish

- [ ] **User view**: Profile page shows “Primary domain”, “My domains” link, and account info.
- [ ] **Admin**: In admin panel, when listing “users”, show their domains and primary domain; when listing “domains”, show permitted users (from user_domain_access).

### Phase 5 – Security & compliance (optional)

- [ ] **Domain verification**: Optional DNS TXT / meta tag / `/.well-known` file check; store `domain_verified_at` on tenant; warn or block track/script on unverified domains.
- [ ] **Constant-time API key check**: Resolve tenant by prefix only, then compare hash with `crypto.timingSafeEqual()` in app code.
- [ ] **Session revocation**: Admin "revoke all sessions for user"; store token version or revoked-before timestamp; check in auth middleware.
- [ ] **RLS (Postgres)**: Add Row-Level Security policies on tenant-scoped tables for defense in depth.
- [ ] **Secure mode (storefront)**: HMAC of user_id + context with API key; reject requests without valid hash so client cannot peek other users' variants.
- [ ] **GDPR for standalone users**: "Export my data" and "Delete my account" endpoints; purge or anonymize user and related data.

### Phase 6 – Enterprise & operational (optional)

- [ ] **API versioning**: Introduce `/api/v1/` (or header/query versioning); document deprecation policy (e.g. 180 days notice, `X-API-Deprecation` header). You already send `X-API-Version`; formalise versioning for breaking changes.
- [ ] **Per-tenant quotas**: Optional limits (e.g. max active tests per domain, max events/day) to prevent abuse and ensure fairness; expose in admin and optionally in UI.
- [ ] **Observability**: Correlation/request IDs in logs and audit; structured logging (JSON); health/degraded states beyond current `/health`; optional runbooks for incident response (e.g. credential rotation, revoke-all-sessions).
- [ ] **Backup & DR**: Document RPO/RTO; tested backup/restore for DB and critical config; secure handling of JWT_SECRET and key material in backups.
- [ ] **Security alerts**: Alert (email/Slack) on anomalies: e.g. burst of failed logins, new domain added, API key rotated, admin actions; extend existing significance/notification pipeline.
- [ ] **SDK/script versioning**: Document minimum supported script version; deprecation policy for old script versions (you already have `script_version` in KV); return `script_version` in script response so clients can upgrade.

---

## 5. Optional / Advanced Ideas

1. **Invite flow**: Admin or domain owner invites by email; invited user gets email; after they register and are accepted, they get access to that domain (user_domain_access) without creating the tenant.
2. **Domain roles**: In `user_domain_access`, use `role` (owner, member, viewer) to later restrict what a user can do on that domain (e.g. viewer = read-only).
3. **Audit**: Log “user X opened domain Y”, “user X added domain Z”, “admin accepted user W”.
4. **Rate limit**: Limit magic-link / code emails per email and per IP to avoid abuse.
5. **Remember device**: Optional “Trust this device for 30 days” so not every login requires email (stored token or cookie); still support “every time email” as default if you prefer.

---

## 6. Security & Hardening (Best Practices)

These measures make the auth and multi-tenant model **secure by design** and suitable for production.

### 6.1 Token & Magic-Link Security

- **CSPRNG**: Use `crypto.randomBytes()` (or equivalent) for all tokens — already in place for email verification tokens.
- **Short expiry**: Magic-link and one-time codes: **5–15 minutes** (current 15 min is good); high-security contexts can use 2–3 minutes.
- **Single-use**: Consume token on first use and set `used_at` — already implemented in `emailVerificationService.consumeToken`.
- **Store hash only**: Store SHA-256 hash of token in DB, never plaintext — already done in `email_verification_tokens`.
- **Optional 6-digit code**: If adding “enter code” path, use 6+ digits, same expiry and single-use; rate limit code verification attempts (e.g. 5 attempts per 15 min per email).

### 6.2 Rate Limiting

- **Registration**: Limit per email (e.g. 3 attempts/hour) and per IP (e.g. 10/hour) to prevent enumeration and spam.
- **Send login link / send code**: Per email (e.g. 5/hour) and per IP (e.g. 20/hour); return same “If an account exists…” message to avoid email enumeration.
- **Verify code / consume token**: Limit failed attempts per IP and per email to mitigate brute-force (e.g. 10 failures/15 min).
- Use existing `RATE_LIMIT_*` and admin overrides where applicable; add dedicated limits for auth endpoints if not already covered.

### 6.3 API Key & Tenant Auth

- **Constant-time comparison**: When validating API key, fetch by `api_key_prefix` only, then compare hash in application code with `crypto.timingSafeEqual()` so timing does not leak validity. Currently comparison is in SQL; consider moving to app-side for high-sensitivity deployments.
- **Key rotation**: Support “reissue API key” for a domain/account: generate new key, invalidate old after grace period; audit log the event.
- **Scope**: API keys are already scoped to tenant/account; ensure every API that reads/writes tenant data resolves tenant from key or session and never trusts client-supplied tenant id without re-validation.

### 6.4 Session & JWT

- **Short-lived access**: Keep JWT expiry reasonable (e.g. 30 days with “remember me”, 24h without); support refresh or re-login when expired.
- **Binding**: Optionally bind session to IP or fingerprint for high-security; document that email compromise implies account compromise for passwordless auth.
- **Revocation**: Admin “revoke all sessions for user” by invalidating tokens (e.g. store a “token version” or “revoked before” timestamp per user and check in middleware).

### 6.5 Domain Verification (Optional but Recommended)

- **Prove ownership** before allowing script/track on a domain: reduces abuse (e.g. someone adding a competitor’s domain).
- **Methods** (choose one or combine):
  - **DNS TXT**: User adds a TXT record (e.g. `ripx-verify=abc123`); backend checks via DNS lookup.
  - **Meta tag**: User adds `<meta name="ripx-verify" content="abc123">` to homepage; backend or script fetches page and checks.
  - **HTTP file**: User places a file at `/.well-known/ripx-verify.txt` with a secret; backend fetches and validates.
- **State**: Store `domain_verified_at` (or `verification_status`) on tenant; block or warn on unverified domains for track/script until verified.

### 6.6 Tenant Isolation (Multi-Tenant Security)

- **Request edge**: Resolve tenant (and user) in auth middleware; attach to `req`; never trust client for tenant identity on sensitive operations.
- **Query discipline**: Every query that reads/writes tenant-scoped data must include tenant filter. Code review checklist for all new queries.
- **Row-Level Security (RLS)**: For defense in depth, consider Postgres RLS policies on key tables so that even buggy application code cannot return another tenant’s rows.
- **Secure mode (storefront)**: For client-side SDK, use HMAC-SHA256 of (e.g. `user_id` + context) signed with environment/API key so the server can reject forged requests that try to read another user’s variant (LaunchDarkly-style “secure mode”).

### 6.7 Audit & Non-Repudiation

- **Coverage**: Log all sensitive actions: registration, email confirm, admin accept/reject, login (success/failure), “open domain”, add domain, API key issue/rotate, invite, role change.
- **Immutable**: Append-only audit log; no updates/deletes (only retention purge after policy period if needed).
- **Fields**: Include actor (user id or email), action, resource (domain/id), IP, timestamp, and optionally request id for correlation.

---

## 7. Compliance & Privacy

- **GDPR / data subject rights**: You already have consent gating (`RIPX_CONSENT_REQUIRED`), purge on uninstall, and export. Ensure “export my data” and “delete my account” for standalone users (export + delete or anonymize `standalone_users` and related rows).
- **Data isolation**: Per-tenant data must not be returned to other tenants; audit logs and exports restricted to admin or the owning tenant/user.
- **Retention**: Document and enforce retention for audit logs, events, and webhook_events; consider hot/warm/cold tiers for audit if volume grows.
- **Consent**: Storefront script should respect consent before tracking (already supported); document in privacy/terms.
- **Encryption**: Use **TLS in transit** for all APIs and script delivery; consider **encryption at rest** for DB and backups (e.g. via cloud provider or application-level for sensitive columns).

---

## 8. Best-in-Class A/B Testing Platform (Summary)

To position RipX as a **leading, secure A/B testing tool**:

1. **Clear RBAC**: Owner / member / viewer per domain; enforce in API and UI (e.g. viewer cannot edit tests).
2. **Invite flow**: Invite by email; invitee gets link; after signup and admin accept, they get access to the invited domain only.
3. **Domain verification**: Optional but recommended (DNS/meta/file) so only verified domains can use script/track.
4. **Secure storefront SDK**: HMAC-based verification so client cannot peek other users’ variants; reject requests without valid hash.
5. **Tenant isolation**: Middleware always resolves tenant; every query filtered by tenant; optional RLS.
6. **Audit**: Full audit trail for auth, domain lifecycle, and test changes; immutable, with retention policy.
7. **Rate limiting**: Auth and sensitive endpoints rate limited per IP and per identity.
8. **Token hygiene**: Short-lived, single-use, hashed tokens for magic link and codes.

---

## 9. Further Scope: Enterprise & Operational Excellence

Additional improvements that strengthen RipX as an enterprise-grade, secure A/B testing platform:

### 9.1 Statistical Rigor (Multiple Comparisons & FDR)

- **Problem**: Running many A/B tests or looking at many metrics increases false positives (“multiple comparisons” or “look-elsewhere” effect). Implementing only “winning” variants can make the proportion of false discoveries high.
- **Approach**: Offer **False Discovery Rate (FDR)** control, e.g. **Benjamini–Hochberg** (or similar) to adjust p-values/confidence when many tests or metrics are evaluated. Optionally tier primary vs secondary metrics (e.g. Optimizely-style). You already have significance and guardrails; FDR is the next step for teams running many experiments.
- **Implementation**: Optional “FDR correction” or “multiple comparisons correction” in analytics; document in stats methodology.

### 9.2 API Versioning & Deprecation Policy

- **Versioning**: Prefer **URI path versioning** (`/api/v1/...`) for breaking changes: clear, cacheable, and easy to run different versions. You already send `X-API-Version`; formalise when to bump and how clients are notified.
- **Deprecation**: Publish a **deprecation policy**: e.g. minimum 180 days notice for breaking changes, `X-API-Deprecation` or `Sunset` header, changelog and migration guide. Add new optional fields instead of changing existing ones where possible.

### 9.3 Observability & Incident Response

- **Logging**: **Structured logs** (e.g. JSON) with **request/correlation IDs** so trace flows across services; include tenant/user id (masked if needed) for debugging without exposing PII.
- **Health**: Extend `/health` (or `/api/health`) with **degraded** states (e.g. DB slow, Redis down) so load balancers and runbooks can react.
- **Incident response**: Document **runbooks**: e.g. “Credential compromise” (rotate JWT_SECRET, API keys, revoke sessions), “Suspicious activity” (revoke keys, notify users, audit). Align with §6.7 audit; consider automated credential rotation triggers.

### 9.4 Backup & Disaster Recovery

- **RPO/RTO**: Define and document **Recovery Point Objective** and **Recovery Time Objective**; align DB backup frequency and restore tests with them.
- **Tested restore**: Run **periodic restore tests** (e.g. from backup to staging) so recovery is validated.
- **Secrets in backups**: Ensure **JWT_SECRET**, API key material, and other secrets are handled securely in backups (encryption, access control); avoid storing plaintext secrets in backup artifacts.

### 9.5 Anomaly Detection & Security Alerts

- **Anomaly detection**: Alert on unusual patterns: e.g. spike in failed logins, many new domains from one account, very high track volume from one tenant. Use existing notification pipeline (email/Slack) where possible.
- **Security events**: Send **security alerts** for: admin accept/reject, API key issue/rotate, session revocation, bulk export, login from new device/location (if you add device/location later). Helps admins detect compromise.

### 9.6 Quotas & Per-Tenant Limits

- **Fair use**: Optional **per-tenant** or **per-account** limits: e.g. max active tests, max events per day, max domains. Prevents one tenant from consuming all resources; configurable in admin or plan.
- **Graceful handling**: Return **429** or clear error when over limit; document limits in API docs and terms.

### 9.7 Documentation & Developer Experience

- **API docs**: **OpenAPI (Swagger)** spec for public APIs so clients can generate clients and test; keep in sync with code.
- **Changelog**: Maintain a **changelog** (e.g. keep a CHANGELOG.md) for API and script version changes; link from deprecation notices.
- **Script/SDK versioning**: Document **minimum supported script version**; deprecation policy for old script versions (e.g. 12 months support); script endpoint can return `min_script_version` so storefronts can prompt upgrade.

---

## 10. Decisions to Confirm

1. **Login default** (see §2.3): Prefer **magic link only**, or **code-only 2nd step**, or **both** (user chooses “Email me a link” vs “Email me a code”)?
2. **Primary domain**: Used only for “default domain when I have multiple”, or also for “first domain at registration” (pre-create tenant from that domain)?
3. **Domain creation**: Only **standalone** (user enters domain, backend creates tenant + API key), or also **Shopify connect** for the same user (OAuth and add tenant to user)?
4. **Admin panel for admins**: Should admins also see a **Domain list** for their own domains, or only the full admin panel?
5. **Domain verification**: Require domain ownership verification (DNS/meta/file) before enabling track/script, or keep it optional?

---

## 11. Summary

- **Best approach**: Keep **user** and **domain** separate; add **user_domain_access** for “permitted users” and “domains I can access”. Extend **standalone_users** with **account_id** and **primary_domain_id**.
- **Registration**: Keep current flow; add **acceptance email** when admin accepts; optionally add **primary domain** at registration.
- **Login**: Keep **magic link**; optionally add **“enter code” 2nd step** so “every time = email with token, enter token on 2nd step” is satisfied.
- **Post-login**: **Non-admin** → Domain list only; **Admin** → full admin panel. From Domain list, **Open** domain → app for that domain.
- **Domain creation**: Add **“Add domain”** on Domain list; backend creates tenant, links to user/account, returns API key once; show connection details and permitted users on Domain list.

- **Security**: Token hygiene (CSPRNG, short expiry, single-use, hash storage) is already in place; add rate limits on auth endpoints, optional constant-time API key check, domain verification, and extend audit to auth and domain lifecycle. Consider storefront “secure mode” (HMAC) and RLS for defense in depth.
- **Compliance**: GDPR export/delete for standalone users; retention and consent documented; audit trail immutable with retention policy.

- **Further scope (§9)**: Statistical rigor (FDR / multiple comparisons), API versioning & deprecation, observability & incident response, backup & DR, anomaly detection & security alerts, per-tenant quotas, and documentation (OpenAPI, changelog, script versioning). Phase 6 checklist captures these as optional enterprise and operational improvements.

If you confirm the decisions in §10, the next step is to implement Phase 1 (emails + optional primary domain + optional code step + auth rate limits), then Phase 2 (schema + Domain list API + Domain list page + routing/guards), then Phase 3 (domain creation + audit coverage + optional domain verification). Phases 5 and 6 add security/compliance and enterprise/operational improvements as needed.
