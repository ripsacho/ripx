---
marp: true
theme: default
paginate: true
backgroundColor: #fff
style: |
  section { font-size: 0.9em; }
  blockquote { font-style: normal; background: #f8fafc; padding: 1rem; border-left: 4px solid #6366f1; }
  .timing { color: #6366f1; font-weight: 600; }
---

# RipX — Speaker Script

**15–18 min (full) | 7–8 min (condensed)**

---

# Presenter Tips

- **Pace:** ~120–140 words/min
- **Pauses:** 2–3 sec after key points
- **Emphasis:** Bold = slight stress
- **Backup:** Print Q&A section

---

# Slide 1: Title [~30 sec]

> "Good [morning/afternoon]. I'm here to present **RipX** — an enterprise-grade A/B testing platform. Our tagline: **Stop guessing. Start winning.** RipX supports **Shopify** and **standalone**, runs **multi-variant** experiments with **statistical rigor**, and is **production-ready**."

**Key takeaway:** RipX = data-driven A/B testing for e-commerce.

---

# Slide 2: The Problem [~45 sec]

> "Most merchants make decisions based on **guesswork**. That leads to **lost revenue**. Many decisions lack **statistical rigor** — picking a winner by gut feel is gambling. Most tools are **platform-locked**. RipX addresses all of these."

**Bridge:** "So what does RipX do about it?"

---

# Slide 3: Cost of Guesswork [~30 sec]

> "The cost is real. Wrong pricing, weak CTAs, wrong shipping thresholds, over-discounting. RipX replaces guesswork with **statistically valid experiments**."

---

# Slide 4: The Solution [~45 sec]

> "RipX is a full-stack A/B testing platform. **8 test types**. **Shopify + standalone**. **GA4, BigQuery, webhooks**. Your data flows into your existing stack."

**Bridge:** "Here's how it works under the hood."

---

# Slide 5: Architecture [~60 sec]

> "A **storefront script** runs on the merchant's site. The **backend API** runs the **AB Test Engine**, **Traffic Allocator**, **Analytics Service**. Everything in **PostgreSQL**, optional **Redis**. **Node.js, Express, React, Vite** — battle-tested, Docker-ready."

---

# Slide 6: 8 Test Types [~75 sec]

> "**Price, Onsite Edit, Split URL, Template, Theme, Shipping, Offer, Checkout** — full funnel coverage from landing to purchase."

**Bridge:** "How do we handle multiple variants?"

---

# Slide 7: Multi-Variant [~45 sec]

> "**A/B, A/B/C, multivariate**. **Custom allocation** — 50/50, 80/20, any split. **Consistent hashing** — same user, same variant, no flicker. **Sample size calculator** to plan test duration."

---

# Slide 8: Analytics [~60 sec]

> "**Z-test**, **p-values**, **confidence intervals**, **lift**. **Automatic winner** when significance reached. The math decides. Not gut feel."

---

# Slide 9: Advanced Analytics [~45 sec]

> "**Profit, PPV**, **custom events**, **custom formulas**. **Heatmap** — click/scroll density. **Funnel** — step-by-step analysis. **Time-series** — performance over time."

---

# Slide 10: Power Features [~30 sec]

> "**Test cloning** — duplicate in one click. **Health score** — 0–100 quality indicator. **Sample size calculator**. **Notifications** — when tests complete or reach significance."

---

# Slide 11: Integrations [~45 sec]

> "**GA4** — conversion & custom events. **BigQuery** — events, analytics, heatmap. **Outbound webhooks**. **Shopify webhooks**. Your data flows where you need it."

---

# Slide 12: Targeting [~40 sec]

> "**Device** — desktop, mobile, tablet. **Geography** — country, region, city. **Customer** — new/returning, tags, LTV. **Custom rules**. **Presets**."

---

# Slide 13: Promo Links [~25 sec]

> "Direct URLs with embedded discounts. **Unique**, **usage limits**, **expiration**. Track usage and conversion per link. Perfect for email, social, affiliate."

---

# Slide 14: Multi-Platform [~45 sec]

> "**Shopify** — OAuth, embedded admin, webhooks. **Standalone** — API key, same React admin. Same backend, same engine, same analytics. You choose."

---

# Slide 15: Security [~30 sec]

> "**OAuth 2.0, JWT**. **Tenant isolation**. **Parameterized queries**. **Rate limiting**. **Docker, CI/CD**. **Structured logging**."

---

# Slide 16: Tech Stack [~45 sec]

> "**Backend:** Node.js, Express, PostgreSQL, Redis, Bull, Shopify API, JWT, Swagger. **Frontend:** React, Vite, TanStack Query, Polaris, Recharts. **Integrations:** GA4, BigQuery, webhooks. **DevOps:** Docker, migrations, Jest, Playwright. Modern, production-grade, battle-tested."

---

# Slide 17: Features — Step by Step [~60 sec]

> "**Connect → Dashboard → Create → Run → Analyze & Act.** 1. Connect: OAuth or API key + script tag. 2. Dashboard: Stats, quick create. 3. Create: Wizard — type, variants, traffic, targeting, goal, review. 4. Run: Script assigns variants, tracks conversions. 5. Analyze & Act: Metrics, funnel, heatmap, export, apply winner."

---

# Slide 18: Roadmap [~35 sec]

> "**Phase 1** — flicker fix, combination testing. **Phase 2** — Bayesian stats, custom metrics, templates. **Phase 3** — multi-armed bandit, AI hypotheses."

---

# Slide 19: Why RipX? [~45 sec]

> "**Statistical rigor**. **8 test types**. **Multi-platform**. **Integrations**. **Production-ready**. Deploy with confidence."

---

# Slide 20: Thank You [~15 sec]

> "That's RipX — data-driven decisions for e-commerce. I'm happy to take questions."

---

# Q&A — Technical

**Variant assignment?** Consistent hashing on user ID. Same user → same variant.

**Multiple tests?** Yes. Script handles multiple active tests per page.

**API?** Full REST API. Docs at /api/docs.

**GDPR?** Tenant isolation. Merchants control data.

---

# Q&A — Business & Objections

**Pricing?** [Adjust per your model.]

**Setup time?** Under 15 minutes.

**Why not Optimizely/VWO?** E-commerce focused, Shopify + standalone, GA4/BigQuery, full control.

**Production-ready?** Yes. Docker, migrations, security, CI/CD.
