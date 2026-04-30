# Support – Bubble Chat Window, Realtime Chat & Layout Research

**Purpose:** Research and implementation guide for (1) in-app bubble chat window UI, (2) realtime chat with the support team, and (3) full Support page layout improvements. Complements [SUPPORT_CHAT_AND_AI_RESEARCH.md](./SUPPORT_CHAT_AND_AI_RESEARCH.md) and [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md).

---

## 1. Bubble chat window (in-app)

### 1.1 Why a bubble

- **Always visible:** Users get help without leaving the page or hunting for a Support link.
- **Familiar pattern:** Intercom, Zendesk, live chat use a floating bubble; users expect it for “chat with us”.
- **Unified entry:** One bubble can offer “Ask AI” and “Chat with team” in a single window.

### 1.2 Design best practices

| Aspect            | Recommendation                                                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Position**      | Bottom-right (e.g. 20–24px from edges); avoid covering critical CTAs.                                                                                     |
| **Size**          | Compact when closed (44–56px circle or pill); when open, 380–420px width, 480–560px height (or max 90vh) so it feels like a chat window, not a full page. |
| **Mobile**        | Full-width drawer or near full-width (e.g. 100% width, 70–85vh height) for touch.                                                                         |
| **Open/close**    | Click bubble to open; header “Close” or X to close; optional “Minimize” to collapse to bubble.                                                            |
| **Unread**        | Optional badge (e.g. dot or count) when there are new messages or when agent has replied (if using realtime).                                             |
| **Accessibility** | Focus trap when open; Escape to close; `aria-expanded` and `aria-label` on bubble.                                                                        |

### 1.3 Content inside the bubble window

- **Header:** “Help” or “Support” with close/minimize.
- **Tabs or sections:**
  - **Ask AI:** Same chat UI as on the Support page (message list, input, send); instant answers.
  - **Chat with team:** Short line (“Our team replies in real time”) + primary CTA that opens the live chat (e.g. live chat) via `Contact us link`. When live chat is not used, show “Live chat is not available; use Contact us or email.”
- **Footer (optional):** “Contact us” link to scroll to the form on the Support page or open the Contact tab.

### 1.4 Technical options

- **Option A – In-app bubble only:** Build a custom React component (FAB + slide-up panel or popover). Ask AI uses existing `POST /api/support/chat`; “Chat with team” triggers live chat (or Tawk) programmatically. live chat’s own bubble can be hidden when our bubble is used so there is a single entry point.
- **Option B – optional widget + in-page AI:** Keep live chat’s bubble for live chat; Support page has Ask AI in-page. No custom bubble; two entry points (optional widget + Support page).
- **Recommended:** Option A for a single, consistent “help” entry: one bubble that opens our chat window with Ask AI + “Chat with team” (realtime).

### 1.5 RipX implementation (current)

- **Support page:** Floating bubble (FAB) bottom-right that opens a chat window box.
- **Window content:** “Ask AI” (same API and UX as Support page tab) + “Chat with team” button that dispatches a custom event; `Support` listens and calls `Contact us link` so the live chat widget opens for realtime chat.
- **optional widget:** Can be hidden via — (e.g. `—`) when our bubble is shown, so users see one bubble; “Chat with team” inside our window opens Contact us tab. Alternatively keep both: our bubble = “Help” (AI + link to team), optional widget = direct live chat.

---

## 2. Realtime chat with the support team

### 2.1 What “realtime” means

- **Live, two-way conversation** with a human agent (typing, instant delivery, presence).
- **Typical use:** Urgent issues, complex questions, or when the user prefers conversation over email or AI.

### 2.2 Options

| Option                                 | Realtime? | Pros                                | Cons                                                     |
| -------------------------------------- | --------- | ----------------------------------- | -------------------------------------------------------- |
| **Email / ticket (RipX)**              | No        | Async, audit trail, no third-party. | Not realtime; use Contact us form.                       |
| **Custom (e.g. Socket.io + agent UI)** | Yes       | Full control, on-brand.             | Build and operate agent dashboard, scaling, persistence. |

### 2.3 Recommended for RipX

- **Phase 1:** Use **live chat** (or Tawk.to) for realtime chat. Already integrated on the Support page; user identity set from profile.
- **Surfacing in UI:** “Chat with team” / “Live chat” / “Realtime support” in:
  - The bubble chat window (primary).
  - Support page action cards and “More options.”
- **Opening Contact us from our UI:** `Contact us link` (see [external SDK](https://example.com/guides/chatbox-sdks/web-sdk/)). When the bubble is used, a button “Chat with our team in real time” calls this so the live chat widget opens and the user can talk to an agent immediately (when agents are online).

### 2.4 Copy and expectations

- **When agents are online:** “Chat with our team in real time” or “Live chat – we typically reply within a few minutes.”
- **When offline (for offline message):** “Our team is offline; leave a message and we’ll reply by email” or “Send a message and we’ll get back to you when we’re online.”
- **Fallback:** Always offer “Contact us” (email form) for async, non-realtime requests.

---

## 3. Full Support page layout improvement

### 3.1 Goals

- Clear hierarchy: what to do first (Ask AI / Live chat / Contact).
- Less clutter: hero + primary actions + content; “My requests” and secondary links easy to find.
- Consistent with app design: re-use PageShell, Polaris, and existing design tokens (e.g. `--futuristic-cyan`, `--radius-lg`).

### 3.2 Layout structure (recommended)

1. **Hero**
   - Headline: “Support” or “How can we help?”
   - Short subtext: e.g. “Get instant answers from our AI, chat with our team in real time, or send us a message.”

2. **Primary action cards (grid)**
   - **Ask AI:** Icon, title “Ask AI”, one-line description, CTA “Start chatting” (or “Open chat”) that either scrolls to Ask AI section or opens the bubble chat.
   - **Chat with team:** Icon, title “Chat with team”, “Realtime support when we’re online”, CTA “Open live chat” that opens Contact us tab (or the bubble’s “Chat with team”).
   - **Contact us:** Icon, title “Send a message”, “We reply by email within 24 hours”, CTA “Contact us” that scrolls to the form or switches to Contact tab.

3. **Content sections (tabs or accordions)**
   - **Contact us:** Form (email, category, subject, message).
   - **My requests:** List of tickets (when logged in); empty/401 states as today.
   - **Ask AI:** In-page chat UI (optional if the bubble is the main entry; can keep for users who prefer the full page).

4. **Footer / More options**
   - Link to Documentation; optional “Status” or “API docs” if applicable.

### 3.3 Visual and UX details

- **Cards:** Same style as rest of app (e.g. gradient top border, hover lift); equal height in the grid.
- **Spacing:** Generous gap between hero and cards, and between cards and content (e.g. `gap="600"` or 32px).
- **Responsive:** Cards stack on small screens; bubble remains bottom-right and usable.
- **Bubble + page:** Bubble is the quick path; full Support page remains for “My requests”, long form, and users who land on `/support` directly.

### 3.4 RipX implementation (current)

- Support page uses the structure above: hero, three action cards, then tabbed content (Contact us, My requests, Ask AI).
- Floating bubble component on the Support page opens a chat window with Ask AI + “Chat with team” (realtime via live chat).
- Support page CSS: `Support.module.css` for hero, card grid, and any section-specific spacing.

---

## 4. Implementation checklist

| Item                                                | Status   | Notes                                                                                       |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------- |
| Research doc (this file)                            | Done     | —                                                                                           |
| Bubble chat component (FAB + window)                | Done     | Ask AI + “Chat with team” in window; opens Contact us tab via event.                        |
| live chat open from bubble                          | Done     | Custom event `ripx-open-live chat`; Support calls `Contact us link`.                        |
| Support page layout: hero + cards + tabs            | Done     | Hero, 3 action cards, then tabs.                                                            |
| Support page CSS (hero, cards, spacing)             | Done     | Support.module.css.                                                                         |
| Hide optional widget when our bubble used           | Optional | — on load when showing our bubble; or keep both.                                            |
| Unread badge on bubble                              | Later    | When RAG/conversation history or agent reply is available.                                  |
| Mobile: drawer height                               | Done     | Chat window uses max-height and responsive width.                                           |
| Bubble: click-outside to close                      | Done     | Backdrop with click handler; focus returns to FAB.                                          |
| Bubble: focus management                            | Done     | On open focus close button; on close (Escape/backdrop/X) focus FAB.                         |
| Bubble: open/close animation                        | Done     | Backdrop fade-in; window slide-in.                                                          |
| Support page: My requests card                      | Done     | Fourth action card; "View my requests" switches to tab.                                     |
| Categories from API                                 | Done     | GET /api/support/categories; fallback to static list if API fails.                          |
| Quick links / Popular topics                        | Done     | Documentation + Dashboard above action cards; promotes self-service.                        |
| Bubble: Contact us footer link                      | Done     | Optional onNavigateToContact(); closes bubble and switches to Contact tab.                  |
| Doc-focused suggested prompt                        | Done     | "How do I install the storefront script?" in Ask AI suggestions.                            |
| Single source for suggested prompts                 | Done     | SUGGESTED_PROMPTS in supportFormat.js; Support + Bubble import.                             |
| Fetch tickets: avoid setState after unmount         | Done     | fetchTickets(getIsCancelled); useEffect passes () => cancelled.                             |
| Category sync when categories load from API         | Done     | If current category not in list, set to first or 'other'.                                   |
| Chat area: aria-live + role="log"                   | Done     | Screen readers announce new messages.                                                       |
| My requests empty state: Contact us CTA             | Done     | Primary button switches to Contact tab.                                                     |
| Bubble footer link: focus-visible                   | Done     | .bubbleFooterLink:focus-visible in CSS.                                                     |
| Ticket list: show category label                    | Done     | categories.find(c => c.value === t.category)?.label.                                        |
| Backend: ticket creation resilient to email failure | Done     | Support and user emails in try/catch; always return 201 after insert.                       |
| My requests sign-in state: Sign in CTA              | Done     | When ticketsError === 'sign_in', show primary "Sign in" button linking to ROUTES.CONNECT.   |
| formatReplyContent: empty/whitespace-safe           | Done     | supportFormat.js returns null for empty or whitespace-only string for consistent rendering. |

---

## 5. Deflection and self-service (research)

- **Deflection:** Reduce ticket volume by guiding users to docs and AI first. Quick links (Popular topics) and suggested prompts that match common queries (e.g. script install) help.
- **Single source of truth:** Categories come from the backend (GET /api/support/categories) so admins can change them without a frontend deploy.
- **Bubble → Contact flow:** "Contact us (email form)" in the bubble footer lets users switch to the form without losing context; closing the bubble and switching tab is one click.

---

## 6. References

- [SUPPORT_CHAT_AND_AI_RESEARCH.md](./SUPPORT_CHAT_AND_AI_RESEARCH.md) – Ask AI, UX
- [CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md](./CUSTOMER_SUPPORT_IMPLEMENTATION_PLAN.md) – Phase 1/2 plan
- Help center best practices: organize around customer problems, search above the fold, promote KB in replies and contact flows (Zendesk, Swifteq, Cobbai).
