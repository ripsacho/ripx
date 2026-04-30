# Support System – Data Management, Algorithms & Related Features

**Purpose:** Research on support data lifecycle, algorithms (routing, prioritization, SLA, auto-categorization), and related features. Complements [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md), [SUPPORT_SYSTEM_ADVANCED_RESEARCH.md](./SUPPORT_SYSTEM_ADVANCED_RESEARCH.md), and [SUPPORT_UI_AND_ROLES_RESEARCH.md](./SUPPORT_UI_AND_ROLES_RESEARCH.md). For **UI/UX** and **roles**, see the UI doc; for **advanced features** (omnichannel, AI, proactive, etc.), see the Advanced doc.

**Current implementation (Phase 1):** `support_tickets` has id, user_id, email, subject, category, message, status, tenant_id, shop_domain, created_at, updated_at, first_response_at, resolved_at, assigned_to, priority, metadata. Optional auth on `POST /api/support/ticket` sets tenant_id/shop_domain when the user is logged in. `GET /api/support/categories` returns the category allowlist. No replies table, full-text search, or SLA jobs yet.

**Table of contents**

1. [Data management](#1-data-management)
2. [Algorithms](#2-algorithms)
3. [Related features](#3-related-features)
4. [RipX implementation notes](#4-ripx-implementation-notes)
5. [References](#5-references)

---

## 1. Data management

### 1.1 Schema and lifecycle

**Core entities (typical):**

- **Tickets** – id, requester (user_id / email), subject, message, category, status, priority, assignee, tenant/shop, timestamps (created_at, updated_at, first_response_at, resolved_at), metadata (JSONB).
- **Replies** – id, ticket_id, from_agent (boolean), author_id or email, body, created_at.
- **Canned responses** – id, name, body, category, created_at.
- **Feedback (CSAT)** – ticket_id, score, comment, created_at.
- **Attachments** – ticket_id or reply_id, file path or URL, content_type, size (store in object storage or DB; limit size and type).

**Retention and deletion:**

- **GDPR / CPRA:** Do not retain personal data longer than necessary; support deletion schedules and right-to-erasure.[^1][^2]
- **Deletion schedules:** e.g. soft-delete tickets first; after 30–90 days permanently remove; support rules by status, age, brand, tag.[^1][^2]
- **RipX:** Migration 049 adds `deleted_at` (soft delete). Optional job (Phase 2): set deleted_at for closed tickets older than SUPPORT_TICKET_RETENTION_DAYS; anonymise or purge on request. (Job not yet implemented; schema ready.)

### 1.2 Indexing and search

- **Lookups:** Indexes on `user_id`, `email`, `tenant_id`/`shop_domain`, `status`, `created_at`, `assigned_to`, `category` for list/filter and reporting.[^2]
- **Full-text search:** PostgreSQL `tsvector`/`tsquery` on subject + message, or `pg_trgm` for trigram search; GIN index for fast search.[^3]
- **RipX:** Start with B-tree indexes on status, created_at, email, tenant_id; add full-text or pg_trgm in Phase 2 when search is needed.

### 1.3 Backup and audit

- **Backup:** Regular DB backups (same as rest of app); support tables included.
- **Audit:** Log ticket creation, status changes, assignment, reply (who, when); use existing `audit_log` with entity_type `support_ticket` and action `created`|`updated`|`replied`|`assigned`.[^3]
- **RipX:** Ticket creation is logged to `audit_log` with `entity_type = 'support_ticket'`, `entity_id = ticket_id`, `action = 'created'` (see supportRoutes.js). Store ticket_id in entity_id, changes in JSONB.

### 1.4 Data model (analytics-ready)

- **Performance metrics:** first_response_at, resolved_at enable FRT and resolution time; store in same table.[^2]
- **SLA:** Optional columns `sla_target_hours`, `sla_breached`; job computes from first_response_at / resolved_at.
- **Historical snapshots:** Optional table for ticket lifecycle (status changes, assignee changes) for reporting; start simple with main ticket table only.

---

## 2. Algorithms

### 2.1 Priority scoring

**Factors (industry practice):[^4][^5]**

- **Urgency** – Customer sentiment (NLP), keywords (“urgent,” “broken”), SLA time left.
- **Impact** – Account tier, number of users affected, revenue impact.
- **Complexity** – Category, history (reopens), length of thread.

**Simple rule-based (Phase 1):**

- Category “billing” or “outage” → high; “feature_request” → low; else normal.
- Optional: “no first response in 24h” → auto-increase priority.

**AI-based (Phase 2+):**

- NLP for sentiment (anger, frustration) and intent; combine with category and SLA to output priority score or level.[^4][^5]

### 2.2 Auto-categorization

- **Keyword / rule-based:** Map keywords to category (e.g. “refund,” “invoice” → billing; “script,” “install” → technical).
- **ML/NLP:** Train classifier (e.g. logistic regression, transformer) on subject + message → category; retrain from corrected labels.[^6]
- **RipX:** Phase 1: allowlist category from form; Phase 2: optional keyword or small LLM call to suggest category when missing.

### 2.3 Routing and assignment

- **Round-robin:** Maintain “next agent” pointer; assign new ticket to next in list; wrap on end.[^7]
- **By category:** Route “billing” to team/agent A, “technical” to B (configurable map).
- **By load:** Assign to agent with fewest open tickets; requires query per assignment.
- **RipX:** Phase 1: unassigned; Phase 2: manual assign; Phase 3: optional round-robin or category-based routing.

### 2.4 SLA calculation

- **Targets:** e.g. “First response within 24h,” “Resolution within 72h” (from created_at).
- **Computation:** On first agent reply set `first_response_at`; on status=resolved set `resolved_at`. Job or trigger: if now() > created_at + target and first_response_at is null → breach (or “at risk”).
- **Business hours:** Optional: only count business hours for SLA (more complex; start with wall-clock).

### 2.5 Sentiment and deflection

- **Sentiment:** NLP (e.g. DistilBERT) for emotion (anger, joy, sadness) to flag at-risk or VIP responses.[^6]
- **Deflection:** Before creating ticket, run RAG; if confidence high, return answer and “Was this helpful?”; if no, then create ticket.[^8]
- **RipX:** Deflection in Phase 2 (RAG); sentiment optional later.

---

## 3. Related features

### 3.1 Notifications

- **Customer:** “We received your request #ID”; “We replied to your request #ID”; “Your request was resolved.”
- **Agent/Admin:** “New ticket assigned to you”; “Ticket #ID approaching SLA breach”; “New ticket in queue.”
- **RipX:** Reuse `emailService` and `notificationService` (in-app); templates in `mailProcessService`.

### 3.2 Webhooks and integrations

- **Outbound:** On ticket created, replied, resolved → POST to customer webhook URL (if configured).
- **Inbound:** Email-to-ticket (SendGrid Inbound Parse, SES receipt); create ticket from email thread.
- **RipX:** Optional outbound webhook in `outboundWebhookService` for support events; inbound email in Phase 3.

### 3.3 Attachments and storage

- **Store:** Local disk or S3-compatible object storage; DB stores path or URL; restrict type (images, PDF, txt) and size (e.g. 5 MB per file, 3 files per ticket).
- **Virus scan:** Optional scan on upload (e.g. ClamAV); strip EXIF from images for privacy.

### 3.4 Internal notes

- **Visibility:** Notes visible only to agents; not sent to customer; useful for “called customer, left voicemail.”
- **Schema:** `support_ticket_replies` with `internal: true` or separate `support_ticket_notes` table.

### 3.5 Merge and split

- **Merge:** Two tickets → one; move replies into target; mark source as “merged into #ID.”
- **Split:** One ticket → two (e.g. two topics); copy message into new tickets; advanced, Phase 3.

### 3.6 Tags and custom fields

- **Tags:** Many-to-many ticket–tag for filter and reporting (e.g. “vip,” “bug”).
- **Custom fields:** Key-value on ticket (e.g. “order_id,” “test_id”); store in `metadata` JSONB or dedicated table.
- **RipX:** `metadata` JSONB on ticket for test_id, order_id, etc.; tags optional later.

---

## 4. RipX implementation notes

- **Data:** `support_tickets` (migration 047) includes id, user_id, email, subject, category, message, status, tenant_id, shop_domain, created_at, updated_at, first_response_at, resolved_at, assigned_to, priority, metadata. Optional auth on ticket create populates tenant_id/shop_domain. Add `support_ticket_replies` and `support_canned_responses` in Phase 2.
- **Categories:** Backend allowlist in `supportRoutes.js`; `GET /api/support/categories` returns value/label pairs for forms.
- **Algorithms:** Phase 1: category from form only; no auto-priority or auto-category. Phase 2: optional keyword-based category suggestion; SLA and priority rules in Phase 2+.
- **Retention:** Migration 049 adds `deleted_at`; optional env `SUPPORT_TICKET_RETENTION_DAYS` for a future job to soft-delete or anonymise old closed tickets.
- **Search:** Add pg_trgm or tsvector in a later migration when agent search is required.
- **Audit:** Implemented: ticket creation logged to `audit_log` with entity_type `support_ticket`, action `created`.

---

## 5. References

[^1]: Zendesk – Deletion schedules, ticket deletion, GDPR

[^2]: Fivetran – Zendesk Support data model; performance metrics, lifecycle

[^3]: Bytebase / Supabase – Postgres audit logging; pg_trgm indexing

[^4]: Everworker, Cobbai – AI ticket prioritization; SLA and urgency

[^5]: Pylar, IrisAgent – Triage pipeline; priority scoring

[^6]: Langflow, Akira – Ticket classification; sentiment and NER

[^7]: Zendesk – Round-robin, routing options

[^8]: SUPPORT_SYSTEM_ADVANCED_RESEARCH.md – Deflection, RAG

---

_Part of the RipX support system design. Implement in line with the implementation plan and security policy._
