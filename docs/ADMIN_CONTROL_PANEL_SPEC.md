# RipX Admin Control Panel – Full Specification (Advanced)

This document defines a **full-featured admin control panel** for RipX so that **every controllable aspect** of the project can be managed from one place. It is research-backed and aligned with your existing backend (routes, jobs, services, DB) and security best practices.

**Document convention:** All project Markdown (specs, research, guides) lives under the `docs/` folder; the only Markdown file at the repository root is `README.md`.

---

## 1. Purpose and audience

- **Purpose:** Single place for platform operators to **control and observe** users, domains, tests, settings, jobs, integrations, security, and product behavior.
- **Audience:** Internal admins / super-admins only. Access must be role-gated (e.g. `admin` / `superadmin`). Not for end-customers.
- **Principles:** Least privilege, full audit of admin actions, no raw DB access from the app.

---

## 2. Core entities and data (observe & manage)

### 2.1 Users

- **List:** All users (id, email/identifier, name, role, created_at, last_seen, domains_count, status [active | locked | suspended]).
- **Detail:**
  - Profile: email, name, role, created_at, last_login, timezone, preferences (theme, etc.).
  - **Domains / tenants** linked (with role per domain if applicable).
  - **Sessions:** active sessions, device/browser, IP, last activity; action: **Revoke all sessions**.
  - **Activity log:** recent actions (logins, test create/start/stop, exports, settings changes).
- **Actions:** Impersonate (short-lived token + audit), **Lock / unlock account**, Change role, Reset MFA (if added), Send support email, **Delete user** (soft delete + GDPR-style export option).

### 2.2 Domains and tenants

- **List:** All domains (domain, tenant_id, platform [Shopify | standalone], owner user_id, created_at, **status** [active | suspended | pending | blocked], tests_count, visitors_30d, **script_status** [ok | error | blocked]).
- **Detail:**
  - Domain, platform, API key status (masked), **Script install status** (last script load / proxy hit, errors).
  - Owner and collaborators (user_id, role, added_at).
  - **Tests:** count by status; list last N tests with links.
  - **Usage:** visitors, events, conversions (7/30/90 days); optional revenue.
  - **Shop-level settings (overridable by admin):** min_sample_size, confidence_level, auto_stop_enabled, outbound_webhook_url, outbound_webhook_events, GA4/BigQuery config (from `shop_settings`).
- **Actions:** **Suspend / unsuspend domain** (script and API reject with clear message), **Block domain** (hard block list), Transfer ownership, **Regenerate API key** (standalone; with audit), Override shop settings (min sample, confidence, webhook, integrations), View raw tenant/shop_settings row.

### 2.3 Accounts (multi-store)

- **List:** All accounts (account_id, name, domains[] count, owner user_id, created_at).
- **Detail:** Account name, owner, list of domains with links; per-domain: shop_domain, platform, tests count, last activity.
- **Actions:** Add/remove domain, Change owner, Merge accounts (advanced).

### 2.4 Tests (global)

- **List:** All tests across all domains (paginated, filterable by domain, status, type, date range, has_guardrail, has_personalization).
- **Columns:** id, name, domain, type, status, variants count, visitors, conversions, revenue, created_at, updated_at, **scheduled_start/stop**, **guardrail_enabled**, **personalization**.
- **Actions:** View (link to app), **Start / Stop** (admin override), **Archive**, **Delete** (soft delete with audit), **Clone** (as another domain if needed for support).

### 2.5 Notifications

- **List:** All notifications (system-wide or per domain): id, user/domain, type, title, read, created_at.
- **Actions:** **Create system-wide announcement** (all users or by role/domain), Mark as read (support), Delete (cleanup).

### 2.6 Targeting presets

- **List:** All presets across domains (id, name, shop_domain, created_at).
- **Actions:** View JSON, Delete (with audit).

### 2.7 Promo links

- **List:** All promo links (test_id, token, domain, created_at, expires).
- **Actions:** View, **Disable / revoke** by test or domain (e.g. abuse).

### 2.8 Outbound webhooks

- **List:** Per-domain webhook config (domain, url masked, events, last_triggered, last_status).
- **Detail:** Delivery history (last N events: event, timestamp, status code, response time).
- **Actions:** **Override URL or events** for a domain, Disable webhooks for domain.

### 2.9 Shop sessions (Shopify only)

- **List:** All `shop_sessions` (shop_domain, installed_at, updated_at, scope). Used for Shopify API access tokens.
- **Actions:** **Revoke session** (delete token → force re-auth / re-install for that shop). View scope.

### 2.10 Incoming webhook events (Shopify)

- **List:** Last N rows from `webhook_events` (shop_domain, webhook_id, topic, received_at). Idempotency log for orders/create, products/update, app/uninstalled.
- **Use:** Audit/debug “did we receive this webhook?”; filter by domain or topic.

### 2.11 Conflict detection (per domain)

- **View:** For a given domain, list **overlapping running tests** (same target_type/target_id). Uses `conflictDetectionService.findConflicts`.
- **Actions:** No direct “resolve” (user must stop one test); admin can **Stop test** from global test list to resolve.

### 2.12 Test health (bulk view)

- **List:** Tests with **health score** (from `testHealthService.calculateHealthScore`): filter by health level (poor / fair / good / excellent), domain, status.
- **Columns:** test id, name, domain, status, totalVisitors, daysRunning, healthLevel, issues (sample size, SRM, allocation, etc.).
- **Use:** Prioritize support, nudge users to fix allocation or wait for sample size.

### 2.13 Significance alerts

- **List:** All rows in `significance_alerts` (test_id, shop_domain, winner_variant_id, winner_variant_name, lift, p_value, alerted_at). Tracks which tests have already triggered a significance notification/webhook.
- **Actions:** **Reset alert** for a test (delete row) so that if the test is still significant, the job can fire notification again (support/debug).

### 2.14 Full test templates

- **List:** Targeting presets that have `goal` and `variants` set (full test templates). id, name, shop_domain, created_at.
- **Actions:** View JSON (goal + variants + segments), Edit (advanced), Delete.

### 2.15 Event catalog (data discovery)

- **List:** Per domain, **distinct** `event_type` and `event_name` from `events` (with counts). Helps admins/support see what custom events a domain uses (e.g. add_to_cart, newsletter_signup).
- **Use:** Debug analytics, document API usage.

### 2.16 Client errors (storefront)

- **List:** If you persist **POST /api/track/client-error** payloads to a table (e.g. `client_errors`: domain, test_id, message, stack, user_agent, created_at), admin can list last N per domain.
- **Use:** Debug script errors in production; optional “ack” or “ignore” for known issues.

---

## 3. Platform configuration (full control)

### 3.1 Global / environment-style settings (admin override)

Store overrides in `key_value_store` or a dedicated `admin_config` table; app reads admin override first, then env.

| Key                  | Description                | Default / env          | Admin can                                                                                 |
| -------------------- | -------------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| **Platform mode**    | Shopify vs standalone-only | `RIPX_STANDALONE_ONLY` | Toggle “Allow Shopify installs” (standalone always allowed)                               |
| **Rate limits**      | API and track              | `RATE_LIMIT_*`         | Set global max requests per window; **per-domain overrides** (e.g. higher for enterprise) |
| **Track limit**      | Storefront track calls     | `RATE_LIMIT_TRACK_MAX` | Global and per-domain override                                                            |
| **Body limit**       | Max request body           | `BODY_LIMIT`           | Increase for webhooks if needed                                                           |
| **Request timeout**  | Server timeout             | `REQUEST_TIMEOUT_MS`   | Tune for long exports                                                                     |
| **Script delivery**  | Block script for domain    | —                      | Add domain to “block list”; script and proxy return 403 + message                         |
| **Maintenance mode** | Global or per-domain       | —                      | If set, script returns minimal JSON (e.g. “maintenance”); app shows banner                |

### 3.2 Feature flags (per domain or global)

| Flag                          | Scope               | Effect                                              |
| ----------------------------- | ------------------- | --------------------------------------------------- |
| **Heatmaps**                  | Global / per domain | Enable/disable heatmap collection and UI            |
| **Export**                    | Global / per domain | Enable/disable CSV/BigQuery export                  |
| **GA4**                       | Per domain / global | Enable/disable GA4 forwarding (even if configured)  |
| **BigQuery**                  | Per domain / global | Enable/disable BQ export                            |
| **Outbound webhooks**         | Per domain          | Master on/off for webhooks                          |
| **Max tests**                 | Per domain / plan   | Cap number of tests (draft + running + stopped)     |
| **Max variants**              | Per test / domain   | Cap variants per test                               |
| **Personalization / rollout** | Per domain          | Enable/disable personalization and rollout features |
| **Significance alerts**       | Per domain          | Enable/disable significance alert jobs              |
| **Guardrails**                | Per domain          | Allow/disallow guardrail config on tests            |
| **Scheduled start/stop**      | Per domain          | Allow scheduled test start/stop (requires Redis)    |

Admin UI: list of flags, scope (global vs domain), current value; edit with audit.

### 3.3 Shop-level settings (admin override)

For any domain, admin can **override** (not only view) what is in `shop_settings`:

- min_sample_size, confidence_level, auto_stop_enabled
- outbound_webhook_url, outbound_webhook_events
- GA4: ga4_measurement_id, ga4_api_secret
- BigQuery: bigquery_project_id, bigquery_dataset, bigquery_credentials (masked)

Override stored in same table with an `overridden_by_admin_at` / `overridden_by_admin_id` so tenants see “Managed by platform” where applicable.

### 3.4 Key-value store (admin UI)

- **List:** Keys (and optionally scope: global vs shop_domain).
- **Actions:** Get, Set, Delete. Use for: feature flags, maintenance message, “Terms URL”, “Privacy URL”, custom limits, or any future config without code deploy.

### 3.5 Consent and script behavior

| Key                  | Description                                                                   | Admin can                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Consent required** | Storefront script waits for consent before tracking (`RIPX_CONSENT_REQUIRED`) | Override per domain or global (key e.g. `consent_required`) so script.js returns consentRequired: true/false in runtime config.      |
| **Script cache**     | Script served with `X-Script-Version` and long cache                          | **Invalidate cache** per domain: bump a “script_version” key so next script request gets a new version query param and fresh script. |

### 3.6 Analytics and aggregation

- **Analytics daily:** If `timeSeriesService.aggregateDailyAnalytics` is run by a job or cron, admin can see **last run time** (from `key_value_store` or a job log) and **Trigger aggregation now** for a given date or “yesterday”.
- **BigQuery:** Last export time per domain (from export service / key_value_store); trigger export from admin.

---

## 4. Jobs and background processing

### 4.1 Queues (Bull / Redis)

- **List:** Queues (e.g. `scheduled-tests`, `archive-old-tests`); per queue: pending count, active, completed (last 24h), failed (last 24h), delayed.
- **Detail:** List last N jobs (id, name, data, progress, finishedOn, failedReason); **Retry** failed, **Remove** stuck job.
- **Actions:** **Trigger manual run** (e.g. “Run archive job now”), Pause/Resume queue (if supported by Bull).

### 4.2 Job definitions (reference)

| Job                     | Trigger                           | Admin can                                        |
| ----------------------- | --------------------------------- | ------------------------------------------------ |
| **Scheduled tests**     | Cron / repeat                     | View next run, trigger once                      |
| **Archive old tests**   | Cron / repeat                     | View next run, trigger once                      |
| **Auto-stop**           | Per test (when enabled)           | — (observability via test list)                  |
| **Guardrail processor** | Per test (when guardrail enabled) | — (observability)                                |
| **Significance alerts** | Per test / domain                 | Enable/disable per domain (see Feature flags)    |
| **BigQuery export**     | On-demand / schedule              | Trigger export for domain, view last export time |

### 4.3 Observability

- **Failed jobs:** List last 50 failed (queue, jobId, error, timestamp); Retry, Discard.
- **Slow jobs:** If you add timing, show jobs > N seconds.
- **Redis:** Status (ok / error / not configured); if not configured, show “Scheduled jobs disabled”.

---

## 5. Usage, analytics, and billing

### 5.1 Platform dashboards

- **Overview:** Total domains, users, tests (by status), events/visitors/conversions (7/30/90 days), revenue (if tracked).
- **Growth:** New signups (users, domains) per day/week; new tests per day.
- **Health:** Script load success rate per domain (if you track), API error rate by endpoint (if you add metrics), DB/Redis status from `/health`.

### 5.2 Usage export

- **Export CSV/Excel:** By domain or by user: visitors, events, conversions, revenue, test count (date range). For billing or support.

### 5.3 Quotas and limits (future-ready)

- **Per-domain caps:** Max tests, max events/month, max exports/month (stored in admin_config or key_value_store).
- **Overage:** Flag domains over cap; optional “overage allowed” toggle per domain.

---

## 6. Security and compliance

### 6.1 Admin auth and session

- **MFA:** Require MFA for all admin users (recommended).
- **Short-lived tokens:** Access token 15 min, refresh 7 days; auto-refresh before expiry.
- **Session list:** Admin sees own sessions; **Revoke all other sessions**.
- **IP allowlist (optional):** Restrict admin panel access to certain IPs (env or admin_config).

### 6.2 Audit log

- **Scope:** Every admin action (who, what, when, IP, resource id). Write to `audit_log` (or dedicated `admin_audit_log`).
- **Actions logged:** Login, lock user, suspend domain, override settings, regenerate API key, delete test, change role, impersonate, feature flag change, job trigger, export data.
- **UI:** Read-only list (filter by admin, action, date, resource).

### 6.3 Data export and deletion (GDPR-style)

- **Export user data:** Per user: profile, domains, tests metadata, events summary (no raw PII in events if possible); download as JSON/CSV.
- **Delete user:** Soft delete user, anonymize in audit; optional cascade: suspend domains, archive tests.
- **Delete domain:** Soft delete tenant/domain, archive tests, anonymize assignments/events (or hard delete with retention policy).

---

## 7. System and operations

### 7.1 Health and dependencies

- **Dashboard:** DB status, Redis status (from `/health` or custom admin endpoint).
- **Version:** APP_VERSION, backend git commit (if set), frontend version (if set).
- **Env hints:** Which features are “on” (e.g. Redis yes/no, GA4 env set, BigQuery env set) without exposing secrets.

### 7.2 API and script control

- **Block list:** Domains that get 403 on script and track (and optional message).
- **Maintenance message:** Global or per-domain message returned by script when maintenance mode is on.
- **Rate limit overrides:** Table of domain → overrides (e.g. track_max, api_max) stored in key_value_store or admin_config.

### 7.3 Content and legal (optional)

- **Terms of Service URL,** **Privacy Policy URL:** Stored in key_value_store; app and Connect page can show links in footer.
- **Announcement banner:** HTML or text + “dismissible” flag; show on app layout when set.

---

## 8. Suggested workflows (expanded)

1. **Onboarding:** New domain appears in Domains with status “pending” → admin verifies script/API → mark “active” or “suspended”.
2. **Abuse / support:** Filter tests or domains by volume or errors → Domain detail → Owner → Tests → Suspend domain or revoke promo links; lock user if needed.
3. **Billing / usage:** Export usage by domain for last month; set or adjust quotas; flag overage.
4. **Incident:** System → Failed jobs, API errors → Audit log → Affected domains; enable maintenance mode if needed; fix and retry jobs.
5. **Feature rollout:** Enable “Heatmaps” for one domain via Feature flags → observe; then enable globally.
6. **Config override:** Customer needs higher rate limit → Admin → Domain → Rate limit override (track 5000).
7. **GDPR:** User request → Admin → User detail → Export data; then Delete user (soft + anonymize).
8. **Impersonation:** Support ticket → Admin → User → Impersonate → short-lived token → debug in app; all actions in audit.

---

## 9. Technical implementation

- **Auth:** Admin role on user (e.g. `role = 'admin' | 'superadmin'`); middleware `requireAdmin` on all `/api/admin/*` routes. Separate admin login or reuse main app with role check.
- **Making a user admin:**
  - **Local:** Set `RIPX_ADMIN_SHOP_DOMAINS=your-store.myshopify.com` in `.env` (comma-separated for multiple). No DB change needed.
  - **Production:** Set `users.role = 'admin'` or `'superadmin'` in the database (see [docs/getting-started/ADMIN_SETUP.md](getting-started/ADMIN_SETUP.md) for step-by-step instructions).
  - **Scripts:** Set `ADMIN_API_KEY` in env and send `X-Admin-API-Key` header for key-based admin access.
- **API:** Prefix `/api/admin/*`; reuse existing DB, add views/queries for aggregates; optional `admin_config` and `admin_audit_log` tables.
- **UI:** Section under `/admin` with own layout (sidebar: Users, Domains, Accounts, Tests, Notifications, Presets, Promo links, Webhooks, **Configuration**, **Feature flags**, **Jobs**, **Usage**, **Audit**, **System**). Reuse Polaris and design system.
- **Impersonation:** Issue short-lived JWT with `impersonated_user_id`; backend sets `req.user` to that user; audit “admin X impersonated user Y”.

---

## 10. MVP vs phased build

| Phase       | Scope                                                                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MVP**     | Users list+detail (with domains), Domains list+detail (with owner, tests, status), Tests list (all) with filters, Platform stats (counts), Audit log (write for critical actions + read view), Suspend domain, Lock user. |
| **Phase 2** | Shop settings override, Feature flags (global + per domain), Key-value store UI, Jobs list + retry/trigger, Outbound webhooks list + delivery history, Rate limit overrides.                                              |
| **Phase 3** | Notifications (system-wide create), Promo links list + revoke, Impersonation, Data export/delete (GDPR), Maintenance mode, Block list, Advanced usage export.                                                             |
| **Full**    | Everything above + MFA for admins, IP allowlist, Billing/quotas, Announcement banner, Content URLs (Terms/Privacy).                                                                                                       |

---

## 11. Summary: what the admin panel can control

- **Users:** View, lock/unlock, role, sessions, impersonate, export/delete.
- **Domains/Tenants:** View, suspend/block, script block list, settings override, API key regenerate, webhooks override.
- **Accounts:** View, owner, add/remove domain, merge.
- **Tests:** View all, start/stop, archive, delete, clone.
- **Notifications:** Create system-wide; view/delete.
- **Presets / Promo links:** View, delete or revoke.
- **Configuration:** Global and per-domain rate limits, body limit, timeout, maintenance mode, block list.
- **Feature flags:** Heatmaps, export, GA4, BigQuery, webhooks, max tests/variants, personalization, significance alerts, guardrails, scheduled tests (per domain or global).
- **Shop settings:** Override min sample, confidence, auto_stop, webhook URL/events, GA4/BQ (per domain).
- **Key-value store:** Get/set/delete for feature flags, URLs, limits, custom config.
- **Jobs:** List queues and jobs, retry failed, trigger manual run, pause/resume.
- **Usage:** Dashboards, CSV/Excel export, quotas/overage (when added).
- **System:** Health, version, audit log, GDPR export/delete.
- **Shop sessions (Shopify):** List, revoke (force re-auth).
- **Incoming webhooks:** List webhook_events (audit).
- **Conflict detection:** View overlapping tests per domain.
- **Test health:** Bulk list/filter by health level.
- **Significance alerts:** List, reset for re-alert.
- **Full test templates:** List, view/edit/delete presets with goal+variants.
- **Event catalog:** Distinct event_type/event_name per domain.
- **Client errors:** List stored storefront errors (if persisted).
- **Consent / script:** Consent required override; script cache invalidation.
- **Analytics:** Trigger daily aggregation; trigger BigQuery export.

**Appendix A** maps every API route, service, job, table, and frontend area so you can trace “control everything” to the codebase and add more advanced features (e.g. §12 and §13) as you scale.

This spec gives you a single reference to control the **full project** from the admin panel while staying consistent with your existing RipX backend and security practices.

---

## 12. Advanced features (research-backed, optional)

From enterprise experimentation platforms (e.g. Amplitude Experiment, VWO) and SaaS admin best practices, consider adding when scaling:

- **SSO / SAML:** Optional Single Sign-On for admin (or for tenant users) with IdP (Okta, Azure AD, etc.).
- **SCIM provisioning:** Automated user/group sync from identity provider for large teams.
- **Currency / locale:** Per-domain or per-account currency for revenue display (e.g. USD, EUR); locale for dates and numbers in app.
- **Data retention policy:** Per domain or global: auto-delete or anonymize `events` / `test_assignments` / `heatmap_events` older than N days (e.g. 365). Admin sets retention_days; job runs periodically.
- **Permission groups:** If you add multiple roles (viewer, editor, admin) per account, admin panel to manage **permission groups** and assign users.
- **Usage-based billing hooks:** Emit “usage” events (MTU, events/month, tests count) to your billing provider or webhook; admin sees “billing status” per account (e.g. within plan, overage).
- **Custom metrics / goal templates:** Admin-defined **global goal templates** (e.g. “Revenue + Add to cart”) that all domains can pick when creating a test; stored in key_value_store or `goal_templates` table.

---

## 13. Advanced research (industry & compliance)

This section summarizes **deeper research** into enterprise experimentation platforms (Statsig, Optimizely, LaunchDarkly, VWO, Amplitude), multi-tenant SaaS security (SOC2), and observability/billing patterns. Use it to extend the admin panel and backend when scaling to enterprise.

### 13.1 Statistical governance (organization experiment policy)

**Source:** Statsig Organization Experiment Policy, product experimentation best practices.

- **Organization-level defaults (admin-set):**
  - **Default experiment duration** (e.g. 14 days) so new tests inherit a sensible run length.
  - **Minimum sample size** default (already in shop_settings; can be enforced globally or per plan).
  - **Sequential testing** default: allow or require sequential methods for early stopping (align with your Bayesian/auto-stop).
  - **Custom significance level** default (e.g. 95% confidence) applied to new tests.
- **Enforcement:** Optional "strict policy" so non-admins cannot override these defaults (stored in admin_config or key_value_store; scope global or per account).
- **Power analysis:** Admin or docs link to power/sample-size calculator; optionally store "recommended minimum sample" per goal type and expose in Test Creator.
- **Admin UI:** "Experiment policy" page: list of defaults, scope (global / per account), lock/unlock override for non-admins.

### 13.2 Experiment monitoring and health (observability)

**Source:** Statsig experiment monitoring, LaunchDarkly guarded rollouts, AWS Evidently.

- **Per-test monitoring (admin or support view):**
  - **Sample ratio mismatch (SRM):** Hourly breakdown of assignments by variant; chi-squared test; red/yellow flag when SRM detected (you already have SRM in analytics; expose in admin test detail).
  - **Crossover detection:** Users who saw multiple variants (contamination); list count and optionally user IDs for debugging.
  - **Exposure stream:** Cumulative exposure over time (chart) to confirm traffic ramp.
  - **Statistical alerts:** Configurable p-value thresholds (e.g. &lt; 0.05 = green, 0.05–0.10 = yellow, &gt; 0.10 = red); show in test list and detail.
- **Guarded rollouts (optional):** When using personalization/rollout, evaluate a "guard" metric (e.g. conversion rate) on a short interval (e.g. 1–5 min); **auto-rollback** if metric regresses beyond a threshold (similar to LaunchDarkly). Admin config: enable per domain, guard metric, threshold, check interval.
- **Kill switch:** Admin (or API) can **immediately stop** a test and optionally revert to control; all such actions in audit log with reason.
- **Admin UI:** Test detail "Health" tab: SRM status, crossover count, exposure chart, last significance check; global "Tests with health issues" filter (you already have test health score; extend with SRM/crossover in list).

### 13.3 Data quality (bot filtering and outliers)

**Source:** Statsig bot filtering, Adobe/Statsig outlier handling.

- **Bot filtering:**
  - **Known bots:** Strip or tag requests from known crawlers (e.g. search engines, AI scrapers) so they are excluded from assignment and analytics (config: list of User-Agent substrings or IP ranges; admin UI: view/edit list, enable/disable).
  - **Optional ML/anomaly:** Flag sessions with anomalous behavior (e.g. 50 clicks in 1 minute); mark as "suspected bot" and exclude from primary metrics; admin can tune thresholds.
- **Outlier handling:**
  - **Winsorization / caps:** Per-metric caps (e.g. max 5 signup clicks per user per day) to limit impact of outlier users; config in admin (global or per domain) and applied in analytics aggregation.
  - **Revenue outlier smoothing:** Cap or winsorize extreme revenue values per user so one big order doesn't skew test results; admin toggle and cap value.
- **IP filtering:** Optional exclude list (e.g. internal IPs, VPN ranges) so internal traffic is not counted; admin UI: list of IPs or CIDRs.
- **Admin UI:** "Data quality" page: bot list, outlier caps, IP exclude list; per-domain overrides; "Preview impact" (count of events/assignments that would be excluded).

### 13.4 Multi-tenant security and SOC2-style controls

**Source:** Multi-tenant SaaS architecture guides, SOC2 (Atlassian, Matillion), Omnistrate governance.

- **Tenant isolation:**
  - **Tenant guard:** Every admin and tenant-facing API resolves tenant (domain/account) first and enforces access; no cross-tenant data in responses (you already scope by shop/tenant; document and audit).
  - **Composite indexes:** All tenant-scoped queries use indexes that start with `tenant_id` (or equivalent) to avoid full table scans and data leakage.
- **Access control:**
  - **RBAC:** Admin panel restricted to roles (e.g. admin, superadmin); tenant users get viewer/editor/admin per account (when you add multi-role).
  - **Per-tenant rate limits and quotas:** Prevent "noisy neighbor"; admin sets caps (events/month, tests, API calls) and sees usage vs cap.
- **Audit and compliance:**
  - **Audit log:** Every admin action (who, what, when, IP, resource) and high-value tenant actions (e.g. delete test, regenerate API key) stored immutably; retention policy (e.g. 1 year) configurable by admin.
  - **Secrets management:** No secrets in code; GA4/BigQuery credentials in env or secure store; admin UI shows "configured" but never raw secret.
  - **Penetration testing and vulnerability program:** Document process for periodic pen tests and responsible disclosure (policy doc, not admin UI).
- **Admin UI:** "Security" section: audit log viewer (already in spec), "Tenant isolation" status (e.g. checklist), rate limit and quota matrix per domain.

### 13.5 Privacy, data residency, and GDPR

**Source:** PostHog data storage, BigQuery/Snowflake clean rooms, differential privacy.

- **PII and anonymization:**
  - **Pre-storage transforms:** Optional IP anonymization, PII hashing or redaction for `events` and other tables (e.g. hash email in custom attributes); config per domain or global (key_value_store or admin_config).
  - **Differential privacy (advanced):** For shared or exported aggregates, optional differential-privacy budget so outputs don't allow re-identification; consider for "shared" dashboards or data clean room integrations later.
- **Data residency:**
  - **EU hosting option:** If you offer a separate deployment or region (e.g. EU-only DB and app), admin can see "Region" per deployment and which domains are mapped to which region.
  - **Retention:** Already in §12 (data retention policy); ensure job and admin UI show "last run" and "next run" for retention job.
- **Consent:** Already in spec (consent required override); ensure script and track respect consent and that admin can see "consent_required" per domain.
- **Admin UI:** "Privacy" page: retention policy, PII settings (anonymize IP, hash PII), data residency/region per tenant (if applicable).

### 13.6 Usage metering and billing hooks

**Source:** Stripe meters, Microsoft Marketplace metering.

- **Meters (conceptual):** Define countable dimensions for billing, e.g. monthly active tests, events/month, MTU (monthly tracked users), exports/month.
  - **Event name and aggregation:** e.g. `events_monthly` = count(events) per domain per month; `tests_active` = count(tests where status = running) at month end.
  - **Dimensions (optional):** Tag usage by plan, region, or product line for segmented pricing.
- **Idempotency:** When sending usage to a billing provider (Stripe, webhook), use idempotency keys so duplicate events don't double-charge.
- **Admin UI:** "Usage" already has dashboards and export; add **"Billing export"** or **"Meter feed"**: per-account/domain usage (tests, events, MTU) by month; "Send to billing webhook" or "Sync to Stripe" (if you integrate). Optional: "Quota vs usage" table with overage flags.
- **Rate limits:** Already in spec (per-domain overrides); ensure usage and rate limits are aligned (e.g. track_limit per day vs events/month for billing).

### 13.7 SLA, availability, and status

**Source:** Optimizely SLA 2024, status page best practices.

- **Availability:**
  - **Definition:** Uptime % for script and API (e.g. 99.9%); exclude scheduled maintenance with advance notice (e.g. 10 business days).
  - **Monitoring:** Health checks (e.g. every 1–5 min) for script endpoint, track endpoint, and critical API paths; alert on failure.
- **Status page (optional):** Public or customer-facing page: "Operational / Degraded / Outage" for script, API, dashboard, exports; incident history and scheduled maintenance.
- **Incident process:**
  - **RFO (Reason for Outage):** If SLA is breached, document cause and remediation; store in admin (e.g. "Incidents" list with date, duration, affected components, RFO).
  - **Service credits:** Policy (e.g. 10–50% credit by downtime tier); admin can record "Credit issued" per account for billing reconciliation.
- **Admin UI:** "System" section: add "Uptime (last 30d)" from health-check logs; "Incidents" list (create/edit RFO); "Scheduled maintenance" (date, message, scope). Optional: "Status page" config (URL, components to show).

### 13.8 Rollback and change history (experiment and config)

**Source:** LaunchDarkly change history, Optimizely rollback.

- **Experiment lifecycle:**
  - **Rollback:** One-click "Revert to control" or "Stop and reset" for a test; audit log entry with reason; optional "Rollback" history on test detail (e.g. "Stopped by admin at &lt;time&gt;, reason: guardrail breach").
  - **Change history:** Full history of test config (variants, allocation, targeting, start/stop) from audit_log or dedicated test_history table; admin and support can view "Who changed what and when."
- **Config and feature flags:**
  - **Feature flag history:** When admin changes a feature flag, store previous value and timestamp; list in "Configuration history" or "Feature flag history."
  - **Key-value store:** Optional versioning (previous value + timestamp on set); admin can "Revert to previous" for critical keys.
- **Admin UI:** Test detail "History" tab; Config "History" for feature flags and key-value store (read-only list with diff or old/new values).

### 13.9 AI in experimentation (other platforms and research)

Research across **AI-powered experimentation platforms**, **agentic AI**, **LLM/prompt A/B testing**, and **AI copilots**—for future admin and product alignment. All references are external; no new root-level Markdown files—spec and supporting docs live under `docs/` (root README only).

#### 13.9.1 Agentic AI and full-lifecycle experimentation

**Sources:** Optimizely Opal benchmark (2024–2025), agentic AI experimentation reports.

- **Optimizely Opal:** Agent orchestration for marketing—pre-built and custom agents for ideation, metric selection, variation creation, and analysis. Benchmark across ~900 companies, ~47k interactions: ~58.7% of agent usage is experimentation; teams using AI across the full lifecycle see **+78.7% experiments created**, **+9.3% win rates**, **+24.1% personalization campaigns**, **−53.7% faster campaign completion**. Takeaway: impact comes from AI across the full experimentation lifecycle, not single tasks.
- **Admin/product implications:** If RipX adds an AI copilot or agents: admin controls for enabling/disabling AI features per domain, usage/quotas for AI calls, audit of AI-generated changes (e.g. variant copy, targeting suggestions), and optional “AI policy” (allowed actions, guardrails).

#### 13.9.2 Natural-language and AI-generated test creation

**Sources:** VWO Copilot, Intempt AI Coach, Apex by Drip.

- **VWO Copilot:** Create tests from natural language; AI generates variations, sets metrics, defines audiences; Editor Copilot “Remix” generates alternative headlines/CTAs/layouts; plus hypothesis generation, heatmap and session-recording summaries, segment discovery.
- **Intempt AI Coach:** Describe changes in plain language → full page or element-level variations; no-code editing; multi-page flows; CUPED, sequential testing, real-time confidence.
- **Apex (Drip):** AI-generated test ideas and variations at scale, real-time analytics, auto significance, AI page detection, smart goal tracking; integrations (e.g. Shopify).
- **Admin implications:** If RipX offers “AI-generated variations” or “prompt-to-test”: feature flag per domain, rate limits on AI generation, audit log of prompts and generated config (stored for compliance/support), optional PII stripping before sending to third-party AI.

#### 13.9.3 LLM and prompt A/B testing (specialized tools)

**Sources:** Langfuse, Braintrust, PromptLayer, Humanloop (sunset 2025).

- **Use case:** A/B testing of LLM prompts (e.g. `prod-a` vs `prod-b`), tracking latency, cost, token usage, and evaluation scores; multi-model support (GPT-4, Claude, Gemini).
- **Patterns:** Label prompt versions, random assignment, measure real user outcomes (e.g. “did user save output”, “click regenerate”) rather than only synthetic evals; small rollout (5–10%), then ramp; combine with offline evals.
- **RipX relevance:** If you add “prompt” or “content” tests that call LLMs (e.g. copy variations backed by different prompts), same patterns apply: assignment, metrics, rollout; admin would need visibility into prompt/test linkage and cost/latency per variant.

#### 13.9.4 AI for analytics and insights

**Sources:** AB Tasty (Emotions AI, stats engine), VWO (Copilot insights), Statsig (AI evaluation and deployment).

- **AB Tasty:** “Emotions AI” for test ideation, analysis, and interpretation; advanced stats engine; dynamic allocation; sequential testing alerts.
- **VWO Copilot:** Hypothesis generation, heatmap and session-replay summaries, hidden segment discovery.
- **Statsig:** AI evaluation and deployment in experimentation workflows; feature flags and product analytics in one stack.
- **Admin implications:** If RipX adds AI-driven insights (e.g. “suggest next test”, “explain lift”, “find segments”): feature flags, per-domain or per-account AI usage caps, and audit of which insights were shown and to whom (for fairness and support).

#### 13.9.5 Admin control summary for future AI features

| Area                              | Admin / config capability                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **AI copilot / agents**           | Feature flag (global/per domain), usage quotas, audit of AI-suggested changes                           |
| **AI-generated variations**       | Enable/disable per domain, rate limits, log prompts and generated config (no PII to third party)        |
| **LLM / prompt experiments**      | If supported: same as tests (assignment, metrics); admin view of cost/latency by variant                |
| **AI insights / recommendations** | Feature flag, usage caps, audit of insights delivered                                                   |
| **Policy**                        | Optional “AI policy”: allowed actions, guardrails, data sent to which provider (e.g. OpenAI, Anthropic) |

Implement when you add AI capabilities; keep all spec and research docs under `docs/` (only README at repo root).

---

## Appendix A: Project feature inventory (RipX codebase)

This appendix lists **every feature** in the project so the admin spec can observe or control each. Use it to ensure no capability is missed.

### A.1 API routes (backend)

| Method  | Path / prefix                              | Purpose                                                 |
| ------- | ------------------------------------------ | ------------------------------------------------------- |
| GET     | /health, /api/health                       | Health check (DB, Redis, uptime).                       |
| GET     | /api-docs                                  | Swagger UI.                                             |
| GET     | /api/auth                                  | Shopify OAuth start.                                    |
| GET     | /api/auth/callback                         | Shopify OAuth callback.                                 |
| POST    | /api/tenants/standalone                    | Register standalone domain (get API key).               |
| GET     | /api/account/stores                        | List stores (multi-store).                              |
| POST    | /api/account/stores                        | Add store.                                              |
| GET     | /api/dashboard/stats                       | Dashboard aggregates (tests, visitors, revenue).        |
| POST    | /api/tests                                 | Create test.                                            |
| GET     | /api/tests                                 | List tests.                                             |
| GET     | /api/tests/:id                             | Get test.                                               |
| PUT     | /api/tests/:id                             | Update test.                                            |
| DELETE  | /api/tests/:id                             | Delete test.                                            |
| PUT     | /api/tests/:id/variants/codes              | Update variant code.                                    |
| PUT     | /api/tests/:id/variants/allocation         | Update traffic allocation.                              |
| POST    | /api/tests/:id/start                       | Start test.                                             |
| POST    | /api/tests/:id/stop                        | Stop test.                                              |
| POST    | /api/tests/:id/personalize                 | Apply winner (personalize).                             |
| POST    | /api/tests/:id/rollout                     | Start rollout.                                          |
| POST    | /api/tests/:id/personalization/disable     | Disable personalization.                                |
| POST    | /api/tests/:id/clone                       | Clone test.                                             |
| GET     | /api/analytics/tests/:id                   | Test analytics (variants, significance, Bayesian, SRM). |
| GET     | /api/analytics/tests/:id/segments          | Segment breakdown options.                              |
| GET     | /api/analytics/tests/:id/timeseries        | Time series.                                            |
| GET     | /api/analytics/tests/:id/funnel            | Funnel metrics.                                         |
| GET     | /api/analytics/tests/:id/events            | Events list (paginated).                                |
| GET     | /api/analytics/tests/:id/heatmap           | Heatmap data.                                           |
| GET     | /api/analytics/tests/:id/export            | CSV export.                                             |
| POST    | /api/analytics/bigquery/export             | BigQuery export.                                        |
| GET     | /api/shopify/products/:id                  | Shopify product (Shopify auth).                         |
| GET     | /api/shopify/setup/status                  | Setup status.                                           |
| GET     | /api/track/script.js                       | Storefront script (shop/site).                          |
| POST    | /api/track                                 | Track event (conversion/custom).                        |
| POST    | /api/track/heatmap                         | Heatmap events batch.                                   |
| GET     | /api/track/variants                        | Batch variant assignment.                               |
| GET     | /api/track/variant                         | Single variant for user.                                |
| GET     | /api/track/preview                         | Preview variant (promo links).                          |
| POST    | /api/track/client-error                    | Client-side error log.                                  |
| GET     | /api/proxy/script.js                       | App proxy script (Shopify).                             |
| POST    | /api/webhooks/orders/create                | Shopify orders webhook.                                 |
| POST    | /api/webhooks/products/update              | Shopify products webhook.                               |
| POST    | /api/webhooks/app/uninstalled              | Shopify app uninstall.                                  |
| POST    | /api/promo-links                           | Create promo link.                                      |
| GET     | /api/promo-links/test/:testId              | List by test.                                           |
| GET     | /api/promo-links/validate/:token           | Validate token.                                         |
| GET     | /api/profile                               | Profile.                                                |
| PUT     | /api/profile/profile, account, preferences | Update profile/account/preferences.                     |
| GET/PUT | /api/settings                              | Shop settings.                                          |
| GET     | /api/settings/installation                 | Installation (script snippet).                          |
| GET/PUT | /api/settings/integrations                 | GA4/BigQuery config.                                    |
| GET     | /api/targeting-presets                     | List presets.                                           |
| POST    | /api/targeting-presets                     | Create preset.                                          |
| DELETE  | /api/targeting-presets/:id                 | Delete preset.                                          |
| GET     | /api/notifications                         | List notifications.                                     |
| PUT     | /api/notifications/:id/read, read-all      | Mark read.                                              |

### A.2 Services (backend)

| Service                  | Purpose                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| analytics                | getTestAnalytics (significance, Bayesian, SRM, revenue impact), getBatchVariantMetrics. |
| timeSeriesService        | aggregateDailyAnalytics (analytics_daily).                                              |
| integrationConfigService | GA4/BigQuery config from shop_settings or env.                                          |
| outboundWebhookService   | Fire webhook on test_complete, significance.                                            |
| auditLogService          | Write to audit_log.                                                                     |
| notificationService      | Create/read notifications.                                                              |
| personalizationService   | Winner resolution, personalize, rollout.                                                |
| combinationTestService   | Combination tests (multi-variable).                                                     |
| customMetricsService     | Custom metrics (revenue, profit, conversion_rate, AOV, custom_event, custom_formula).   |
| testHealthService        | Health score, SRM, issues, recommendations.                                             |
| conflictDetectionService | Find overlapping running tests.                                                         |
| targetingService         | Evaluate targeting rules.                                                               |
| promoLinkService         | Create/validate promo links.                                                            |
| abTestEngine             | Assignment, getVariant (with context).                                                  |
| trafficAllocator         | Allocate traffic by percentage.                                                         |
| exportService            | CSV, BigQuery export.                                                                   |
| shopifyService           | Shopify API (products, etc.).                                                           |
| ga4Service               | GA4 Measurement Protocol.                                                               |

### A.3 Jobs (backend)

| Job                        | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| scheduledTestsProcessor    | Start/stop tests by schedule (Redis/Bull).                                   |
| archiveProcessor           | Archive old tests.                                                           |
| guardrailProcessor         | Check guardrail (conversion drop), auto-stop.                                |
| autoStopProcessor          | Auto-stop when significance reached (shop setting).                          |
| significanceAlertProcessor | Notify + webhook when test reaches significance; writes significance_alerts. |
| bigQueryExport             | Export to BigQuery (key_value_store for last run).                           |

### A.4 Database tables (migrations)

| Table               | Purpose                                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| tests               | Test metadata, type, status, goal, variants, segments, guardrail*config, target_ids, personalization_mode, rollout*_, winner\__, scheduled\_\*. |
| test_assignments    | User–variant assignment (device, country).                                                                                                      |
| events              | Conversions/custom events (event_type, event_name, event_value).                                                                                |
| promo_links         | Promo link tokens.                                                                                                                              |
| notifications       | In-app notifications.                                                                                                                           |
| shop_settings       | min*sample_size, confidence_level, auto_stop_enabled, outbound_webhook*_, ga4\__, bigquery\_\*.                                                 |
| analytics_daily     | Time series aggregates.                                                                                                                         |
| shop_sessions       | Shopify access tokens per shop.                                                                                                                 |
| webhook_events      | Incoming Shopify webhook idempotency.                                                                                                           |
| tenants             | Standalone domains (api_key hash, etc.).                                                                                                        |
| audit_log           | Audit trail (entity_type, entity_id, action, changes).                                                                                          |
| targeting_presets   | Presets (optional goal, variants for full templates).                                                                                           |
| significance_alerts | Which tests have fired significance alert.                                                                                                      |
| key_value_store     | Key-value (e.g. BigQuery last export).                                                                                                          |
| heatmap_events      | Click/scroll heatmap data.                                                                                                                      |
| accounts            | Multi-store accounts.                                                                                                                           |
| users               | User profiles (if present).                                                                                                                     |

### A.5 Frontend (pages / flows)

| Route / area           | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| / (Dashboard)          | Overview, quick start, recent tests, stats.                 |
| /tests                 | Test list, filters, sort.                                   |
| /tests/new             | Create test (TestWizard).                                   |
| /tests/:id             | Test detail, start/stop, edit, clone, personalize, rollout. |
| /tests/:id/analytics   | Per-test analytics (overview, funnel, events, heatmap).     |
| /tests/:id/export      | Export CSV/BigQuery.                                        |
| /tests/:id/promo-links | Promo links.                                                |
| /analytics             | Analytics overview (all tests).                             |
| /setup                 | Setup wizard.                                               |
| /connect               | Register / API key (standalone).                            |
| /settings              | Settings, installation, integrations, targeting presets.    |
| /profile               | Profile, account, preferences.                              |
| /docs                  | Documentation.                                              |

### A.6 Storefront (script and track)

- **Script:** Injected config (apiUrl, shopDomain, consentRequired, activeTests with targetType, targetId, targetIds, js_targeting). Fetched via GET /api/track/script.js or proxy.
- **Track:** POST /api/track (event_type, event_name, event_value), POST /api/track/heatmap, GET /api/track/variant(s), GET /api/track/preview, POST /api/track/client-error.

Every row in this inventory can be **observed** (list, detail, logs) or **controlled** (enable/disable, override, trigger, delete) from the admin panel as described in sections 2–11 and 12.
