# Customer Support Features – Implementation Plan

**Implementation index (quick reference):**

| Doc                                                                                        | Purpose                                                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| This file                                                                                  | Master plan, phases, checklist, env.                                                  |
| [SUPPORT_CHAT_AND_AI_RESEARCH.md](./SUPPORT_CHAT_AND_AI_RESEARCH.md)                       | AI chatbot, Support UX.                                                               |
| [SUPPORT_UI_AND_ROLES_RESEARCH.md](./SUPPORT_UI_AND_ROLES_RESEARCH.md)                     | Support portal UI, roles, agent workspace.                                            |
| [SUPPORT_SYSTEM_ADVANCED_RESEARCH.md](./SUPPORT_SYSTEM_ADVANCED_RESEARCH.md)               | Omnichannel, RAG, analytics, roadmap.                                                 |
| [SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md](./SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md)       | Data model, retention, routing, SLA.                                                  |
| [SUPPORT_BUBBLE_AND_LAYOUT_RESEARCH.md](./SUPPORT_BUBBLE_AND_LAYOUT_RESEARCH.md)           | Bubble chat window, realtime chat UX, Support page layout.                            |
| [SUPPORT_CHAT_IMPROVEMENTS_RESEARCH.md](./SUPPORT_CHAT_IMPROVEMENTS_RESEARCH.md)           | Chat input (send-inside, compact), image share, ticket status, human+AI same chatbox. |
| [SUPPORT_SYSTEM_REQUIREMENTS_AND_INSTALL.md](./SUPPORT_SYSTEM_REQUIREMENTS_AND_INSTALL.md) | Requirements, install steps, env vars (OpenAI, DB, rate limits).                      |

**Current status:** Email tickets, Support page with hero + **Popular topics** (Documentation, Dashboard) + 3 action cards + tabs (Contact us, My requests, Ask AI), categories from `GET /api/support/categories`, floating bubble (Ask AI + "Contact us" footer link), `POST /api/support/chat` (stub or OpenAI with optional `messages` for multi-turn). **Chat history:** Optional persistence via migration 048 (`support_chat_conversations`, `support_chat_messages`); backend saves each turn when tables exist and returns `conversation_id` for threading. **Rate limiting:** `RATE_LIMIT_SUPPORT_MAX` (default 10/15min per IP) applies to ticket + chat. See [SUPPORT_SYSTEM_REQUIREMENTS_AND_INSTALL.md](./SUPPORT_SYSTEM_REQUIREMENTS_AND_INSTALL.md). Phase 2: RAG (pgvector), admin ticket list. **Recent improvements:** TopBar user menu: "Account & API keys" (single entry), Resources order (My Profile, Preferences, Support, Documentation), vertical divider between primary actions and utilities; Support: `mountedRef` guards in `sendChatMessage`/`handleSubmit`/fetch retry, ticket list fallbacks (subject/title, status, date), Try again for tickets; `supportFormat.formatReplyContent` array guard; extensionless imports for `supportFormat`. **Chat UX:** Compact composer (48px height), send icon **inside** input on the right (WhatsApp/Teams style), SendIcon from Polaris; attach-image placeholder (left, disabled, "coming soon"); ticket status in My requests shows **Open** / **Closed** / **Resolved** with tooltip; **My requests** has status filter (All / Open / Closed). **Audit:** Ticket creation logged to `audit_log` (entity_type `support_ticket`, action `created`). **Retention:** Migration 049 adds `deleted_at` to `support_tickets` for future soft-delete/retention job; `SUPPORT_TICKET_RETENTION_DAYS` in .env.example. See [SUPPORT_CHAT_IMPROVEMENTS_RESEARCH.md](./SUPPORT_CHAT_IMPROVEMENTS_RESEARCH.md) for image share, human+AI same chatbox, and roadmap.

**Table of contents**

1. [Overview](#overview)
2. [Implementation Readiness – What You Have vs What You Need](#2-implementation-readiness)
3. [Architecture Options](#3-architecture-options)
4. [Live Chat with Real Support Team](#4-live-chat-with-real-support-team)
5. [AI Bot for Basic Q&A](#5-ai-bot-for-basic-qa)
6. [Email Support](#6-email-support)
7. [Unified UX and Escalation](#7-unified-ux-and-escalation)
8. [Implementation Order and Checklist](#8-implementation-order-and-checklist)
9. [Environment and Config](#9-environment-and-config)
10. [Security and Privacy](#10-security-and-privacy)
11. [Risks and Mitigations](#11-risks-and-mitigations)
12. [Advanced features and roadmap](#12-advanced-features-and-roadmap)
13. [Summary](#13-summary)

---

## Overview

This document outlines a full plan to add three customer support capabilities to RipX:

1. **Live chat with real support team** – Users can chat with human agents in real time.
2. **AI support bot** – An AI assistant that answers basic Q&A from your documentation/knowledge base.
3. **Email support** – Users can send an email for extra help or when the support team is unreachable.

The plan includes architecture options, step-by-step implementation, pros/cons, and how to handle common issues.

---

## 2. Implementation Readiness – What You Have vs What You Need

This section is specific to **RipX**. It lists what already exists in the codebase and what you need to add so you can start implementation with minimal surprises.

### 2.1 Already Available in RipX

| Need               | Status in RipX       | Notes                                                                                                                                                                                                                         |
| ------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**        | ✅ Node/Express      | `backend/src/app.js`, existing routes and middleware.                                                                                                                                                                         |
| **Database**       | ✅ PostgreSQL        | Migrations in `backend/migrations/` (e.g. `001_initial_schema.sql` … `046_*`). Next migration can be `047_support_tickets.sql`, then `048_pgvector_support_kb.sql`.                                                           |
| **Auth**           | ✅ Email + Shopify   | `req.email`, `req.shopDomain`, `authType`; `userModel.getByEmail()`. Support routes can use same `authenticate` + optional `requireEmailSession` or shop auth.                                                                |
| **Email sending**  | ✅ Nodemailer (SMTP) | `backend/src/services/emailService.js` – `sendMail({ to, subject, text, html })`, retries, branded layout. **No SendGrid required** for Phase 1; use existing SMTP (e.g. AWS SES) for support ticket and confirmation emails. |
| **Frontend**       | ✅ React + Vite      | `frontend/` with Polaris, React Router, lazy routes (`lazyRoutes.js`), `useAppRoutes`, `getRoutesForDomain`. Same pattern as `Documentation` can be used for a Support page.                                                  |
| **Routes pattern** | ✅ Centralised       | `frontend/src/constants/routes.js` (e.g. `ROUTES.DOCS`, `ROUTES.appDocs(domain)`). Add `ROUTES.SUPPORT` and `ROUTES.appSupport(domain)` and wire in `getRoutesForDomain.js`.                                                  |
| **Users table**    | ✅ UUID `id`         | `users.id` is UUID; `support_tickets.user_id` should be `UUID REFERENCES users(id)` (optional FK if ticket is from logged-in user).                                                                                           |

### 2.2 What You Need to Add

| Component                 | What to add               | Availability / notes                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Live chat widget**      | npm package + env         | **live chat:** `live chat-sdk-web` (npm, works with React/Vite SPA; [live chat SPA docs](https://help.live chat.chat/en/article/how-can-you-embed-live chat-inside-a-single-page-app-1ptfyyx)). **Tawk.to:** `@tawk.to/tawk-messenger-react` (official, [Tawk React](https://help.tawk.to/article/react-js)). Both free tiers available. You only need a **Website ID** (live chat) or **propertyId + widgetId** (Tawk) from their dashboards. |
| **Support tickets table** | New migration             | Create `support_tickets` (id UUID, user_id UUID nullable FK to users, email, subject, category, message, status, timestamps, metadata jsonb). No new backend deps.                                                                                                                                                                                                                                                                             |
| **Support ticket API**    | New routes + emailService | `POST /api/support/ticket`, optional `GET /api/support/tickets`. Use existing **emailService.sendMail()** for “to support” and “to user” emails (no SendGrid needed to start). Optional: add a mail process in `mailProcessService` for support confirmation so admins can edit template.                                                                                                                                                      |
| **AI bot (Phase 2)**      | pgvector + OpenAI         | **PostgreSQL:** Enable extension `CREATE EXTENSION IF NOT EXISTS vector;` in a new migration. **Node:** `npm install openai` (official SDK). **Table:** e.g. `support_kb_chunks(id, source, chunk_index, content, embedding vector(1536), metadata jsonb)`. OpenAI API key required; `text-embedding-3-small` and `gpt-4o-mini` (or similar) are enough.                                                                                       |
| **Support / Help route**  | Frontend route + page     | Add `ROUTES.SUPPORT` and `ROUTES.appSupport(domain)` in `routes.js`, add `support` in `getRoutesForDomain.js`, lazy-load a `Support` component, add `<Route path={...}>` in App (user-panel and app-domain). Same pattern as Documentation.                                                                                                                                                                                                    |

### 2.3 Readiness Checklist – Can You Start?

| Requirement                          | Ready?       | Action if not                                                                                                                                                                                                      |
| ------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend runs and DB migrations apply | ✅           | Fix any migration errors first.                                                                                                                                                                                    |
| SMTP configured (or stub)            | ✅           | `.env`: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. If not set, emailService stubs (no send); you can still implement ticket creation and test with stub.                                                  |
| live chat or Tawk account            | ❌ → sign up | Free: [live chat](https://live chat.chat), [Tawk.to](https://www.tawk.to). Get Website ID (live chat) or propertyId + widgetId (Tawk).                                                                             |
| OpenAI API key (Phase 2 only)        | ❌ → get key | [OpenAI API](https://platform.openai.com/api-keys). Needed only for custom RAG bot.                                                                                                                                |
| pgvector on Postgres (Phase 2 only)  | ❌ → enable  | Run `CREATE EXTENSION IF NOT EXISTS vector;` (e.g. in migration 048). Requires Postgres 11+ with pgvector installed on the server (e.g. [pgvector on AWS RDS](https://github.com/pgvector/pgvector#installation)). |

**Verdict:** You have everything needed to start **Phase 1** (live chat + email support) without new infrastructure. Phase 2 (RAG bot) requires pgvector extension, OpenAI API key, and a small knowledge base.

### 2.4 Deeper research notes (sources and alternatives)

- **live chat vs Tawk.to:** Both offer free tiers and React-friendly SDKs. live chat: `live chat-sdk-web`, supports SPA with `autoload: false` and manual `live chat.load()`; identity via `live chat.session.setData()`. Tawk: official `@tawk.to/tawk-messenger-react`, propertyId + widgetId; unlimited agents on free tier. Choose live chat for slightly richer UX and bot; Tawk for zero cost at scale.
- **pgvector in Node:** Use the standard `pg` client; pgvector stores vectors as a native type. Query with `ORDER BY embedding <=> $1::vector LIMIT 5` (cosine distance). No extra Node package required; ensure Postgres has the extension installed (e.g. [pgvector](https://github.com/pgvector/pgvector)).
- **OpenAI in Node:** Official `openai` npm package; `new OpenAI({ apiKey })`, then `openai.embeddings.create({ model: 'text-embedding-3-small', input })` and `openai.chat.completions.create()`. Use `gpt-4o-mini` for cost-effective RAG replies.
- **Unified inbox:** If you later want one place for chat + email, use live chat’s “Conversations” (chat + email in one thread) or integrate webhooks to push chat transcripts into your `support_tickets` table for a single admin view.

---

## 3. Architecture Options

### Option A: Unified SaaS (Recommended for faster launch)

Use one platform that can cover chat + bot + email (or combine 2–3 tools with clear roles).

| Component | Recommended SaaS                    | Alternative              | Why                                                                                                    |
| --------- | ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Live chat | **live chat** or **Tawk.to**        | Intercom, Zendesk        | live chat/Tawk: free tier, React SDK, good for startups. Intercom/Zendesk: more features, higher cost. |
| AI bot    | **live chat chatbot** or **custom** | Intercom Fin, Dialogflow | live chat has built-in bot; custom RAG gives full control and RipX-specific answers.                   |
| Email     | **Same platform** or **SendGrid**   | Zendesk, Help Scout      | Many chat tools have email; SendGrid + your backend = full control and ticketing.                      |

### Option B: Best-of-breed (More control, more integration work)

- **Live chat:** live chat or Tawk.to (embed widget).
- **AI bot:** Custom backend (OpenAI/Anthropic + RAG on your docs).
- **Email:** SendGrid + your own ticket table + optional Zendesk/Help Scout later.

### Option C: All custom (Maximum control, highest effort)

- Custom WebSocket or polling chat.
- Custom RAG pipeline (embeddings + vector DB + LLM).
- Custom email forms + ticket DB + notifications.

**Recommendation:** Start with **Option A** using **live chat** (or Tawk.to) for live chat + built-in bot + email, then add a **custom AI bot** (Option B) later for RipX-specific Q&A if needed.

---

## 4. Live Chat with Real Support Team

### 4.1 Options Compared

| Solution      | Pros                                                       | Cons                                 | Cost (typical) |
| ------------- | ---------------------------------------------------------- | ------------------------------------ | -------------- |
| **live chat** | Free tier (2 seats), React SDK, bot + email, GDPR-friendly | Bot is rule-based unless upgraded    | Free → $45/mo  |
| **Tawk.to**   | Free, unlimited agents, mobile app                         | Less polished UI, fewer integrations | Free + add-ons |
| **Intercom**  | Strong automation, Fin AI, Zendesk sync                    | No free tier, expensive              | ~$139/seat/mo  |
| **Zendesk**   | Full ticketing, chat, email, API                           | Heavier, more setup                  | Tiered, higher |

### 4.2 Implementation Steps (live chat – fits React/Vite)

**Step 1: live chat account and site**

1. Sign up at [live chat.chat](https://live chat.chat).
2. Create a site, get **Website ID** (Settings → Setup & Integrations).
3. (Optional) Add team members and set availability.

**Step 2: Install and configure in RipX frontend**

```bash
cd frontend && npm install live chat-sdk-web
```

**Step 3: Load live chat only when needed (e.g. support page or layout)**

- Create a small hook or component that runs `live chat.configure(websiteId)` in `useEffect` and (optional) sets user data from your auth (email, name).
- Mount this in your main layout or a dedicated Support/Help route so the widget appears on the right pages only.
- For SPA: use live chat’s SPA docs so the widget doesn’t re-init on every route change.

**Step 4: Identify users (optional but recommended)**

- When the user is logged in, call live chat’s API to set email/name so agents see who they’re talking to and you can avoid asking again. Example: `live chat.session.setData([{ key: 'email', value: user.email }, { key: 'nickname', value: user.name || user.email.split('@')[0] }]);`

**Step 5: Backend (optional)**

- If you want chat history or “open ticket” logic in your DB, use live chat’s webhooks (e.g. `message:sent`) and your backend to store or link to tickets.

### 4.3 Pros and Cons – Live Chat

| Pros                                    | Cons                                          | How to handle                                                                                  |
| --------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Fast to ship with live chat/Tawk        | Dependency on third party                     | Keep user-facing copy and escalation paths in your app; you can swap widget later.             |
| No real-time backend needed             | Free tier limits (e.g. 2 seats for live chat) | Start on free tier; upgrade when you add a second agent.                                       |
| Mobile apps for agents (live chat/Tawk) | Possible delays if agents offline             | Set expectations (“usually reply in X hours”), add “Email us” and AI bot as fallbacks.         |
| Chat history in one place               | Data lives in provider                        | Comply with their DPA; document in privacy policy; use webhooks if you need a copy in your DB. |

### 4.4 Human availability and support team role

**Is "real human available" shown in the app?**  
RipX does **not** currently show a real-time "agent online" indicator. The UI states that live chat is available when the team is online and that the team typically replies within a few minutes. Adding a live "agents available" badge would require optional widget's REST API or webhooks to detect operator status and expose it via your backend, or a custom availability endpoint.

**How the support team role works today:**

| Channel                   | Who handles it             | How                                                                                                                                                                                                                                                                |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Live chat (live chat)** | Support agents (operators) | Add team members in live chat (Settings → Team). They use the live chat app or web inbox. When a user clicks "Chat with team," the conversation appears in live chat; agents reply there. No RipX-specific "support role" is required—live chat manages operators. |
| **Contact us (tickets)**  | Support team via email     | `POST /api/support/ticket` creates a row in `support_tickets` and sends email to the configured address. The team replies by email (or later via an admin ticket UI).                                                                                              |
| **Ask AI**                | Automated (OpenAI)         | Backend uses `OPENAI_API_KEY`; no human in the loop unless you add handoff (e.g. "Transfer to human" opening live chat or creating a ticket).                                                                                                                      |

**Recommendations:** Use optional widget's availability/business hours if enabled. Optionally use live chat routing or teams to assign by topic. For tickets, a future admin ticket list (e.g. `/admin/support`) would let support or admin users assign and reply from RipX; until then, replying by email is sufficient.

---

## 5. AI Bot for Basic Q&A

### 5.1 Options Compared

| Approach                                       | Pros                                                      | Cons                                        | Best for                         |
| ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- | -------------------------------- |
| **live chat/Tawk built-in bot**                | No backend, quick setup                                   | Generic, rule-based or limited NLP          | First version, simple FAQs.      |
| **Custom RAG (OpenAI/Claude + your docs)**     | Answers from your docs, less hallucination, RipX-specific | Backend + embeddings + storage              | Accurate, project-specific Q&A.  |
| **Third-party RAG (e.g. ChatRAG, custom GPT)** | Less code                                                 | Cost, less control, data outside your stack | Fast MVP if you’re OK with that. |

### 5.2 Recommended: Hybrid

- **Phase 1:** Use live chat’s chatbot for simple rules (“How do I create a test?”, “Contact support”) so you have a bot immediately.
- **Phase 2:** Add a **custom AI bot** (RAG) in your backend and expose it via API; either:
  - Replace live chat bot with your own UI that calls your API, or
  - Keep live chat for live chat and add a separate “Ask AI” flow in the app that uses your RAG API.

### 5.3 Implementation Steps – Custom RAG Bot (Phase 2)

**Step 1: Knowledge base**

1. Gather content: docs (MD/HTML), FAQ, key help articles about RipX (tests, targeting, install, storefront script, etc.).
2. Store in a folder (e.g. `docs/kb/`) or in a CMS/DB you can read from.

**Step 2: Backend – embeddings and search**

1. **Chunking:** Split each doc into chunks (e.g. 300–500 tokens, 50-token overlap). Use a simple splitter (by paragraph or by token count).
2. **Embeddings:** Call OpenAI `text-embedding-3-small` (or similar) per chunk; store `(chunk_id, text, embedding)`.
3. **Storage:** Use **pgvector** in your existing PostgreSQL so you don’t add a new DB. Create a table e.g. `support_kb_chunks(id, source, chunk_index, content, embedding vector(1536), metadata jsonb)`.
4. **Search:** On each user question, embed the question, run a vector similarity search (e.g. top 5 chunks), return chunks + source.

**Step 3: Backend – chat API**

1. New route, e.g. `POST /api/support/chat` (protected by your auth).
2. Body: `{ message: string, conversation_id?: string }`.
3. Optional: store conversation in DB by `conversation_id` for context (last N messages).
4. Flow: embed user message → vector search → build prompt with “Use only this context: …” + user message → call OpenAI/Claude chat API → return assistant reply; optionally include “sources” (chunk titles/URLs).
5. Add a system prompt: “You are RipX support. Answer only from the provided context. If unsure, say to contact support or send an email.”

**Step 4: Frontend – AI bot UI**

1. Add a small “Ask AI” or “Help” entry (button or link in header/support page).
2. Simple chat UI: input, list of messages, optional “Sources” for the last answer.
3. Call `POST /api/support/chat` with the current message (and `conversation_id` if you use it).
4. Show typing state and errors; offer “Chat with human” or “Email support” if the bot can’t help.

**Step 5: Safety and cost**

- Rate limit per user (e.g. 20 requests/hour).
- Max tokens per reply (e.g. 500).
- Do not send PII to the LLM beyond what’s necessary; log only for debugging if allowed by policy.

### 5.4 Pros and Cons – AI Bot

| Pros                          | Cons                                     | How to handle                                                       |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Instant answers, 24/7         | Can hallucinate or be wrong              | RAG + “only from context” + “contact support if unsure”.            |
| Cuts repetitive questions     | Needs good docs and chunking             | Start with a small KB; iterate from real questions.                 |
| Scalable (no extra headcount) | LLM and embedding cost                   | Limit context length and rate limits; cache frequent Q&A if useful. |
| RipX-specific with RAG        | More engineering (embeddings, vector DB) | Phase 2; Phase 1 use live chat bot.                                 |

---

## 6. Email Support

### 6.1 Options Compared

| Approach                      | Pros                                  | Cons                                        |
| ----------------------------- | ------------------------------------- | ------------------------------------------- |
| **live chat/Tawk “Email us”** | Same inbox as chat, no backend        | Less control over templates and routing.    |
| **SendGrid + your backend**   | Full control, your templates, your DB | You build form, storage, and notifications. |
| **Zendesk / Help Scout**      | Full ticketing, SLA, reports          | Cost and integration effort.                |

### 6.2 Recommended: Form in app → Backend → existing emailService (or SendGrid) + your DB

- User submits a form (category, subject, message, optional attachment).
- Backend: validate, store in `support_tickets`, send two emails using **existing emailService** (SMTP): one to your support address, one confirmation to the user. Optionally add SendGrid later for higher volume or templates.
- Later: admin view to mark “replied” or sync to Zendesk.

**RipX-specific:** You already have `emailService.sendMail()` and `mailProcessService` (templates). Use them for support ticket and confirmation emails so Phase 1 needs **no new email provider** (no SendGrid unless you prefer it).

### 6.3 Implementation Steps – Email Support

**Step 1: DB schema (migration `047_support_tickets.sql`)**

```sql
-- support_tickets: optional user_id for logged-in users (RipX users.id is UUID)
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  category VARCHAR(100),
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at DESC);
```

**Step 2: Backend API**

1. **POST /api/support/ticket** (auth optional; if present, set `user_id` and prefill email from `req.email`)
   - Body: `{ email, subject, category, message }`. Validate: message max length (e.g. 2000 chars), subject max (e.g. 500 to match DB), category from an allowlist if used. Sanitize message for HTML when sending in emails (escape or strip tags) to avoid injection.
   - **Rate limit:** e.g. 10 requests per 15 min per IP (or per user if authenticated). Insert into `support_tickets`. Call **emailService.sendMail()** twice:
     - To `SUPPORT_EMAIL_TO` (env): “New ticket #ID from {email}: {subject}” + message (use existing `wrapEmailLayout` or simple HTML).
     - To user: “We received your request #ID. We’ll reply within X.” (same service).
   - Return `{ ticket_id, message }`.

2. (Optional) **GET /api/support/tickets** for “My tickets”: list by `user_id` or `email` (when logged in).

**Step 3: Email transport (no new dependency for Phase 1)**

- Use existing **SMTP** (e.g. AWS SES) via `emailService.sendMail()`. Set in `.env`: `SUPPORT_EMAIL_TO=your-team@yourdomain.com`. Use same `SMTP_FROM` or a dedicated `SUPPORT_EMAIL_FROM` if you prefer.
- **Optional later:** Add SendGrid (`npm install @sendgrid/mail`) and a small wrapper that chooses SendGrid when `SENDGRID_API_KEY` is set, else fall back to current SMTP.

**Step 4: Frontend**

1. “Email support” or “Contact us” page: form (category dropdown, subject, message, optional file).
2. On submit: POST to `POST /api/support/ticket`, show success (“We’ve received your message. Ticket #…”) or error.
3. Optional: “My support requests” page that calls `GET /api/support/tickets` and shows status.

### 6.4 Pros and Cons – Email Support

| Pros                             | Cons                                  | How to handle                                                                         |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| Async, no need for agents online | Slower than chat                      | Set expectations (“we reply within 24h”); use for non-urgent or when chat is offline. |
| Audit trail in your DB           | You own templates and delivery        | Use templates and env-based config; monitor bounces.                                  |
| Works with any email client      | Spam risk if form is public           | Require auth or CAPTCHA; rate limit by IP/email.                                      |
| Can plug into Zendesk later      | Duplicate work if you add Zendesk now | Keep schema and API generic so you can sync to Zendesk via API later.                 |

---

## 7. Unified UX and Escalation

### 7.1 Single “Support” or “Help” entry

- One place (e.g. “Help” or “Support” in nav) that offers:
  - **Ask AI** – opens your RAG bot (or live chat bot in Phase 1).
  - **Chat with us** – opens Contact us tab/Tawk widget (live agents).
  - **Email us** – opens the ticket form.

### 7.2 Escalation flow

1. User tries AI first → if they say “I need a person” or the bot says “I’m not sure”, show “Chat with an agent” or “Send an email”.
2. In chat: if no agents online, show “We’re offline. Send us an email and we’ll reply within X.”
3. In email confirmation: “You can also try our AI assistant or live chat when we’re online.”

### 7.3 Optional: Link chat to tickets

- When a live chat conversation is “resolved” or tagged “needs-email”, your webhook could create a `support_tickets` row so everything is visible in one place later (e.g. admin “Support” page).

---

## 8. Implementation Order and Checklist

### Phase 1 (Quick wins, ~1–2 weeks)

**Done:** Email support and Support page are implemented: migration `047_support_tickets.sql`, `supportRoutes.js` (POST/GET tickets, GET categories), optional auth on ticket submit so tenant/shop are set when logged in, Support page with form, "My requests", email prefill, and graceful 401 handling. Frontend allows `/support/` for email session in `api.js`.

- [x] **Email support:** Migration `047_support_tickets.sql`, route `POST /api/support/ticket`, use **existing emailService.sendMail()** for “to support” and “to user"; add `SUPPORT_EMAIL_TO` to `.env`. Simple “Contact us” form on Support page.
- [x] **Support page:** Add `ROUTES.SUPPORT` and `appSupport(domain)` in `routes.js`, `support` in `getRoutesForDomain.js`, lazy-load `Support` component, add Route in App. One page with “Chat”, “Email us”, and short copy (e.g. “Or try our AI assistant below”).

### Phase 2 (AI and polish, ~2–4 weeks)

- [ ] **pgvector:** Migration `048_pgvector_support_kb.sql`: `CREATE EXTENSION IF NOT EXISTS vector;`, table `support_kb_chunks` with `embedding vector(1536)`.
- [ ] **RAG pipeline:** Chunk RipX docs (e.g. `docs/kb/`), call OpenAI `text-embedding-3-small`, store in pgvector; `POST /api/support/chat`: embed query, similarity search, build prompt, OpenAI chat, return reply + sources.
- [x] **AI chat UI:** “Ask AI” component that calls your API and shows “Chat with human” / “Email support” when needed.
- [ ] **Rate limits and safety:** Per-user limits, max tokens, clear system prompt and “only from context”.
- [ ] (Optional) Admin view for `support_tickets` and basic status updates.

### Phase 3 (Optional)

- [ ] Zendesk/Help Scout integration (sync tickets, or move to their inbox).
- [ ] Analytics: top AI questions, ticket categories, response time.

### Files to create or modify (quick reference)

| Phase | Action | Path / note                                                                                                                                  |
| ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Create | `backend/migrations/047_support_tickets.sql`                                                                                                 |
| 1     | Create | `backend/src/routes/supportRoutes.js` (POST/GET tickets, GET categories), mount in `app.js`                                                  |
| 1     | Create | `frontend/src/components/Support/Support.jsx` (and optional `Support.module.css`)                                                            |
| 1     | Modify | `frontend/src/constants/routes.js` – add `SUPPORT`, `appSupport(domain)`                                                                     |
| 1     | Modify | `frontend/src/utils/getRoutesForDomain.js` – add `support`, `appSupport`                                                                     |
| 1     | Modify | `frontend/src/config/lazyRoutes.js` – add Support lazy import                                                                                |
| 1     | Modify | `frontend/src/App.jsx` (or route config) – add Route for Support (user-panel and app-domain)                                                 |
| 1     | Modify | `.env.example` – add `SUPPORT_EMAIL_TO`                                                                                                      |
| 1     | Test   | Stub SMTP for ticket emails; Support page (Contact us, Ask AI, My requests)                                                                  |
| 1     | Create | `backend/migrations/049_support_tickets_deleted_at.sql` – soft delete column for retention (optional job uses SUPPORT_TICKET_RETENTION_DAYS) |
| 2     | Create | `backend/migrations/048_pgvector_support_kb.sql` (RAG Phase 2; chat history already in 048_support_chat_history.sql)                         |
| 2     | Create | `backend/src/services/supportKbService.js` – embed, search, chat                                                                             |
| 2     | Modify | `backend/src/routes/supportRoutes.js` – add `POST /api/support/chat`                                                                         |
| 2     | Modify | `frontend/src/components/Support/Support.jsx` – add Ask AI UI or separate component                                                          |

---

## 9. Environment and Config (add to `.env.example`)

```env
# Customer support – Live chat (live chat). Get from live chat dashboard → Setup & Integrations. Frontend reads VITE_* from root .env.
# VITE_live chat_WEBSITE_ID=your_live chat_website_id

# Or Tawk.to (alternative): propertyId and widgetId from Administration → Channels → Chat Widget.
# TAWK_PROPERTY_ID=your_property_id
# TAWK_WIDGET_ID=default

# Customer support – Email. Uses existing SMTP (emailService) unless you add SendGrid.
SUPPORT_EMAIL_TO=your-team@yourdomain.com
# SUPPORT_EMAIL_FROM=support@yourdomain.com
# Optional: use SendGrid instead of SMTP for support emails.
# SENDGRID_API_KEY=your_sendgrid_api_key

# Customer support – AI bot (Phase 2 only)
# OPENAI_API_KEY=your_openai_api_key
# RIPX_SUPPORT_KB_PATH=./docs/kb
```

---

## 10. Security and Privacy (short)

- **Live chat (live chat/Tawk):** Data is processed by the provider; sign their DPA, document in your privacy policy, and restrict which pages load the widget if needed (e.g. only when user is logged in).
- **AI bot:** Prefer not to send PII in prompts; use a short system instruction that the bot must not ask for or store passwords/payment data. Rate limit and log only what’s necessary for abuse/debug.
- **Email/tickets:** Store only what’s needed (email, subject, message); restrict admin access to tickets; use TLS for SendGrid; define retention and deletion for tickets (e.g. anonymise after 1 year).

---

## 11. Risks and Mitigations

| Risk                                     | Mitigation                                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| AI gives wrong answer                    | RAG + strict “only from context”; “Contact support if unsure”; log and review samples.                      |
| Chat widget slows or breaks the app      | Load live chat asynchronously; only on Support/Help route or after user clicks “Chat”.                      |
| Email form abused (spam)                 | Auth or CAPTCHA; rate limit (e.g. 10/15min per IP); validate and sanitize message; moderate first.          |
| Third-party outage (live chat, SendGrid) | Show “Support temporarily unavailable; email us at X”; store tickets in DB so you can process later.        |
| Cost (LLM, SendGrid, live chat paid)     | Rate limit AI; use free tiers first; set billing alerts.                                                    |
| PII in logs or LLM                       | Don’t log full messages in production; don’t send unnecessary PII to the model; document in privacy policy. |

---

## 12. Advanced features and roadmap

For a **full list of advanced support features** (omnichannel, proactive support, analytics/SLA, routing, macros, feedback/voting, status page, multilingual) and how they fit RipX, see **[SUPPORT_SYSTEM_ADVANCED_RESEARCH.md](./SUPPORT_SYSTEM_ADVANCED_RESEARCH.md)**. For **support UI/UX**, **role management**, agent workspace, ticket forms, dashboards, and workflows, see **[SUPPORT_UI_AND_ROLES_RESEARCH.md](./SUPPORT_UI_AND_ROLES_RESEARCH.md)**. For **data management**, **algorithms** (routing, prioritization, SLA, auto-categorization), and **related features** (notifications, audit, retention), see **[SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md](./SUPPORT_DATA_AND_ALGORITHMS_RESEARCH.md)**. For **live chat (live chat)** and **AI chatbot** implementation and UX, see **[SUPPORT_CHAT_AND_AI_RESEARCH.md](./SUPPORT_CHAT_AND_AI_RESEARCH.md)**.

That document includes:

- **Feature matrix** – What the current plan covers vs best-in-class (effort and impact).
- **Deep research** – Omnichannel, AI automation, contextual in-app help, proactive triggers, analytics/SLA, ticket routing, canned responses, feature requests, developer/status support, multilingual.
- **RipX integration points** – Auth, tenants, tests, storefront script, admin, notifications, email.
- **Prioritized roadmap** – Phase 2+ items in order: canned responses, CSAT/analytics, contextual help, unified chat/ticket view, deflection/suggested reply, status/changelog, categories/assignment, proactive triggers, feature requests, multilingual.

After completing Phase 1 (chat + email + Support page) and Phase 2 (RAG bot + optional admin tickets), use the advanced research doc to pick the next improvements that will make the project best-in-class.

---

## 13. Summary

- **Live chat:** Integrate optional live chat service via their SDK in the frontend; identify users when logged in; optional webhooks for tickets.
- **AI bot:** Start with live chat’s built-in bot; add a custom RAG bot (OpenAI + pgvector + your docs) for RipX-specific Q&A and expose it via `POST /api/support/chat` and a small chat UI.
- **Email:** Form → `POST /api/support/ticket` → store in `support_tickets` → existing emailService (SMTP) for "to support" and "to user"; optional SendGrid later; add “My tickets” and admin later if needed.

Implementation readiness: RipX already has backend, PostgreSQL, auth, emailService (SMTP), and frontend routing. Start Phase 1 with a live chat/Tawk account plus one migration, support routes, and a Support page. Phase 2 needs pgvector, OpenAI API key, and a small KB. All deps (live chat SDK, Tawk React, OpenAI SDK) are on npm and work with your stack.
