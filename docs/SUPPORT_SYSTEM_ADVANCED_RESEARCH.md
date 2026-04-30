# Support System – Advanced Features Research

**Purpose:** Deep research on advanced support capabilities so RipX can offer best-in-class customer support. Complements [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md).

**Related:** For support **UI/UX**, **role management**, and agent workspace, see **[SUPPORT_UI_AND_ROLES_RESEARCH.md](./SUPPORT_UI_AND_ROLES_RESEARCH.md)**. For **data management** and **algorithms**, see **[SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md](./SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md)**. For **live chat (live chat)** and **AI chatbot** implementation, see **[SUPPORT_CHAT_AND_AI_RESEARCH.md](./SUPPORT_CHAT_AND_AI_RESEARCH.md)**.

**Current implementation (Phase 1):** Email support and Support page are live: `support_tickets` table, `POST /api/support/ticket` (optional auth sets `tenant_id`/`shop_domain`), `GET /api/support/tickets` (authenticated, by email or shop), `GET /api/support/categories`; Support page with contact form, email prefill from profile, "My requests" (with graceful 401), and Documentation link. Live chat (live chat/Tawk) and RAG bot are Phase 2.

**Table of contents**

1. [Executive summary](#1-executive-summary)
2. [Advanced feature matrix](#2-advanced-feature-matrix)
3. [Omnichannel and unified inbox](#3-omnichannel-and-unified-inbox)
4. [AI and automation](#4-ai-and-automation)
5. [Contextual in-app help and product tours](#5-contextual-in-app-help-and-product-tours)
6. [Proactive and trigger-based support](#6-proactive-and-trigger-based-support)
7. [Analytics, SLAs, and dashboards](#7-analytics-slas-and-dashboards)
8. [Ticket routing and escalation](#8-ticket-routing-and-escalation)
9. [Macros, templates, and canned responses](#9-macros-templates-and-canned-responses)
10. [Feedback and feature requests](#10-feedback-and-feature-requests)
11. [Developer and status support](#11-developer-and-status-support)
12. [Multilingual support](#12-multilingual-support)
13. [RipX-specific integration points](#13-ripx-specific-integration-points)
14. [Prioritized roadmap for RipX](#14-prioritized-roadmap-for-ripx)
15. [References and sources](#15-references-and-sources)

---

## 1. Executive summary

Modern SaaS support systems go beyond live chat and email. Best-in-class setups combine:

- **Omnichannel** – One inbox for email, chat, social, and in-app messages with shared context.
- **AI-first response** – 24/7 bots fed by a knowledge base; deflection and suggested replies for agents.
- **Contextual in-app help** – Tooltips, tours, and embedded docs that reduce tickets by ~45% when context-aware.
- **Proactive support** – Triggers (usage drop, renewal, failed payment) that initiate outreach before users contact support.
- **Analytics and SLAs** – CSAT, NPS, first response time, resolution time, and SLA dashboards.
- **Smart routing** – Priority- and category-based routing, round-robin assignment, escalation workflows.
- **Templates and macros** – Canned responses and multi-action macros to speed agent work.
- **Feedback and feature voting** – Public boards, voting, and status updates so product and support align.
- **Developer support** – Status page, changelog, and API docs as part of the support surface.
- **Multilingual** – AI-driven translation and localized knowledge bases for global users.

RipX already has auth, email, DB, and frontend routing; the base plan covers live chat (live chat/Tawk), email tickets, and RAG bot. This document maps **advanced** features to that base and recommends a phased roadmap so the project can adopt them incrementally.

---

## 2. Advanced feature matrix

| Area                   | Current plan (RipX)                  | Best-in-class add-ons                              | Effort (vs plan) | Impact                  |
| ---------------------- | ------------------------------------ | -------------------------------------------------- | ---------------- | ----------------------- |
| **Omnichannel**        | Chat + email (separate)              | Unified inbox, chat+email in one thread            | Medium           | High                    |
| **AI**                 | RAG bot (Phase 2)                    | Suggested replies, auto-categorization, deflection | Low–Medium       | High                    |
| **In-app guidance**    | Docs link, Support page              | Contextual tooltips, product tours, embedded help  | Medium           | High (ticket reduction) |
| **Proactive support**  | —                                    | Usage/health triggers, automated outreach          | High             | Medium–High             |
| **Analytics/SLA**      | —                                    | CSAT, FRT, resolution time, SLA dashboard          | Medium           | High (ops)              |
| **Routing/escalation** | —                                    | Priority routing, round-robin, escalation rules    | Medium           | Medium                  |
| **Macros/templates**   | Email templates (mailProcessService) | Canned responses, multi-action macros              | Low              | Medium                  |
| **Feedback/voting**    | —                                    | Feature request widget, public board, voting       | Low–Medium       | Medium (product)        |
| **Status/changelog**   | —                                    | Status page, API changelog, incident comms         | Low–Medium       | High (developers)       |
| **Multilingual**       | —                                    | KB translation, chatbot in 95+ languages           | Medium           | Depends on audience     |

---

## 3. Omnichannel and unified inbox

**What it is:** One place where agents see email, chat, social, and in-app messages with full context and history.

**Best practices (2024–2025):**

- Customers expect the same conversation to continue across email, chat, and in-app.[^1]
- Unified platforms keep context and reduce “repeat your issue” friction.[^2]
- E-commerce leaders (e.g. Gorgias, Willdesk) use one inbox for email, chat, social, SMS, and voice.[^3][^4]

**RipX relevance:**

- Today: live chat/Tawk for chat; own `support_tickets` for email. Two surfaces.
- **Upgrade path:** Use live chat “Conversations” (chat + email in one thread) or webhooks to push chat transcripts into `support_tickets` so an admin “Support” view shows both. Optionally add a small “unified” admin view that merges tickets and chat by `user_id` / `email`.

**Implementation notes:**

- live chat supports email in the same conversation; Tawk has email add-ons.
- Webhook: on `message:sent` or conversation closed, `POST` to your backend to create/update `support_tickets` and optionally link `external_id` (live chat conversation id).

---

## 4. AI and automation

**What it is:** 24/7 first response, ticket deflection, suggested replies, and auto-categorization.

**Best practices:**

- AI chatbots that use the knowledge base give instant, context-aware answers and free agents for complex cases.[^1]
- Target high-volume queries, define escalation paths, and refine from bot interaction data.[^1]
- E-commerce helpdesks report ~30% labor reduction and ~43% faster first response with AI.[^3]
- Per-ticket or per-resolution AI pricing is common in modern tools.[^4]

**RipX relevance:**

- **Phase 2 (plan):** Custom RAG (OpenAI + pgvector + RipX docs) via `POST /api/support/chat`; “only from context” and “contact support if unsure.”
- **Advanced:**
  - **Deflection:** Before creating a ticket, call RAG; if confidence is high, return answer and “Was this helpful?” (if no → then create ticket).
  - **Suggested reply:** In admin ticket view, “Suggest reply” button that calls RAG with ticket body + KB and pre-fills a draft.
  - **Auto-category:** On `POST /api/support/ticket`, run a small classifier (keyword or tiny LLM) to set `category` if not provided.

**Implementation notes:**

- Deflection: same RAG service as chat; add a `deflect: true` mode that returns answer + confidence. Frontend shows answer and “Still need help? Submit a ticket.”
- Suggested reply: new endpoint `POST /api/support/tickets/:id/suggest-reply` (admin-only), returns text for agent to edit.

---

## 5. Contextual in-app help and product tours

**What it is:** Tooltips, product tours, and embedded docs triggered by page or action, not a generic help link.

**Best practices:**

- Context-aware help can cut support tickets by ~45% vs static help.[^5]
- Tours should be short (5–7 steps), contextual, and end with a clear CTA.[^6]
- Trigger by UI element or user action; support “show once per user” and progress persistence.[^7]

**RipX relevance:**

- **Current:** Documentation route and Support page with “Ask AI”, “Chat”, “Email.”
- **Advanced:**
  - **Guided tours:** First-time Test Creator flow (e.g. “Create test” → “Choose type” → “Set variants” → “Launch”) using a lightweight library (e.g. Intro.js, Shepherd.js, or Navio).
  - **Contextual tooltips:** “?” or info icon next to “Traffic split”, “Targeting”, “Holdout” that open a short snippet or deep link to docs.
  - **Embedded docs:** On Support/Help, embed or link to “Getting started”, “Storefront script”, “App Proxy” by section so users don’t leave the app.

**Implementation notes:**

- Store “tour completed” in `users` metadata or localStorage so tours don’t repeat.
- Reuse existing docs (e.g. `docs/SHOPIFY_HOSTED_APP_SETUP.md`) and expose sections via API or static routes for in-app snippets.

---

## 6. Proactive and trigger-based support

**What it is:** Automatically detect risk or opportunity and reach out (email, in-app, or chat) before the user contacts support.

**Best practices:**

- Triggers: usage drop, approaching renewal, NPS drop, repeated unresolved tickets, failed payment, feature adoption gap.[^8][^9]
- Define health signals per segment, connect product + support + billing data, and automate triggers with human review for low confidence.[^9]
- Reported benefits: large time savings vs manual outreach, better response rates, and ~24% of avoidable tickets prevented.[^9]

**RipX relevance:**

- **Signals you have:** Test list, test status, store connection, last login (if tracked), domain/tenant.
- **Possible triggers:**
  - Store disconnected (Shopify app uninstalled) → email: “Reconnect your store.”
  - No test run in 30 days → in-app message or email: “Need help setting up your first test?”
  - Test stopped with 0 conversions → “Tips to improve conversions” or offer to review.
  - Script install failing (e.g. repeated 4xx from proxy) → email to domain owner with troubleshooting link.

**Implementation notes:**

- Requires a small job (cron or Bull) that runs “support triggers”: query DB for segments that match rules, then call `emailService` or create in-app notifications. Start with 1–2 high-value triggers (e.g. store disconnected, no test in 30 days).

---

## 7. Analytics, SLAs, and dashboards

**What it is:** Metrics and dashboards for response time, resolution time, CSAT, NPS, SLA compliance, and backlog.

**Best practices:**

- Track: first response time (FRT), first assigned time, average handle time (AHT), resolution time, CSAT, NPS, ticket volume, backlog, agent workload.[^10][^11]
- Real-time visibility into queue depth, agent availability, and SLA status helps avoid escalation.[^10]
- Filter by date, agent, priority, channel, group; customizable reports and scheduled delivery.[^11]

**RipX relevance:**

- **Current:** No support analytics.
- **Advanced:**
  - **Tables:** Add `first_response_at`, `resolved_at`, `assigned_to` (agent id or email) to `support_tickets`. Optional `sla_target_hours` and `sla_breached`.
  - **CSAT:** After status → “resolved”, send email or in-app survey (e.g. “How was your experience?” 1–5). Store in `support_ticket_feedback` (ticket_id, score, comment, created_at).
  - **Admin dashboard:** Counts by status, FRT (e.g. p50/p95), resolution time, CSAT average, tickets per category; simple date filter.
  - **SLA (later):** Define “first response within 24h” and “resolved within 72h”; job that sets `sla_breached` and optionally notifies.

**Implementation notes:**

- Minimal schema: `first_response_at`, `resolved_at` on `support_tickets`; new table `support_ticket_feedback`. Analytics can be read-only aggregations; no need for a full BI stack initially.

---

## 8. Ticket routing and escalation

**What it is:** Rules to assign tickets by priority, category, or round-robin; escalation when SLA or time thresholds are missed.

**Best practices:**

- Round-robin: sequential assignment so workload is balanced.[^12][^13]
- Priority routing: e.g. “Critical” → support lead, “Billing” → finance.[^13]
- Zendesk-style: rule-based routing by tags/queues, push (auto-assign) vs pull (agent picks), omnichannel rules.[^14]

**RipX relevance:**

- **Current:** Single queue; no assignment.
- **Advanced:**
  - **Categories:** Already have `category` on `support_tickets`. Add allowlist (e.g. `billing`, `technical`, `feature_request`) and optional `priority` (e.g. `low`, `normal`, `high`, `critical`).
  - **Assignment:** `assigned_to` (user id or email). Simple round-robin: job or on-create logic that assigns next agent from a list (from env or DB).
  - **Escalation:** Background job: if `created_at` > 24h and no `first_response_at`, set `priority = high` and/or notify “unassigned backlog.”

**Implementation notes:**

- Start with category + optional manual assignment; round-robin and escalation can be Phase 3.

---

## 9. Macros, templates, and canned responses

**What it is:** Pre-written replies and multi-action macros (reply + set status + add tag) to standardize and speed agent work.

**Best practices:**

- Macros can add reply text (with placeholders), update status/priority/assignee/tags, attach files.[^15][^16]
- Personal vs shared macros; organize in folders; create from existing tickets.[^16]

**RipX relevance:**

- **Current:** `mailProcessService` and email templates for system emails; no agent-facing templates.
- **Advanced:**
  - **Canned responses:** Table `support_canned_responses` (id, name, body, category). Admin UI: list, add, edit. When replying to a ticket, agent picks a template and can edit before sending.
  - **Placeholders:** Support `{{ticket_id}}`, `{{customer_email}}`, `{{subject}}` in body; replace in backend when sending.
  - **Macros (simplified):** “Close as solved” = set status + send one of N canned “We’ve resolved your issue…” replies. Start with a small set (e.g. “Resolved – script install”, “Resolved – billing”, “Escalate to dev”).

**Implementation notes:**

- Reuse `emailService.sendMail()` and existing layout for outbound reply email. Store “replies” in `support_ticket_replies` (ticket_id, from_agent, body, created_at) so thread is visible in admin.

---

## 10. Feedback and feature requests

**What it is:** Widget or page for feature requests and voting; public roadmap and status updates.

**Best practices:**

- Embeddable widgets; voting with email verification; public boards; prioritization (e.g. RICE, ICE); notify voters when status changes.[^17][^18]
- AI duplicate detection for similar requests; integration with Intercom/Slack.[^18]

**RipX relevance:**

- **Current:** No structured feedback channel (only free-form in tickets).
- **Advanced:**
  - **Lightweight:** “Feature request” category on `support_tickets` plus optional `feature_request` table (title, description, votes, status, created_by). Simple “Vote” button that increments votes (one per user).
  - **Or integrate:** ProductLift, FeatureVote, Upvoted, or Canny: embed on Support or “Feedback” page; link from in-app menu.
  - **Roadmap:** Public page “What we’re building” with status (Considering / Planned / In progress / Shipped) and optional changelog link.

**Implementation notes:**

- Phase 1: use ticket category “feature_request” and tag in admin. Phase 2: add `feature_requests` table + voting or adopt a third-party widget.

---

## 11. Developer and status support

**What it is:** Status page, API changelog, and clear developer support contact for API/app issues.

**Best practices:**

- Status pages for API/services with incident history and optional email/RSS.[^19][^20]
- Changelog for API versions and breaking changes; early notice for deprecations.[^20]
- Developer support: contact form, email, or forum; problem reporting and regional availability where relevant.[^19]

**RipX relevance:**

- **Current:** Docs (e.g. App Proxy, setup); no formal status or changelog.
- **Advanced:**
  - **Status page:** Simple “RipX status” page (or use Statuspage.io, Better Uptime): “All systems operational” / “Incident” with short history. Optional: health endpoint `GET /health` already exists; status page can poll it or be updated manually.
  - **Changelog:** `docs/CHANGELOG.md` or `/changelog` route with release notes (API, storefront script, admin). Link from Documentation and footer.
  - **Developer contact:** “API or integration issue?” → support form with category “API / developer”; optional “Report an issue” link in docs.

**Implementation notes:**

- Changelog: maintain a markdown file; render in app or static. Status: start with a static “Operational” plus link to status provider if you use one later.

---

## 12. Multilingual support

**What it is:** Knowledge base and chatbot in multiple languages; automatic detection and translation.

**Best practices:**

- Many customers prefer support in their language; AI can detect language and respond in 95+ languages.[^21][^22]
- Localization: prepare content, use AI or MT, review by native speakers, test, and keep in sync.[^21]
- Multilingual chatbots can improve satisfaction and conversion while reducing cost vs human multilingual teams.[^22]

**RipX relevance:**

- **Current:** English-only docs and UI.
- **Advanced:**
  - **KB:** If you have a RAG KB, add language field to chunks; detect locale from Accept-Language or user setting; search only that language or add machine-translated chunks.
  - **Chatbot:** Same RAG API with `lang` param; system prompt “Respond in the user’s language.”
  - **UI:** Full UI translation is a separate i18n effort; support-specific translation (e.g. Support page, email templates) can be a first step.

**Implementation notes:**

- Defer until you have non-English demand. When needed: start with RAG response language (detect or pass `lang`) and a few high-traffic KB articles translated.

---

## 13. RipX-specific integration points

These tie support to existing RipX features so the system feels native.

| RipX area             | Support integration                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**              | `optionalAuthenticate` on ticket submit sets `tenant_id`/`shop_domain` when logged in; `GET /api/support/tickets` filters by email or shop. when widget is added. |
| **Tenants / domains** | `tenant_id` and `shop_domain` set from session on submit; agents see which store/domain in ticket data.                                                           |
| **Tests**             | “Having trouble with a test?” → prefill or link test id in ticket; admin sees test link in ticket view.                                                           |
| **Storefront script** | KB and RAG: “Storefront script”, “App Proxy”, “Script not loading”; suggested replies for common script issues.                                                   |
| **Admin**             | Admin layout: “Support” section for ticket list, canned responses, and (later) analytics.                                                                         |
| **Notifications**     | Reuse notification service: “New ticket”, “Ticket replied”, “SLA at risk.”                                                                                        |
| **Email**             | All support email via `emailService`; templates in `mailProcessService` for “Ticket received”, “Reply”, “Survey”.                                                 |

---

## 14. Prioritized roadmap for RipX

**Phase 1 (done: email + Support page)**

- Email tickets: `support_tickets` table, `POST /api/support/ticket` (optional auth), `GET /api/support/tickets`, `GET /api/support/categories`. Support page: contact form, email prefill, "My requests," Documentation link. **Remaining:** Live chat (live chat/Tawk), basic live chat bot.

**Phase 2 (existing plan)**

- RAG bot (pgvector + OpenAI), “Ask AI” UI, rate limits, optional admin ticket list.

**Phase 2+ (advanced, in order)**

1. **Canned responses + reply tracking** – Low effort; high agent productivity. Table `support_canned_responses`; `support_ticket_replies`; admin “Reply” with template picker.
2. **CSAT + basic analytics** – FRT, resolution time, CSAT survey after resolve; simple admin dashboard.
3. **Contextual help** – One guided tour (e.g. Test Creator) and a few tooltips (traffic, targeting); link to docs.
4. **Unified view** – live chat webhook → create/update tickets from chat; single admin “Support” list.
5. **Deflection + suggested reply** – RAG before ticket create; “Suggest reply” in admin.
6. **Status + changelog** – Public status page (or static “Operational”) and `/changelog` from `CHANGELOG.md`.
7. **Categories + assignment** – Category allowlist, `assigned_to`, simple round-robin or manual.
8. **Proactive triggers** – Job: store disconnected, no test in 30 days; send email or in-app message.
9. **Feature requests** – Category + voting table or third-party widget.
10. **Multilingual** – When needed; start with RAG language and a few KB articles.

---

## 15. References and sources

[^1]: DocsBot AI – SaaS Customer Support Best Practices 2026

[^2]: Desk365 – SaaS Customer Support Best Practices

[^3]: Gorgias – E-commerce helpdesk, AI, omnichannel

[^4]: Robylon – SaaS Help Desk Software (2025/2026)

[^5]: Docsie – Context-Sensitive Help & In-App Guidance

[^6]: Supademo – In-App Product Tours, Knowledge Base

[^7]: Navio – Embeddable Onboarding & Product Tours

[^8]: FullStory – Proactive Customer Care

[^9]: GrowthCues / Pedowitz – Proactive support, trigger-based outreach with AI

[^10]: Dixa – Customer Service Reporting & Dashboards

[^11]: Desk365 – Helpdesk Reporting and Analytics

[^12]: Squadcast – Round Robin & Advanced Escalations

[^13]: Formaloo – Support escalation form, priority routing

[^14]: Zendesk – Routing and automation options

[^15]: Zendesk – Creating macros for repetitive ticket responses

[^16]: Freshservice – Canned responses

[^17]: ProductLift – User feedback, feature requests, voting

[^18]: FeatureVote, Upvoted – Feature voting and feedback

[^19]: Shell / Anywhere – API status pages, developer support

[^20]: Cisco DevNet – Support API, API Changelog

[^21]: Chatiq, Transifex – Knowledge base localization

[^22]: BuiltABot – Multilingual chatbot (95+ languages)

---

_This document is part of the RipX support system design. Implement in line with [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md) and your security/privacy policy._
