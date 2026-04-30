# Advanced price testing research — Shopify & best approach for RipX

Deep research on price testing for Shopify: competitor landscape, platform constraints, advanced methodology, and the **most advanced, implementable approach** for RipX to be best-in-class.

> Historical research note: this is a strategy snapshot from 2025.  
> For current implementation decisions, prioritize in-app docs and active product docs where new **Price tests** default to **Direct Price Override** and **Offer tests** handle promo discounts.

**Sources:** Shopify docs, App Store (Intelligems, ABConvert, Elevate, TestSignal), statistical literature (sequential testing, MDE), pricing research methods (Van Westendorp, Gabor-Granger). Last updated: 2025.

---

## 1. Competitor and market landscape

### 1.1 Feature matrix (Shopify price-testing apps)

| Capability              | Intelligems                                                             | ABConvert                                       | Elevate             | TestSignal                                             |
| ----------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- | ------------------- | ------------------------------------------------------ |
| **Checkout alignment**  | Cart Transform (primary), Script (Plus, deprecated), Duplicate products | Real A/B at checkout (method not always public) | Checkout-aware      | Native Checkout integration                            |
| **Catalog at start**    | Auto-update to highest on start                                         | —                                               | —                   | —                                                      |
| **PDP display**         | DOM + merchant-tagged selectors                                         | —                                               | Theme/price/content | Price, imagery, content                                |
| **Where prices change** | PDP, collections, homepage, search, upsells, quiz (where tagged)        | —                                               | —                   | PDP + checkout                                         |
| **Set prices**          | Manual table, CSV upload, Quick Fill (% or $ vs control)                | —                                               | —                   | —                                                      |
| **Segmentation**        | Device, audience, UTM, **currency/country** (default store currency)    | **UTM, country**                                | —                   | **Audience segments**; **currency** (premium)          |
| **Subscriptions**       | Recharge, Stay.ai (complex; they recommend doing integration)           | —                                               | —                   | **Stay AI** integration                                |
| **Multi-currency**      | Default: store currency; doc + fixed prices per market                  | —                                               | —                   | **Currency-specific tests** (premium tier)             |
| **Launch rules**        | —                                                                       | —                                               | —                   | **Auto price tests for new products** (launch control) |
| **Product limit**       | 500 default (support can increase)                                      | —                                               | —                   | —                                                      |
| **Bundles**             | Cannot price-test (Cart Transform conflict)                             | —                                               | —                   | —                                                      |

**Takeaways:** (1) Checkout alignment (Cart Transform or Discount Function) is table stakes for “real” price tests. (2) Catalog = highest at start is used by the leader (Intelligems). (3) Segmentation (currency, country, UTM, audience) appears in multiple apps. (4) Subscriptions and multi-currency are differentiators (TestSignal + Stay AI; TestSignal/Elevate currency tiers). (5) Launch rules (auto-test new products) are an advanced UX. (6) Quick Fill and CSV are common for bulk setup.

### 1.2 Pricing and positioning

- **ABConvert:** ~$79/mo; price, shipping, content, theme, checkout; real-time analytics; 100M+ shoppers cited.
- **Elevate:** ~$49/mo; theme, price, content; advanced analytics; zero impact on load.
- **TestSignal:** $79 (Starter) to $799 (Premium); price testing on Growth+; **currency-specific on Premium**; Slack/Teams + CSM on Premium; Stay AI for subscription price tests.
- **Intelligems:** Enterprise positioning; Cart Transform as primary; Duplicate products for edge cases; 500-product default limit.

RipX can differentiate with: **no per-store product limit** (or clear, high limit), **Discount Function path** (no Cart Transform slot used, bundle-friendly), **open doc and implementation roadmap**, and **statistical rigor** (MDE, sequential testing, sample size guidance).

---

## 2. Shopify platform state (2025–2026)

### 2.1 Scripts deprecation

- **Shopify Scripts** (Script Editor) are **sunset June 30, 2026**. All scripts stop working after that date.
- **Migration:** Line item scripts → **Discounts API** or **Cart Transform API** (or Cart and Checkout Validation). Shipping scripts → Delivery Customization + Discounts. Payment scripts → Payment Customization.
- **Implication for price tests:** Any solution that relies on Checkout Scripts (e.g. Intelligems’ Script path) must move to **Functions** (Cart Transform or Discount Function). RipX’s path—**Discount Function + cart attributes**—does not depend on Scripts and works on **any plan**; Cart Transform is Plus-oriented and consumes the single transform slot.

### 2.2 Functions for price at checkout

| API                   | Use for price tests                               | Plan                                                             | Limit                                                |
| --------------------- | ------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| **Cart Transform**    | Override line price per segment                   | Plus (custom); any plan via App Store app                        | **One** transform per store (conflicts with bundles) |
| **Discount Function** | Apply product/order discount from cart attributes | Any plan (App Store or custom; custom may need Plus for network) | **25** functions per store                           |
| **Scripts**           | Line item discount (legacy)                       | Plus only                                                        | Deprecated June 2026                                 |

**Best long-term approach for RipX:** Document and support **Discount Function** that reads `_ripx_price_test` and `_ripx_variant`; optionally provide reference implementation and **config API** so the Function can resolve test+variant → discount. Avoid depending on Cart Transform so merchants can keep using bundle apps.

### 2.3 Headless and Storefront API

- **Hydrogen / headless:** Storefront API exposes product/variant and pricing; checkout still runs on Shopify. Price tests can (1) run in the headless app (e.g. RipX script or API returns test price and app renders it), or (2) run at checkout via Discount Function once the cart has attributes. No Scripts dependency.
- **RipX:** Theme app extension + script work on Liquid storefronts; headless would need Storefront API integration or “price by variant from RipX” in the app. Document as future scope; Discount Function still applies at checkout for headless.

---

## 3. Advanced methodology

### 3.1 Sample size and minimum detectable effect (MDE)

- **MDE** = smallest true effect (e.g. % change in conversion rate) that a test can detect with given confidence and power. **Lower MDE → larger sample size and longer run.**
- **Typical targets:** ~300 **orders (conversions)** per variant to detect a **10% relative change** at **90% confidence** (and ~80% power) is a common industry rule of thumb (Intelligems, others). For 5% relative change, sample size grows substantially (often 4× or more).
- **Formula (conversion rate):** Required sample size per variant scales with (z*α/2 + z*β)² × σ² / e², where e = minimum detectable relative effect, σ² = variance of the metric.
- **RipX:** Surface in the wizard: “Aim for **~300 conversions per variant** to detect a **10%** change at **90%** confidence. Run **2–4 weeks** and avoid stopping early.” Optionally add a **sample size / MDE calculator** (baseline conversion rate, desired MDE, confidence, power → required conversions or days).

### 3.2 Sequential testing and early stopping

- **Peeking problem:** Checking results repeatedly without adjustment **inflates false positives** (e.g. from 5% to 17–40% with daily peeking). Fixed significance levels are invalid when you stop as soon as p &lt; 0.05.
- **Sequential testing:** Pre-specified stopping rules and **adjusted** significance thresholds (e.g. group sequential, error spending, mSPRT) so that early stopping keeps the nominal false positive rate. Can **shorten** run time when the effect is large.
- **Best practice:** Either (1) **fixed sample size** and one analysis at the end, or (2) **pre-planned sequential design** with proper boundaries. Avoid “stop when significant” without a sequential method.
- **RipX:** Document “avoid stopping early unless you use a sequential design.” Optional: integrate or link to a sequential A/B calculator; default to “run 2–4 weeks, then decide” to keep behavior simple and safe.

### 3.3 Primary metrics: conversion, revenue, profit

- **Conversion rate** is the most common primary metric; **revenue per visitor (RPV)** or **total revenue** is better when testing price (revenue can rise even if conversion falls).
- **Profit** (revenue − COGS) is ideal when COGS is available; some tools support margin or profit as the goal.
- **RipX:** Support **revenue** (and optionally **profit** if COGS exists) as primary goal for price tests; surface in the wizard that conversion-only can bias toward lower prices. Align analytics and “winner” logic with the chosen goal.

### 3.4 Pre-launch validation (process)

- **Before launch:** Clear hypothesis and KPIs; traffic allocation; minimum sample size (~300 conversions per variant for 10% MDE at 90% confidence); script live in theme; preview each variant on PDP; product scope correct; catalog = highest if checkout alignment is desired.
- **Post-launch validation:** Incognito/private window to simulate first-time visitor; verify variant assignment and price on PDP; complete full journey (add to cart → checkout, including tax); optional cross-device (mobile/tablet) and second team member verification.
- **RipX:** In-app QA checklist (Documentation → Price testing) and Review-step banner link to it.

### 3.5 Beyond A/B: Van Westendorp and Gabor-Granger

- **Van Westendorp:** Survey method; “too cheap” / “bargain” / “expensive but OK” / “too expensive” → acceptable range and optimal price point. Good for **perception** and **range finding**.
- **Gabor-Granger:** Survey with purchase intent at each price → demand curve and revenue-optimal price. Good for **elasticity** and **revenue optimization**.
- **Role for RipX:** A/B tests on live traffic are **complementary** to survey methods. Doc can briefly mention that pre-test research (e.g. Van Westendorp) can inform which prices to A/B test; RipX focuses on **in-store A/B** for real behavior.

---

## 4. Segmentation and scope

### 4.1 Why segment price tests

- **Currency:** Avoid mixing currencies in one test (noise, FX); run in **default currency** or **per market** with fixed prices.
- **Country/region:** Legal or positioning (e.g. test only in US); different willingness-to-pay by region.
- **UTM / traffic source:** Paid vs organic may react differently to price; segment by campaign.
- **Device:** Mobile vs desktop sometimes show different price sensitivity.
- **New vs returning:** New visitors vs returning can have different elasticity.

### 4.2 What competitors do

- **Intelligems:** Currency/country default to store currency; optional targeting.
- **ABConvert:** Price tests by **UTM** or **country**.
- **TestSignal:** Segment by **audience**; **currency-specific tests** on Premium.

**RipX:** Add **optional** “Run in default currency only” and “Limit to countries” for price tests (see PRICE_TEST_IMPLEMENTATION_ROADMAP.md §3.3). Keep default “site-wide” so setup stays simple; advanced users get segmentation.

### 4.3 Launch and automation

- **TestSignal:** “Automatically run price tests for new products” (launch control rules). Useful for scaling tests.
- **RipX (roadmap):** “Auto-start price test when new product is added” or “suggest test for new product” could be a later feature; not required for “best” v1.

---

## 5. Most advanced approach for RipX (recommended stack)

Synthesis of research into a single **best and most advanced** approach that is **implementable** and differentiates RipX.

### 5.1 Checkout alignment (must-have for “real” price tests)

1. **Keep PDP display + cart attributes** as today (`_ripx_price_test`, `_ripx_variant`).
2. **Document Discount Function** path: how to build (or use reference) a Function that reads cart attributes and applies the correct discount so **charged price = displayed price**. Prefer **Discount Function** over Cart Transform (no bundle conflict; 25 per store).
3. **Provide config API** (e.g. GET “price-test config for shop”) so the Function or a deploy-time step can get testId+variantId → target price without manual config.
4. **Catalog = highest:** Document and, if feasible, offer “update catalog to highest and start” (with confirmation and snapshot for revert). Otherwise, strong in-app warning at start + CSV of “recommended catalog prices.”

### 5.2 Wizard and operational UX

5. **Start test:** Clear **catalog warning** on Review (“Set catalog to highest…”); optional checkbox “I’ve set catalog” or “Update catalog and start” (Phase 3).
6. **End test:** **“Roll out winning prices”** modal with **CSV export** (product/variant id, winning price) and, later, “Apply in Shopify” if we have write_products.
7. **Quick-fill:** One rule for all non-control variants (e.g. “−10%” or “−$5”) with optional rounding.
8. **CSV import:** Template + upload for variant prices (bulk entry).
9. **Optional targeting:** Currency (default only) and/or country list for price tests.

### 5.3 Statistical rigor and analytics

10. **Sample size hint** in wizard: “~300 conversions per variant to detect 10% change at 90% confidence; run 2–4 weeks.”
11. **Primary goal:** Support **revenue** (and profit if COGS available) as primary metric for price tests; document that conversion-only can be misleading.
12. **Early stopping:** Document “don’t stop early unless you use a sequential design”; optional link to sequential calculator. Default = fixed duration + single decision.
13. **MDE (optional):** In-app or doc: “For smaller effects (e.g. 5%), you need more conversions; use a sample size calculator.” Link to existing calculator or add simple one.
14. **Results reporting:** Doc: interpret confidence (false positive rate), report lift in context, statistical vs practical significance; “when you stop” checklist; wizard Confidence helpText.

### 5.4 QA and trust

14. **In-app QA checklist:** Script live, preview each variant, check PDP + cart + checkout, catalog = highest, optional test order. Link from Review or Documentation.
15. **Preview:** Reliable variant switcher so merchants can see each arm; doc that cart/checkout match only with Function or manual alignment.

### 5.5 Documentation and transparency

16. **Single source of truth:** Documentation → Price testing (Shopify) with troubleshooting, readiness, and checkout alignment. Keep SHOPIFY_PRICE_TESTING.md and INTELLIGEMS_RESEARCH.md as deep references; ADVANCED_PRICE_TESTING_RESEARCH.md (this doc) as methodology and “best approach.”
17. **Implementation roadmap:** PRICE_TEST_IMPLEMENTATION_ROADMAP.md for phased tasks; update as items ship.
18. **In-app doc (done):** Sample size & MDE with calculator link; after-the-test; price presentation; hypothesis tip on Review for price tests.

### 5.6 Roadmap (later)

18. **Collection/PLP:** Same cohort sees test price on collection/search cards when we have stable assignment and selectors.
19. **Discount Function reference:** Open-source or in-repo reference implementation (Rust or JS) with static config + doc for “Export config from RipX.”
20. **Headless:** Storefront API or “price from RipX” for Hydrogen/custom storefronts; checkout still via Function.

---

## 6. Summary: best approach in one paragraph

**Best approach for RipX:** (1) **Checkout:** Discount Function reading `_ripx_price_test` and `_ripx_variant`, with doc + optional reference and config API; catalog = highest. (2) **Wizard:** Catalog warning at start; roll-out + CSV at end; quick-fill and CSV import; optional currency/country targeting. (3) **Stats:** Revenue (and profit) as primary goal for price tests; sample size hint (~300/variant, 10% MDE, 90% confidence); discourage unadjusted early stopping. (4) **Trust:** QA checklist, preview with variant switcher, clear doc. (5) **Roadmap:** Collection/PLP display, optional “update catalog and start,” headless support. This aligns with competitor best practices, respects Shopify’s Functions future, and is implementable via PRICE_TEST_IMPLEMENTATION_ROADMAP.md.

---

## 7. References

- **Shopify:** [Migrating from Scripts to Functions](https://shopify.dev/docs/apps/build/functions/migrating-from-shopify-scripts), [Discount Function](https://shopify.dev/docs/apps/build/discounts/build-product-discount-function), [Cart Transform](https://shopify.dev/docs/api/functions/reference/cart-transform).
- **Intelligems:** Price testing docs and FAQs (see INTELLIGEMS_RESEARCH.md).
- **Apps:** ABConvert, Elevate, TestSignal (Shopify App Store).
- **Statistics:** Statsig (sequential testing, MDE); Evan Miller (sequential A/B); Van Westendorp / Gabor-Granger (Marketbridge, Synoint, Monetizely).
- **RipX:** SHOPIFY_PRICE_TESTING.md, INTELLIGEMS_RESEARCH.md, PRICE_TEST_IMPLEMENTATION_ROADMAP.md.

---

_Last updated: 2025. Use this doc for methodology and “most advanced” strategy; use PRICE_TEST_IMPLEMENTATION_ROADMAP.md for implementation tasks._
