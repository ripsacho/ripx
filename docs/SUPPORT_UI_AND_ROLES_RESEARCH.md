# Support System – UI, Role Management & Advanced Features

**Purpose:** Deep research on support portal UI/UX, role and permission models, and advanced features needed for a best-in-class support system. Complements [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md) and [SUPPORT_SYSTEM_ADVANCED_RESEARCH.md](./SUPPORT_SYSTEM_ADVANCED_RESEARCH.md). For **data and algorithms**, see [SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md](./SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md).

**Current implementation (Phase 1):** Support page uses **tabs**: Contact us (form with email prefill), My requests (ticket list, 401 handling), Ask AI (chat UI with suggested prompts, scroll-to-bottom, **bold** in replies). Live chat (live chat) when `VITE_live chat_WEBSITE_ID` set; user identity from profile. Backend: ticket + chat endpoints (`conversation_id` accepted for future). No agent UI yet. See [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md) for the implementation index.

**Table of contents**

1. [Executive summary](#1-executive-summary)
2. [Support system UI](#2-support-system-ui)
3. [Role management and permissions](#3-role-management-and-permissions)
4. [Agent workspace and queue UI](#4-agent-workspace-and-queue-ui)
5. [Support dashboards and metrics UI](#5-support-dashboards-and-metrics-ui)
6. [Advanced features (workflows, bulk, automation)](#6-advanced-features-workflows-bulk-automation)
7. [RipX integration: existing roles and support](#7-ripx-integration-existing-roles-and-support)
8. [Prioritized UI and roles roadmap](#8-prioritized-ui-and-roles-roadmap)
9. [References](#9-references)

---

## 1. Executive summary

A complete support system needs:

- **Customer-facing UI** – Support portal with clear navigation, ticket form (categories, required/optional fields, attachments), “My tickets,” and self-service (KB, AI, chat).
- **Agent/admin UI** – Ticket queue with views, filters, sort, bulk actions; ticket detail with reply editor, canned responses, and suggested replies; assignment and status.
- **Role management** – Distinct roles for support agents, supervisors, and admins (beyond RipX’s existing platform admin); permissions for tickets, KB, reports, and settings; optional team/department scoping and tenant scoping.
- **Dashboards** – Metrics widgets (volume, FRT, resolution time, CSAT), agent performance, SLA status, and topic/knowledge gaps.
- **Advanced features** – Saved views, SLA automation, workflow triggers, bulk actions, multiple ticket forms, and mail rules.

This document details UI patterns, role/permission models, and advanced features, then maps them to RipX’s current auth and admin model so support can be added without duplicating security logic.

---

## 2. Support system UI

### 2.1 Customer-facing support portal

**Goals:** Build trust, reduce friction, and deflect tickets via self-service.

| Principle              | Best practice                                                                    | RipX application                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **First impression**   | Design is the first touchpoint; clarity and consistency increase confidence.[^1] | Support page aligned with app (Polaris, same nav). Single entry: “Help” or “Support” with Chat, Email, Ask AI.   |
| **Navigation**         | Simple, structured categories; responsive and accessible.[^1]                    | Sidebar or tabs: “Contact us,” “My requests,” “Documentation,” “Ask AI.” Mobile-friendly.                        |
| **Self-service first** | KB, search, and AI reduce ticket volume.[^2]                                     | Show “Search our docs” and “Ask AI” above the ticket form; optional “Related articles” after category selection. |
| **Omnichannel**        | Consistent experience across chat, email, in-app.[^1]                            | One Support page: Chat (live chat/Tawk), Email (form), Ask AI (RAG). Same layout in user-panel and app-domain.   |

**Layout components (typical):**

- **Header:** Logo, “Support” or “Help,” optional search.
- **Primary CTA:** “Contact us” or “New request” that opens form or chat.
- **Shortcuts:** “My tickets,” “Documentation,” “Ask AI,” “Live chat.”
- **Footer:** Status page link, changelog, privacy/terms.

### 2.2 Ticket form UI

**Goals:** Collect the right information without burdening the customer; route and triage effectively.

**Eight support ticket UI best practices (research-backed):[^3]**

1. **Simplify case creation** – Minimize required fields; use smart defaults (e.g. prefill email when logged in).
2. **Right information** – Ask only what’s needed for routing and first response (category, subject, description).
3. **Efficient for agents** – Structure so agents see context quickly (category, domain/store when multi-tenant).
4. **Conditional fields** – Show extra fields based on category (e.g. “Test ID” for “Test issue,” “Order ID” for billing).
5. **Clear categories** – Dropdown or cards: e.g. Technical, Billing, Feature request, Script/Install, Other.
6. **Attachments** – Allow files (screenshots, logs); limit type and size (e.g. 5 MB, images + PDF).
7. **Expectations** – After submit: “We’ll respond within 24 hours” and ticket ID.
8. **No duplicate work** – If user is logged in, don’t ask for email again; optional “Link to current page” or “Test ID.”

**Form fields – recommended set:**

| Field         | Required              | Notes                                                                                 |
| ------------- | --------------------- | ------------------------------------------------------------------------------------- |
| Email         | Yes (or from session) | Prefill from `req.email` when authenticated.                                          |
| Category      | Yes                   | Allowlist: e.g. `technical`, `billing`, `feature_request`, `script_install`, `other`. |
| Subject       | Yes                   | Max length 500 chars (backend `MAX_SUBJECT_LENGTH`).                                  |
| Message       | Yes                   | Textarea, max 5000 chars; sanitize for HTML.                                          |
| Tenant/domain | Optional (hidden)     | Set from session when in app-domain so agents see which store.                        |
| Test ID       | Optional              | Shown when category = “Test issue” or “Technical”; link to test in admin.             |
| Attachments   | Optional              | 1–3 files, max 5 MB each; types: images, PDF, txt.                                    |

**Multiple ticket forms (advanced):**  
Different forms for “Refund,” “Technical,” “Feature request” with different fields and routing. Start with one form; add forms when you have clear use cases.

### 2.3 “My tickets” (customer)

- **Implemented:** List (ticket ID, subject, category, status, date) via `GET /api/support/tickets`; empty state; graceful 401; loading state.
- Filter: status (open, pending, resolved).
- Detail: thread of messages, status, “Reply” if open.
- Empty state: “No requests yet” with CTA to create one.

---

## 3. Role management and permissions

### 3.1 Role tiers (industry pattern)

Help desk systems use hierarchical roles with distinct permissions:[^4][^5]

| Role                         | Typical permissions                                                             | Use case            |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------- |
| **Account/System Admin**     | Full config, billing, security, all tickets, all reports, role assignment       | Platform owner, IT  |
| **Supervisor**               | View/respond to tickets, reports, team view; no system config or role changes   | Team lead           |
| **Agent**                    | View, reply, assign (if permitted), change status; own or team queue; no config | Support staff       |
| **Collaborator / View-only** | View tickets or reports only; no reply/assign                                   | Auditors, read-only |

**Two-tier model (advanced):[^5]**

- **Admin roles** – Configuration (settings, KB, forms, roles, integrations).
- **Agent roles** – Day-to-day work (tickets, replies, assignment, macros).  
  One user can have an admin role and an agent role.

### 3.2 Permission matrix (support-specific)

Granular permissions that map to UI and API:

| Permission                 | Description                                    | Typically                      |
| -------------------------- | ---------------------------------------------- | ------------------------------ |
| **Tickets**                |                                                |                                |
| `support:tickets:view`     | See ticket list and detail                     | Agent, Supervisor, Admin       |
| `support:tickets:view_all` | See all tenants’ tickets (vs own/team)         | Supervisor, Admin              |
| `support:tickets:create`   | Create ticket (customer form)                  | Any authenticated user         |
| `support:tickets:reply`    | Post reply as agent                            | Agent, Supervisor, Admin       |
| `support:tickets:assign`   | Assign / reassign ticket                       | Agent (own), Supervisor, Admin |
| `support:tickets:edit`     | Edit subject, category, priority, status       | Agent, Supervisor, Admin       |
| `support:tickets:delete`   | Delete or merge tickets                        | Admin only                     |
| **Canned responses**       |                                                |                                |
| `support:canned:use`       | Use shared canned responses                    | Agent, Supervisor, Admin       |
| `support:canned:manage`    | Create/edit/delete canned responses            | Admin (or Supervisor)          |
| **Reports & settings**     |                                                |                                |
| `support:reports:view`     | Access support analytics dashboard             | Supervisor, Admin              |
| `support:settings:manage`  | Configure categories, forms, SLA, integrations | Admin only                     |
| **Role assignment**        |                                                |                                |
| `support:roles:assign`     | Assign support role to a user                  | Admin only                     |

**Tenant/domain scoping (multi-tenant):**

- **Option A:** Agents see only tickets for tenants they have access to (e.g. same `tenant_id` or same account).
- **Option B:** “Support admin” sees all tenants; “Support agent” sees only assigned tenant(s) or team.  
  RipX can scope by `tenant_id` / `shop_domain` on tickets and by `user_domain_access` or account.

### 3.3 Teams and departments (optional)

- **Teams:** Groups of agents; tickets can be assigned to a team then picked by an agent.
- **Departments:** e.g. “Technical,” “Billing”; route by category to department; agents belong to one or more.  
  Start without teams; add when you have multiple agents and need routing.

### 3.4 Custom roles

Enterprise systems allow many custom roles (e.g. 197 in Zendesk[^5]) with a permission subset. For RipX, start with three fixed support roles:

- **Support Agent** – `view`, `reply`, `assign` (own/team), `edit` (status, etc.), `canned:use`.
- **Support Supervisor** – Agent + `view_all`, `reports:view`, optionally `canned:manage`.
- **Support Admin** – All of the above + `tickets:delete`, `canned:manage`, `settings:manage`, `roles:assign`.

Map “Support Admin” to existing platform **admin** or **superadmin** so one set of users can manage both app and support; alternatively add a separate `support_role` column.

---

## 4. Agent workspace and queue UI

### 4.1 Agent Home / command center

- **My work** – Tickets assigned to me; approval requests; CC’d/following.[^6]
- **Queue / shared inbox** – Unassigned or team tickets.
- **Views** – Saved filters (e.g. “Open – High priority,” “Unassigned,” “My resolved today”).

### 4.2 Ticket list (agent)

- **Layouts:** Inbox (conversation-style), Table (columns), Card (cards).[^7]
- **Columns:** ID, Requester, Subject, Category, Status, Priority, Assigned to, Created, Updated, SLA.
- **Sort:** By any column (e.g. created desc, priority).
- **Filters:** Status, priority, category, assignee, date range, tenant/shop (if multi-tenant). Filters persist per session.[^7]
- **Bulk actions:** Select multiple → Assign, Change status, Change priority, Add tag, Close.[^8][^9]

### 4.3 Ticket detail (agent)

- **Header:** ID, status, priority, category, assignee; actions: Assign, Close, Merge, Delete (if permitted).
- **Requester and context:** Email, tenant/shop, optional Test ID link, custom fields.
- **Thread:** Customer messages and agent replies in chronological order; internal notes (optional) visible only to agents.
- **Reply area:** Rich text or plain text; “Canned response” picker; “Suggest reply” (AI); optional “Internal note” checkbox.
- **Sidebar (optional):** Tenant info, test link, recent tickets from same user, SLA timer.

### 4.4 Assignment and status

- **Assign to:** Self, other agent, or team (if teams exist).
- **Status:** e.g. New, Open, Pending (waiting on customer), Resolved, Closed.
- **Priority:** Low, Normal, High, Critical (optional; can drive SLA and routing).

---

## 5. Support dashboards and metrics UI

### 5.1 Widgets (typical)

| Widget                     | Metrics                                               | Who               |
| -------------------------- | ----------------------------------------------------- | ----------------- |
| **Ticket volume**          | Created, closed, open; trend (e.g. last 7/30 days)    | All               |
| **First response time**    | Median or p95; by agent/team/tenant                   | Supervisor, Admin |
| **Resolution time**        | Time to resolve; by category                          | Supervisor, Admin |
| **CSAT**                   | Average score; % satisfied; trend                     | Supervisor, Admin |
| **SLA**                    | % in target; breached count; at-risk list             | Supervisor, Admin |
| **Agent activity**         | Tickets handled, replies, availability (if live chat) | Supervisor, Admin |
| **Topic / knowledge gaps** | Top topics; “no KB match” rate for AI                 | Admin             |

### 5.2 Dashboard layout

- **Tabs or sections:** e.g. Overview, Performance, SLA, Topics.
- **Date range** and filters (tenant, team, channel).
- **Export** (CSV/Excel) for reports.
- **Real-time (optional):** Live queue depth, agent status.[^10]

### 5.3 RipX relevance

- Reuse existing admin layout; add “Support” section with “Tickets,” “Canned responses,” “Reports.”
- Reports: start with ticket count by status, FRT, resolution time, CSAT average (from `support_ticket_feedback`).
- SLA widgets come after SLA rules and `first_response_at` / `resolved_at` are in place.

---

## 6. Advanced features (workflows, bulk, automation)

### 6.1 Saved views

- Agents save filter combinations as named views (e.g. “My open,” “High priority – unassigned”).
- Views are per user or shared with team.
- Implementation: store `view_name`, `user_id`, `filter_json` in `support_views`; list and apply in UI.

### 6.2 Bulk actions

- Select N tickets → one action: Assign, Set status, Set priority, Add tag, Close, Merge (optional).
- Confirmation step for destructive actions (e.g. “Close 10 tickets?”).
- API: `POST /api/support/tickets/bulk` with `{ ticketIds: [], action: 'close' }` (or similar).

### 6.3 SLA automation

- **Rules:** “If first_response_at is null and created_at > 24h ago → escalate (priority high, notify lead).” “If resolved_at is null and created_at > 72h → breach, notify.”
- **Jobs:** Cron or Bull job that evaluates SLA rules and updates `sla_breached`, sends notifications.
- **UI:** SLA target per ticket or per category; indicator (e.g. “At risk” / “Breached”) in list and detail.

### 6.4 Workflow triggers (if-then)

- **On create:** Set category from form; auto-assign by round-robin or route by category.
- **On reply:** Set `first_response_at` on first agent reply; notify customer.
- **On status = Resolved:** Send CSAT survey; set `resolved_at`.
- **Scheduled:** “Every 6h, list tickets with no first response > 24h and notify.”

### 6.5 Multiple ticket forms

- Different forms for “Refund,” “Technical,” “Feature request” with different fields and required/optional.
- Backend: `form_id` on ticket; form definition (fields, validation) in DB or config.
- Start with one form; add when routing and product need it.

### 6.6 Mail rules (email-to-ticket)

- Inbound email to e.g. support@ creates a ticket; thread by reply-to or headers.
- Mail rules: route by sender/domain, keyword, or forward to specific queue.
- Requires inbound email (e.g. SendGrid Inbound Parse, AWS SES receipt rule); can be Phase 3.

---

## 7. RipX integration: existing roles and support

### 7.1 Current RipX model

- **Platform roles** (`users.role`): `collaborator`, `admin`, `superadmin` (see `permissions.js`, `requireAdmin.js`).
- **Domain roles** (`user_domain_access.role`): `owner`, `member`, `viewer` (see `requireDomainRole.js`).
- **Admin panel:** Gated by `requireAdmin`; permission checks via `requirePermission(permission)`.

### 7.2 Mapping support to RipX

**Option A – Reuse platform admin for support admin**

- Only users with platform role `admin` or `superadmin` can access Support admin (ticket list, reports, settings, canned responses).
- No separate “Support Agent” role: any platform admin can reply and assign.
- **Pros:** No new role column; quick to ship. **Cons:** No read-only or agent-only tier.

**Option B – Add support-specific role**

- New column `users.support_role`: `null` | `agent` | `supervisor` | `admin`.
- Or reuse `users.role` and add permissions: e.g. `support_agent` (can view/reply tickets), `support_supervisor` (+ view all, reports), `support_admin` (+ settings, roles).
- Platform `admin`/`superadmin` can still access Support admin; optionally “Support agent” can only access Support, not other admin sections.
- **Pros:** Clear separation, future team growth. **Cons:** More schema and UI (role assignment).

**Option C – Permissions only (recommended for Phase 2+)**

- Add support permissions to `permissions.js` (e.g. `SUPPORT_VIEW_TICKETS`, `SUPPORT_REPLY`, `SUPPORT_MANAGE_SETTINGS`).
- Map to existing roles: e.g. `collaborator` = view tickets only; `admin` = view + reply + assign + reports; `superadmin` = all + settings and role assignment.
- No new column; single permission registry; frontend shows/hides Support menu and actions by permission.

### 7.3 Tenant scoping for tickets

- Store `tenant_id` or `shop_domain` on each ticket (from session when user submits in app-domain).
- **Agents:** If RipX uses domain-level access, restrict “My tickets” / queue to tenants the user can access (e.g. via `user_domain_access` or account).
- **Super admin / platform admin:** Can see all tenants’ tickets for support oversight.

### 7.4 Suggested backend additions

- **Tables:** `support_tickets` (existing plan), `support_ticket_replies`, `support_canned_responses`, `support_ticket_feedback` (CSAT), optional `support_views`, `support_forms`.
- **Columns on tickets:** `assigned_to` (user id), `first_response_at`, `resolved_at`, `priority`, `tenant_id` or `shop_domain`.
- **APIs:**
  - Customer (implemented): `POST /api/support/ticket` (optional auth; sets tenant/shop when logged in), `GET /api/support/tickets` (own, by email or shop), `GET /api/support/categories`.
  - Customer (Phase 2): `GET /api/support/tickets/:id`, `POST /api/support/tickets/:id/reply` (customer reply).
  - Agent/Admin: `GET /api/support/tickets` (filtered by permission), `PATCH /api/support/tickets/:id`, `POST /api/support/tickets/:id/reply`, `POST /api/support/tickets/bulk`, `GET /api/support/reports/*`, CRUD canned responses.

---

## 8. Prioritized UI and roles roadmap

**Phase 1 (done)**

- Customer: Support page with Email (single form), "My requests," Documentation link; Ask AI / Chat placeholder.
- Form: email (prefilled from profile when logged in), category, subject, message; tenant/shop set from session via optional auth.
- No agent UI; tickets in DB and email to support. `GET /api/support/categories` for dropdown.

**Phase 2**

- **Customer:** “My tickets” list and detail; reply from customer side.
- **Agent (admin) UI:** Ticket list (table) with status, category, assignee, date; filters (status, category); ticket detail with thread and reply box; optional canned response dropdown.
- **Roles:** Reuse platform admin; only admin/superadmin see Support in admin nav; no new permissions yet.

**Phase 2+ (UI and roles)**

1. **Support permissions** – Add `SUPPORT_*` to `permissions.js`; map to platform roles; gate routes and UI.
2. **Canned responses** – Table + UI (list, add, edit); “Insert” in reply box.
3. **Assignment** – `assigned_to`; dropdown in ticket detail; optional round-robin on create.
4. **Priority and status** – Priority field; status workflow (Open → Pending → Resolved → Closed).
5. **Saved views** – Save filters as named views; load in ticket list.
6. **Bulk actions** – Select multiple tickets; assign, set status, close.
7. **Reports dashboard** – FRT, resolution time, volume, CSAT widgets; date filter.
8. **SLA** – `sla_target_hours`, breach detection job, SLA column and indicators.
9. **Support-specific role** – Optional `support_role` or agent/supervisor/admin permission set for larger teams.
10. **Multiple forms** – Form selector or separate routes; `form_id` on ticket.

---

## 9. References

[^1]: Diziana / Freepixel – Zendesk Help Center UX, design principles, trust and clarity

[^2]: LogRocket – Help desk UX case studies (Dropbox, Litmus, Spotify, Zoom)

[^3]: Coveo – 8 Support Ticket UI Best Practices From Research

[^4]: Freshservice – Agent roles and permissions; two-tier role management

[^5]: Zendesk – Adding agents and admins; creating custom roles; ticket access

[^6]: Zendesk – Using Agent Home to manage work

[^7]: Zendesk – Sorting and filtering tickets in a view

[^8]: Cuppa – Bulk close tickets

[^9]: Freshdesk – Working with the ticket list view; bulk actions

[^10]: Zendesk – Agent productivity real-time dashboard; BoldDesk Agent Performance Dashboard

[^11]: Zendesk – Designing ticket forms for better agent and end-user experience

[^12]: Jitbit – SLA automation and help desk workflow rules

[^13]: Aserto / LoginRadius – RBAC for SaaS; multi-tenant roles; permission matrix

---

_This document is part of the RipX support system design. Use with [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md) and [SUPPORT_SYSTEM_ADVANCED_RESEARCH.md](./SUPPORT_SYSTEM_ADVANCED_RESEARCH.md)._
