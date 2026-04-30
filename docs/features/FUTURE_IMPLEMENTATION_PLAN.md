# RipX Future Implementation Plan

This document outlines a **phased roadmap** for the **full RipX project** (product and admin), based on the [Admin Control Panel Spec](../ADMIN_CONTROL_PANEL_SPEC.md), project inventory (Appendix A), and industry research (§12–§13). It is a living plan: priorities can shift with product and compliance needs.

---

## Vision: most advanced all-in-one AB testing tool

**Goal:** RipX is a single platform where teams create, run, analyze, and act on experiments—plus personalization, heatmaps, and analytics—without juggling multiple tools.

**All-in-one means:**

- **Create:** A/B and multivariate tests, combination tests, personalization rules, scheduled start/stop, targeting and segments, guardrails; **visual editor (side-by-side with code)** and **heatmap over page image** (planned).
- **Run:** Consistent assignment (sticky bucketing), per-test holdout, script + server-side, Shopify and headless/standalone.
- **Analyze:** Per-test analytics (Bayesian + frequentist), funnel, events, heatmaps, time series, SRM and health checks, export (CSV/JSON/BigQuery).
- **Act:** Rollout winner, personalize, promo links; outbound webhooks and GA4/BigQuery for downstream use.
- **Operate:** Admin panel (users, domains, tests, audit), feature flags, jobs, and (future) key-value config.

**Differentiators:** Shopify-native plus standalone (API key); one stack for experimentation + analytics + personalization + heatmaps; multi-store accounts; admin and audit built in. Roadmap below closes gaps and adds enterprise-grade controls so RipX can stand out as the most advanced all-in-one option.

**Handling issues:** The plan is designed to handle reliability, failure modes, and data quality: see § **Handling issues** (failure-mode table, graceful degradation, monitoring). It ties current mitigations (validation, SRM, conflict detection, guardrails, suspend/block) to Phase 2–6 (rate limits, jobs list, data quality, rollback/kill switch, SLA/status) so the platform can handle all issues end-to-end.

**Make it perfect:** For a full list of everything to add, update, fix, upgrade, and quality improvements (experiment quality score, pre-launch checklist, force variation, CWV, cross-campaign analysis, mobile/future), see § **Comprehensive research: add, update, fix, upgrade, and quality (make it perfect)**.

---

## Product feature inventory (current)

| Area           | What exists today                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tests**      | A/B and multi-variant, combination tests, targeting presets, segments, guardrails, scheduling, personalization/rollout, conflict detection, test health (SRM, allocation). |
| **Analytics**  | Per-test metrics, Bayesian + frequentist, funnel, event explorer, heatmaps, time series, custom events, export CSV/JSON + BigQuery job.                                    |
| **Platform**   | Shopify OAuth + standalone (API key), multi-store accounts, tenants, shop settings (GA4, BigQuery, webhooks).                                                              |
| **Operations** | Admin (users, domains, tests, audit), notifications, promo links, inbound/outbound webhooks, scheduled and background jobs.                                                |

**Notes:** Combination test is in TestTypeModal and TestWizard. Export and BigQuery live under `/api/analytics/` (e.g. `GET /api/analytics/tests/:id/export`). See § Feature audit for a full add/update/upgrade checklist.

Use this inventory to avoid duplicating work and to see where to extend (e.g. experiment groups, global holdout, team notes, report PDF).

---

## Feature audit: add, update, upgrade (project-wide)

Checklist from a full project review. Prioritize **add** (net-new), **update** (align code/docs/UX), or **upgrade** (complete partial implementations).

- **Add:** Product — experiment groups, global holdout, team notes, report PDF, date-range/product analytics, idea repository, calendar, bandit, always-valid inference, program impact, AI (Phase 7), Shopify price override, targeting page/product/collection list UI, theme/template tests internal, Checkout UI extension; **Visual editor (side-by-side with code)** and **heatmap over page image** (see § Visual editor and heatmap over page image); Notifications page (quick win); Combination test in TestCreator (quick win; backend exists). Admin — Phase 2 (key-value UI, feature flags, jobs list, shop override, webhooks admin, rate limits), Phase 3 (notifications, promo list/revoke, impersonation, GDPR, maintenance, block list, usage export, email re-verify), Phase 4+ (accounts, presets, sessions, webhook events, conflict view, test health bulk, significance alerts, templates, event catalog, client errors, consent/script, aggregation trigger, MFA).
- **Update:** Backend validators: ~~add checkout, template, split-url, onsite-edit~~ **Done;** ~~add PAGE to TARGET_TYPES~~ **Done;** ~~document export under /api/analytics/~~ **Done** (exportRoutes mounted under analyticsRoutes; GET /api/analytics/tests/:id/export; Documentation.jsx). Frontend: consistent pricing/price mapping. Docs: keep product inventory in sync; mark Combination as backend-only until wizard exists.
- **Upgrade:** Frontend: add Combination to TestTypeModal + wizard path; add page/product/collection list selectors when doing Shopify targeting. Extensions: optional theme block payload; add Checkout UI extension (Phase 3). Admin: MVP done; Phase 2–4 = add. Backend: ~~webhook product sync job and cleanup job~~ **Done:** productSyncQueue + productSyncProcessor exist and run; archiveProcessor runs purge of old webhook_events (configurable retention via RIPX_WEBHOOK_EVENTS_RETENTION_DAYS).
- **Priority:** Quick wins = Combination test + Notifications page + validators/TARGET_TYPES. High impact = price override, targeting lists, team notes, report PDF, then theme/checkout. Admin = Phase 2 first.
- **Verification:** When using this plan, re-check code (validators, constants, routes, storefront script) so the checklist stays accurate; see § Comprehensive research “Actionable (code-level)” for exact file/line references.

---

## Gaps and additions for “most advanced” all-in-one

To align with leading experimentation platforms and close gaps, the following are in scope. RipX already has **per-test holdout**, **Bayesian + frequentist**, **SRM**, **combination tests**, and **conflict detection**; the list below strengthens or adds net-new capability.

| Gap / addition                                   | Purpose                                                                                                                                      | Notes                                                                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Experiment groups (mutual exclusion)**         | Prevent overlapping tests on the same audience so results are not confounded.                                                                | Define groups (e.g. “checkout”, “hero”); at most one test per group per user; assignment respects group.                                                                                                        |
| **Global holdout**                               | Measure aggregate long-term impact: a fixed % of traffic never in any test (e.g. 1–10%).                                                     | Optional org/tenant-level setting; analytics can compare “in-tests” vs “global holdout” over 3–6 months.                                                                                                        |
| **Multivariate (4–6+ variants)**                 | Support more variants per test where product needs it.                                                                                       | Clarify or raise variant cap; ensure analytics and allocation scale.                                                                                                                                            |
| **Team notes on tests**                          | Internal notes, hypotheses, and decisions attached to a test.                                                                                | Rich text or markdown; created/updated by user; show in test detail and in exports.                                                                                                                             |
| **Report generation (PDF / shareable)**          | One-click report for stakeholders: test config, results, charts, recommendation.                                                             | Export current test analytics + metadata to PDF or shareable link (optional expiry).                                                                                                                            |
| **Sticky bucketing and cohort controls**         | Make sticky behaviour explicit and optional cohort windows.                                                                                  | Document and optionally expose “stick user to variant for N days” or “by cohort” in UI.                                                                                                                         |
| **Date-range and product-level analytics**       | Compare performance across date ranges; break down by product/category where applicable.                                                     | Analytics UI: compare period A vs B; optional dimensions (e.g. product_id) for e‑commerce.                                                                                                                      |
| **Idea repository and shared calendar**          | Capture and prioritize test ideas; visualize test schedule across teams.                                                                     | Backlog with idea → test link; calendar/timeline/kanban; optional voting and due dates.                                                                                                                         |
| **Dynamic allocation (bandit)**                  | Reduce opportunity cost by shifting traffic to better variants during the test.                                                              | Optional mode; Thompson sampling or UCB; single primary metric; document bandit vs fixed.                                                                                                                       |
| **Flicker-free / edge execution**                | Eliminate flash of original content and layout shift; faster perceived load.                                                                 | Variant at edge or server before HTML; document true flicker-free vs anti-flicker snippet.                                                                                                                      |
| **Always-valid inference**                       | Safe continuous monitoring and early stopping without inflating Type I error.                                                                | Always-valid p-values and CIs; integrate with sequential testing in experiment policy.                                                                                                                          |
| **Program impact view**                          | Show how the experimentation program moves business metrics over time.                                                                       | Portfolio/report: experiments by period, aggregate lift on revenue/conversion.                                                                                                                                  |
| **AI: idea discovery and result summaries**      | Lower barrier to running tests; clearer interpretation for stakeholders.                                                                     | Suggest ideas from funnel/heatmaps; plain-language result summary; Phase 7 AI.                                                                                                                                  |
| **Shopify price tests (direct display)**         | Reliable price tests on storefront with clear “display only” vs checkout behavior.                                                           | Storefront script + optional theme block override displayed price per assignment; document catalog vs display; optional Price List (B2B) later.                                                                 |
| **Theme/template tests (internal)**              | Theme and template/section tests that run fully from RipX (no external tool).                                                                | Split-theme redirect or proxy; template/section variant injection via app block or script; wizard for theme ID, template, section, variants.                                                                    |
| **Checkout tests**                               | A/B content inside Shopify Checkout (trust badges, copy, images).                                                                            | Checkout UI extension calls RipX for assignment; render variant content; Plus-focused; track conversion via existing events/webhooks.                                                                           |
| **Targeting: page and product/collection lists** | Merchants pick exact Shopify pages and product/collection lists for tests.                                                                   | Fetch pages/products/collections from Admin API in UI; store `target_type` + `target_ids`; script activates only on matching page/product/collection.                                                           |
| **Visual editor (side-by-side with code)**       | No-code and code in one flow, like VWO/Convert: visual element picker + mutations and code pane (CSS/JS); same variation editable both ways. | Editor route with iframe preview, element picker, visual edits (setText/setAttr/setStyle/hide/show), code pane; persist to variant config; storefront applier. See § Visual editor and heatmap over page image. |
| **Heatmap over page image**                      | Show click (and scroll) heatmap overlaid on a screenshot of the targeted page, not only grid.                                                | Screenshot capture (Puppeteer or service) per page_url; store image; HeatmapView shows screenshot + heat overlay; normalize coordinates to reference viewport. See § Visual editor and heatmap over page image. |

These feed into the **product experimentation initiatives** in the phased roadmap below. See § Additional research, § Shopify-native integration plan, and § Visual editor and heatmap over page image for details.

---

## Additional research: ideas to improve, add, and update

Ongoing research (2024–2025) on experimentation platforms, statistics, and Shopify surfaces the following. Use this to **improve** existing features, **add** new capabilities, and **update** the roadmap.

### AI and automation

| Idea                                | Type | Description                                                                                                                                                                             |
| ----------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI test idea discovery**          | Add  | Suggest test ideas from analytics (low-converting pages, drop-off steps, segment gaps); optional per-domain feature flag.                                                               |
| **AI result summaries**             | Add  | Plain-language interpretation of results (“Variant B is 12% likely to be best; recommend rolling out if guardrails pass”).                                                              |
| **Auto traffic to winner (bandit)** | Add  | Optional test mode: dynamic allocation toward better-performing variants (Thompson sampling or UCB); “earn while learning”; best when one primary metric and high cost of bad variants. |
| **Experiment design assistant**     | Add  | In-wizard guidance: sample size, duration, guardrails, goal choice based on test type and traffic.                                                                                      |

### Collaboration and program management

| Idea                           | Type | Description                                                                                                        |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------ |
| **Idea repository**            | Add  | Central backlog: submit ideas (hypothesis, metric, priority); list/kanban/calendar; link idea → test when created. |
| **Shared calendar / timeline** | Add  | Calendar or timeline view of tests (start/end, status); coordinate across teams and sprints.                       |
| **Prioritization**             | Add  | Score or vote on ideas; pipeline stages (idea → planned → running → done); optional due dates and assignees.       |
| **Threaded comments**          | Add  | Comments on tests (or ideas) with @-mentions; design proofing / approval workflows optional later.                 |
| **Program impact view**        | Add  | Portfolio view: how experiments collectively moved key metrics over time (e.g. revenue, conversion by quarter).    |

### Delivery and performance

| Idea                              | Type          | Description                                                                                                                                                                                                                   |
| --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flicker-free / edge execution** | Add / Improve | Serve variant at edge or server before HTML (CDN middleware, server-side render) so no flash of original content; document “true flicker-free” vs anti-flicker snippet; consider edge SDK or Next.js middleware for headless. |
| **Script performance**            | Improve       | Minimize script size and latency; async load; optional “critical path only” for above-the-fold tests.                                                                                                                         |

### Statistical and governance

| Idea                       | Type          | Description                                                                                                                                                                |
| -------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Always-valid inference** | Add / Improve | Support continuous monitoring and early stopping with valid p-values and confidence intervals at any stop time; align with Phase 6 experiment policy (sequential testing). |
| **Bandit as test mode**    | Add           | Optional “dynamic allocation” mode alongside fixed A/B; document when to use bandit vs fixed (e.g. bandit for scarce traffic, time-sensitive promos).                      |

### Shopify and merchant context

| Idea                             | Type         | Description                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Position vs Shopify Rollouts** | Update       | Shopify Rollouts (Winter ’26): theme-level, traffic %, schedule—no audience segmentation, no checkout/pricing/app-embed tests yet. RipX differentiators: segments, checkout/product/pricing, app embeds, full analytics, personalization, heatmaps. Call this out in positioning and docs. |
| **Theme/section targeting**      | Improve      | Align test targeting with theme sections and blocks (e.g. “hero”, “product grid”) for clearer merchant UX.                                                                                                                                                                                 |
| **Simulated pre-live testing**   | Add (future) | SimGym-style: synthetic or replay traffic to validate tests before go-live; lower priority, research-only for now.                                                                                                                                                                         |

### No-code and UX

| Idea                                       | Type          | Description                                                                                                                                                                                                      |
| ------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visual editor (side-by-side with code)** | Add           | Like VWO/Convert: WYSIWYG + code in one flow; element picker, visual mutations (text/style/hide/show), code pane (CSS/JS); same variation editable both ways. See § Visual editor and heatmap over page image.   |
| **Heatmap over page image**                | Add           | Click/scroll heatmap overlaid on screenshot of target page (Hotjar-style); screenshot capture (Puppeteer or service), normalize coords, overlay in HeatmapView. See § Visual editor and heatmap over page image. |
| **No-code / low-code creation**            | Add / Improve | Drag-and-drop or template-based test creation for simple changes; reduce dependency on devs.                                                                                                                     |
| **Pre-built templates**                    | Improve       | Expand full test templates (Phase 4): not only targeting but goal + variants + copy so merchants can clone and edit.                                                                                             |

### How this maps to the roadmap

- **Phase 2–3 (product):** Idea repository, shared calendar/timeline, team notes (already in initiatives), report PDF, bandit as optional mode (after fixed allocation is solid), flicker-free/edge as doc + optional integration. **Shopify:** Price display override, targeting (page/product/collection lists), then theme/template internal execution and Checkout UI extension.
- **Phase 4:** Prioritization, threaded comments, program impact view; full test templates (already in Phase 4).
- **Phase 5–6:** Always-valid inference in experiment policy; data quality and SRM (already in Phase 6).
- **Phase 7 (AI):** AI idea discovery, result summaries, design assistant; AI-generated variations (already in Phase 7).
- **Ongoing:** Positioning vs Rollouts and script performance are documentation and incremental improvements; theme/section targeting improves existing targeting UX.

---

## Shopify-native integration plan: price, theme/template, checkout, targeting

Research-backed plan so **price tests**, **theme/template tests**, and **checkout tests** work end-to-end from the app, with **direct targeting by Shopify pages and product/collection lists**.

### Price tests: direct price update options

RipX already supports test type `price` / `pricing` and variant config with `price`. To make Shopify price tests work reliably and give merchants clear options:

| Option                             | Description                                                                                                                                                                 | Pros                                                  | Cons                                                                                                                                  | Recommendation                                                                                                                                                                                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Storefront display override** | Script or theme app block injects test; storefront JS overrides displayed price (per variant) using assignment from RipX; cart/checkout still use catalog price unless B/C. | No catalog change; fast to ship; works with any plan. | Checkout charge is catalog price; order history shows catalog price; must re-apply on variant change and in product cards/collection. | **Implement first:** script + theme block that (1) gets assignment from RipX, (2) overwrites price DOM or intercepts theme price updates (e.g. `_updatePrice`), (3) sends `view_price`/`add_to_cart` with variant_id for analytics. Document “display only” for this mode. |
| **B. Shopify Price Lists (B2B)**   | Use Admin API `priceListCreate` / `priceListFixedPricesUpdate` to create a price list with fixed prices per variant; assign catalog to a “test” customer segment.           | Real price at checkout for that segment.              | B2B/catalog feature; not all plans; segment = customer-based only; operational overhead.                                              | **Phase 2–3 (optional):** Offer for Plus/B2B stores; UI to map test variants to price list + customer segment; document limitations.                                                                                                                                       |
| **C. Discount at checkout**        | Apply discount code or Draft Order–style logic so effective price matches test variant.                                                                                     | Real price at checkout.                               | Requires discount/cart logic; can conflict with other promos; UX (code vs automatic).                                                 | **Later:** Consider as “checkout price test” variant if Checkout Extensibility allows applying discounts per session from extension.                                                                                                                                       |

**Implementation (Option A):** Storefront script receives test config with `template_key: 'price'` and variant `config: { price: "9.99", variant_id_gid: "..." }`. On product page (and collection if desired), script identifies price elements (e.g. `[data-product-id]`, variant selectors), gets assignment from RipX, and replaces displayed price for the assigned variant; on add-to-cart, send event with variant_id and test variant for analytics. Optionally: theme block that outputs a data payload (test id, variant prices) so script can apply without scraping DOM. **Targeting:** use existing `target_type: 'product'`, `target_id` / `target_ids` (Shopify product GID or numeric ID) so test runs only on chosen products.

### Theme and template tests: work from internal (app)

- **Current:** RipX has `target_type: 'theme'` and test types that infer `template_key` (e.g. `theme`, `template`); config can include `url`, `template`, or section identifiers.
- **Split theme:** Run two full themes (e.g. live vs duplicate); app assigns user to theme A or B (e.g. via cookie/assignment), then redirects or uses app proxy to serve the correct theme. Shopify does not support “same URL, two themes” natively—common pattern is **split URL** (e.g. `?theme=variant_b` or path prefix) with script or server routing to the theme. **Improvement:** In-app “Theme test” flow: merchant selects “Theme A” (current) vs “Theme B” (duplicate theme ID); RipX stores `config: { theme_id_a, theme_id_b }`; storefront script reads assignment and redirects to theme B’s preview URL or app proxy that serves the correct theme for the session. Requires theme duplicate and stable assignment.
- **Split template / section:** Test specific templates (e.g. `product`, `collection`) or sections (e.g. “hero”). **Option 1:** Section-based: theme app block or script injects alternate section HTML for the assigned variant (content from RipX or from theme snippet). **Option 2:** Template-based: use Liquid conditional or script to show different content per assignment (RipX provides assignment via meta tag or JS global). **Improvement:** In-app “Template test” / “Section test” wizard: merchant picks template (e.g. `product`) or section ID; defines variants (e.g. two hero images); RipX stores `template_key: 'template'`, `config: { template: 'product', section_id: 'hero', variants: [...] }`; storefront script or app block fetches assignment and swaps content (e.g. section HTML or image/copy). Run **internally** (RipX backend + app embed / app block) so no external third-party; assignment and events stay in RipX.

**Implementation:** Extend Test Wizard for “Theme” and “Template/Section” with clear fields (theme IDs, template name, section id, variant content). Storefront: app embed script already loads from app proxy; add handling for `theme` / `template` tests (redirect for theme; inject or swap for template/section). Use existing `target_type` / `target_id` (e.g. `page` + handle, or `theme` + theme_id).

### Checkout tests

- **Constraint:** Shopify Checkout is locked; customization is via **Checkout UI Extensibility** (extensions). No direct A/B in checkout liquid; extensions render in defined slots (e.g. information, delivery, payment).
- **Approach:** RipX **Checkout UI extension** (separate from theme app): extension loads on checkout, calls RipX backend (e.g. `GET /api/track/assignment?test_id=...&visitor_id=...`) with checkout session/visitor id; backend returns assigned variant. Extension renders different content per variant (e.g. trust badge A vs B, guarantee text, image). **Limitation:** Checkout UI extensions are available for **Shopify Plus** (and certain slots); non-Plus has limited checkout customization. **Implementation:** Add a Checkout UI extension project (e.g. `extensions/ripx-checkout`) that (1) receives test id and shop from config, (2) fetches assignment from RipX API (server-side or from extension with `network_access`), (3) renders block content (text, image, banner) per variant. Track “checkout viewed” / “order completed” via existing track or webhooks; goal = conversion. RipX already has `template_key: 'checkout'` and test type `checkout`; ensure assignment API is callable from checkout extension (CORS, auth: e.g. session token or shop+test id signed).
- **Checkout price:** Changing the actual amount charged in checkout (for a price test) is not supported by Checkout UI alone; use Price List (B2B) or discount-based approach (Option C above) if needed.

### Targeting: direct pages and product/collection lists (Shopify)

- **Current:** RipX has `target_type` and `target_id` (e.g. `product`, `collection`, `page`, `theme`) and `target_ids` (JSONB array) for multi-target; targeting service has URL rules in custom rules (e.g. `url` operator). So “page” and “product” are already supported at the data level; the gap is **first-class UI and storefront behavior** so merchants can pick “these pages” and “these products/collections” directly from Shopify.
- **Pages:** Shopify “pages” have handles (e.g. `about`, `contact`). Storefront URL is `/pages/<handle>`. **Improvement:** (1) In Test Wizard targeting, add “Page list” selector: fetch pages via Admin API (`pages`) or Storefront API; show dropdown or multi-select of page handles (or “All pages”, “Home”, “Product”, “Collection”, “Cart”, “Custom URL pattern”). (2) Store `target_type: 'page'`, `target_id: handle` or `target_ids: ['about','contact']`. (3) Storefront script: if test targets pages, only activate on `window.location.pathname` matching `/pages/<handle>` or pattern. **Direct page list:** Allow multiple `target_ids` (e.g. `['about','faq','contact']`) so test runs only on those pages.
- **Product list:** **Improvement:** (1) In targeting, add “Product list” selector: search/products API (Admin or Storefront) to pick products by title, ID, or collection; save as `target_type: 'product'`, `target_ids: [gid1, gid2, ...]` (or numeric IDs if script uses that). (2) Storefront: script gets current product (e.g. from `window.ShopifyAnalytics.meta.product` or DOM/data attribute); if `product.id` (or GID) is in test’s `target_ids`, run test; otherwise skip. Same for **collection list:** `target_type: 'collection'`, `target_ids: [id1, id2]`; on collection page, if `collection.id` in list, run test (e.g. test “collection grid layout” only on selected collections).
- **Data source:** Use Shopify Admin API (with shop’s OAuth) in RipX backend to **fetch pages**, **fetch products** (with search), and **fetch collections** when building the targeting UI; cache or live call. Store only IDs/handles in RipX; script receives test config including `target_type` and `target_ids` and matches on current page context.

**Summary table (targeting):**

| Target type       | Storage                                                    | Storefront behavior                                                           |
| ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Page list         | `target_type: 'page'`, `target_ids: ['handle1','handle2']` | Activate only when `pathname` matches `/pages/handle` for one of the handles. |
| Product list      | `target_type: 'product'`, `target_ids: [gid or id, ...]`   | Activate on product page when current product ID is in list.                  |
| Collection list   | `target_type: 'collection'`, `target_ids: [id, ...]`       | Activate on collection page when current collection ID is in list.            |
| All / URL pattern | existing `target_type` + custom_rules (url)                | Keep existing behavior; optional “URL pattern” preset (e.g. `/products/*`).   |

**Phasing:** Price display override (Option A) and targeting (page list, product list, collection list) in **Phase 2–3**. Theme/template internal execution and Checkout UI extension in **Phase 3**. Price Lists (B2B) and checkout price (discount path) in **Phase 3–4** as optional.

---

## Full project roadmap (beyond admin)

Research-backed directions for the **entire product**, not only the admin panel:

| Pillar                   | Initiatives                                                                                             | Notes                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Experimentation**      | Test templates, saved targeting presets, multi-goal tests, personalization rules, scheduled start/stop. | Reduces time-to-test; aligns with Phase 4 full test templates and Phase 6 experiment policy. |
| **Analytics**            | Funnel steps, heatmaps, event explorer, custom events, revenue attribution, Bayesian stats.             | Already partially in place; extend with segments, date comparison, export.                   |
| **Integrations**         | GA4, BigQuery export, outbound webhooks, Shopify theme app, headless/API-only.                          | Admin Phase 2 (webhooks, feature flags) supports rollout control.                            |
| **Developer experience** | Public API (tests, events, assignments), script install guide, SDK or npm package, webhook signing.     | Enables headless and custom dashboards; document in Docs.                                    |
| **Performance & scale**  | Event ingestion batching, aggregation jobs, retention policies, read replicas, per-tenant quotas.       | Admin Phase 2 jobs list and Phase 6 metering support operations.                             |
| **UX & onboarding**      | Setup wizard, in-app hints, empty states with CTAs, mobile-responsive layouts, accessibility (a11y).    | Keeps product and admin "same overall" and reduces support load.                             |

Admin phases (2–7) support this by providing configuration, compliance, and platform control so the core product can scale and stay auditable.

**Research depth:** Prioritise experimentation and analytics for user value; integrations and developer experience for adoption; performance and UX for retention. Revisit the roadmap quarterly and adjust phases based on usage and feedback.

**Success metrics (per pillar):** Experimentation — tests created per month, time-to-first-test. Analytics — report views, export usage. Integrations — GA4/BigQuery/webhook adoption rate. Developer experience — API calls, script installs. Performance — p95 latency, job throughput. UX — setup completion, support tickets.

**Advanced research (full project):**

- **Accessibility:** Keyboard navigation for all admin and app flows; focus order and visible focus rings (2px cyan); ARIA labels on icon-only buttons; contrast ratios ≥4.5:1 for body text; screen-reader announcements for list updates and toasts.
- **Technical debt and refactor:** Extract shared hooks (useAdminList, useExportCsv); centralise API error handling and toasts; consider a small design-token layer (e.g. spacing, radius) used by both app and admin; document component usage in Storybook or DocComponents.
- **Competitive alignment:** Feature parity with experimentation platforms (templates, targeting, stats); admin control comparable to SaaS ops panels (audit, config, jobs); roadmap order reflects user value first, then operations and scale.

**Product experimentation (all-in-one) initiatives** — phased so RipX can position as the most advanced all-in-one tool:

| Initiative                                     | Phase | Description                                                                                                                                                                                                                        |
| ---------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------ |
| **Team notes on tests**                        | 2     | Internal notes/hypotheses per test (rich text or markdown); show in test detail and in exports.                                                                                                                                    |
| **Report generation (PDF / shareable)**        | 2     | One-click report: test config, results, charts, recommendation; PDF or shareable link (optional expiry).                                                                                                                           |
| **Multivariate (4–6+ variants)**               | 2     | Clarify or raise variant cap per test; ensure analytics and allocation scale.                                                                                                                                                      |
| **Experiment groups (mutual exclusion)**       | 3     | Groups (e.g. checkout, hero); at most one test per group per user; assignment and conflict detection respect groups.                                                                                                               |
| **Global holdout**                             | 3     | Optional org/tenant-level % of traffic never in any test; analytics compare in-tests vs global holdout over time.                                                                                                                  |
| **Sticky bucketing and cohort controls**       | 3     | Document and optionally expose “stick user to variant for N days” or “by cohort” in UI.                                                                                                                                            |
| **Date-range and product-level analytics**     | 3     | Compare performance across date ranges; optional dimensions (e.g. product_id) for e‑commerce.                                                                                                                                      |
| **Idea repository and shared calendar**        | 3     | Central backlog of test ideas; calendar/timeline view of tests; link idea → test.                                                                                                                                                  |
| **Dynamic allocation (bandit) mode**           | 3     | Optional test mode: traffic shifts toward better-performing variants (Thompson sampling or UCB); document when to use vs fixed split.                                                                                              |
| **Flicker-free / edge execution**              | 3     | Document and optionally support variant-at-edge or server-side before HTML; reduce FOOC and layout shift.                                                                                                                          |
| **Prioritization and program impact**          | 4     | Prioritize ideas (score/vote, pipeline); program-level view of experiment impact on key metrics over time.                                                                                                                         |
| **Always-valid inference**                     | 6     | Valid p-values and CIs at any stop time for continuous monitoring and early stopping; align with experiment policy.                                                                                                                |
| **Shopify price tests (display override)**     | 2–3   | Storefront script + theme block override displayed price per variant; target products via target_ids; document display vs checkout; optional B2B Price List later.                                                                 |
| **Targeting: page + product/collection lists** | 2–3   | UI: fetch Shopify pages/products/collections (Admin API); save target_type + target_ids; script activates only on matching page/product/collection.                                                                                |
| **Theme/template tests (internal)**            | 3     | Split-theme redirect or proxy; template/section variant injection; wizard for theme, template, section, variants; run entirely from RipX.                                                                                          |
| **Checkout UI extension**                      | 3     | Extension fetches RipX assignment; renders A/B content in checkout slots; Plus; track conversion; document limitations.                                                                                                            |
| **Heatmap over page image**                    | 2–3   | Screenshot capture per page_url; store image; HeatmapView shows screenshot with click (and optional scroll) overlay; normalize coords to reference viewport.                                                                       |
| **Visual editor (code pane)**                  | 2     | Editor route: iframe preview + code pane (CSS/JS per variant); persist to variant config; storefront script applies customCss/customJs.                                                                                            |
| **Visual editor (visual pane)**                | 3     | Element picker on preview; visual mutations (setText, setAttr, setStyle, hide/show); persist visualEdits; storefront applier; optional viewports.                                                                                  |
| **Experiment quality score**                   | 6     | Single score (e.g. 0–100) from hypothesis, audience, sample size, SRM, allocation, tracking, duration; color bands; show in Test detail and Analytics.                                                                             |
| **Pre-launch QA checklist**                    | 3–4   | ~~In-app checklist before Start~~ **Done:** Test detail "Start Test" opens Pre-launch checklist modal (hypothesis, goal, audience, tracking verified, staging/force variation); optional checkboxes, "Continue to start" / Cancel. |
| **Force variation (QA)**                       | 3     | ~~Cookie or query param~~ **Done:** GET /api/track/variant?force_variant=control                                                                                                                                                   | id  | name; persists assignment for goal verification. |
| **CWV monitoring**                             | 6     | Core Web Vitals (FCP, LCP, CLS) monitoring and alerts when tests regress performance; optional.                                                                                                                                    |
| **Cross-campaign analysis**                    | 6     | Detect interaction effects when users are in multiple tests; overlap analysis; Phase 6 data quality.                                                                                                                               |

These sit alongside the admin Phase 2–4 tables; implement in the same backend-first way and reuse existing services (e.g. conflict detection, analytics). See § Additional research and § Shopify-native integration plan for full idea list and mapping.

---

## Visual editor (side-by-side with code editor) and heatmap over page image

Research-backed plan to match and exceed **VWO** and **Convert**: a **visual editor** alongside a **code editor**, and **heatmaps over the actual page image** (screenshot) so RipX can compete as the best all-in-one A/B tool.

---

### Visual editor: side-by-side with code (like VWO / Convert)

**Goal:** No-code and low-code users create variations visually; power users can switch to or combine with code. Both views edit the same variation so the platform serves all skill levels.

#### What VWO and Convert do

- **VWO:** Visual Editor = WYSIWYG: change images/video, edit text, move/resize, hide/show, rearrange, modify styles/HTML, add elements; preview variations; optional Code Editor for complex changes; goals can be added in the editor; AI Copilot can generate variations.
- **Convert:** Visual Editor = no-code (drag-drop, text formatting, HTML block for media); generates HTML/CSS automatically; Code Editor for JavaScript/CSS (selectors, external scripts, custom events); choice between “edit code generated by visual” vs “custom JS that runs when experiment fires”.

#### RipX vision: visual + code side-by-side

| Capability            | Description                                                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dual pane**         | Left: live preview of the **target page** (iframe or embedded storefront). Right: **Visual** tools (element picker, style panel, content edit) and/or **Code** (CSS/JS per variant). Toggle or split: “Visual only”, “Code only”, “Visual + Code”. |
| **Element selection** | Click on preview to select element; breadcrumb shows DOM path; panel shows editable props (text, src, style, visibility, order). Changes apply in real time to preview.                                                                            |
| **Visual actions**    | Edit text, replace image/video URL, change color/font/size/margin, hide/show, reorder (drag-drop), add block (HTML snippet or widget). Optional: undo/redo, edit history.                                                                          |
| **Code editor**       | Per-variant or global: CSS (selector + rules), JavaScript (runs on experiment load). Option to “View code generated by visual” so power users can tweak.                                                                                           |
| **Targeting**         | Same as today: URL/page, product, collection; test runs on storefront via script. Editor loads the **target URL** (storefront or staging) so preview matches live.                                                                                 |
| **Goals**             | Add conversion goals from the editor (click selector, URL, or custom event) so setup is in one place.                                                                                                                                              |
| **Preview viewports** | Desktop / tablet / mobile toggle so variations are checked at different sizes.                                                                                                                                                                     |

#### Implementation process and tech

| Step                       | What                                                                                                                                                             | Tech / approach                                                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Editor shell**        | New route e.g. `/tests/:id/editor` or `/tests/new/editor`; full-screen layout: URL bar (target page), left preview, right panel (Visual                          | Code tabs or split).                                                                                                                                                                                                                                                   | React; Polaris or custom layout; state for selected element, variant, and changes. |
| **2. Preview pane**        | Load target page in iframe (storefront URL with optional auth or public page). Sandbox iframe for security; postMessage or same-origin if app is on same domain. | `iframe` with `sandbox="allow-scripts allow-same-origin"`; target URL from test’s target_type/target_id (e.g. product page). For Shopify, use storefront URL; consider app proxy or CORS for authenticated preview if needed.                                          |
| **3. Element picker**      | Overlay on iframe (or inject script into iframe) to highlight hovered/clicked element and return selector/path.                                                  | Cross-origin: inject script via storefront (RipX script in “edit mode” param); script sends element path/selector to parent. Same-origin: contentDocument query. Use a **selector engine** (e.g. unique-id injection, or CSS path) to persist which element to change. |
| **4. Persist changes**     | Store “variation” as list of mutations: e.g. `{ selector, action: 'setText'                                                                                      | 'setAttr'                                                                                                                                                                                                                                                              | 'setStyle'                                                                         | 'replaceHtml' | 'hide' | 'show', value }`. Backend stores in test variant `config`or new`visual_edits` JSON. Storefront script applies these when test runs. | Variant `config.visualEdits = [{ selector, action, value }, ...]` or separate table; script on storefront applies in order (querySelector + apply). |
| **5. Code pane**           | Monaco or CodeMirror for CSS/JS; optional “generated CSS” from visual edits so code and visual stay in sync.                                                     | `@monaco-editor/react` or CodeMirror; save to variant `config.customCss`, `config.customJs`.                                                                                                                                                                           |
| **6. Shadow DOM / iframe** | Optional: support editing inside iframes and Shadow DOM (e.g. Shopify sections). Document limits (e.g. closed Shadow DOM not editable).                          | Like AB Tasty: allow editing in open Shadow DOM and same-origin iframes; selector includes shadow host path.                                                                                                                                                           |
| **7. Multi-viewport**      | Resize preview to 320 / 768 / 1280 or similar; re-run element picker logic if needed.                                                                            | CSS or iframe resize; optional device toolbar.                                                                                                                                                                                                                         |

**Phasing:** Phase 1 (MVP): Editor shell + iframe preview + manual “code” variant (CSS/JS only). Phase 2: Element picker + visual mutations (setText, setAttr, setStyle, hide/show) + persist to variant config + storefront applier. Phase 3: Add block, reorder, undo, viewport toggle; optional “generated code” view. Phase 4: AI-assisted variations (Phase 7 AI) and advanced Shadow DOM/iframe support.

**Dependencies:** Storefront script must support “apply visual edits” from variant config (new block in script). Backend: test variant schema allows `visualEdits` and/or `customCss`/`customJs`. No new tables if stored in existing `variants` JSON.

---

### Heatmap over actual page image (original-style heatmap)

**Goal:** Show click (and optionally scroll) heatmap **overlaid on a screenshot of the targeted page**, not only a grid or list—like Hotjar/VWO so users see “where people clicked on this page.”

#### Current RipX heatmap

- **Today:** Click data aggregated into 10×10 grid buckets; scroll depth as bar chart; per page_url and variant. Data: `x`, `y`, `viewport_width`, `viewport_height`, `page_url`, `event_type` (click/scroll). **Gap:** No screenshot; heatmap is not over the real page layout.

#### Target: heatmap on page screenshot

| Capability          | Description                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Page screenshot** | One reference screenshot per (page_url, viewport or “default”) per test or per shop. Screenshot = what the page looks like so heatmap aligns to it. |
| **Click overlay**   | Aggregate clicks (normalized to reference viewport); render as semi-transparent heat layer (e.g. gradient from cool to hot) over the screenshot.    |
| **Scroll overlay**  | Optional: scroll-depth gradient (e.g. top = 100%, fading by depth) or a thin bar on the side.                                                       |
| **Interaction**     | Zoom/pan if image is large; toggle heat on/off; filter by variant and date (reuse existing HeatmapView filters).                                    |

#### Implementation process and tech

| Step                               | What                                                                                                                                                                                                                               | Tech / approach                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Screenshot capture**          | Produce a screenshot for a given `page_url` (and optional viewport).                                                                                                                                                               | **Option A:** Backend job (Puppeteer/Playwright): headless browser, navigate to storefront URL (with shop domain), wait for load, `page.screenshot({ fullPage: true })` or viewport-sized; store file in object storage (S3, GCS) or DB (blob). **Option B:** Third-party (e.g. Screenshot API, Microlink); call from backend, store URL or blob. **Option C:** Merchant uploads screenshot (manual). Prefer A for automation; viewport e.g. 1280×720 for consistency. |
| **2. Storage**                     | Store screenshot per (shop_domain, page_url, viewport_key) so heatmap view can fetch it.                                                                                                                                           | Table `heatmap_page_screenshots (shop_domain, page_url, viewport_width, viewport_height, image_url or image_blob, created_at)` or reuse key_value_store with key pattern. Object storage + URL in DB is better for large images.                                                                                                                                                                                                                                       |
| **3. Normalize click coordinates** | Clicks today have x, y, viewport_width, viewport_height. Normalize to reference viewport (e.g. 1280×720): `x_norm = (x / viewport_width) * 1280`, same for y. Aggregate normalized clicks into 2D bins or keep for canvas overlay. | Backend: in `getClickHeatmap` or new `getClickHeatmapForOverlay`, return list of (x_norm, y_norm, count) or pre-rendered heatmap image. Or return raw normalized points and render client-side.                                                                                                                                                                                                                                                                        |
| **4. Render overlay**              | Frontend: image (screenshot) as background; canvas or SVG on top with heat layer. Use gradient (e.g. blue→red) and radius per point so overlapping clicks “burn” hotter.                                                           | **heatmap.js** (or similar): container div with background-image = screenshot URL; heatmap instance with same dimensions; set data from API (normalized x, y, count). Or canvas: draw screenshot, then draw circles with gradient and opacity.                                                                                                                                                                                                                         |
| **5. Trigger capture**             | When to capture? On first heatmap view for that page; or cron “refresh screenshots for active tests”; or “Update screenshot” button.                                                                                               | API `POST /api/analytics/tests/:id/heatmap/capture-screenshot` (body: page_url, viewport); job queue runs Puppeteer, uploads, saves record. Feature-flag or Phase 2.                                                                                                                                                                                                                                                                                                   |
| **6. Security / CORS**             | Storefront may require auth or be on different domain. Headless must hit public URL or use cookie.                                                                                                                                 | For Shopify: use storefront URL (public); if store is password-protected, document “screenshot may show login page” or optional merchant token.                                                                                                                                                                                                                                                                                                                        |

**Phasing:** Phase 1: Backend endpoint to capture screenshot (Puppeteer) + storage; API to get screenshot URL for (test, page_url). Phase 2: HeatmapView enhancement: when screenshot exists, show image + overlay (heatmap.js or canvas); when not, keep current grid/scroll view. Phase 3: “Update screenshot” button; optional full-page capture and scroll overlay.

**Dependencies:** Puppeteer (or Playwright) in backend; object storage or blob column; HeatmapView gets screenshot URL from new API and renders overlay. Existing heatmap_events and getClickHeatmap stay; add normalization and overlay API or response shape.

---

### How this helps RipX beat the rest

| Feature           | RipX (after plan)                                                                                       | Typical competitors                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Visual + code** | Same variation editable in visual and code; side-by-side; generated code visible; Shopify + standalone. | VWO/Convert: visual + code; RipX matches and adds Shopify-native + one platform (test + analytics + heatmap). |
| **Heatmap**       | Heatmap over real page screenshot; click + scroll; per variant and page; no separate tool.              | Hotjar/VWO: screenshot heatmaps; RipX integrates in same product as tests and analytics.                      |
| **All-in-one**    | Create (visual/code) → Run → Analyze (incl. heatmap on page) → Act; one login, one billing.             | Many teams use separate tools for testing vs heatmaps; RipX reduces tool sprawl.                              |

**Implementation order (suggested):** (1) Heatmap over page image (smaller scope, reuses existing heatmap data). (2) Visual editor MVP (iframe preview + code pane + persist CSS/JS to variant). (3) Visual editor Phase 2 (element picker + visual mutations). (4) Polish (viewports, undo, AI later).

---

### Add to roadmap (initiatives table)

| Initiative                      | Phase | Description                                                                                                                                                                                                                                                                   |
| ------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Heatmap over page image**     | 2–3   | **Foundation done:** API returns overlay (normalized points 1280×720) + screenshotUrl from key_value_store; HeatmapView shows screenshot + click overlay when both present. Screenshot URL via Admin KV (key heatmap_screenshot.shop.page); Puppeteer capture optional later. |
| **Visual editor (code pane)**   | 2     | **Done:** Editor route /tests/:id/editor with iframe preview URL + code pane (CSS/JS per variant); PUT /api/tests/:id/variants/codes accepts customCss/customJs; storefront script applies customCss/customJs (and legacy code).                                              |
| **Visual editor (visual pane)** | 3     | Element picker on preview; visual mutations (setText, setAttr, setStyle, hide/show); persist visualEdits; storefront applier; optional add block, reorder, viewports.                                                                                                         |
| **Visual editor (advanced)**    | 4     | Undo/history; “generated code” view; optional Shadow DOM/iframe editing; AI-assisted variations (Phase 7).                                                                                                                                                                    |

---

## Email token login and re-verification (security)

This section outlines research and a recommended approach for **email-based token login** with **expiry and periodic re-verification**, suitable for higher security (e.g. admin, standalone app, or API key lifecycle).

### Current auth in RipX

- **Shopify:** OAuth flow → `shop_sessions` (access token); requests authenticated by shop domain + server-side session. No built-in expiry; revocation is via app uninstall or admin.
- **Standalone:** API key (header or Bearer); tenant or account lookup. Keys are long-lived; no expiry or re-verify today.
- **Admin:** Either env (`RIPX_ADMIN_SHOP_DOMAINS`, `ADMIN_API_KEY`) or DB `users.role` (admin/superadmin). No email re-verification.

### Research summary (email tokens and re-verification)

- **Magic link / one-time tokens:** Industry practice is **short-lived** (5–15 minutes) and **single-use**. Use CSPRNG (`crypto.randomBytes`), store a hash server-side, invalidate on first use. Prevents replay and limits exposure if the link is intercepted.
- **Session vs long-lived token:** For “30-day” access, prefer a **session** (or access token) that expires in 30 days, plus a **refresh token** (longer-lived, stored securely) or a **re-verification step** every 30 days. Avoid a single 30-day token in a link (high risk if leaked).
- **Re-verification:** “Re-verify via email every 30 days” means: when the session or token is about to expire (or has expired), require the user to prove control of the same email again (e.g. magic link or OTP), then issue a new session/token. This limits damage from stolen sessions and keeps access tied to current email control.
- **Security extras:** Rate-limit magic-link requests per email/IP; validate `aud`/`iss` if using JWT; use HttpOnly, SameSite cookies for web sessions; avoid open redirects in verification links; consider CAPTCHA on “send link” to reduce abuse.

### Options for RipX

| Option                                 | Description                                                                                                                                               | Pros                                                    | Cons                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| **A. Magic link only (passwordless)**  | User enters email → receives 5–15 min link → click logs in; issue 30-day session (cookie or JWT).                                                         | No passwords; good UX.                                  | Requires email service; session still long-lived unless combined with B. |
| **B. 30-day token + email re-verify**  | Access token (or session) expires in 30 days; before/after expiry user must complete email verification (magic link or OTP) to get a new token or extend. | Balances security and UX; limits impact of token theft. | More flows to build and test.                                            |
| **C. Admin-only re-verify**            | Admin access (DB role or env) requires email re-verification every 30 days; app users unchanged.                                                          | Focused on highest privilege.                           | Two different auth stories (admin vs app).                               |
| **D. API key expiry + email re-issue** | API keys expire (e.g. 30 days); user re-verifies by email to generate a new key or extend.                                                                | Good for standalone/headless; keys not forever-lived.   | Key rotation UX and backward compat (old key until expiry).              |

### Recommended approach for this project

- **Unified model:** Introduce a single **email verification** capability (magic link or OTP, short-lived token 5–15 min, single-use, rate-limited). Use it for:
  1. **Optional passwordless login** for standalone (no Shopify): magic link → issue **30-day session** (cookie or JWT) + optional **refresh token** (e.g. 90 days) to extend without email each time.
  2. **30-day re-verification:** When the 30-day session (or admin session) is near expiry or expired, require the user to complete **email verification again**; on success, issue a new 30-day session (and optionally refresh token). No new password; just “prove you still control this email.”
  3. **Admin:** Tie admin access to the same identity; optionally require re-verification every 30 days for admin-only sessions (or any session that can access admin).
  4. **API keys (optional):** Allow API keys with **expiry** (e.g. 30 days); “re-issue” or “extend” requires email verification; existing keys remain valid until expiry for backward compat.

- **Why this fits:** Keeps Shopify OAuth as-is for Shopify merchants; adds a clear path for standalone and admin security without maintaining passwords; 30-day expiry + re-verify is a good balance of security and friction; short-lived verification tokens follow best practices.

### Implementation hints

- **Tables:** e.g. `email_verification_tokens` (token_hash, email, purpose: `login` | `reverify` | `api_key_reissue`, expires_at, used_at, created_at); optionally `sessions` (id, user_id/shop_domain, token_hash, expires_at, refresh_token_hash) if using DB-backed sessions.
- **Flow:** (1) POST `/api/auth/send-login-link` or `/api/auth/send-reverify-link` (body: email; rate-limited). (2) Generate token (CSPRNG), store hash, set expires_at (e.g. 15 min). (3) Send email with link containing token (or signed JWT). (4) GET/POST `/api/auth/verify-email?token=...` validates token (single-use, not expired), then creates/extends session and returns redirect or JWT. (5) Middleware for protected routes checks session expiry; if expired or &lt; N days left, require re-verify (redirect or 401 with `code: REVERIFY_REQUIRED`).
- **Email:** Use existing or new provider (SendGrid, Resend, SES); templates for “Log in to RipX” and “Re-verify your email for RipX”; no sensitive data in the link except the one-time token.
- **Admin:** If admin is via shop domain + role, “re-verify” can be: send magic link to the email associated with that shop (e.g. from `users.profile`); on verify, extend admin session or set a `last_verified_at` and allow access for 30 days.

This gives a secure, research-aligned path to **email token login**, **30-day expiry**, and **re-verification via email** suitable for RipX’s multi-platform setup.

---

## Research summary and design principles

### UI and layout (same overall)

Admin must look and behave like the rest of RipX so operators feel they are in one product:

- **Design system:** Use the same CSS variables (`--futuristic-cyan`, `--futuristic-violet`, `--spacing-*`, `--radius-lg`, `--border-secondary`, `--text-primary`, etc.) and gradient accents (card top bar, page header underline).
- **Layout:** Admin content area should respect the same max-width and padding as main app content; sidebar matches main Sidebar styling (gradient bar, nav item hover/active states).
- **Components:** Polaris Page, Card, DataTable, Badge, Button, Modal, Banner—styled via global overrides and admin-specific classes so tables, empty states, and pagination match Dashboard, Settings, and Test list.
- **Dark theme:** All admin blocks (sidebar, stat cards, tables, modals) must support `[data-theme='dark']` with the same token-based approach as the rest of the app.

### Implementation approach

- **Backend first:** New capabilities require `/api/admin/*` routes, `requireAdmin` middleware, and audit logging for write actions. Reuse existing services and models where possible.
- **Spec as source of truth:** For each feature, refer to the spec section for workflows, data shape, and edge cases before implementing.
- **Phased rollout:** Ship by phase; each phase should leave the admin panel stable and usable.

### Admin UX patterns (head, foot, title, description, buttons)

- **Head:** A content-area header (breadcrumb) shows "Admin / [Section]" so operators always know where they are; "Admin" is clickable back to Overview. Sidebar header includes a short subtitle (e.g. "Control panel") for clarity.
- **Foot:** A content-area footer provides "RipX Admin", links to System health and Docs, and optional version. Sidebar footer repeats the brand and a clear "Back to app" action so exit is obvious.
- **Title and description:** Each admin page uses Polaris `Page` with a clear `title` and `subtitle` (one-line description). Title is prominent (1.5rem, bold); subtitle is muted and max-width for readability. A gradient accent bar under the header matches the app. The **main section** (first content block) uses an intro panel (`.adminMainSection`) with left accent border and subtle background so the page purpose is obvious.
- **Back action:** The back arrow/link (e.g. "Admin" or "App") in the page header is styled for clarity: cyan color, 500 weight, comfortable padding and border-radius, hover background, and consistent icon size so it reads as the primary navigation out of the current page.
- **Buttons:** Primary actions use the same gradient accent (cyan/teal); secondary and plain use cyan border/text and light hover. Destructive actions (Suspend, Lock, Stop) use critical tone and red border. Header actions have consistent border-radius, weight, and min-height; toolbar and pagination buttons match. Slim buttons in table cells for View/Set role/Lock etc.

---

## Current state (MVP admin and product)

- **Admin (MVP complete):** Users (list, search, status filter, lock/unlock, set role, export CSV, user detail modal), Domains (list, status filter, search, suspend/unsuspend, domain detail modal), Tests (list, filters by status/type/domain, view link, stop, page size), Audit log (list, entity/shop filters, CSV export, page size), Platform stats (overview with quick links: System health, Audit log, Export audit CSV), Admin auth (role + env + API key), separate admin rate limiter. Backend: `/api/admin/*` with requireAdmin; audit_log for admin actions; users.role/status; tenants.status; GET /admin/domains/:domain for detail.
- **Product (complete):** Test CRUD, TestCreator/TestWizard (price, content, shipping, offer, theme, checkout, template, split-url, onsite-edit, **Combination in UI**), Test list/detail, Analytics (per-test + overview), Export (CSV/JSON/BigQuery), Promo links, Settings, Profile, Connect, **dedicated Notifications page** + API + TopBar. Storefront script and app proxy; theme app embed loads script only (no checkout extension). Maintenance mode and announcement banner (key_value_store) shown in app layout when set.
- **Not yet implemented:** See § Feature audit (add/update/upgrade) and Phase 2–7 tables. **Explicitly deferred:** Phase 3 — Email token login and re-verification (§ Email token login and re-verification); Phase 4 — MFA for admins; Phase 5 — SSO/SAML, SCIM, data retention, permission groups, usage billing, etc.; Phase 6 — Experiment policy, test monitoring, data quality, SLA/status, etc.; Phase 7 — AI copilot, AI-generated variations, AI policy. Product initiatives (experiment groups, global holdout, visual editor, heatmap over page image, etc.) are in the initiatives table with phases.

---

## Phase 2 – Configuration and operations

| Feature                     | Description                                                                                                                                                                                                                                                                   | Dependencies                             | Spec ref   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------- |
| **Shop settings override**  | ~~Admin override of min_sample_size, confidence_level, auto_stop, webhook URL/events per domain.~~ **Done:** GET/PUT /api/admin/shop-settings-overrides/:shopDomain; Admin Shop settings overrides page; overridden*by_admin*\* in shop_settings.                             | shop_settings columns or key_value_store | §3.3       |
| **Feature flags**           | ~~Global flags: Heatmaps, Export, GA4, BigQuery, webhooks, personalization, significance alerts, guardrails, scheduled tests. Admin UI: list, toggle with audit.~~ **Done:** flag.\* keys in key_value_store; Admin Feature flags page (list, toggle via PUT /admin/kv/:key). | key_value_store or admin_config table    | §3.2       |
| **Key-value store UI**      | ~~Admin list/get/set/delete for keys.~~ **Done:** GET/PUT/DELETE /api/admin/kv (list with prefix, get/set/delete by key); Admin Key-value store page; audited.                                                                                                                | key_value_store table                    | §3.4       |
| **Jobs list and control**   | ~~List Bull queues; Retry failed, Trigger manual run.~~ **Done:** GET /api/admin/jobs (counts); POST /api/admin/jobs/:queueName/retry-failed, POST /api/admin/jobs/:queueName/trigger; Admin Jobs page.                                                                       | Redis/Bull                               | §4.1, §4.2 |
| **Outbound webhooks admin** | ~~List per-domain webhook config; override URL/events or disable.~~ **Done:** GET/PUT /api/admin/webhooks (list, update per shop_domain); Admin Webhooks page.                                                                                                                | shop_settings, optional delivery log     | §2.8       |
| **Rate limit overrides**    | ~~Per-domain overrides for track_max, api_max; admin UI table.~~ **Done:** key_value_store; GET/PUT /api/admin/rate-limit-overrides; Admin Rate limit overrides page.                                                                                                         | key_value_store or admin_config          | §3.1, §7.2 |

---

## Phase 3 – Support and compliance

| Feature                                   | Description                                                                                                                                                                                                                                                                                                                                                                             | Dependencies                                        | Spec ref        |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------- |
| **System-wide notifications**             | ~~Create announcement; mark as read; delete.~~ **Done:** GET/POST/DELETE /api/admin/notifications; Admin Notifications page (create, list, delete).                                                                                                                                                                                                                                     | notifications table                                 | §2.5            |
| **Promo links list + revoke**             | ~~List promo links; revoke by test or domain.~~ **Done:** GET /api/admin/promo-links, POST /api/admin/promo-links/revoke (body: test_id or shop_domain); Admin Promo links page.                                                                                                                                                                                                        | promo_links table                                   | §2.7            |
| **Impersonation**                         | ~~Short-lived token with impersonated_user_id; audit.~~ **Done:** POST /api/admin/impersonate (body: shop_domain) issues 15-min JWT (ripxtype: impersonation, impersonated_shop, admin_id); audited; auth middleware accepts Bearer impersonation JWT and sets req.shopDomain + req.impersonation. Admin Users: "Impersonate (get token)" in user detail modal; copy token for API use. | JWT or session extension                            | §8, §9          |
| **Data export/delete (GDPR-style)**       | ~~Export user data~~ **Done:** GET /api/admin/users/:shopDomain/export (profile, domains, tests metadata); Admin Users modal "Export data (GDPR)" button; audited. Soft delete + anonymize and cascade remain for later.                                                                                                                                                                | audit_log, users soft delete                        | §6.3            |
| **Maintenance mode**                      | ~~Global or per-domain; script returns minimal JSON; app shows banner.~~ **Done:** Backend (maintenanceMode.js, track 503, health returns maintenance + optional config.maintenance_message). App shows banner. Admin Maintenance page: toggle (Off / Global / Per-domain) + optional message; GET/PUT /api/admin/maintenance; domain comparison case-insensitive.                      | key_value_store, script/track read                  | §3.1            |
| **Block list**                            | ~~Domains that get 403 on script/track with optional message; admin UI add/remove.~~ **Done:** blockListCheck in track; getBlockListMessage (key block_list.<domain>); domain normalized (strip protocol) on lookup and on KV set; Admin Block list page.                                                                                                                               | key_value_store or block_list table                 | §3.1, §7.2      |
| **Usage export**                          | ~~CSV/Excel by domain~~ **Done:** GET /api/admin/usage-export (start_date, end_date, format=csv\|json); Admin "Usage export" page with date range and CSV download. By-user aggregation can be added later.                                                                                                                                                                             | events, test_assignments, tests                     | §5.2            |
| **Force variation (QA)**                  | ~~Query param to force control/variant~~ **Done:** GET /api/track/variant accepts `force_variant=control` or variant id or variant name; returns that variant and persists assignment so QA can verify goal firing.                                                                                                                                                                     | track, test_assignments                             | § Pre-launch QA |
| **Email token login and re-verification** | **Foundation done:** POST /api/auth/send-login-link (body: email), GET /api/auth/verify-email?token= (returns 30d JWT). Table email_verification_tokens (migration 033); stub email (log) until provider set. Frontend and auth middleware acceptance of email_session JWT remain for full flow.                                                                                        | email_verification_tokens, sessions, email provider | —               |

---

## Phase 4 – Full platform control

| Feature                           | Description                                                                                                                                                                                                                                                                                                      | Dependencies                       | Spec ref |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------- |
| **Accounts (multi-store) admin**  | ~~List accounts; detail with domain list.~~ **Done:** GET /api/admin/accounts, GET /api/admin/accounts/:id; Admin Accounts page. Add/remove domain, change owner, merge (advanced) remain optional.                                                                                                              | accounts table                     | §2.3     |
| **Targeting presets admin**       | ~~List presets across domains; view JSON; delete with audit.~~ **Done:** GET /api/admin/targeting-presets, DELETE /api/admin/targeting-presets/:id; Admin Targeting presets page.                                                                                                                                | targeting_presets                  | §2.6     |
| **Shop sessions (Shopify)**       | ~~List shop_sessions; revoke session.~~ **Done:** GET /api/admin/shop-sessions, DELETE /api/admin/shop-sessions/:shopDomain; Admin Shop sessions page.                                                                                                                                                           | shop_sessions table                | §2.9     |
| **Incoming webhook events**       | ~~List last N from webhook_events; filter by domain/topic.~~ **Done:** GET /api/admin/webhook-events; Admin Webhook events page.                                                                                                                                                                                 | webhook_events table               | §2.10    |
| **Conflict detection view**       | ~~Per domain: list overlapping running tests; link to stop test.~~ **Done:** GET /api/admin/conflicts; Admin Conflicts page.                                                                                                                                                                                     | conflictDetectionService           | §2.11    |
| **Test health bulk view**         | ~~List tests with health score; filter by health level, domain, status.~~ **Done:** GET /api/admin/test-health; Admin Test health page.                                                                                                                                                                          | testHealthService                  | §2.12    |
| **Significance alerts list**      | ~~List significance_alerts; reset alert for a test.~~ **Done:** GET /api/admin/significance-alerts, DELETE (reset); Admin Significance alerts page.                                                                                                                                                              | significance_alerts table          | §2.13    |
| **Full test templates**           | ~~List presets with goal+variants; view/delete.~~ **Done:** Admin Targeting presets lists presets (goal, variants in API); View JSON modal shows segments, goal, variants; DELETE with audit. Edit (PUT) optional later.                                                                                         | targeting_presets                  | §2.14    |
| **Event catalog**                 | ~~Per domain: distinct event_type/event_name with counts.~~ **Done:** GET /api/admin/event-catalog; Admin Event catalog page.                                                                                                                                                                                    | events table                       | §2.15    |
| **Client errors (storefront)**    | ~~If POST /api/track/client-error is persisted: list last N per domain; ack/ignore.~~ **Done:** client_errors table (migration 032); POST /api/track/client-error persists; GET /api/admin/client-errors (shop_domain, limit), DELETE /api/admin/client-errors/:id (dismiss, audited); Admin Client errors page. | client_errors table (optional)     | §2.16    |
| **Consent and script**            | ~~Override consent_required per domain/global; script cache invalidation (bump script_version).~~ **Done:** GET/PUT /api/admin/consent-script; Admin Consent & script page (global/per-domain, consent_required, script_version).                                                                                | key_value_store                    | §3.5     |
| **Analytics aggregation trigger** | ~~Admin view last run; "Trigger aggregation now".~~ **Done:** GET /api/admin/aggregation (last_run), POST /api/admin/aggregation/trigger (date); Admin Aggregation page.                                                                                                                                         | timeSeriesService, key_value_store | §3.6     |
| **MFA for admins**                | Require MFA for admin users.                                                                                                                                                                                                                                                                                     | Auth provider or custom            | §6.1     |
| **IP allowlist (optional)**       | ~~Restrict admin access to certain IPs.~~ **Done:** When ADMIN_IP_ALLOWLIST (comma-separated IPs) is set, requireAdmin checks client IP (req.ip / X-Forwarded-For); 403 if not in list. Documented in .env.example.                                                                                              | env or admin_config                | §6.1     |
| **Announcement banner**           | ~~HTML/text + dismissible; show on app layout when set.~~ **Done:** key_value_store `config.announcement_banner`; app shows dismissible banner; GET/PUT /api/admin/announcement-banner; Admin "Announcement banner" page.                                                                                        | key_value_store, app layout        | §7.3     |
| **Terms/Privacy URLs**            | ~~Store in key_value_store; show in app/Connect footer.~~ **Done:** GET/PUT /api/admin/config/legal; Admin Legal page; LegalFooter in app/Connect; key_value_store config.terms_url, config.privacy_url.                                                                                                         | key_value_store                    | §7.3     |

---

## Phase 5 – Advanced (enterprise and scale)

| Feature                       | Description                                                                                                      | Spec ref |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| **SSO / SAML**                | Optional SSO for admin or tenant users (Okta, Azure AD).                                                         | §12      |
| **SCIM provisioning**         | User/group sync from IdP for large teams.                                                                        | §12      |
| **Currency / locale**         | Per-domain or per-account currency and locale for revenue/dates.                                                 | §12      |
| **Data retention policy**     | Auto-delete or anonymize events/assignments older than N days; admin sets retention_days; job runs periodically. | §12      |
| **Permission groups**         | Multiple roles (viewer, editor, admin) per account; admin manages groups and assignments.                        | §12      |
| **Usage-based billing hooks** | Emit usage events (MTU, events/month, tests) to billing provider; admin sees billing status per account.         | §12      |
| **Global goal templates**     | Admin-defined goal templates (e.g. "Revenue + Add to cart") for all domains.                                     | §12      |

---

## Phase 6 – Statistical governance and observability

| Feature                                        | Description                                                                                                                                        | Spec ref |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Experiment policy**                          | Org-level defaults: default duration, min sample size, sequential testing, significance level; optional strict policy (no override by non-admins). | §13.1    |
| **Test monitoring (SRM, crossover, exposure)** | Per-test: SRM status, crossover count, exposure chart; "Tests with health issues" filter.                                                          | §13.2    |
| **Guarded rollouts / kill switch**             | Auto-rollback if guard metric regresses; admin kill switch to stop test and revert.                                                                | §13.2    |
| **Data quality**                               | Bot filtering (UA/IP), outlier caps (winsorization), IP exclude list; admin "Data quality" page.                                                   | §13.3    |
| **Tenant isolation and SOC2-style**            | Document tenant guard; composite indexes; RBAC; per-tenant quotas; audit retention.                                                                | §13.4    |
| **Privacy and GDPR**                           | PII anonymization options; data residency; retention UI.                                                                                           | §13.5    |
| **Usage metering and billing**                 | Meters (events/month, MTU, tests); idempotent feed to billing; quota vs usage table.                                                               | §13.6    |
| **SLA and status page**                        | Uptime (last 30d), incidents (RFO), scheduled maintenance; optional public status page.                                                            | §13.7    |
| **Rollback and change history**                | Test rollback + history; feature flag history; key-value versioning.                                                                               | §13.8    |

---

## Phase 7 – AI and experimentation (future)

| Feature                      | Description                                                                                       | Spec ref |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| **AI copilot / agents**      | Feature flag (global/per domain), usage quotas, audit of AI-suggested changes.                    | §13.9.1  |
| **AI-generated variations**  | Enable/disable per domain; rate limits; log prompts and generated config (no PII to third party). | §13.9.2  |
| **LLM / prompt experiments** | If supported: assignment, metrics, cost/latency by variant; admin visibility.                     | §13.9.3  |
| **AI insights**              | Feature flag, usage caps, audit of insights delivered.                                            | §13.9.4  |
| **AI policy**                | Allowed actions, guardrails, which provider (OpenAI, Anthropic).                                  | §13.9.5  |

---

## Handling issues: reliability, failure modes, and data quality

So the plan **can handle all issues** that experimentation platforms typically face: reliability, failure recovery, data quality, and operational safety.

### What RipX already does

- **Validation:** Track: required fields, UUID test_id, domain length, tenant exists and not suspended; test create/update: abTestEngine.validateTest, conflict check, holdout and allocation checks. Central error handler (requestId, structured log, optional Sentry).
- **Access control:** Suspended/blocked tenants get 403 on track and script; admin lock/suspend users and domains.
- **Data quality (in-product):** SRM detection in analytics and test health; conversion dedup (e.g. by order_id); guardrail processor can auto-stop tests when a variant regresses.
- **Operations:** Conflict detection (overlapping tests); scheduled start/stop jobs; archive, significance alert, auto-stop, guardrail jobs (Bull); audit log for admin actions.

### Failure modes and mitigations

| Failure mode                    | Risk                                                        | Current mitigation                                                        | Plan (add or strengthen)                                                                                                              |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Sample ratio mismatch (SRM)** | Unequal traffic across variants; invalidates results.       | SRM detection in analytics and testHealthService; threshold p &lt; 0.001. | Phase 6: Test monitoring (SRM status, exposure chart); "Tests with health issues" filter; optional sequential SRM checks.             |
| **Assignment skew / cache**     | CDN or proxy serving one variant only (e.g. cache key bug). | Sticky assignment in DB; script fetches from backend.                     | Document: script must not be cached per-user; app proxy cache policy; Phase 6 monitoring.                                             |
| **Script/API down**             | Storefront gets no assignment or events fail.               | Track returns 4xx/5xx; script can fall back to control.                   | Document graceful degradation (show control on error); optional storefront retry with backoff; Phase 6 SLA/status page.               |
| **Job failures**                | Scheduled start/stop or guardrail not running.              | Bull queues; jobs in code.                                                | Phase 2: Jobs list and Retry failed; Phase 6: alerting on failed job count.                                                           |
| **Bad or duplicate events**     | Inflated conversions, wrong variant.                        | Dedup by order_id; variant_id from assignment.                            | Phase 6: Data quality (bot filtering, outlier caps, IP exclude); event validation at ingest optional.                                 |
| **Rollback / emergency stop**   | Need to stop test and revert to control.                    | Manual stop in UI; personalization/rollout.                               | Phase 6: Guarded rollouts / kill switch; Rollback and change history.                                                                 |
| **Tenant abuse / overload**     | One domain floods track or API.                             | Suspended check; no per-domain rate limit in code yet.                    | Phase 2: Rate limit overrides (track_max, api_max per domain); Phase 3: Block list.                                                   |
| **Misconfiguration**            | Invalid test (e.g. allocations ≠ 100%).                     | abTestEngine.validateTest + validators on create/update.                  | Keep validation; add validators test types (checkout, template, etc.) per Feature audit; Phase 6 experiment policy (strict defaults). |

### Graceful degradation and storefront

- **Script:** ~~If assignment fails, storefront script should not break the page.~~ **Done:** getVariant/getVariantCachePromise return null or {} on failure (network, 5xx, 503); callers treat null as control. Track failures are caught and logged only. Documented in storefront-script.js top comment (graceful degradation, no per-user script cache).
- **Track POST:** If event ingest fails after assignment was returned, the user already saw a variant; consider idempotency key (e.g. event_id) for retries so duplicate events are not double-counted when Phase 6 data quality is in place.

### Monitoring and alerting (plan)

- **Phase 2:** Jobs list (failed count per queue); manual retry. **Phase 6:** Test monitoring (SRM, exposure); data quality page; SLA and status page; optional alerting on SRM or job failure rate.
- **Existing:** Logger + requestId; optional SENTRY_DSN in error handler. Extend as needed (e.g. health check for DB/Redis, heartbeat for script endpoint).

### Summary

- **Already in place:** Validation (track + test), suspended/blocked checks, SRM detection, conflict detection, guardrails, audit, job processors.
- **Plan covers:** SRM and test monitoring (Phase 6), rate limits and block list (Phase 2–3), jobs list and retry (Phase 2), data quality and rollback/kill switch (Phase 6), SLA/status (Phase 6). Document storefront graceful degradation and script cache policy so the system can handle script/API and assignment issues without breaking the merchant site.

---

## Prioritization and success criteria

- **Phase order:** 2 → 3 → 4 for maximum operational impact (config, support, full control). Phase 5–6 when moving upmarket; Phase 7 when AI product direction is set.
- **Success per phase:** All new admin actions are audited; no regression in existing admin flows; UI remains within the same design system (Polaris + RipX tokens).
- **Definition of done (per feature):** API under `/api/admin/*`, requireAdmin + audit for writes, frontend uses shared Admin layout and Card/DataTable/Modal patterns.

---

## Comprehensive research: add, update, fix, upgrade, and quality (make it perfect)

Master checklist from plan review and industry research: everything we can **add**, **update**, **fix**, **upgrade**, or **need for quality** so RipX can be complete and best-in-class.

**Add (net-new):** Experimentation (groups, holdout, bandit, theme/checkout, visual editor, heatmap over page); Analytics (date-range, product-level, program impact, report PDF, always-valid); Collaboration (team notes, idea repo, calendar); Shopify-native (price override, targeting lists); Admin (Phase 2–4+). **Quality & QA:** Experiment quality score (config + execution + data); Pre-launch QA checklist in UI; Force variation for QA; Real-time/near-real-time reporting. **Performance:** Core Web Vitals (FCP, LCP, CLS) monitoring and alerts. **Cross-experiment:** Cross-campaign/overlap analysis; anomaly detection. **Future:** Mobile app SDK (iOS/Android); 360 visitor profile; server-side SDK.

**Update:** Validators and TARGET_TYPES — **fixed in code** (validTypes + PAGE, ALL). ~~Export route docs~~ **Done** (exportRoutes.js, Documentation.jsx). ~~Pricing/price canonical value (document)~~ **Done** (constants + validators). Keep product inventory and API docs in sync (ongoing).

**Fix:** Validation mismatch (validators vs abTestEngine); regression smoke tests before release; storefront fallback when API fails; idempotency for track retries. **Backend TODOs (track):** ~~product sync job~~ **Done** (productSyncProcessor); ~~cleanup job~~ **Done** (archiveProcessor purges old webhook_events by retention days; test_assignments left as-is per current design).

**Upgrade:** Combination test in UI; Notifications page; targeting page/product/collection selectors; theme block payload; HeatmapView with screenshot overlay when available.

**Quality (make it perfect):** **Experiment quality score** (e.g. 0–100 from hypothesis, audience, sample size, SRM, allocation, tracking, duration)—Phase 6. ~~**Pre-launch checklist** in app~~ **Done:** Modal before Start Test with checklist (hypothesis, goal, audience, tracking, staging). ~~**Force variation** for QA~~ **Done:** query param `force_variant` on GET /api/track/variant. **Documentation and audit** (team notes, experiment summary, audit trail). **Archive and hygiene** (max duration, archive after N days, limit segments/goals). **Winning variation to code** (CTA to integrate winner into source after rollout).

**One-page perfect checklist:** Create (visual+code, templates, targeting, hypothesis+goals) → Run (sticky, holdout, groups, bandit, schedule, guardrails, force variation) → Analyze (Bayesian, SRM, funnel, heatmap on page, date compare, export, report, quality score) → Act (rollout, personalize, webhooks, integrate winner) → Operate (admin, rate limits, data quality, rollback, SLA) → Quality (pre-launch checklist, force variation, policy, archive, docs). Revisit when prioritising next sprint.

**Actionable (code-level):** (1) **Done:** validators.js `validTypes`; constants TARGET_TYPES (PAGE, ALL); webhook product sync (productSyncProcessor); webhook_events cleanup (archiveProcessor, RIPX_WEBHOOK_EVENTS_RETENTION_DAYS); export route docs (exportRoutes.js top comment); Document pricing/price canonical (constants + validators); standardize frontend API response shape (unwrapData in PromoLinks, Settings, useDashboardStats, useTests, useAnalytics, AdminTests, Notifications, TestDetail, TestCreator). (2) **Remaining:** Gradual unwrapData migration in remaining components (optional). For full list, see § **Code audit: fix, update, upgrade (full project check)**.

---

## Quick wins (minimal or no new backend)

| Item                            | Description                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~User detail modal~~           | **Done:** Admin Users list opens modal with full profile (GET /api/admin/users/:shopDomain); profile, role, account, preferences, created/updated. |
| Domain detail modal             | Already implemented: View domain stats and recent tests from Domains list.                                                                         |
| ~~Quick actions on Overview~~   | **Done:** Admin Overview shows System health (link + badge), Audit log (navigate), Export audit CSV.                                               |
| Tests list pre-fill from domain | Already implemented: `?domain=...` on Admin Tests pre-fills domain filter.                                                                         |
| ~~Consistent table styling~~    | **Done:** Admin.module.css `.adminTableWrap` applies border-radius and row hover to DataTables.                                                    |

---

## Technical research (existing codebase)

- **Key-value store:** Table `key_value_store` (see migration `023_add_key_value_store.sql`). Used for feature flags, maintenance message, script_version, etc. Admin Phase 2 Key-value store UI and Feature flags can read/write here.
- **Health:** `GET /api/health` and `GET /health` return DB/Redis status; no auth. Overview can link or optionally fetch and show status.
- **Audit export:** `GET /api/admin/audit-log/export` (query params: limit, entity_type, shop_domain) returns CSV; requires admin auth.
- **Bull queues:** See `backend/src/jobs/queue.js` for queue names (e.g. archive, scheduledTests, significanceAlert). Phase 2 Jobs list would list these.

---

## Code audit: fix, update, upgrade (full project check)

Result of a full project and code check. **Already fixed:** validators.js `validTypes`; constants `TARGET_TYPES` (PAGE, ALL); notificationRoutes (limit 0/NaN + asyncHandler); exportService null check (test not found → 404); .env.example (RIPX_ARCHIVE_DAYS_AFTER, RIPX_CONSENT_REQUIRED).

### Fix (bugs / logic / security)

| Item                                | Location                                           | Action                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Notification limit=0~~            | notificationRoutes.js                              | **Done:** limit 0 or NaN uses default 20; capped at 50; handlers wrapped in asyncHandler.                                                                                                                         |
| ~~Track success shape~~             | trackRoutes.js                                     | **Done:** All track responses use `success: true` or `success: false` + `error` where applicable.                                                                                                                 |
| ~~Stack in production~~             | errorHandler.js, response.js                       | **Done:** Stack and details only added when NODE_ENV === 'development'.                                                                                                                                           |
| ~~Webhook unhandled rejections~~    | webhookRoutes.js                                   | **Done:** Handlers wrapped in asyncHandler.                                                                                                                                                                       |
| ~~Export service null ref~~         | exportService.js                                   | **Done:** exportToCSV and exportToJSON now check test from getTestById; throw 404 if test not found.                                                                                                              |
| Frontend API response shape         | PromoLinks, Settings, useDashboardStats, etc.      | **Helper:** `unwrapData(res)` in services/api.js. **Migrated:** PromoLinks, Settings, useDashboardStats, useTests, useAnalytics, AdminTests, Notifications, TestDetail, TestCreator; other components can follow. |
| ~~Content-Disposition filename~~    | exportRoutes.js                                    | **Done:** generateFilename sanitizes; filename escaped for header (quotes/backslashes).                                                                                                                           |
| ~~Block list domain normalization~~ | trackRoutes.js, maintenanceMode.js, adminRoutes.js | **Done:** blockListCheck uses normalizeDomain(raw) for lookup; getBlockListMessage normalizes domain (strip protocol); PUT /kv/:key normalizes block_list.\* keys so add and lookup match.                        |
| ~~Toast prop (Admin)~~              | AdminAnnouncementBanner.jsx, AdminMaintenance.jsx  | **Done:** Toast component uses `onClose`; both components now pass `onClose` instead of `onDismiss`.                                                                                                              |
| ~~Storefront graceful degradation~~ | shopify/storefront-script.js                       | **Done:** Script returns null/{} on assignment API failure; control shown; track errors logged only. Documented in script top comment.                                                                            |

### Update (align / refactor)

| Item                                  | Action                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Test type: price vs pricing~~       | **Done:** Backend constants comment documents API canonical = `price`, UI label = "Pricing Test"; validators accept both.                                                                                                                                                                    |
| ~~API success/error shape (errors)~~  | **Done:** All 4xx/5xx JSON responses now include `success: false` + `error`: adminRoutes (404, 400, 500), authRoutes (400, 401, 500), promoLinkRoutes (404), requireAdmin (403), auth middleware (403). Success shape (e.g. `{ success: true, data?: T }`) remains to standardize per route. |
| Frontend vs backend test types        | Keep allowed types identical in TestCreator, validators, and abTestEngine; document which are fully supported vs planned. See backend constants TEST_TYPES and validators validTypes; frontend TestTypeModal/TestWizard.                                                                     |
| ~~Document pricing/price canonical~~  | **Done:** Backend constants (price vs "Pricing Test") and validators accept both; see § Test type: price vs pricing.                                                                                                                                                                         |
| .env.example optional vars            | .env.example                                                                                                                                                                                                                                                                                 | **Done:** Added RIPX_ARCHIVE_DAYS_AFTER, RIPX_CONSENT_REQUIRED. RIPX_STANDALONE_ONLY already present (commented).                                                                                       |
| Document export under /api/analytics/ | exportRoutes.js, analyticsRoutes.js, Documentation.jsx                                                                                                                                                                                                                                       | **Done:** Export routes mounted under /api/analytics (router.use('/', exportRoutes)); GET /api/analytics/tests/:id/export and POST /api/analytics/bigquery/export; docs reference in Documentation.jsx. |

### Upgrade (complete or improve)

| Item                       | Action                                                                                                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Webhook TODOs~~          | **Done:** product sync = productSyncProcessor; cleanup = archiveProcessor purges old webhook_events (RIPX_WEBHOOK_EVENTS_RETENTION_DAYS).                                                                                                         |
| ~~Combination test in UI~~ | **Done:** Combination in TestTypeModal and TestWizard.                                                                                                                                                                                            |
| ~~Notifications page~~     | **Done:** Dedicated Notifications page at /notifications; backend /api/notifications.                                                                                                                                                             |
| ~~asyncHandler on routes~~ | **Done:** testRoutes, profileRoutes, trackRoutes, promoLinkRoutes, targetingPresetRoutes, proxyRoutes, shopifyRoutes, tenantRoutes, exportRoutes, notificationRoutes, authRoutes, accountRoutes, dashboardRoutes, analyticsRoutes, webhookRoutes. |
| Dependencies               | **Audit run:** backend 0 vulnerabilities; frontend 2 moderate (esbuild/vite dev server—fix requires Vite 7 breaking change). Update deprecated/transitive deps when upgrading.                                                                    |
| ~~Rate limiting~~          | **Done:** Separate admin rate limiter (app.use('/api/admin', adminLimiter)); 120 req/15 min default, configurable via RATE_LIMIT_ADMIN_MAX. General API skips /api/admin.                                                                         |

### Security (verified)

- No sensitive data in logs; SQL uses parameterized queries; admin uses requireAdmin. Ensure production does not run with NODE_ENV=development.

---

## Research: acceptance criteria (Phase 2 first feature)

For the first Phase 2 feature (e.g. Key-value store UI), define done as:

- **API:** `GET /api/admin/kv` (list with optional prefix), `GET/PUT/DELETE /api/admin/kv/:key`; all require admin; PUT/DELETE audited.
- **UI:** Admin sidebar item "Key-value store" (or under "Settings"); list view with key, value preview, updated_at; detail/modal to view and edit value; delete with confirmation. Empty state when no keys.
- **Quality:** No regression on existing admin list/detail flows; new actions appear in Audit log with entity_type and entity_id.

Use the same pattern (API shape, audit, UI placement) for Feature flags and Maintenance mode in Phase 2.

---

## Phase 2 first mile (implementation hints)

Suggested first features and API shapes so Phase 2 can ship incrementally:

| Feature                   | Suggested API                                                                                                                                                                                                      | Notes                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Key-value store UI**    | `GET /api/admin/kv` (list keys with optional prefix), `GET /api/admin/kv/:key`, `PUT /api/admin/kv/:key` (body: `{ value }`), `DELETE /api/admin/kv/:key`. Audit all writes.                                       | Table: `key_value_store(key, value, updated_at)`. Prefix convention e.g. `flag.heatmaps`, `config.maintenance_message`. |
| **Feature flags**         | Store as keys e.g. `flag.<name>` (value: `"true"`/`"false"`) or `flag.<name>.<domain>`. Optional: `GET /api/admin/features` that reads all `flag.*` keys.                                                          | Admin UI: list flags, toggle with audit. App reads via existing config layer that checks key_value_store.               |
| **Maintenance mode**      | **Done:** Key `config.maintenance_mode` + `config.maintenance_message`. GET/PUT /api/admin/maintenance; Admin Maintenance page (toggle + message). Script and app read it; health returns custom message when set. |
| **Jobs list (read-only)** | `GET /api/admin/jobs` returns counts per queue (pending, active, completed, failed) from Bull. Optional: `GET /api/admin/jobs/:queue/failed` with last N job ids.                                                  | Requires Bull/Redis; keep read-only in first mile; "Retry" in a later iteration.                                        |

**Risks and dependencies:** Phase 2 depends on Redis for Bull jobs and on `key_value_store` for flags/config. Ensure migrations are run and Redis is available in target environments.

---

## Industry alignment

The phased roadmap aligns with how experimentation and optimization platforms typically evolve: start with core experiment management and tenant controls (Phases 1–2), add support and compliance tooling (Phase 3), then full platform and entity control (Phase 4), and finally enterprise and governance (Phases 5–6). Admin panels that expose configuration, jobs, and audit trails are standard in SaaS; this plan mirrors that pattern while staying within the existing RipX stack.

---

## Implementation notes

- **Order:** Phases 2–4 deliver the most operational value (config, support, full entity control). Phase 5–6 align with enterprise and compliance. Phase 7 depends on product direction for AI. Product experimentation initiatives (including **visual editor**, **heatmap over page image**, Shopify price/theme/checkout/targeting, idea repository, calendar, bandit, flicker-free, program impact, always-valid inference) are phased in 2–6—see § Gaps and additions, § Additional research, § Shopify-native integration plan, § Visual editor and heatmap over page image, and the Product experimentation initiatives table.
- **Backend first:** New admin capabilities typically need: new or extended API under `/api/admin/*`, audit logging for sensitive actions, and optional DB migrations (e.g. admin_config, job logs). Product-side features (experiment groups, global holdout, notes, reports) need non-admin API and DB where applicable; reuse abTestEngine, conflictDetectionService, analytics.
- **Frontend:** Reuse Admin layout and design system; add new sidebar items and list/detail pages as needed; keep audit log for all write actions. Keep UI "same overall" (same variables, card style, table style, empty states). For product features, reuse Test detail, Analytics, and Settings patterns.
- **Spec:** Full detail (workflows, tables, API shape) remains in [ADMIN_CONTROL_PANEL_SPEC.md](../ADMIN_CONTROL_PANEL_SPEC.md). This plan is a high-level roadmap; refer to the spec for each feature before implementing.
- **Feature audit:** Use § Feature audit (add, update, upgrade) for a project-wide checklist of what to add, what to update (validators, TARGET_TYPES, export docs, pricing/price mapping), and what to upgrade (Combination wizard, Notifications page, targeting UI, theme/checkout extensions). Re-run a project review periodically to keep the audit in sync.
- **Handling issues:** Use § Handling issues (reliability, failure modes, and data quality) to ensure the plan addresses SRM, assignment skew, script/API failure, job failures, bad events, rollback, rate limits, and monitoring. Covers what exists today and what Phases 2–6 add so the platform can handle all issues.
- **Make it perfect:** Use § Comprehensive research (add, update, fix, upgrade, and quality) as the master checklist for every feature and quality item: experiment quality score, pre-launch QA checklist, force variation, CWV monitoring, cross-campaign analysis, idempotency, and the one-page perfect platform checklist.

---

_Last updated: Comprehensive research "Update" bullet (export docs + pricing/price canonical marked Done); unwrapData migration extended to Notifications, TestDetail, TestCreator; asyncHandler list extended to accountRoutes, dashboardRoutes, analyticsRoutes, webhookRoutes; Code audit and Actionable updated._
