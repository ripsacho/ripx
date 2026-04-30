# Price test implementation roadmap

Actionable plan to make RipX price testing best-in-class. Built from competitor research (Intelligems, etc.) and technical constraints. Each item has scope, acceptance criteria, effort, and where to implement.

> Roadmap context note: this roadmap captures a phased proposal from an earlier model period.  
> Some items are now superseded by the shipped simplified flow (Price = Direct Price Override, Offer = discount-function path). Treat unchecked items as historical ideas unless re-adopted in current planning.

**Prerequisites:** RipX already has PDP display, cart attributes `_ripx_price_test` and `_ripx_variant`, variant config (fixed/amount/percent, per-product overrides), and product scope. This doc adds checkout alignment, wizard UX, and operational flows. For the research that led to this roadmap (competitor matrix, methodology, “best approach”), see **docs/research/ADVANCED_PRICE_TESTING_RESEARCH.md**.

---

## Phase 1: High impact, low–medium effort (do first)

### 1.1 Start test: catalog warning and confirmation

**Goal:** Every merchant starting a price test knows they must set catalog to the highest price (or we do it for them), reducing checkout mismatch.

**Scope:**

- **Review step (frontend):** When test type is price and at least one variant has a fixed price or computed price &gt; 0:
  - Show a clear **Banner** or **Callout**: “To charge the test price at checkout, set your Shopify product catalog to the **highest** price in this test before starting. [Link to Documentation → Price testing].”
  - Optional: checkbox “I’ve set my catalog to the highest test price (or I’m running display-only)” before **Start test** is enabled (or soft warning if unchecked).
- **Backend:** No change. Optional later: endpoint that returns “recommended catalog prices” (max per product/variant) for the test so the UI can show “Set these prices in Shopify: …”.

**Acceptance criteria:**

- On Review step for a price test, the catalog/highest-price warning is visible and links to the in-app doc.
- Copy matches Documentation (Price testing) and SHOPIFY_PRICE_TESTING.md.

**Effort:** Small (frontend only).  
**Files:** `frontend/src/components/TestWizard/TestWizard.jsx` (Review step), optionally `TargetingSection.module.css` if new class.

---

### 1.2 End test: “Roll out winning prices” + CSV export

**Goal:** When stopping a price test, merchant can apply the winning variant’s prices to Shopify (or export for manual/ERP import).

**Scope:**

- **Backend:** New endpoint or extend stop/complete flow:
  - **GET or POST** (e.g. when stopping a price test): return “winning” variant and, for each product/variant in the test, the **price to set** (from winning variant’s config: fixed price, or computed from catalog + delta/percent if we store “catalog at test end” — for simplicity, start with **fixed price only** for “apply”).
  - **CSV export:** Same data as CSV: columns e.g. `product_id`, `variant_id`, `sku`, `new_price`, `compare_at_price` (optional). Merchants can import in Shopify (e.g. bulk editor) or ERP.
- **Frontend:** When user stops a **price** test:
  - Modal or inline step: “Roll out prices?” with short summary (e.g. “Variant B won. Apply these prices to your catalog?”).
  - Buttons: **“Download CSV”** (triggers download of the CSV above), **“Apply in Shopify”** (if we implement 1.4), or “I’ll update manually.”
  - If we don’t have “Apply in Shopify” yet, only “Download CSV” and “I’ll update manually” with link to doc.

**Acceptance criteria:**

- Stopping a price test offers “Download CSV” with correct product/variant IDs and winning prices (fixed only in v1).
- CSV is valid for Shopify bulk edit or similar (document format in doc).

**Effort:** Medium (backend payload + CSV generation; frontend modal/buttons).  
**Files:** `backend/src/routes/testRoutes.js` or new `exportRoutes.js`, `frontend/src/components/TestWizard/TestWizard.jsx` or TestDetail stop flow.

**Dependencies:** None. Winning variant can be “first variant” or from analytics if we have a “winner” field; else “choose which variant to roll out” in the modal.

---

### 1.3 Quick-fill (autofill) for variant prices

**Goal:** For store-wide price tests, set all non-control variants with one rule (e.g. “Variant B: −10%”, “Variant C: −$5”) instead of editing each variant by hand.

**Scope:**

- **Traffic step (frontend):** In the price variant configuration (accordion or table):
  - Add **“Quick fill”** or **“Apply rule to all non-control variants”**:
    - Dropdown: “Percent off control” | “Percent on control” | “$ off control” | “$ on control”.
    - Input: number (e.g. 10 for 10%, or 5 for $5).
    - Optional: “Round to nearest” (e.g. 0.01, 0.25, 1).
  - On Apply: for each variant that is not control (control = fixed with no value, or explicit control flag), set `priceMode` to `percent` or `amount`, `priceDelta`/`pricePercent` and `priceBase` from the rule. If “percent off”, pricePercent = +10; “percent on” = −10; “$ off” = negative delta; “$ on” = positive delta.
- **Validation:** Existing rules (percent −100..100, etc.) still apply after quick-fill.

**Acceptance criteria:**

- User can set one rule and apply it to all non-control variants in one click.
- Resulting variant configs are valid and display correctly on PDP.

**Effort:** Medium (frontend only; logic in wizard state).  
**Files:** `frontend/src/components/TestWizard/TestWizard.jsx`, `testWizardConfig.js` if we add a “control” flag per variant.

---

### 1.4 Sample size and confidence hint in wizard

**Goal:** Surface “~300 conversions per variant for 10% lift at 90% confidence” in the wizard so merchants don’t underpower tests.

**Scope:**

- **Goal & Metrics or Traffic step:** Add a short **Text** or **Banner** (info): “For reliable results: aim for **~300 conversions per variant** to detect a 10% change at 90% confidence. Run **2–4 weeks** and avoid stopping early.” Link to Documentation (Price testing) or sample size calculator if we have one.

**Acceptance criteria:**

- Hint is visible in the wizard for price tests (and optionally all tests).
- Wording aligned with Documentation and SHOPIFY_PRICE_TESTING.md.

**Effort:** Small.  
**Files:** `frontend/src/components/TestWizard/TestWizard.jsx`.

---

### 1.5 In-app Price test QA checklist

**Goal:** One place in the app for “before you start” and “before you trust results” checks.

**Scope:**

- **Documentation (Price testing)** or a **modal** linked from the wizard (e.g. Review step: “Open QA checklist”):
  - Checklist: Script live in theme; Preview each variant on PDP; Check cart/checkout (remind: catalog = highest or use Discount Function); Confirm product scope; Optional: place test order.
  - Format: short bullets or checkboxes (no backend persistence needed for v1).

**Acceptance criteria:**

- Checklist is reachable from the app (doc section or modal) and matches the intent of Intelligems’ QA checklist (simplified).

**Effort:** Small.  
**Files:** `frontend/src/components/Documentation/Documentation.jsx` (add subsection under Price testing) or new small component + link from TestWizard.

---

## Phase 2: Checkout alignment (high impact, higher effort)

### 2.1 Discount Function: spec and merchant-facing doc

**Goal:** Merchants (or developers) can deploy a Shopify Discount Function that reads RipX cart attributes and applies the correct discount so **charged price = displayed price**.

**Technical context:**

- **Cart attributes today:** Storefront injects `attributes[_ripx_price_test]` = test ID and `attributes[_ripx_variant]` = assigned variant ID (e.g. variant index or backend variant id). Injected into add-to-cart forms (see `injectPriceTestCartAttributes` in storefront-script.js).
- **Discount Function:** Must run at checkout, read cart/line attributes, and apply a **product discount** (or order discount) so the line total matches the test price. Product Discount Functions can target cart lines (e.g. by line attribute or cart attribute). Limitation: Draft orders may not expose cart attributes consistently; standard checkout and B2B work.
- **Config resolution:** The Function needs “for test T, variant V, what is the target price?” Options:
  - **A. Function calls RipX API:** Request with `testId` + `variantId` (and optionally shop, line item key). RipX returns target price and currency. **Requires network access** (Shopify Plus/Enterprise for custom apps in some cases).
  - **B. Config at deploy time:** Merchant (or RipX) deploys the Function with a config file or env that maps testId+variantId → discount amount or target price. Updated when tests change (redeploy or admin-triggered sync).
  - **C. Metafield / app proxy:** Store “active price test config” in a metafield or serve from RipX app proxy; Function reads it (may need network).

**Scope (v1):**

- **Documentation:** Add a **“Checkout alignment with a Discount Function”** section under Price testing:
  - Explain that cart attributes `_ripx_price_test` and `_ripx_variant` are set by the script.
  - Describe what the Function must do: read attributes, resolve test + variant → target price (or discount amount), apply product/order discount so charged = displayed.
  - Document config options (API vs static config) and link to Shopify docs (Build a Discount Function, Product Discount with cart line targeting).
- **Optional:** Provide a **reference implementation** (e.g. Rust or JavaScript) in the repo or separate repo that:
  - Reads `cart.attribute._ripx_price_test` and `cart.attribute._ripx_variant`.
  - Uses a **static config** (e.g. JSON in the Function input or metafield) mapping (testId, variantId) → discount amount or target price.
  - Applies the discount to the matching line(s). Document how to fill the config (e.g. from RipX “Export config for Function” in the app).

**Acceptance criteria:**

- Doc is clear enough for a developer to build or adapt a Discount Function that aligns checkout with RipX price tests.
- If we ship a reference implementation, it builds and runs in a Shopify app with Function extension.

**Effort:** Medium (doc + optional reference Function).  
**Files:** `docs/research/SHOPIFY_PRICE_TESTING.md`, `frontend/src/components/Documentation/Documentation.jsx`, optionally new repo or `shopify/functions/` in RipX.

---

### 2.2 Backend: “Config for Discount Function” API

**Goal:** Let a Discount Function (or a deploy-time script) fetch the current test config so it can apply the right discount without the merchant editing config by hand.

**Scope:**

- **Backend:** New endpoint, e.g. **GET /api/tests/price-test-config** (or under storefront):
  - Query: `shop` (or tenant), optional `testIds` (comma-separated).
  - Returns: For each active price test, test id, variant list (id, index, or name), and per-variant **target price** (or discount from catalog). Format optimized for a Function: e.g. `{ testId: string, variants: { variantKey: string, price: string, currency: string }[] }`.
  - Auth: same as storefront script (shop in query + optional token) or app-only. Must not expose to public without shop context.
- **Use case:** Function deployed with “fetch config from RipX on cold start” or a cron that updates a static file the Function reads. Or merchant runs “Export config” in RipX and pastes into Function input.

**Acceptance criteria:**

- Endpoint returns valid config for all active price tests for the shop; variant key matches what we send in `_ripx_variant` (e.g. variant index or id).

**Effort:** Medium.  
**Files:** `backend/src/routes/trackRoutes.js` or `testRoutes.js`, `backend/src/models/test.js`.

**Dependencies:** None. Storefront already has variant assignment; we only need to expose variant config (price, priceMode, priceDelta, pricePercent, priceBase) and compute target price per variant (backend can compute from catalog if we have it, else from fixed only for v1).

---

## Phase 3: Catalog update and advanced UX

### 3.1 “Update catalog to highest and start” (optional)

**Goal:** When starting a price test, optionally set Shopify product prices to the highest in the test (per product/variant) so checkout alignment works with a Discount Function or manual discounts.

**Scope:**

- **Backend:** New endpoint or action: “Set catalog to highest for test X.” For each product/variant in the test, compute max price across variants (from variant config: fixed or from current catalog + delta/percent). Call **Shopify Admin API** `productVariantsBulkUpdate` (or `productVariantUpdate`) with new price. Requires `write_products` scope and tenant’s access token.
- **Frontend:** On Start test (price test), show option: “Update my Shopify catalog to the highest price in this test and start.” Confirmation modal with short summary (e.g. “We will update N variants. You can revert from CSV after the test.”). On confirm, call backend; then start test as usual.
- **Safety:** Idempotent where possible; store “catalog snapshot before test” (variant id → price) so we can offer “Revert catalog” or CSV at end. Rate-limit and validate variant ownership to the shop.

**Acceptance criteria:**

- With proper OAuth scope, starting a price test can update catalog to max price and then start the test.
- Snapshot or CSV of “previous prices” is available for revert (or documented manual revert).

**Effort:** High (Admin API, scopes, error handling, revert story).  
**Files:** `backend/src/routes/testRoutes.js`, new service (e.g. `catalogUpdateService.js`), Shopify API client, `frontend/src/components/TestWizard/TestWizard.jsx`.

**Dependencies:** Shopify app with `write_products`; only for Shopify (not standalone).

---

### 3.2 CSV import for variant prices

**Goal:** Merchants with many products can upload a CSV (product/variant id + price per variant group) instead of manual entry.

**Scope:**

- **Frontend:** In Traffic step, “Import prices from CSV.” Template download: columns e.g. `variant_id`, `control_price`, `variant_b_price`, `variant_c_price` (or by variant name). Upload: parse CSV, validate variant IDs belong to selected products, map columns to variant groups, update wizard state.
- **Backend:** No change (wizard state is frontend; save as usual when user saves test).

**Acceptance criteria:**

- User can download a template CSV, fill it, upload, and see variant table populated. Validation errors (unknown variant, wrong format) are shown.

**Effort:** Medium.  
**Files:** `frontend/src/components/TestWizard/TestWizard.jsx`, optional `utils/csvParse.js`.

---

### 3.3 Optional currency or country targeting for price tests

**Goal:** Allow “Run this price test only in default currency” or “Only in countries: US, CA” to avoid multi-currency noise.

**Scope:**

- **Frontend:** In Targeting step, for price tests only: show an optional “Price test scope” block: “Run in default currency only” (checkbox) and/or “Limit to countries” (multi-select). Stored in test payload (e.g. `segments.priceTestCurrencyOnly`, `segments.countries`).
- **Backend:** Store and return these segments. Storefront script: when evaluating a price test, if `priceTestCurrencyOnly` and current currency ≠ shop default, skip assignment or don’t apply price (or exclude from analytics). If `countries` set, skip or exclude when visitor country not in list. Country/currency from Shopify or geo headers if available.

**Acceptance criteria:**

- Merchant can limit a price test to default currency and/or a country list. Storefront respects it (no price change or no assignment when outside scope).

**Effort:** Medium (frontend + backend + storefront script).  
**Files:** `frontend/src/components/TestWizard/TestWizard.jsx`, `backend/src/models/test.js`, `shopify/storefront-script.js`.

---

## Phase 4: Roadmap (later)

- **Collection / PLP price display:** Same cohort sees test price on collection and search result cards. Requires stable variant-by-product assignment and theme-dependent selectors; document as limitation until then.
- **Duplicate products (Intelligems-style):** Only if needed for subscription or non-Function stores; high effort and support cost.
- **Price selector config (tagging):** Optional per-theme or per-test selector for non-standard price elements; keep optional so setup stays simple.

---

## Implementation order (recommended)

1. **1.1** Catalog warning at start (fast, high value).
2. **1.4** Sample size hint (fast).
3. **1.5** QA checklist in doc or modal (fast).
4. **1.3** Quick-fill for variant prices (medium, high UX).
5. **1.2** End test: CSV export + “Roll out” modal (medium).
6. **2.1** Discount Function doc + optional reference implementation (medium).
7. **2.2** Config API for Function (medium).
8. **3.1** Catalog update at start (high; do after 1.2 and 2.x if demand is clear).
9. **3.2** CSV import (medium).
10. **3.3** Currency/country targeting (medium).

---

## References

- **RipX:** `docs/research/SHOPIFY_PRICE_TESTING.md`, `docs/research/INTELLIGEMS_RESEARCH.md`, `shopify/storefront-script.js` (injectPriceTestCartAttributes, applyPriceTest).
- **Shopify:** [Build a Discount Function](https://shopify.dev/docs/apps/build/discounts/build-product-discount-function), [Product Discount — cart line targeting](https://shopify.dev/changelog/the-product-discount-function-api-now-supports-cart-line-targeting), [productVariantsBulkUpdate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkUpdate).

---

_Last updated: 2025. Use this roadmap to prioritize and implement; update this doc as items are shipped or deferred._
