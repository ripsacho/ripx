# RipX Presentation — Speaker Script (Upgraded)

**Estimated total time:** 15–18 minutes (full) | 7–8 minutes (condensed)  
**Audience:** Technical stakeholders, product managers, investors  
**Tone:** Confident, data-driven, concise

---

## Presenter Tips

- **Pace:** ~120–140 words per minute for clarity
- **Pauses:** 2–3 seconds after key points; 1 second between bullets
- **Emphasis:** Bold words = slight stress; use for impact
- **Transitions:** Use the bridge phrases to flow between slides
- **Eye contact:** Glance at audience, not the screen
- **Backup:** Keep SPEECH.md on a tablet or print the Q&A section

---

## Section 1: Opening (Slides 1–2) — ~2 min

### Slide 1: Title — RipX

**[~30 sec]**

> "Good [morning/afternoon]. I'm here to present **RipX** — an enterprise-grade A/B testing platform built for e-commerce.
>
> Our tagline is simple: **Stop guessing. Start winning.**
>
> RipX supports both **Shopify** and **standalone** sites, runs **multi-variant** experiments with **statistical rigor**, and is **production-ready** out of the box.
>
> Let me walk you through the problem we solve, how we solve it, and why RipX stands out."

**Key takeaway:** RipX = data-driven A/B testing for e-commerce.

---

### Slide 2: The Problem

**[~45 sec]**

> "Most merchants today make decisions based on **guesswork**.
>
> They change prices, copy, or layouts without knowing if it actually improves conversions. That leads to **lost revenue** — suboptimal pricing, weak CTAs, and offers that don't convert.
>
> Worse, many decisions lack **statistical rigor**. Running a test for a week and picking a winner by gut feel is not science — it's gambling.
>
> And finally, most tools are **platform-locked**. If you're on Shopify, you're stuck with Shopify-only solutions. If you're on a custom stack, you're often left with nothing.
>
> RipX addresses all of these."

**Bridge:** "So what does RipX do about it?"

---

### Slide 3: The Cost of Guesswork

**[~30 sec]**

> "The cost is real. Wrong pricing loses margin or volume. Weak CTAs mean abandoned carts. Wrong shipping thresholds erode profit. Over-discounting bleeds margin.
>
> RipX replaces guesswork with **statistically valid experiments**."

**Bridge:** "Let me show you the solution."

---

## Section 2: Solution & Architecture (Slides 4–6) — ~3 min

### Slide 4: The Solution — RipX

**[~45 sec]**

> "RipX is a full-stack A/B testing platform that lets merchants run **statistically valid** experiments.
>
> You can test **prices, content, shipping rates, offers**, and more — across **eight distinct test types**.
>
> We support **Shopify** and **standalone** sites from the same backend, so you're not locked into one platform.
>
> And we integrate with **GA4, BigQuery**, and **webhooks**, so your data flows into your existing analytics and BI stack."

**Bridge:** "Here's how it works under the hood."

---

### Slide 5: Architecture Overview

**[~60 sec]**

> "A **storefront script** runs on the merchant's site. It requests variant assignments, tracks conversions, and sends heatmap events.
>
> The **backend API** — Node.js and Express — runs the **AB Test Engine**, **Traffic Allocator**, and **Analytics Service**. It assigns variants, enforces traffic allocation, and computes statistical significance.
>
> Everything is persisted in **PostgreSQL**, with optional **Redis** for caching and sessions.
>
> The stack is **Node.js, Express, React, Vite, PostgreSQL** — battle-tested, scalable, and easy to deploy with Docker."

**Bridge:** "Now let's look at what you can test."

---

## Section 3: Features (Slides 7–14) — ~6 min

### Slide 6: 8 Test Types

**[~75 sec]**

> "RipX supports **eight test types** covering the full funnel.
>
> **Price** — Test different product prices and measure elasticity.
>
> **Onsite Edit** — Headlines, copy, CTAs, images — anything you can edit in the theme.
>
> **Split URL** — Entire page variants, different URLs for each variant.
>
> **Template** and **Theme** — Layout and visual variations.
>
> **Shipping** — Different shipping rates, free-shipping thresholds.
>
> **Offer** — Discounts, promo links, time-limited deals.
>
> **Checkout** — Checkout experience variations.
>
> That's coverage from landing to purchase."

**Bridge:** "How do we handle multiple variants?"

---

### Slide 7: Multi-Variant & Traffic Allocation

**[~45 sec]**

> "We support **A/B, A/B/C, and multivariate** tests — up to N variants per experiment.
>
> You can set **custom traffic allocation** — 50/50, 80/20, or any split that makes sense.
>
> We use **consistent hashing** so the same user always sees the same variant — no flicker, no confusion.
>
> And we include a **sample size calculator** so you can plan how long to run a test before you start."

**Bridge:** "Analytics is where RipX really shines."

---

### Slide 8: Analytics & Statistical Rigor

**[~60 sec]**

> "We use a **Z-test** — the standard two-proportion significance test — to determine if results are statistically significant.
>
> We report **p-values** — typically we consider p less than 0.05 as significant.
>
> We show **confidence intervals** — 95% CI for conversion rates so you see the range of plausible values.
>
> We calculate **lift** — the percentage improvement versus control.
>
> And we **automatically determine a winner** when significance is reached — no manual interpretation needed.
>
> The math decides. Not gut feel."

**Bridge:** "We go beyond basic conversion rate."

---

### Slide 9: Advanced Analytics

**[~45 sec]**

> "Beyond conversion rate, we support **profit** and **profit per visitor** — revenue minus COGS.
>
> You can track **custom events** — add to cart, newsletter signup, any event you define.
>
> **Custom formulas** let you define your own metrics.
>
> **Heatmap** shows click and scroll density per variant — where do users click, how far do they scroll?
>
> **Funnel** gives step-by-step conversion analysis — visitors, add to cart, purchase — so you see where drop-off happens.
>
> And **time-series** shows performance over time with daily trends."

**Bridge:** "We also have power features that save time."

---

### Slide 10: Power Features

**[~30 sec]**

> "**Test cloning** — Duplicate successful tests in one click.
>
> **Health score** — A 0–100 quality indicator based on sample size, duration, traffic distribution, and significance.
>
> **Sample size calculator** — Know required visitors before you start.
>
> **Notifications** — In-app alerts when tests complete or reach significance."

**Bridge:** "RipX fits into your existing stack."

---

### Slide 11: Integrations

**[~45 sec]**

> "**GA4** — We send conversion and custom events to Google Analytics with user properties for A/B segmentation.
>
> **BigQuery** — We export events, analytics, and heatmap data to your data warehouse for deeper analysis.
>
> **Outbound webhooks** — We notify external systems when tests start, stop, or reach significance.
>
> **Shopify webhooks** — We listen for orders, product updates, and app lifecycle events for conversion tracking and sync.
>
> Your data flows where you need it."

**Bridge:** "You can also target who sees each test."

---

### Slide 12: Targeting & Segmentation

**[~40 sec]**

> "**Device** — Desktop, mobile, tablet.
>
> **Geography** — Country, region, city — include or exclude.
>
> **Customer** — New vs returning, tags, lifetime value, order count.
>
> **Custom rules** — Operators like equals, contains, greater than, in — so you can target by any field.
>
> **Presets** — Save and reuse targeting configs across tests."

**Bridge:** "For offer tests, we have promo links."

---

### Slide 13: Promo Links

**[~25 sec]**

> "**Promo links** — Direct URLs with embedded discounts, no promo codes needed.
>
> Each link is **unique**, can have **usage limits** and **expiration**, and we **track usage and conversion** per link.
>
> Perfect for email campaigns, social, and affiliate programs."

**Bridge:** "RipX works on more than just Shopify."

---

### Slide 14: Multi-Platform

**[~45 sec]**

> "For **Shopify**, merchants install via OAuth, the admin UI is embedded in Shopify Admin, and we use webhooks plus the storefront script for conversion tracking.
>
> For **standalone** sites, merchants register with an API key, use the same React admin as a standalone app, and load the script with a site parameter.
>
> Same backend, same AB engine, same analytics — you choose the platform."

---

## Section 4: Technical & Close (Slides 15–20) — ~3 min

### Slide 15: Security & Reliability

**[~30 sec]**

> "**OAuth 2.0 and JWT** for auth. **Tenant isolation** so shop data never leaks. **Parameterized queries** to prevent SQL injection. **Rate limiting** on the API.
>
> We ship with **Docker** and **CI/CD** for reproducible deployments. **Structured logging** for debugging and audit trails."

---

### Slide 16: Tech Stack & Tools

**[~45 sec]**

> "RipX is built with a **modern, production-grade stack** — battle-tested, scalable, and easy to deploy.
>
> **Backend:** Node.js 18+ and Express — REST API, OAuth 2.0, JWT. PostgreSQL for persistence, Redis for sessions and caching. Bull for job queues — scheduled tests, BigQuery export, significance alerts. Shopify API for OAuth and webhooks. Swagger for API docs.
>
> **Frontend:** React 18 with Vite 5 — fast builds, code splitting. TanStack Query for server state and cache. Polaris for UI components. Recharts for analytics charts. React Router 6 for routing.
>
> **Integrations:** GA4 Measurement Protocol, BigQuery client, outbound webhooks — all pluggable via env config.
>
> **DevOps:** Docker for deployment. SQL migrations for schema. ESLint, Prettier, Husky for code quality. Jest for unit tests, Playwright for E2E. Structured logging for debugging and audit."

---

### Slide 17: Features — Step by Step

**[~75 sec]**

> "The full flow in five steps — **Connect, Dashboard, Create, Run, Analyze & Act**.
>
> **1. Connect** — Shopify: OAuth install. Standalone: register domain → API key → add one script tag. That's it.
>
> **2. Dashboard** — Stats, progress ring, quick create (Price, Content, Shipping, Offer), recent tests.
>
> **3. Create** — Wizard: type → name → variants (add/remove) → traffic → targeting → goal → config → review. Sample size calculator built in.
>
> **4. Run** — Start → script assigns variants (consistent hash) → tracks conversions, heatmap. GA4, BigQuery, webhooks fire automatically.
>
> **5. Analyze & Act** — Metrics, p-value, CI, lift, winner. Funnel, heatmap, events. Export CSV/JSON. Apply winner, clone, or archive."

---

### Slide 18: Roadmap

**[~35 sec]**

> "**Phase 1** — Fix storefront flicker, ship combination testing UI.
>
> **Phase 2** — Bayesian statistics, custom metrics UI, test templates.
>
> **Phase 3** — Multi-armed bandit, AI hypothesis suggestions.
>
> We're building toward a platform that not only runs tests but helps you **design better ones**."

---

### Slide 19: Why RipX?

**[~45 sec]**

> "So why RipX?
>
> **Statistical rigor** — Z-test, p-values, confidence intervals. No guesswork.
>
> **Eight test types** — Price, content, shipping, offers, checkout — full funnel coverage.
>
> **Multi-platform** — Shopify and standalone from one codebase.
>
> **Integrations** — GA4, BigQuery, webhooks — your data, your stack.
>
> **Production-ready** — Docker, migrations, security — deploy with confidence."

---

### Slide 20: Thank You

**[~15 sec]**

> "That's RipX — data-driven decisions for e-commerce.
>
> I'm happy to take questions."

---

## Condensed Script (7–8 min)

*Use when time is limited. Hit these slides only: 1, 2, 5, 6, 7, 9, 16, 17, 19, 20.*

1. **Title** — "RipX: enterprise A/B testing. Stop guessing, start winning."
2. **Problem** — "Guesswork, lost revenue, no rigor, platform lock-in."
5. **Architecture** — "Storefront script → backend API → PostgreSQL. Node, Express, React."
6. **8 Test Types** — "Price, content, shipping, offers, checkout — full funnel."
7. **Multi-Variant** — "A/B/C, custom allocation, consistent hash, sample size calculator."
9. **Advanced Analytics** — "Profit, funnel, heatmap, events, time-series."
16. **Tech Stack** — "Node.js, Express, PostgreSQL, Redis, Bull, React, Vite, TanStack Query, Polaris, Recharts. Docker, Jest, Playwright. Modern, production-grade, battle-tested."
17. **Features** — "Connect → Dashboard → Create (wizard) → Run → Analyze & Act. Five steps, end to end."
19. **Why RipX** — "Rigor, 8 types, multi-platform, integrations, production-ready."
20. **Thank You** — "Questions?"

---

## Appendix: Q&A Prep

### Technical

**Q: How does variant assignment work?**  
A: Consistent hashing on user ID. Same user always gets same variant. Traffic allocation is enforced by the hash distribution. No flicker.

**Q: Can I run multiple tests at once?**  
A: Yes. Tests can overlap. The storefront script handles multiple active tests per page.

**Q: What about Shopify Plus?**  
A: RipX works with all Shopify plans. Plus stores get the same features; checkout tests may have additional considerations.

**Q: Is there an API?**  
A: Yes. Full REST API for tests, analytics, promo links, settings. API docs at `/api/docs`.

**Q: How do you handle GDPR?**  
A: Tenant isolation, no cross-shop data sharing. Merchants control their data. Designed for data protection compliance.

### Business

**Q: What's the pricing model?**  
A: [Adjust based on your model — e.g., per-store, per-test, tiered.]

**Q: How long does setup take?**  
A: Shopify: install and go. Standalone: register, add script, configure. Typically under 15 minutes.

**Q: Do you support white-label?**  
A: The UI is customizable; discuss requirements for full white-label.

### Objections

**Q: Why not use Google Optimize / VWO / Optimizely?**  
A: RipX is e-commerce focused, supports Shopify and standalone, integrates with GA4/BigQuery, and gives you full control over your data and deployment.

**Q: Is this production-ready?**  
A: Yes. Docker, migrations, security, CI/CD. Used in production today.

**Q: What about support?**  
A: [Adjust based on your support model — docs, email, Slack, etc.]

---

## Key Takeaways (One-Liners)

- **Problem:** Guesswork costs revenue; most tools lack rigor and are platform-locked.
- **Solution:** RipX = statistically valid A/B testing for Shopify + standalone.
- **Tech:** Node.js, Express, PostgreSQL, Redis, Bull, React, Vite, TanStack Query, Polaris, Recharts. Docker, Jest, Playwright.
- **Architecture:** Storefront script → Node/Express API → PostgreSQL.
- **8 Test Types:** Price, content, shipping, offers, checkout — full funnel.
- **Flow:** Connect → Dashboard → Create (wizard) → Run → Analyze & Act.
- **Analytics:** Z-test, p-value, CI, lift, automatic winner. Funnel, heatmap, event explorer.
- **Power Features:** Clone, health score, sample size calculator, notifications, promo links.
- **Integrations:** GA4, BigQuery, webhooks.
- **Multi-Platform:** Same engine for Shopify and standalone.
- **Why RipX:** Rigor + 8 types + multi-platform + integrations + production-ready.

---

## Tech & Tools — Best Description (Use When Asked)

**One-liner:** *"RipX is built with Node.js, Express, PostgreSQL, Redis, React, Vite, and TanStack Query — a modern, production-grade stack that's battle-tested, scalable, and Docker-ready."*

**By layer:**
- **Backend:** Node.js 18+ · Express (REST, OAuth, JWT) · PostgreSQL · Redis · Bull (queues) · Shopify API · Swagger
- **Frontend:** React 18 · Vite 5 · TanStack Query · Polaris · Recharts · React Router 6
- **Integrations:** GA4 · BigQuery · Outbound webhooks
- **DevOps:** Docker · SQL migrations · ESLint · Prettier · Husky · Jest · Playwright

---

## Features at a Glance (Shortest)

| Step | What | How |
|------|------|-----|
| **1. Connect** | Get in | OAuth (Shopify) or API key (standalone) + 1 script tag |
| **2. Dashboard** | Overview | Stats, progress ring, quick create, recent tests |
| **3. Create** | New test | Wizard: type → variants → traffic → targeting → goal → config → review |
| **4. Run** | Go live | Start → script assigns variants (hash) → tracks conversions, heatmap |
| **5. Analyze & Act** | Results + next | Metrics, p-value, CI, lift, funnel, heatmap, events. Export, apply winner, clone |

**Ultra-short flow:** *Connect → Dashboard → Create (wizard) → Run → Analyze & Act*
