# Support – AI Chatbot & Contact UX Research

**Purpose:** Research and implementation guide for the AI chatbot (RAG or simple LLM) and Contact us (email/tickets) on the RipX Support page. Complements [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md), [SUPPORT_SYSTEM_ADVANCED_RESEARCH.md](./SUPPORT_SYSTEM_ADVANCED_RESEARCH.md), and [SUPPORT_UI_AND_ROLES_RESEARCH.md](./SUPPORT_UI_AND_ROLES_RESEARCH.md).

**Implemented:** `POST /api/support/chat` (stub or OpenAI when `OPENAI_API_KEY` set, optional `conversation_id` for threading); Ask AI tab with message list, **bold** formatting in replies, scroll-to-bottom, suggested prompts when empty. **Bubble chat:** Floating FAB opens a chat window with Ask AI + "Contact us" link. **Layout:** Hero, three action cards (Ask AI, Send a message, My requests), then tabbed content. No third-party live chat widget; human support via Contact us (email form). See [SUPPORT_BUBBLE_AND_LAYOUT_RESEARCH.md](./SUPPORT_BUBBLE_AND_LAYOUT_RESEARCH.md) for bubble and layout details.

**Table of contents**

1. [Overview](#1-overview)
2. [AI chatbot (simple LLM vs RAG)](#2-ai-chatbot-simple-llm-vs-rag)
3. [Unified Support page UX](#3-unified-support-page-ux)
4. [Implementation checklist](#4-implementation-checklist)
5. [References](#5-references)

---

## 1. Overview

| Channel            | Role                            | When to use                                                       |
| ------------------ | ------------------------------- | ----------------------------------------------------------------- |
| **Live chat**      | Human agents in real time       | Urgent issues, complex questions, when user prefers conversation. |
| **AI chatbot**     | 24/7 first response, deflection | FAQs, setup help, “how do I…?”; reduces ticket volume.            |
| **Email / ticket** | Async, audit trail              | Non-urgent, detailed issues, when chat is offline.                |

**Recommended flow:** Support page offers **Ask AI** first (instant), **Contact us** (email form) as fallback. Escalation: AI says “I’m not sure” → suggest Contact us.

---

## 2. AI chatbot (simple LLM vs RAG)

### 3.1 Simple LLM (Phase 1)

- **Endpoint:** `POST /api/support/chat` with `{ message: string, conversation_id?: string }`. Backend accepts `conversation_id` for future multi-turn context; not used yet.
- **Backend:** If `OPENAI_API_KEY` is set, call OpenAI `chat.completions` with a short system prompt: “You are RipX support. Answer briefly from general knowledge about A/B testing and e-commerce. If unsure, say to contact support or use the contact form.” No vector DB.
- **When no key:** Return a friendly stub: “AI assistant is not configured. Please use the contact form or live chat.”
- **Rate limit:** Stricter than tickets (e.g. 20 requests/hour per user or IP).
- **Frontend:** “Ask AI” tab/section: message list, input, send; show “Still need help? Contact us or open a ticket.”

### 3.2 RAG (Phase 2)

- **Knowledge base:** Chunk RipX docs (e.g. `docs/kb/`), embed with `text-embedding-3-small`, store in pgvector table `support_kb_chunks`.
- **Flow:** Embed user message → similarity search (top 5 chunks) → build prompt “Use only this context: …” + user message → OpenAI chat → return reply + sources.
- **System prompt:** “You are RipX support. Answer only from the provided context. If the context doesn’t contain the answer, say so and suggest contacting support.”
- **Deflection:** Optional: before creating a ticket, call RAG; if confidence high, show answer + “Was this helpful?”; if no, then create ticket.

### 3.3 Safety and cost

- Rate limit chat (e.g. 20/hour per user or IP).
- Max tokens per reply (e.g. 500).
- Do not send PII beyond what’s needed; log minimally.
- RAG reduces hallucination; simple LLM is cheaper but less accurate for RipX-specific questions.

---

## 4. Unified Support page UX

- **Tabs or sections:** “Contact us” | “My requests” | “Ask AI” so users choose channel clearly.
- **Above the fold:** Short copy: “Get help with our AI assistant or send us a message. We typically reply within 24 hours.
- **Ask AI:** Chat UI with placeholder “Ask anything about RipX…”; after reply, show “Need a human? Use Contact us.”

---

## 4. Implementation checklist

| Item                                                   | Status | Notes                                                                                                    |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------- |
| Research doc (this file)                               | Done   | —                                                                                                        |
| Support page UI: Tabs (Contact / My requests / Ask AI) | Done   | Polaris Tabs; icons for Contact and Ask AI.                                                              |
| `POST /api/support/chat`                               | Done   | Stub when no OpenAI; when `OPENAI_API_KEY` set, OpenAI with system prompt. Uses same support rate limit. |
| Ask AI chat UI                                         | Done   | Messages list, input, Send; fallback text to Contact us.                                                 |
| Chat UX (scroll, formatting, suggestions)              | Done   | Auto-scroll to bottom; **bold** in replies; suggested prompts when empty.                                |
| conversation_id in chat API                            | Done   | Accepted in body for multi-turn.                                                                         |
| Bubble chat window (Ask AI + Contact us link)          | Done   | FAB + window; Contact us footer link. See SUPPORT_BUBBLE_AND_LAYOUT_RESEARCH.md.                         |
| Support page layout (hero, action cards)               | Done   | Hero, 3 cards, tabs; Support.module.css.                                                                 |
| RAG (Phase 2)                                          | Later  | pgvector, chunks, embeddings, similarity search.                                                         |

---

## 5. References

- [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md) – Phase 1/2 plan
- [SUPPORT_SYSTEM_ADVANCED_RESEARCH.md](./SUPPORT_SYSTEM_ADVANCED_RESEARCH.md) – Deflection, suggested reply, RAG
