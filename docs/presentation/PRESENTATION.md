---
marp: true
theme: default
paginate: true
backgroundColor: #fff
size: 16:9
style: |
  section { font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
  section.lead { text-align: center; }
  section.lead h1 { font-size: 2.8em; letter-spacing: -0.02em; }
  section.lead h2 { font-size: 1.4em; font-weight: 500; color: #64748b; }
  h1 { color: #0f172a; font-weight: 700; }
  h2 { color: #1e293b; font-weight: 600; }
  .tagline { font-size: 0.95em; color: #64748b; margin-top: 0.5em; }
  .highlight { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 600; }
  .stat { font-size: 2em; font-weight: 700; color: #6366f1; }
  table { font-size: 0.9em; }
  footer { font-size: 0.65em; color: #94a3b8; }
  section.section-break { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; }
  section.section-break h1 { color: white; }
  section.section-break p { color: #cbd5e1; }
---

<!-- _class: lead -->
<!-- _backgroundColor: #f8fafc -->
# RipX
## Enterprise A/B Testing for E‑Commerce

**Stop guessing. Start winning.**

Shopify & Standalone · Multi-Variant · Statistical Rigor · Production-Ready

---

<!-- _backgroundColor: #fef2f2 -->
# The Problem: Decisions Without Data

| Pain Point | Impact |
|------------|--------|
| **Guesswork** | Merchants change prices, copy, layouts — no proof it works |
| **Lost revenue** | Suboptimal pricing, weak CTAs, offers that don't convert |
| **No rigor** | Picking winners by gut feel = gambling, not science |
| **Platform lock-in** | Tools tied to one platform; custom stacks left behind |

> *"We ran it for a week and B looked better."* — Not good enough.

---

# The Cost of Guesswork

- **Price tests** — Wrong price = lost margin or lost volume
- **CTA tests** — Weak copy = abandoned carts
- **Shipping tests** — Wrong threshold = margin erosion
- **Offer tests** — Over-discounting = profit bleed

**RipX replaces guesswork with statistically valid experiments.**

---

<!-- _class: section-break -->
# The Solution

---

<!-- _backgroundColor: #f0fdf4 -->
# RipX: Full-Stack A/B Testing

**RipX** lets merchants run **statistically valid** experiments across the full funnel:

- **8 test types** — Price, content, shipping, offers, checkout, and more
- **Multi-platform** — Shopify + standalone from one codebase
- **Integrations** — GA4, BigQuery, webhooks — your data, your stack
- **Production-ready** — Docker, migrations, security out of the box

---

# Architecture Overview

**Stack:** Node.js · Express · React · Vite · PostgreSQL · Redis · Bull — battle-tested, Docker-ready

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│ Storefront      │────▶│ Backend API     │────▶│ PostgreSQL   │
│ Script          │     │ (Node.js/Express)│     │ + Redis      │
└────────┬────────┘     └────────┬────────┘     └──────────────┘
         │                       │
         │ • Variant assignment  │ • AB Test Engine
         │ • Conversion tracking │ • Traffic Allocator
         │ • Heatmap events      │ • Analytics Service
         └───────────────────────┘
```

---

# 8 Test Types — Full Funnel Coverage

| Type | What You Test | Use Case |
|------|---------------|----------|
| **Price** | Product pricing | Elasticity, optimal price point |
| **Onsite Edit** | Headlines, copy, CTAs, images | Messaging, conversion copy |
| **Split URL** | Entire page variants | Landing page tests |
| **Template** | Theme/layout | Layout variations |
| **Theme** | Visual + content | Design experiments |
| **Shipping** | Rates, free-shipping threshold | Shipping strategy |
| **Offer** | Discounts, promo links | Promo effectiveness |
| **Checkout** | Checkout experience | Friction reduction |

---

# Multi-Variant & Traffic Allocation

| Feature | Benefit |
|---------|---------|
| **A/B, A/B/C, multivariate** | Up to N variants per test |
| **Custom allocation** | 50/50, 80/20, or any split |
| **Consistent hashing** | Same user → same variant (no flicker) |
| **Sample size calculator** | Plan test duration before launch |

*Built-in wizard guides you through setup.*

---

# Analytics & Statistical Rigor

| Metric | What It Tells You |
|--------|-------------------|
| **Z-test** | Two-proportion significance |
| **P-value** | Statistical significance (p < 0.05) |
| **Confidence intervals** | 95% CI for conversion rates |
| **Lift** | % improvement vs control |
| **Winner determination** | Automatic when significance reached |

*No manual interpretation — the math decides.*

---

# Advanced Analytics

- **Profit & PPV** — Revenue minus COGS, profit per visitor
- **Custom events** — `add_to_cart`, `newsletter_signup`, any event
- **Custom formulas** — Define your own metrics
- **Heatmap** — Click and scroll density per variant
- **Funnel** — Step-by-step conversion analysis (visitors → cart → purchase)
- **Time-series** — Performance over time, daily trends

---

# Power Features

| Feature | What It Does |
|---------|--------------|
| **Test cloning** | Duplicate successful tests in one click |
| **Health score** | 0–100 quality indicator (sample size, duration, significance) |
| **Sample size calculator** | Required visitors before you start |
| **Notifications** | In-app alerts when tests complete or reach significance |

---

# Integrations

| Integration | Purpose |
|-------------|---------|
| **GA4** | Conversion & custom events → Google Analytics |
| **BigQuery** | Events, analytics, heatmap → data warehouse |
| **Outbound Webhooks** | Notify external systems on test events |
| **Shopify Webhooks** | Order, product, app lifecycle |

*Your data flows where you need it.*

---

# Targeting & Segmentation

| Dimension | Options |
|-----------|---------|
| **Device** | Desktop, mobile, tablet |
| **Geography** | Country, region, city (include/exclude) |
| **Customer** | New vs returning, tags, LTV, order count |
| **Custom rules** | equals, contains, greater_than, in |
| **Presets** | Save and reuse targeting configs |

---

# Promo Links — No Codes Needed

- **Direct URLs** — Embedded discount, no promo code
- **Unique per variant** — Per-campaign tracking
- **Usage limits** — Cap redemptions
- **Expiration** — Time-bound offers
- **Tracking** — Usage and conversion per link

*Ideal for email, social, affiliate campaigns.*

---

# Multi-Platform: Shopify + Standalone

| | Shopify | Standalone |
|---|---------|------------|
| **Auth** | OAuth (install) | API key |
| **Admin** | Embedded in Shopify | Standalone React app |
| **Script** | `?shop=xxx.myshopify.com` | `?site=example.com` |
| **Conversion** | Webhooks + storefront | Storefront + API |

*Same backend, same engine, same analytics — choose your platform.*

---

# Security & Reliability

- **OAuth 2.0 / JWT** — Secure authentication
- **Tenant isolation** — Shop-specific data, no cross-leak
- **Parameterized queries** — SQL injection protection
- **Rate limiting** — API protection
- **Docker, CI/CD** — Reproducible deployments
- **Structured logging** — Debug and audit trails

---

# Tech Stack & Tools

**Modern, production-grade stack — battle-tested, scalable, Docker-ready**

| Layer | Technologies |
|-------|--------------|
| **Backend** | Node.js 18+, Express (REST, OAuth, JWT), PostgreSQL, Redis, Bull (queues), Shopify API, Swagger |
| **Frontend** | React 18, Vite 5, TanStack Query, Polaris, Recharts, React Router 6, Axios |
| **Integrations** | GA4 Measurement Protocol, BigQuery, Outbound Webhooks |
| **DevOps** | Docker, SQL migrations, ESLint, Prettier, Husky, Nodemon |
| **Testing** | Jest (unit), Playwright (E2E), Supertest |

---

# Features — Step by Step

**Connect → Dashboard → Create → Run → Analyze & Act**

| Step | What | How |
|------|------|-----|
| **1. Connect** | Get in | Shopify: OAuth install. Standalone: register domain → API key → add 1 script tag |
| **2. Dashboard** | Overview | Stats, progress ring, quick create (Price/Content/Shipping/Offer), recent tests |
| **3. Create** | New test | Wizard: type → name → variants (add/remove) → traffic → targeting → goal → config → review |
| **4. Run** | Go live | Start → script assigns variants (consistent hash) → tracks conversions, heatmap |
| **5. Analyze & Act** | Results + next | Metrics, p-value, CI, lift, funnel, heatmap, events. Export CSV/JSON. Apply winner, clone |

---

# Roadmap

| Phase | Focus | Examples |
|-------|-------|----------|
| **1** | Stability & gaps | Flicker fix, combination testing UI |
| **2** | Features & quality | Bayesian stats, custom metrics UI, test templates |
| **3** | Differentiators | Multi-armed bandit, AI hypothesis suggestions |

*Building toward a platform that designs better tests, not just runs them.*

---

# Why RipX?

| Pillar | Detail |
|--------|--------|
| **Statistical rigor** | Z-test, p-values, confidence intervals |
| **8 test types** | Full funnel: price → checkout |
| **Multi-platform** | Shopify + standalone |
| **Integrations** | GA4, BigQuery, webhooks |
| **Production-ready** | Docker, migrations, security |

---

<!-- _class: lead -->
<!-- _backgroundColor: #f8fafc -->
# Thank You

**RipX** — Data-driven decisions for e‑commerce

Questions?
