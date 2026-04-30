# Support System – Requirements & Install Guide

This document lists everything required to run the RipX support system (tickets, AI chat, live chat) and provides install steps and links. See [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md) for the full plan.

---

## Configuration from you (with links)

| What                     | Where to set                                                                            | Link / action                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Database**             | Root `.env`: `DATABASE_URL=postgresql://...`                                            | [PostgreSQL](https://www.postgresql.org/download/) – run DB, then `npm run migrate`             |
| **SMTP (tickets email)** | Root `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`            | [AWS SES SMTP](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html) or your provider |
| **Support inbox**        | Root `.env`: `SUPPORT_EMAIL_TO=team@yourdomain.com` (optional; defaults to `SMTP_FROM`) | —                                                                                               |
| **AI chat (OpenAI)**     | Root `.env`: `OPENAI_API_KEY=sk-...`                                                    | [OpenAI API keys](https://platform.openai.com/api-keys)                                         |
| **Rate limit (support)** | Root `.env`: `RATE_LIMIT_SUPPORT_MAX=30` (optional; default 10/15min)                   | —                                                                                               |

**Note:** Backend and frontend both use the **root** `.env` (Vite is configured to load from repo root).

---

## 1. What’s already in the repo

| Component               | Location                                                | Notes                                                       |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| **Backend**             | `backend/src/routes/supportRoutes.js`                   | Ticket + chat API                                           |
| **Frontend**            | `frontend/src/components/Support/`                      | Support page, bubble chat                                   |
| **Tickets DB**          | `backend/migrations/047_support_tickets.sql`            | `support_tickets` table                                     |
| **Chat history DB**     | `backend/migrations/048_support_chat_history.sql`       | Optional; see §4 below                                      |
| **Tickets soft-delete** | `backend/migrations/049_support_tickets_deleted_at.sql` | Adds `deleted_at` for retention/GDPR; run `npm run migrate` |
| **Rate limiting**       | `backend/src/app.js`                                    | `supportLimiter` on `/api/support`                          |

---

## 2. Dependencies (already in package.json)

### Backend (root `package.json`)

- **openai** – AI chat when `OPENAI_API_KEY` is set.  
  Already present. If missing: `npm install openai`
- **pg** – PostgreSQL for tickets (and optional chat history).  
  Already present.
- **nodemailer** – Ticket confirmation and “to support” emails.  
  Already present.
- **express-rate-limit** – Rate limiting for support routes.  
  Already present.

### Frontend (`frontend/package.json`)

- **@shopify/polaris** + **@shopify/polaris-icons** – UI.  
  Already present.

**One-time install (from repo root):**

```bash
npm install
cd frontend && npm install
# or from root:
npm run install:all
```

---

## 3. Environment and external services

### 3.1 Database

- **PostgreSQL** – Used for tickets (and optional chat history).
- Run migrations: `npm run migrate` (from repo root).
- Ensure `047_support_tickets.sql` is applied. If you add chat history, run `048_support_chat_history.sql` too.

**Links:**

- [PostgreSQL download](https://www.postgresql.org/download/)
- RipX docker dev DB: `docker compose -f docker-compose.dev.yml up -d` (if you use it)

### 3.2 Email (tickets)

- **SMTP** – Used for “new ticket” emails to your team and “we received your request” to the user.
- Set in `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Optional: `SUPPORT_EMAIL_TO` (defaults to `SMTP_FROM`).

**Links:**

- [Nodemailer](https://nodemailer.com/)
- [AWS SES SMTP](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html)

### 3.3 AI chat (OpenAI)

- **OpenAI API** – Optional. When set, `POST /api/support/chat` uses GPT.
- Get key: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- In **backend** `.env`:  
  `OPENAI_API_KEY=sk-your-key`  
  Optional: `OPENAI_CHAT_MODEL=gpt-4o-mini` (default).

**Links:**

- [OpenAI API keys](https://platform.openai.com/api-keys)
- [OpenAI Node SDK](https://github.com/openai/openai-node)

---

## 4. Chat history persistence (implemented)

AI chat is **saved to the database** when migration **048** is applied, so you can review conversations later and build admin/analytics.

- **Tables:** `support_chat_conversations` (one per session), `support_chat_messages` (each user and assistant turn).
- **Flow:** The backend creates or reuses a conversation (using optional `conversation_id` from the client), then inserts the user message and assistant reply. The response includes `conversation_id` so the frontend can send it with the next message and keep the same thread.
- **Apply migration:** `npm run migrate` (from repo root). Ensure `048_support_chat_history.sql` is run.
- If the migration is not applied, the API still works; persistence is skipped and a warning is logged.

---

## 5. Rate limiting (token / request management)

Support uses a **rate limiter** on `/api/support` (ticket + chat):

- **Env:** `RATE_LIMIT_SUPPORT_MAX` (default **10** requests per window).
- **Window:** `RATE_LIMIT_WINDOW_MS` (default **15** minutes).
- **Scope:** Per IP (same limit for ticket submit and chat).

So the “token system” for support is **request-based**: a fixed number of support requests per IP per 15 minutes. There is no per-user token bucket unless you add one (e.g. Redis + user id).

To allow more chat messages per user:

```env
RATE_LIMIT_SUPPORT_MAX=30
```

See `.env.example` and `backend/src/constants/index.js` for all rate-limit variables.

---

## 6. Quick checklist

| Step | Action                        | Link / command                                                                                            |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1    | Install deps                  | `npm run install:all`                                                                                     |
| 2    | Set `DATABASE_URL`            | `.env`                                                                                                    |
| 3    | Run migrations                | `npm run migrate`                                                                                         |
| 4    | Set SMTP (email)              | `SMTP_*` in `.env`                                                                                        |
| 5    | (Optional) OpenAI             | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → `OPENAI_API_KEY` in backend `.env` |
| 6    | (Optional) Chat history in DB | Run migration `048` so conversations and messages are stored for future review                            |

---

## 7. From your side (summary)

- **Database:** PostgreSQL running; set `DATABASE_URL` in root `.env`; run `npm run migrate`.
- **Email (tickets):** Set SMTP vars in root `.env`; optional `SUPPORT_EMAIL_TO` for where new tickets are sent.
- **OpenAI (optional):** [Create API key](https://platform.openai.com/api-keys) → set `OPENAI_API_KEY` in root `.env`.

All support code and migrations are in the repo; no extra install beyond `npm run install:all` and the configuration above.
