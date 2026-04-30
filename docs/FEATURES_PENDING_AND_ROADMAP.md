# Features Pending & Roadmap – Consolidated List

This document consolidates **pending features and roadmap items** from all project docs (`docs/*.md`). Use it to prioritize what to implement next.

**Recently implemented:** Help icon (TopBar), Admin support tickets (list + PATCH + bulk), pgvector + support_kb_chunks (migration 050), RAG in POST /api/support/chat (when KB populated), POST/GET support image upload, chat rate limits (RATE_LIMIT_SUPPORT_CHAT_MAX), KB indexing script (npm run index-support-kb; use --no-embed for content-only). **Price test (Phase 1):** Catalog warning on Review step, sample size hint in Traffic step, Price test QA checklist in Documentation, Quick-fill for variant prices (apply % or $ off/on to all non-control variants). **Process:** Primary-metric hint in Goal step for price tests (Revenue/Profit preferred; conversion-only biases low), expanded QA checklist (incognito, cross-device, full journey), Review-step link to QA checklist; pre-launch validation section in ADVANCED_PRICE_TESTING_RESEARCH.md. **More:** Price test validation — at least one non-control variant must have a price (Traffic, Code, Review); optional “I’ve set catalog” checkbox on Review; template description updated with Revenue/Profit metric hint. **Price test UX:** Example catalog price live preview; Round to nearest in quick-fill (stored in variant config); Expand all / Collapse all; at-a-glance variant summary; variant name in editor header; "Copy from [variant]" in each row. **Research-led:** Sample size & MDE + calculator link and "After the test" + "Price presentation" in Documentation; hypothesis tip on Review; sample size calculator link in wizard. **Per-product-variant (Intelligems parity):** byVariant — set test price per product variant (SKU); storefront merges byVariant[variantId]; wizard "Per-variant overrides" in each product card. **Results & reporting:** Documentation "Interpreting test results" (confidence = false positive rate, practical vs statistical significance, full picture); "When you stop a price test" checklist; wizard Confidence level helpText. **Validation (price test):** Backend validateTestConfig enforces at least one non-control variant with price for type price/pricing; wizard validates per-variant overrides (byVariant) on Traffic and Review (fixed ≥ 0, amount/percent valid). **Deferred:** KB embeddings—run `npm run index-support-kb` when OpenAI quota available. See “Suggested next” table and Phase 2 checkboxes below.

---

## How to use this document

- **Sections 1–5** list pending work by area (Support, Admin, Product/Experimentation, TopBar/UX, Auth/Design).
- **Priority:** Items under "Suggested next" and **Phase 2** are high impact and feasible; **Phase 3** and "Advanced" are optional or later.
- **Effort (E):** S = small (days), M = medium (1–2 weeks), L = large (weeks+). **Impact (I):** H/M/L.
- **Source docs** at the end link to full specs and research; implement from those for detail.

**Quick reference – common commands**

| Command                                  | Purpose                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run migrate`                        | Run DB migrations (050 skips if pgvector missing; see migration file for PG16 install).      |
| `npm run index-support-kb`               | Index docs with embeddings (needs OPENAI_API_KEY + quota).                                   |
| `npm run index-support-kb -- --no-embed` | Index docs without embeddings (no OpenAI; RAG inactive until you re-run without --no-embed). |
| `npm run index-support-kb -- --clear`    | Delete all rows from support_kb_chunks.                                                      |
| `npm run validate`                       | Lint + backend + frontend tests.                                                             |

---

## Project summary (support & AI)

- **Support (current):** Tickets (POST/GET), categories, email to support + user, audit, soft delete. Chat: `POST /api/support/chat` with OpenAI (gpt-4o-mini) when `OPENAI_API_KEY` set; history in `support_chat_conversations` / `support_chat_messages`. Frontend: Support page (Contact us, My requests, Ask AI), bubble (Ask AI + Contact us link). **No third-party live chat;** human support via Contact us (email form).
- **Approach:** Custom AI only; Phase 2 RAG (pgvector + docs) for RipX-specific answers.

---

## Suggested next (high impact, feasible)

| Priority | Item                                                                         | Status                     | Notes                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **RAG pipeline** (pgvector + chunk docs + embed + similarity search in chat) | Done (embeddings deferred) | Migration 050; getKbContext in chat; reply + sources when KB has chunks. KB has content (--no-embed). When ready: run `npm run index-support-kb` (OpenAI quota required) to add embeddings. |
| 2        | **Admin ticket list** – view `support_tickets`, basic status updates         | Done                       | GET/PATCH/bulk in admin; AdminSupportTickets page with filter (validated status), sort, bulk actions.                                                                                       |
| 3        | **Image share in chat** – upload endpoint + optional Vision                  | Done (backend)             | POST /api/support/upload, GET /api/support/uploads/:filename. Frontend “Attach image” + Vision in chat optional next.                                                                       |
| 4        | **Help icon** in TopBar (popover: Documentation + Support)                   | Done                       | “?” icon with direct links; no intermediate screen.                                                                                                                                         |
| 5        | **Bulk ticket actions (admin)**                                              | Done                       | POST /api/admin/support-tickets/bulk; UI in AdminSupportTickets.                                                                                                                            |

---

## Research & tool choices (online research summary)

Findings from 2024–2025 on tools, costs, and best practices used to choose stack and priorities.

### RAG & vector store

- **pgvector vs managed (Pinecone, etc.):** For small–medium scale, pgvector is cost-effective and often outperforms Pinecone on same resources; no separate infra, one Postgres. Pinecone ~$80–120+/month per pod; pgvector runs on existing DB. _Sources: Supabase/pgvector benchmarks; “Building RAG with pgvector: Why I Stopped Paying for Pinecone”._
- **Embedding model:** `text-embedding-3-small` ($0.02/1M tokens, 1536 dims) is recommended for most use cases; batch API gives ~50% discount for indexing. _OpenAI pricing; RAG cost optimization posts._
- **Cost (optimized):** Production RAG can reach ~$1.11/1k queries (down from ~$4.12 unoptimized); LLM generation is 45–60% of cost. _RAG cost optimization (Likhon, Abhishek Gautam)._
- **Chunking:** Recursive split at **512 tokens with 10–15% overlap** (e.g. 50-token overlap) is a strong baseline; outperforms naive chunking and reduces boundary-loss. Structure-aware splitting helps on docs with headings/lists. _Chunking strategies (Glukhov, Ailog, MyEngineeringPath)._
- **Index:** HNSW (m=16, ef_construction=64) for better recall and continuous inserts; IVFFlat for under 1M vectors if preferred. _pgvector best practices (Postgres SQL HTX)._
- **Re-ranking (optional):** Re-ranking retrieved chunks can boost precision ~18–42%; add after initial vector search if quality needs a lift. _RAG optimization guides._

### Support AI & deflection

- **Deflection/ROI:** AI resolution ~$0.99–2/ticket vs $6–12 human; deflection can reach 20–40% at launch, 60%+ in 6–12 months with a good KB. ROAR (Resolved on Automation Rate) is preferred over raw deflection. _Freshworks benchmark 2024; Forethought AI in CX; Dante AI ROI._
- **KB quality:** ROI depends on knowledge base quality; invest in docs and structure first. _Digital Applied, Forethought._

### Image in support chat

- **OpenAI Vision:** Supported types PNG, JPEG, non-animated GIF; max **20MB per image** (API). For support uploads, cap at **5MB** and 1–2 images per message to control cost and latency. _OpenAI Images and vision docs._
- **Vision pricing:** GPT-4o-mini vision can consume many more tokens per image than text; consider gpt-4o for image-heavy flows or limit image use to “attach to ticket” only if cost is a concern. _OpenAI community reports; pricing page._

### Admin ticket list & triage

- **Triage stages:** Intake → Prioritize (SLA, urgency) → Resolve (routing, assignment) → Improve (learn from resolved). _Suptask, HappyFox._
- **List UI:** Sortable columns, resizable columns, priority/status/requester/subject at a glance; optional Inbox/Table/Card views. _Freshdesk ticket list; Mojo Helpdesk._
- **Queues:** Structure by urgency, topic, or team; SLA-driven ordering and stale-ticket alerts. _Clearfeed, HappyFox._

### Help icon (in-app)

- **Icon:** “?” is better for help/support/FAQs than “i” (general info). _NN/G._
- **Placement:** App bar or nav; for complex apps, help in both. No intermediate “choose help type” screen—go straight to content. _Material Design Help & feedback; Helpshift; Chameleon._

### Experimentation (A/B)

- **Quality score:** Single score (0–100) for experiment setup/execution is a leading practice (e.g. Statsig). _Statsig Experiment Quality Score._
- **Stats:** ROPE, MDE, FPR, guardrail metrics (e.g. VWO SmartStats) improve decision quality. _VWO product updates; ABsmartly._

### Best choices summary

| Area          | Choice                                | Reason (research)                                                                 |
| ------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| Vector DB     | **pgvector**                          | Same Postgres, no extra cost; good performance at small–medium scale vs Pinecone. |
| Embeddings    | **text-embedding-3-small**            | Low cost, 1536 dims; sufficient for most RAG. Use batch API for indexing.         |
| Chunking      | **512 tokens, ~10% overlap**          | Strong baseline; reduces boundary loss; structure-aware when docs have headings.  |
| Admin tickets | **Sortable list + queues**            | Matches triage workflow (intake → prioritize → resolve); industry standard.       |
| Image upload  | **5MB, 1–2 files; PNG/JPEG/GIF/WebP** | Balances UX and cost; Vision API supports up to 20MB but tokens add up.           |
| Help entry    | **“?” in app bar, direct links**      | “?” = help; no extra click; Material Design + NN/G guidance.                      |

**References (for deeper reading):** OpenAI pricing & vision; pgvector (Supabase blog); RAG chunking/cost; deflection (Freshworks, Forethought); triage (clearfeed, happyfox); help UX (Material Design, NN/G); experimentation (Statsig, VWO).

---

## 1. Customer Support

_Sources: CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN, SUPPORT_CHAT_IMPROVEMENTS_RESEARCH, SUPPORT_SYSTEM_ADVANCED_RESEARCH, SUPPORT_UI_AND_ROLES_RESEARCH._

### Phase 1 – Done

- [x] Email support, Support page, Ask AI (OpenAI when key set). Contact us (form) for human support; no third-party live chat.

### Phase 2 – AI and polish (recommended next)

- [x] **pgvector + KB table** – Migration 050: `CREATE EXTENSION IF NOT EXISTS vector;`; table `support_kb_chunks` with HNSW index (m=16, ef_construction=64). (E: S)
- [x] **RAG pipeline (backend)** – In `POST /api/support/chat`: embed query with `text-embedding-3-small`, similarity search in pgvector, build prompt from top-k chunks, return reply + sources. Populate KB: `node backend/scripts/indexSupportKb.js [docs]`. (E: M, I: H)
- [x] **Rate limits and safety** – Chat: RATE_LIMIT_SUPPORT_CHAT_MAX (40/15min), OPENAI_CHAT_MAX_TOKENS (500); RAG prompt (“only from context”). (E: S)
- [x] **Admin view for tickets** – GET/PATCH/bulk in admin; AdminSupportTickets page: list, filter by status, sort, per-ticket and bulk status updates. (E: S, I: H)

### Phase 3 – Optional

- [x] **Zendesk/Help Scout integration** – Admin-configurable provider sync now pushes new RipX support tickets to Zendesk or Help Scout inboxes.
- [x] **Support analytics** – Top AI questions, ticket categories, response time.

### Chat improvements (SUPPORT_CHAT_IMPROVEMENTS_RESEARCH)

- [x] **Image share in chat (backend)** – `POST /api/support/upload` (multipart, 5MB, 1–2 files, PNG/JPEG/GIF/WebP), `GET /api/support/uploads/:filename`. Multer error handling returns JSON. (E: M, I: M) Frontend “Attach image” + optional Vision in chat still to do.
- [x] **Human + AI in same chatbox (Phase 2)** – “Escalate to support” in same UI now creates a support ticket with conversation summary. Follow-up thread polling (`GET /api/support/tickets/:id/thread`) remains optional future polish. (E: M)
- [x] **Human + AI (Phase 3)** – Real-time ticket thread replies are now available for customers and admins using SSE stream endpoints + dashboard thread UI. (E: L)

### Advanced support (SUPPORT_SYSTEM_ADVANCED_RESEARCH)

- [x] **Unified inbox (admin)** – One view merging tickets (and optional future chat). (E: M)
- [x] **Deflection** – Support chat now runs RAG first, asks “Was this helpful?”, and offers one-click escalation to create a ticket when the answer is not helpful. Research: AI ~$1–2/ticket vs $6–12 human; deflection 20–40% at launch, 60%+ with good KB; prefer ROAR. (E: S, depends on RAG)
- [x] **Suggested reply (admin)** – `POST /api/admin/support-tickets/:id/suggest-reply` (admin-only), RAG-aware draft generation with fallback template; Admin support UI can generate, edit, and copy the draft reply. (E: S, depends on RAG)
- [x] **Auto-category** – On submit, optional classifier to set `category` if not provided. (E: S)
- [x] **Contextual in-app help** – Tooltips, product tours, embedded docs (context-aware; can cut tickets ~45%). (E: M)
- [x] **Proactive support** – Triggers (usage drop, renewal, failed payment) that initiate outreach. (E: L)
- [x] **Analytics/SLA** – CSAT, NPS, first response time, resolution time, SLA dashboard. (E: M)
- [x] **Routing/escalation** – Priority routing + round-robin auto-assignment + escalation API/sweep rules implemented in admin support workflow. (E: M)
- [x] **Macros/templates** – Canned response templates for agents implemented (`/api/admin/support-macros` + quick insert/save/delete in Admin support suggested-reply modal). (E: S)
- [x] **Feedback/voting** – Feature request widget + board + voting API implemented (`/api/support/feature-requests`, vote endpoint, support UI tab). (E: M)
- [x] **Status/changelog** – Status page, API changelog, incident comms. (E: S–M)
- [x] **Multilingual** – Chatbot now supports language-aware responses (selected language + auto mode). Full KB translation can be iterated in a future phase. (E: L)

### Support UI (SUPPORT_UI_AND_ROLES_RESEARCH)

- [x] **Bulk ticket actions (admin)** – `POST /api/admin/support-tickets/bulk` with `{ ticketIds: [], action: 'close'|'resolve' }`; UI in AdminSupportTickets. (E: S)

---

## 2. Admin Panel

_Source: ADMIN_CONTROL_PANEL_SPEC.md._

### Not yet in MVP

- [ ] **Accounts (multi-store)** – List/detail, add/remove domain, change owner, merge accounts.
- [ ] **Users – full spec** – Sessions (revoke all), activity log, impersonate, lock/unlock, change role, reset MFA, delete user (soft + GDPR export).
- [ ] **Domains – full spec** – Script install status, usage (visitors, events, 7/30/90d), block list, transfer ownership, regenerate API key (standalone).
- [ ] **Tests (global) – admin actions** – Archive, Delete (soft + audit), Clone (as another domain).
- [ ] **Notifications – admin** – Create system-wide announcement (all users or by role/domain).
- [ ] **Targeting presets – admin** – List all presets across domains; view JSON, delete with audit.
- [ ] **Promo links – admin** – List all; disable/revoke by test or domain.
- [ ] **Shop sessions (Shopify)** – List `shop_sessions`; revoke session (force re-auth).
- [ ] **Incoming webhook events** – List last N from `webhook_events` (Shopify); filter by domain/topic.
- [ ] **Conflict detection (admin view)** – Per-domain overlapping running tests; link to stop test.
- [ ] **Test health (bulk view)** – List tests with health score; filter by health level, domain, status.
- [ ] **Significance alerts – admin** – List `significance_alerts`; reset alert for a test.
- [ ] **Full test templates – admin** – List targeting presets with goal+variants; view/edit JSON, delete.
- [ ] **Event catalog** – Per-domain distinct `event_type`/`event_name` from events (data discovery).
- [ ] **Client errors (storefront)** – If persisting `POST /api/track/client-error` to a table, admin list last N per domain; optional ack/ignore.

### Platform config (admin)

- [ ] **Script delivery block list** – Add domain to block list; script and proxy return 403 + message.
- [ ] **Maintenance mode** – Global or per-domain; script returns minimal JSON; app shows banner.

### Phases 3–7 (deferred)

- [ ] **Phase 3** – Notifications admin, promo list/revoke, impersonation, GDPR, maintenance, block list, usage export, email re-verify.
- [ ] **Phase 4+** – Accounts admin, presets, sessions, webhook events, conflict view, test health bulk, significance alerts, templates, event catalog, client errors, consent/script, aggregation trigger, MFA.
- [ ] **Email token login and re-verification** (Phase 3) – Magic link, 30-day session + re-verify via email.
- [ ] **MFA for admins** (Phase 4).
- [ ] **SSO/SAML, SCIM, data retention, permission groups, usage billing** (Phase 5).
- [ ] **Experiment policy, test monitoring, data quality, SLA/status** (Phase 6).
- [ ] **AI copilot, AI-generated variations, AI policy** (Phase 7).

---

## 3. Product / Experimentation

_Sources: ADMIN_CONTROL_PANEL_SPEC, support and experimentation research docs._

### Experimentation

- [ ] **Experiment groups (mutual exclusion)** – Groups (e.g. checkout, hero); at most one test per group per user.
- [ ] **Global holdout** – Optional % of traffic never in any test; analytics compare in-tests vs holdout.
- [ ] **Multivariate (4–6+ variants)** – Clarify or raise variant cap; ensure analytics and allocation scale.
- [ ] **Team notes on tests** – Internal notes/hypotheses per test (rich text or markdown); show in test detail and exports.
- [ ] **Report generation (PDF / shareable)** – One-click report: config, results, charts, recommendation.
- [ ] **Sticky bucketing and cohort controls** – Document and optionally expose “stick user to variant for N days” or “by cohort” in UI.
- [ ] **Date-range and product-level analytics** – Compare performance across date ranges; optional dimensions (e.g. product_id).
- [ ] **Idea repository and shared calendar** – Backlog of test ideas; calendar/timeline view; link idea → test.
- [ ] **Dynamic allocation (bandit) mode** – Traffic shifts toward better-performing variants (Thompson sampling or UCB).
- [ ] **Flicker-free / edge execution** – Document and optionally support variant-at-edge or server-side before HTML.
- [ ] **Prioritization and program impact** – Prioritize ideas (score/vote, pipeline); program-level impact view.
- [ ] **Always-valid inference** – Valid p-values and CIs at any stop time; continuous monitoring and early stopping.
- [ ] **Experiment quality score** – Single score (0–100) from hypothesis, audience, sample size, SRM, allocation, etc.; color bands in Test detail and Analytics.
- [ ] **CWV monitoring** – Core Web Vitals (FCP, LCP, CLS) monitoring and alerts when tests regress performance.
- [ ] **Cross-campaign analysis** – Detect interaction effects when users are in multiple tests; overlap analysis.

### Shopify-native

- [x] **Shopify price tests (display override)** – Storefront script + theme block override displayed price per variant; target products via target_ids; optional B2B Price List later.
- [x] **Price test: catalog warning on Review** – Banner on Review step when type is price: “Set catalog to highest…” + link to Documentation (PRICE_TEST_IMPLEMENTATION_ROADMAP §1.1).
- [x] **Price test: sample size hint** – Info banner in Traffic (price step): “~300 conversions per variant, 10% at 90% confidence, 2–4 weeks” (§1.4).
- [x] **Price test: QA checklist** – Subsection in Documentation → Price testing (Shopify): script live, preview variants, cart/checkout, scope, test order (§1.5).
- [x] **Price test: Quick-fill** – In Price summary, “Quick fill (non-control variants)”: rule (% off/on, $ off/on) + value + Apply to set all non-control variants at once (§1.3).
- [x] **Price test: roll-out CSV at end** – When stopping a price test, “Download CSV” of winning prices for import; optional “Apply in Shopify” (roadmap §1.2).
- [x] **Price test: Discount Function doc + config API** – Doc for checkout alignment; optional backend config endpoint for Function (roadmap §2.1–2.2).
- [x] **Targeting: page + product/collection lists** – UI fetches Shopify pages/products/collections (Admin API) with search + pagination; saves target_type + target_ids; storefront activates only on matching page/product/collection.
- [x] **Theme/template tests (internal)** – Split URL + preview proxy flow in place; template wizard now captures per-variant template + optional theme/section metadata for internal theme/template implementations.
- [x] **Checkout UI extension** – Added `extensions/ripx-checkout-ui` block extension that fetches assignment from `/api/track/checkout-assignment`, renders variant content in checkout, and tracks interactions via `/api/track/checkout-conversion` (Shopify Plus with network access).

### Visual editor & heatmap

- [x] **Heatmap over page image** – Screenshot saved per page_url from HeatmapView; backend stores URL and returns it to overlay clicks on a normalized reference viewport.
- [x] **Visual editor (visual pane)** – Element picker on preview; visual mutations (setText, setAttr, setStyle, hide/show); persist visualEdits; storefront applier; optional add block, reorder, viewports.
- [x] **Visual editor (advanced)** – Undo/history; “generated code” view; optional Shadow DOM/iframe editing; AI-assisted variations.

### AI (Phase 7)

- [ ] **AI test idea discovery** – Suggest ideas from analytics (low-converting pages, drop-off, segment gaps).
- [ ] **AI result summaries** – Plain-language interpretation (“Variant B is 12% likely to be best; recommend rollout if guardrails pass”).
- [ ] **Experiment design assistant** – In-wizard guidance (sample size, duration, guardrails, goal choice).

---

## 4. TopBar / UX

_Source: TOPBAR_NAVIGATION_IMPROVEMENTS.md._

- [x] **Help icon** – **“?” icon** (not “i”) in TopBar/app bar with direct links to Documentation and Support (no intermediate “choose help type” screen).
- [x] **Keyboard** – Ensure user menu and “New test” are reachable and closable via keyboard (Tab, Enter, Escape); confirm Polaris Popover behavior.
- [x] **Analytics** – Track clicks on “New test” and user menu sections for product metrics.

---

## 5. Auth / Design / OAuth

_Source: design and auth docs (user/domain separation, security)._

### User domain separation & auth

- [ ] **Acceptance email** – On admin accept-user, send “Your account has been approved” email.
- [ ] **Registration primary domain** – Optional field `primary_domain` on register; store and resolve.
- [ ] **Login 2nd step (optional)** – Optional 6-digit code in email + “Verify code” step; keep magic link as alternative.
- [ ] **Auth rate limiting** – Rate limit register, send-login-link, verify-code per email and per IP.
- [ ] **Audit auth events** – Log registration, email confirm, admin accept/reject, login success/failure to audit_log.
- [ ] **Migration** – Add `standalone_users.account_id`, `primary_domain_id`; create `user_domain_access` (user_id, tenant_id, role).
- [ ] **API** – `GET /api/me/domains` – list domains the current user can access; include permitted users per domain.
- [ ] **Frontend – Domain list page** – New route e.g. `/domains` (or `/my-domains`); list domains, add domain, open domain (set context and redirect to Dashboard).
- [ ] **Domain creation** – “Add domain” flow; backend create tenant and user_domain_access.
- [ ] **Open domain** – From Domain list, “Open” sets chosen domain as current context and redirects to Dashboard.
- [ ] **Audit domain lifecycle** – Log add domain, open domain, invite user, API key issue/rotate.
- [ ] **User view** – Profile shows “Primary domain”, “My domains” link, account info.
- [ ] **Admin** – When listing users, show their domains and primary domain; when listing domains, show permitted users.
- [ ] **Domain verification** – Optional DNS TXT / meta tag / `/.well-known` check; store `domain_verified_at`; warn or block track/script on unverified.
- [ ] **Constant-time API key check** – Resolve tenant by prefix, then compare hash with `crypto.timingSafeEqual()`.
- [ ] **Session revocation** – Admin “revoke all sessions for user”; token version or revoked-before timestamp in auth middleware.
- [ ] **RLS (Postgres)** – Row-Level Security policies on tenant-scoped tables.
- [ ] **Secure mode (storefront)** – HMAC of user_id + context with API key; reject invalid hash.
- [ ] **GDPR for standalone users** – “Export my data” and “Delete my account” endpoints; purge or anonymize.
- [ ] **API versioning** – Formalise `/api/v1/` or header/query versioning; deprecation policy.
- [ ] **Per-tenant quotas** – Optional limits (max active tests, max events/day); expose in admin and optionally UI.
- [ ] **Observability** – Correlation/request IDs, structured logging (JSON), health/degraded states, runbooks.
- [ ] **Backup & DR** – Document RPO/RTO; tested backup/restore; secure handling of secrets in backups.
- [ ] **Security alerts** – Alert on anomalies (failed logins, new domain, API key rotation, admin actions).
- [ ] **SDK/script versioning** – Document minimum script version; deprecation policy for old versions.

### Database (DATABASE_DESIGN)

- [ ] **events / test_assignments** – Optional future `tenant_id` for direct queries.
- [ ] **shop_settings, audit_log, etc.** – Optional future `tenant_id` for consistency and RLS.

---

## 6. Quick reference – Source docs

| Doc                                            | Focus                                                           |
| ---------------------------------------------- | --------------------------------------------------------------- |
| **CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md**    | Support phases 1–3, checklist, env, RAG, admin tickets          |
| **SUPPORT_CHAT_IMPROVEMENTS_RESEARCH.md**      | Image share, human+AI same chatbox, status filter               |
| **SUPPORT_SYSTEM_ADVANCED_RESEARCH.md**        | Omnichannel, RAG+, analytics/SLA, routing, macros, roadmap      |
| **SUPPORT_UI_AND_ROLES_RESEARCH.md**           | Agent workspace, bulk ticket actions, roles                     |
| **SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md**    | Data model, retention, routing, SLA, full-text search           |
| **SUPPORT_BUBBLE_AND_LAYOUT_RESEARCH.md**      | Bubble chat window, Support page layout                         |
| **SUPPORT_SYSTEM_REQUIREMENTS_AND_INSTALL.md** | Requirements, install steps, env vars (OpenAI, DB, rate limits) |
| **ADMIN_CONTROL_PANEL_SPEC.md**                | Full admin spec (users, domains, tests, config, jobs, etc.)     |
| **TOPBAR_NAVIGATION_IMPROVEMENTS.md**          | Help icon, keyboard, analytics                                  |

_Product/experimentation and auth items above are consolidated from ADMIN_CONTROL_PANEL_SPEC and support/experimentation research; there is no single FUTURE_IMPLEMENTATION_PLAN file in the repo._

---

_Consolidated from project docs. Update this file when priorities or source docs change._
