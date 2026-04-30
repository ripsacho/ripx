# Intelligems — deep research & RipX inspiration

Deep dive on how [Intelligems](https://www.intelligems.io/) runs Shopify price tests, their checkout strategies, and how RipX can improve by learning from them.

> Historical research note: this file compares competitor approaches and includes legacy RipX positioning at the time of writing (2025).  
> Current RipX defaults: **Price tests** use **Direct Price Override**; **Offer tests** use discount-function campaigns.

**Sources:** Intelligems docs (price testing, FAQs, integration guides, QA checklist, starting/ending tests). Last reviewed: 2025.

---

## 1. How Intelligems does price testing

### Three checkout methods (in order of preference)

| Method                               | Checkout matches test? | Who               | Notes                                                                                                         |
| ------------------------------------ | ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| **Shopify Cart Transform Functions** | Yes                    | Any plan          | Primary method; dynamically adjusts price at checkout for users in lower-priced groups.                       |
| **Checkout Script**                  | Yes                    | Shopify Plus only | Behind-the-scenes adjustment; **deprecated** — Script Editor deprecated August 2025.                          |
| **Duplicate Products**               | Yes                    | Fallback          | Swaps in a duplicate (unlisted) product per price point when user adds to cart; true catalog price per group. |

- **Catalog strategy:** For Scripts and Functions, Intelligems **automatically updates Shopify product prices to the highest price in the test** when the merchant starts the test. Lower-priced groups get the difference applied at checkout (Script reduces price; Function can adjust line price).
- **Duplicate products:** One duplicate per product per price point; unlisted, tagged `price_test` + experiment/group IDs; same SKU as original. Used when Functions aren’t available (e.g. incompatible PDP app, subscriptions without Script Editor, or store can’t use Functions). Cart/checkout see the real variant for that group.

### Frontend (PDP and beyond)

- **DOM manipulation:** They show the correct price on the frontend by **manipulating the DOM** based on the user’s test group (same idea as RipX).
- **Price tagging (required):** Merchants must **tag** price elements so Intelligems knows where to inject prices. Done via a **Preview widget**: add query selectors for:
  - **Price** (regular selling price)
  - **Compare at price** (strikethrough)
  - **Installment** (e.g. “4 payments of $X”) — optional `data-payment-count`
  - **Savings** (dollar or percentage)
  - **Per-unit price** — optional `data-price-multiplier=".33"` etc.
- **Where they tag:** PDPs, collection pages, homepage, search results, upsells in cart, product quiz, recommended products. **Not** cart/cart drawer — those are updated via Cart Transform.
- **Product/variant ID:** Elements need `data-product-id` and/or `data-variant-id` so Intelligems can match product/variant; otherwise the price is highlighted blue (recognized but not changed).

### Test setup flow

1. **Create test** — Name, description, type = Pricing Test.
2. **Test groups** — 2–5 groups; traffic % per group. Hint: ~300 orders per group to detect 10% conversion change at 90% confidence.
3. **Choose products** — Add/remove products (filters: vendor, product type, tags; search; “select all” with confirmation for 20+).
4. **Set prices** — Three options:
   - **Manual** — Table: product/variant rows × test groups; drag to copy prices; compare-at optional.
   - **Upload** — CSV/Excel template: compare price + price per group, handle, variant_id, product_id, etc.
   - **Quick Fill (autofill)** — % or $ increase/decrease per group relative to control; optional rounding. Single rule for all products in test.
5. **Targeting (optional)** — Mutually exclusive tests, new vs returning, device, UTM, **currency/country** (default: store currency for price tests).
6. **Save & Preview** — Preview URL, mobile QR, full-screen preview; switch test groups in widget.
7. **Goals (optional)** — Primary goal; filter analytics to “orders with test products” vs “any product”.
8. **Onsite editor (optional)** — Change copy by group (not for price components — those use price tagging).

### Starting a test

- **Integration + QA** — Two checkboxes: confirm integration done and QA checklist done.
- **“Yes, update my prices and start test”** — If using Scripts/Functions, pop-up lets Intelligems **update Shopify prices to the highest** in the test (per product). Strong recommendation not to choose “No” unless the merchant knows what they’re doing.
- **ERP (e.g. NetSuite):** If another system pushes prices to Shopify, merchant must update that system to the highest price too (or at least before next sync). CSV of product IDs/SKUs and highest prices available to export.

### Ending a test

- **Roll out** — Modal with metrics per group; merchant chooses **which group’s prices to apply** in Shopify. Then “Apply prices and end test”.
- **Duplicates:** Option to archive duplicates immediately, after 48 hours (recommended for carts), or leave active for manual handling. Subscriptions on duplicates: need to map duplicate → original in Recharge/etc.

### Limits and caveats (from their FAQs)

- **Product limit:** 500 products per price test by default; support can increase.
- **Bundles:** Bundle products **cannot** be price tested — same one–Cart Transform–per–line limit; no workaround.
- **Multi-currency:** By default tests run in **store default currency**; other currencies excluded from results. For Scripts/Functions, if catalog is raised to max, non-default currencies can see that high price (e.g. Markets auto-convert). They recommend fixed/static prices per market for the test period or multi-currency testing (separate doc).
- **Subscriptions:** Work with Recharge/Stay.ai; integration is complex; they recommend Intelligems do it. With Duplicate Products, subscriptions on duplicates must be merged back to originals when ending the test.
- **Shop Pay / Scripts:** Discount line can’t be hidden on Shop Pay; they can change the discount name on request.
- **Google Shopping:** With Scripts/Functions, they recommend triggering a feed update when the test is live (catalog = highest). With Duplicates, send highest prices to Google so visitors never see a higher price on site than in the ad.

---

## 2. Intelligems vs RipX (summary)

| Aspect                   | Intelligems                                                                               | RipX today                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Checkout**             | Cart Transform (primary), Checkout Script (Plus, deprecated), Duplicate Products          | Display-only on PDP; cart attributes for future Discount Function; no Cart Transform or Duplicates                                                                   |
| **Catalog at start**     | Auto-update Shopify to highest price when starting test (Scripts/Functions)               | Merchant must set manually; we document “set catalog to highest”                                                                                                     |
| **PDP price display**    | DOM injection after merchant **tags** price selectors in widget                           | Script finds/injects into common selectors + product JSON; no tagging step                                                                                           |
| **Where prices change**  | PDP, collections, homepage, search, upsells, quiz (where tagged)                          | PDP only (main block); collection/PLP not supported                                                                                                                  |
| **Set prices in wizard** | Manual table (product/variant rows × groups), CSV upload, or autofill (% or $ vs control) | Per test-variant: fixed, $ off/on, % off/on; per-product overrides; **per-product-variant (per-SKU) overrides** (variant ID + price per SKU, like Intelligems table) |
| **Product scope**        | Select products (filters, search, select all); product-level, all variants in             | All products or selected products (by ID); same                                                                                                                      |
| **Targeting**            | Optional: device, audience, UTM, currency/country (default store currency)                | Price tests: site-wide only in UI; no URL/segment                                                                                                                    |
| **Sample size guidance** | ~300 orders per group for 10% change, 90% confidence                                      | Doc: 200–300+ conversions per variant; 2–4 weeks                                                                                                                     |
| **Start test**           | Confirm integration + QA; “Update my prices and start test”                               | Merchant starts; no auto catalog update                                                                                                                              |
| **End test**             | Choose winning group → “Apply prices and end test”; duplicate handling                    | Merchant stops; no “apply winning prices” flow                                                                                                                       |
| **QA**                   | Detailed checklist (preview, all pages, cart, checkout, duplicates)                       | Doc troubleshooting + readiness                                                                                                                                      |
| **Multi-currency**       | Default: test in default currency; doc for multi-currency testing                         | Doc: test in default currency; multi-currency caveats                                                                                                                |

---

## 3. Inspiration and improvements for RipX

### 3.1 Checkout alignment (highest impact)

- **Intelligems:** Cart Transform (or Script/Duplicates) so **charged price = test price**. RipX today is display-only + cart attributes for a future Discount Function.
- **Improve:**
  - **Option A:** Build (or partner) a **Shopify Function** (Cart Transform or Discount Function) that reads `_ripx_price_test` / `_ripx_variant` and applies the correct price or discount so checkout matches PDP. Document “RipX + Function” as the recommended path for true price tests.
  - **Option B:** Document and optionally automate **“set catalog to highest”** at test start: e.g. “When you start this test, RipX can update your Shopify catalog to the highest price in this test (per product). You can revert when the test ends.” Backend would need a safe, auditable way to push prices (e.g. Admin API with confirmation and rollback).

### 3.2 Autofill / bulk price entry

- **Intelligems:** Quick Fill — one rule for all products: e.g. “Group B: −10%”, “Group C: −$5”, with optional rounding. Plus CSV upload for bulk.
- **Improve:**
  - **Traffic step:** Add “Apply to all variants” or “Quick fill”: e.g. “Set all non-control variants to: [% off / $ off / % on / $ on] relative to control,” with optional rounding. Reduces repetitive entry for store-wide tests.
  - **Import:** Allow CSV upload (product/variant ID + price per variant group) for large tests.

### 3.3 Start test: catalog and confirmation

- **Intelligems:** Explicit “Yes, update my prices and start test” and integration/QA checkboxes.
- **Improve:**
  - **Review step:** If any variant has a fixed price higher than current catalog (or we can’t know), show a clear warning: “To charge the test price at checkout, set your Shopify catalog to the highest price in this test before or when you start. [Link to doc].”
  - **Optional:** “I’ve set my catalog to the highest test price” checkbox before Start.
  - **Optional (backend):** “Update catalog to highest and start” with confirmation and, if possible, rollback on test end (or “revert catalog” guide).

### 3.4 End test: apply winning prices

- **Intelligems:** On end, show metrics and “Apply [winning group] prices and end test” so Shopify catalog is updated to the winner.
- **Improve:**
  - When stopping a price test, show a **“Roll out prices”** step: “Apply the winning variant’s prices to your Shopify catalog?” with a short summary (which variant won, which products). If we don’t have API permission to write prices, provide a **CSV export** (product ID, variant ID, new price) and a short “Import this in Shopify or your ERP” guide.

### 3.5 QA and preview

- **Intelligems:** Price test QA checklist (preview, all pages, cart, checkout, duplicates); preview widget with group switcher and highlight mode.
- **Improve:**
  - In-app **“Price test QA checklist”** (expand Documentation or a modal): short list (script live, preview each variant, check PDP + cart + checkout, catalog = highest).
  - **Preview:** Ensure test preview URL (or embed) lets merchants switch variant/group and see the correct price on PDP (and doc that cart/checkout won’t match until they use a Function or manual discount).

### 3.6 Sample size and confidence

- **Intelligems:** “~300 orders per group to detect 10% change with 90% confidence.”
- **Improve:** In the wizard (Goal & Metrics or Traffic), surface a **short hint**: “Aim for ~300 conversions per variant to detect a 10% lift at 90% confidence” and link to the sample size calculator or doc. Align wording with our existing 200–300+ and 2–4 weeks guidance.

### 3.7 Collection / PLP and other surfaces

- **Intelligems:** Tag prices on collection pages, homepage, search, upsells, recommended products so the same cohort sees the same price everywhere.
- **RipX:** PDP only today.
- **Improve:** Roadmap: **collection/PLP price display** when we have a stable way to assign variant by product (e.g. cookie/API) and inject into theme-dependent card markup. Document as a limitation until then.

### 3.8 Price “tagging” vs auto-detection

- **Intelligems:** Merchant tags selectors in a widget; supports compare-at, installment, savings, per-unit.
- **RipX:** No tagging; we rely on product JSON and common patterns.
- **Improve:**
  - **Short term:** Document which theme/JSON patterns we support and that some themes may need a small snippet (e.g. `data-variant-id` on the price node) for reliability; add troubleshooting.
  - **Later:** Optional “price selector” config per theme or per test (e.g. store a selector in test or shop settings) so merchants can point us at non-standard price elements. Avoid making it required so setup stays simple.

### 3.9 Targeting: currency and country

- **Intelligems:** Price tests default to store currency; optional currency/country targeting.
- **Improve:** For price tests, add **optional** “Run in default currency only” or “Limit to countries: …” so merchants can avoid multi-currency noise. Keep default “site-wide” but allow narrowing.

### 3.10 Duplicate products (optional, high effort)

- **Intelligems:** When Functions/Scripts aren’t viable, duplicate products per price point; swap at add-to-cart; unlisted, tagged.
- **Improve:** Only consider if we need parity for subscription or non-Function stores. High implementation and support cost (create duplicates, swap at ATC, revert/archive on end, subscription mapping). Prefer Discount Function + cart attributes first.

---

## 4. Summary: RipX priorities inspired by Intelligems

| Priority              | Action                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Checkout**       | Offer or document Discount Function (or Cart Transform) using existing cart attributes; keep “catalog = highest” as default guidance. |
| **2. Start/end flow** | Clear “set catalog to highest” at start; “apply winning prices” or CSV export at end.                                                 |
| **3. Bulk/autofill**  | Quick-fill rule (e.g. “−10% for Variant B”) and/or CSV import for prices.                                                             |
| **4. QA**             | In-app QA checklist and strong preview (variant switcher).                                                                            |
| **5. Guidance**       | Sample size hint (~300/variant, 10% lift, 90% confidence) in wizard.                                                                  |
| **6. Scope**          | Roadmap: collection/PLP price display; optional currency/country targeting for price tests.                                           |

---

## 5. Deeper technical research (for implementation)

### 5.1 RipX cart attributes (already implemented)

- **Keys:** `attributes[_ripx_price_test]` = test ID (UUID), `attributes[_ripx_variant]` = assigned variant identifier (e.g. variant index or backend variant id). Injected into `form[action*="cart/add"]` via hidden inputs; not injected in cart drawer/mini-cart forms to avoid double-submit.
- **Source:** `shopify/storefront-script.js` → `injectPriceTestCartAttributes(testId, variantId)`. Called after variant assignment; `variantId` is the variant we assign for the test (the one whose price we display).
- **Storefront config:** Script receives `activeTests` with `id`, `type`, `targetType`, `targetIds`; variant assignment and config (price, priceMode, etc.) come from the assignment API. A Discount Function only sees cart attributes, so it must resolve (testId, variantId) → target price via config or API.

### 5.2 Shopify Discount Functions (checkout alignment)

- **Product discount:** Can apply discounts to specific cart lines. **Cart line targeting** (API 2024-07+): target lines by attributes/properties. Cart-level attributes (e.g. `cart.attribute._ripx_price_test`) are available in the Function input in checkout; draft orders may expose them inconsistently.
- **Limits:** Up to 25 discount functions per store; run concurrently. Custom apps may need **network access** for external API calls (e.g. RipX config), which can be limited to Plus/Enterprise in some cases.
- **Config for RipX:** The Function needs a mapping (testId, variantId) → target price or discount amount. Options: (1) **Static config** at deploy (e.g. JSON in input or metafield); (2) **RipX API** returning config (requires network and possibly Plus); (3) **Metafield** or app proxy URL that the Function fetches. Recommendation: document static config first; add a RipX endpoint that returns “price test config for Function” (see PRICE_TEST_IMPLEMENTATION_ROADMAP.md §2.2).

### 5.3 Catalog update (Admin API)

- **Mutation:** `productVariantsBulkUpdate` (preferred) or `productVariantUpdate`. Input: variant id, `price` (Money string). Scope: `write_products`.
- **RipX use case:** “Set catalog to highest” at test start: for each product/variant in the test, compute max price across variant configs (fixed, or catalog + delta/percent if we have current catalog in backend); call bulk update. Store “before” snapshot for revert or CSV at end.

### 5.4 ABConvert / other tools (brief)

- **ABConvert:** Price tests by UTM or country; shipping and free-shipping threshold tests; real-time stats. Suggests UTM/country as first-class targeting for price.
- **Takeaway:** Optional currency/country targeting (Phase 3 in roadmap) aligns with market; keep site-wide default.

---

## 6. Implementation roadmap (summary)

A separate **implementation roadmap** turns these ideas into shippable work:

- **File:** `docs/research/PRICE_TEST_IMPLEMENTATION_ROADMAP.md`
- **Phases:**
  - **Phase 1:** Start catalog warning, end-test CSV + “roll out,” quick-fill, sample size hint, QA checklist.
  - **Phase 2:** Discount Function doc + reference, backend “config for Function” API.
  - **Phase 3:** Optional “update catalog and start,” CSV import, currency/country targeting.
  - **Phase 4:** Collection/PLP display, duplicate products, optional price selector.

Each item has scope, acceptance criteria, effort, and files to touch. Recommended order: 1.1 → 1.4 → 1.5 → 1.3 → 1.2 → 2.1 → 2.2, then 3.x as needed.

---

## 7. References

- [Intelligems — Price testing getting started](https://docs.intelligems.io/price-testing/price-testing-getting-started)
- [Intelligems — How to set up a price test](https://docs.intelligems.io/price-testing/how-to-set-up-a-price-test)
- [Intelligems — Price testing FAQs](https://docs.intelligems.io/price-testing/price-testing-faqs)
- [Intelligems — Tag product prices (Shopify Functions)](https://docs.intelligems.io/price-testing/price-testing-integration-guides/integration-guide-using-shopify-functions/step-2-tag-product-prices)
- [Intelligems — Starting a price test](https://docs.intelligems.io/price-testing/starting-a-price-test)
- [Intelligems — Ending a price test](https://docs.intelligems.io/price-testing/ending-a-price-test)
- [Intelligems — Price test QA checklist](https://docs.intelligems.io/price-testing/price-test-qa-checklist)
- [Shopify — Build a Product Discount Function](https://shopify.dev/docs/apps/build/discounts/build-product-discount-function)
- [Shopify — Product Discount cart line targeting (changelog)](https://shopify.dev/changelog/the-product-discount-function-api-now-supports-cart-line-targeting)
- [Shopify — productVariantsBulkUpdate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/productVariantsBulkUpdate)

**RipX:** For actionable tasks and implementation details, see **docs/research/PRICE_TEST_IMPLEMENTATION_ROADMAP.md**. For broader advanced research (competitor matrix, Scripts sunset, MDE/sequential testing, segmentation, and the recommended “best approach” for RipX), see **docs/research/ADVANCED_PRICE_TESTING_RESEARCH.md**.

---

_Last updated: 2025. Use this doc for strategy and competitor context; use PRICE_TEST_IMPLEMENTATION_ROADMAP.md to implement. See SHOPIFY_PRICE_TESTING.md for RipX strategy and storefront behavior._
