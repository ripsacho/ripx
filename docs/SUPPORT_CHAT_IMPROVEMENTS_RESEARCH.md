# Support Chat Improvements – Research & Roadmap

This document covers research and implementation notes for:

1. **Chat input UX** (compact height, send-inside-input like WhatsApp/Teams)
2. **Image share** in AI chat
3. **Ticketing status** in the UI (open vs closed/resolved)
4. **Human + AI in the same chatbox** (unified thread with escalation)

---

## 1. Chat input design (WhatsApp / Teams style)

### Research

- **WhatsApp:** Single input bar with emoji and attach on the left, **send arrow inside the right edge** of the input. One-line default; expands for multiline. Send is a circular/rounded icon button.
- **Teams / Slack:** Compose area with **send button inside or immediately adjacent** to the text field on the right; attach and emoji on the left. Compact height (~48px) for single line.
- **Best practices:** Send control inside the input reduces vertical space and feels familiar. Use a small icon (e.g. send/arrow) rather than a large separate button. Disabled state: greyed or half opacity.

### Implemented (RipX)

- **Compact composer:** Single-row bar, `min-height: 48px` (44px on mobile). Reduced padding and margins.
- **Send inside input:** Send button is **inside** the input area on the right (`position: absolute; right: 8px`), circular icon button (36px) with Polaris `SendIcon`. No separate column; input has `padding-right` so text does not overlap the icon.
- **Icon:** `SendIcon` from `@shopify/polaris-icons` (familiar “send” affordance).
- **Bubble chat:** Same pattern (compact bar, send icon inside on the right).

---

## 2. Image share in support chat

### Research

- **Use cases:** Users send screenshots of errors, UI, or config. AI can describe images (e.g. GPT-4 Vision) or support can view attachments.
- **Options:**
  - **A. Inline in AI chat:** User attaches image(s); upload to storage (S3, GCS, or base64 in DB); send URL or base64 to OpenAI Vision API. Reply can reference the image. Requires: file upload endpoint, size/type limits, storage, and optionally virus scan.
  - **B. Attach to ticket:** When user escalates (“Contact us”), allow attachment. Store with ticket; support sees it in email or admin. No AI vision needed for Phase 1.
  - **C. Both:** Attach in chat (for AI) and include last N attachments when creating a ticket from “Still need help?”.

### Implementation outline

| Step | Backend                                                                                                                                                                          | Frontend                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1    | `POST /api/support/upload` (multipart): validate type (image/\*), size (e.g. 5MB), store in uploads dir or S3; return `{ url }` or attachment id                                 | File input or drag‑drop in composer; preview thumbnail; send `attachmentUrls: string[]` with `POST /api/support/chat` |
| 2    | In `POST /api/support/chat`: if `attachmentUrls` or base64, build OpenAI message with `image_url` content block (Vision API). Model: e.g. `gpt-4o` or `gpt-4o-mini` with vision. | Show image thumbnails in user bubble; optional “attach image” icon in composer                                        |
| 3    | Optional: link uploads to ticket when user clicks “Contact us” so the thread context + attachments are in the ticket.                                                            | When escalating, include `attachmentUrls` in ticket payload or reference chat session                                 |

### Security and limits

- Allowed types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
- Max size per file: 5MB; max files per message: 2–3.
- Store in private path or object store; serve via signed URL or through your API. Do not expose raw paths to the client.
- Rate limit uploads (e.g. 10/hour per IP or per user).

### Status

- **Current:** Not implemented. Chat is text-only.
- **Next:** Add optional “Attach image” in composer (icon only, disabled or “Coming soon”) and document the API contract; then implement upload endpoint and Vision in `POST /api/support/chat`.

---

## 3. Ticketing status in the UI (open / closed / resolved)

### Research

- Users need to see at a glance whether a request is **still open** or **ended** (closed/resolved). Common patterns: badge, label, or status column in the ticket list.
- Backend: `support_tickets.status` already exists (e.g. `open`, `closed`, `resolved`). API returns it in `GET /api/support/tickets`.

### Implemented (RipX)

- **My requests list:** Each ticket shows a status badge with `data-status` for styling.
- **Labels:** “Open” for open; “Closed” or “Resolved” for `closed` / `resolved`. Title attribute: “This request has been closed” / “Open request”.
- **Styling:** Existing `.ticketStatus` and `[data-status='closed']` / `[data-status='resolved']` in `Support.module.css` (e.g. green for resolved, grey for closed, cyan for open).

### Optional improvements

- **Filter list by status (Open / Closed / All):** Implemented. My requests tab has a "Show:" dropdown (All / Open / Closed).
- In admin: bulk actions to mark tickets resolved/closed; optional “Reopen” for closed tickets.

---

## 4. Human + AI in the same chatbox

### Research

- **Unified thread:** One conversation that can start with AI and later include a human agent (e.g. “Escalate to support” or “Chat with team”). User sees one continuous thread; messages are labeled as “RipX AI” vs “Support team” (or agent name).
- **Benefits:** No context loss; user does not repeat themselves; support sees full history.
- **Challenges:** Real-time delivery (WebSockets or long polling), agent assignment, routing (which agent gets the thread), and UI distinction between bot and human.

### Architecture options

| Option                           | Description                                                                                                                                                                                                                                                                                                         | Effort        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **A. live chat as “human side”** | Keep AI in-app; “Chat with team” opens Contact us tab. live chat does not share the in-app AI thread. User has two places: in-app AI + live chat for humans. Easiest; no backend sync.                                                                                                                              | Low (current) |
| **B. Hybrid in one UI**          | Same chat UI; first replies from AI (`POST /api/support/chat`). User can click “Talk to a person”; backend creates a ticket and marks thread as “escalated”. New messages go to email or a queue; agent replies are pushed (e.g. polling or WebSocket) and rendered in the same thread with a “Support team” label. | Medium–high   |
| **C. Full unified**              | One backend thread (chat_sessions + chat_messages). AI and human both post to the same thread. Real-time for both; agent UI to reply. Requires: session store, real-time channel, agent workspace.                                                                                                                  | High          |

### Recommended path for RipX

1. **Phase 1 (current):** AI in-app; “Chat with team” opens Contact us tab. “Still need help?” links to Contact us or live chat. Clear labels: “RipX” (AI) vs opening live chat for “team”.
2. **Phase 2 (optional):** Add “Escalate to support” in the same chatbox. On click: create ticket with conversation summary (and optional attachment refs); show a system message: “We’ve passed this to our team. We’ll reply by email or in live chat.” Optionally poll `GET /api/support/tickets/:id/messages` for new replies and append to the same thread with a “Support” label (no real-time required initially).
3. **Phase 3 (optional):** Real-time agent replies in the same thread (WebSocket or SSE), plus agent UI to answer from the dashboard.

### Implementation outline (Phase 2 – escalation in same box)

- **Backend:**
  - `POST /api/support/escalate`: body `{ summary?, messageIds? }`; create ticket, attach summary; return `ticketId`.
  - `GET /api/support/tickets/:id/thread`: return messages for that ticket (if you store them). Optional: webhook or polling for “new reply” so the in-app thread can append “Support: …”.
- **Frontend:**
  - In the same chat UI, after AI replies, show “Still need help? Escalate to our team” (existing pattern). On confirm: call escalate, then show in-thread message “We’ve escalated this. Ticket #… You’ll get a reply by email.”
  - Optional: poll thread and render new agent messages in the same list with a “Support” avatar/label.

---

## 5. Summary and checklist

| Feature                                                | Status      | Notes                                                                 |
| ------------------------------------------------------ | ----------- | --------------------------------------------------------------------- |
| Compact chat input, send inside (WhatsApp/Teams style) | Done        | 48px height, SendIcon inside right; same in bubble.                   |
| Ticket status in UI (open/closed/resolved)             | Done        | Badge + tooltip in My requests.                                       |
| Filter My requests by status (Open / Closed / All)     | Done        | Dropdown in My requests tab.                                          |
| Image share in chat                                    | Not started | Research and API outline above; implement upload + Vision when ready. |
| Human + AI in same chatbox                             | Partial     | “Still need help?” + live chat; escalation in same thread is Phase 2. |

For full support system plan and phases, see **[CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md)**.
