# Shopify price A/B testing — research & RipX strategy

Deep reference on how the industry handles price tests on Shopify, known problems, and how RipX compares and evolves.

> Historical research note: this document contains 2025-era analysis and options that predate RipX's simplified Price-vs-Offer model.  
> Current product behavior: new **Price tests** use **Direct Price Override** (Cart Transform path), and **Offer tests** use the discount-function promo path.

**In-app guide:** In RipX, open **Documentation** (sidebar or `/docs`) and go to **Price testing (Shopify)** for a concise reference and checkout-alignment steps.

---

## Current status (2026)

- **Price tests:** direct price override workflow is the default for new tests.
- **Offer tests:** discount-function workflow is used for campaign/promo style discounts.
- **Legacy methods:** older `auto`/native/discounted configurations remain readable for compatibility, but are no longer the default authoring path.

---

## Historical note (2025): does the price test change the price at checkout? (short answer)

**No.** With RipX today, the price test changes **only the displayed price on the product page (PDP)**. The **live price at checkout is not changed** — the customer is charged whatever is in your Shopify product catalog for that variant.

So if you show $29 on the PDP for a test variant but your catalog price is $39, the customer will see $29 on the product page but **pay $39 at checkout** unless you align them using one of the options below. For true “charged price = test price” you need checkout alignment (see **Best solution** below).

---

## Best solution: align checkout with test price

| Approach                                                      | Checkout matches test?                                                                                                                     | Who can use it                                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| **1. Set catalog to highest test price + automatic discount** | Yes, if you create a discount that applies the right amount off for each segment.                                                          | Any plan; you (or an app) create discounts that apply when conditions are met.           |
| **2. Shopify Plus + Cart Transform**                          | Yes; a Function overrides line price at checkout per segment.                                                                              | Plus only; one Cart Transform per store (can conflict with bundle apps).                 |
| **3. Discount Function + cart attribute**                     | Yes; storefront sets a cart attribute (e.g. assigned variant id), a Discount Function reads it and applies the right discount at checkout. | Any plan; requires building/deploying a Discount Function; up to 25 functions per store. |
| **4. Display-only (RipX today)**                              | No; checkout = catalog. Use for perception/messaging tests or combine with (1)–(3).                                                        | Any plan; no setup.                                                                      |

**Cart attribute keys (for Discount Functions):** The storefront injects `attributes[_ripx_price_test]` (test ID) and `attributes[_ripx_variant]` (assigned variant id). A Discount Function can read these at checkout to apply the correct discount.

**Recommended path for “checkout = test price” without Plus:**  
Set your **product catalog price to the highest** price in the test. For test variants that should see a **lower** price, use either: (a) a **manual automatic discount** in Shopify that gives $X or Y% off (you’ll need to target by segment another way, e.g. URL or tag), or (b) a **Discount Function** that reads a cart attribute (e.g. `ripx_price_variant`) set by the storefront when the customer adds to cart, and applies the correct discount for that variant. **RipX storefront today:** The script injects hidden inputs into add-to-cart forms so the cart receives `attributes[_ripx_price_test]` (test id) and `attributes[_ripx_variant]` (assigned variant id). A **Discount Function** that reads these attributes at checkout can apply the correct discount so the charged price matches the displayed test price (no Plus required; does not use the single Cart Transform slot). Until that Function is deployed, checkout still charges catalog price.

---

## Where the test price appears

| Location                                    | Test price applied?                     | Notes                                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product page (PDP)** — main product block | **Yes**                                 | Script updates the visible price for the current product/variant. This is the only place RipX reliably paints the test price.                                                            |
| **Collection / PLP grids**                  | No                                      | Script does not change prices on collection or search result cards.                                                                                                                      |
| **Cart drawer / mini-cart**                 | Best-effort                             | Line-item prices in sidecart are theme-dependent; script does not target them. Checkout (and any cart UI that reads discounted totals) can match display if you use a Discount Function. |
| **Checkout**                                | No (unless you add a Discount Function) | Customer is charged the **Shopify catalog price** unless you align checkout (see **Best solution** above).                                                                               |

---

## Wizard flow and variant config

**Steps that affect price tests:**

1. **Template** — Choose “Price” test.
2. **Traffic** — Add variants, set allocation (must sum to 100%), and **configure each variant** in the Price summary accordion:
   - **Product scope:** “All products” or “Selected products only” (if selected, you must pick at least one product).
   - **Price type:** Fixed price, $ off/on (amount), or % off/on (percent). Control = Fixed with no price (catalog).
   - **Price base** (for amount/percent): Selling price or compare-at price.
   - **Price value:** Fixed $, amount ($), or % per variant. Optional **per-product overrides** (`byProduct`) for different prices per product.
3. **Targeting** — Site-wide only; no targeting options are shown for price tests.
4. **Goal &amp; Metrics** — Set success metric and significance (e.g. 95%).
5. **Code** — No code required for price tests; validation runs here (and on Traffic + Review).
6. **Review** — Same validations; submit when ready.

**Variant config shape (for implementers):** Each variant’s `config` can include: `price`, `priceMode` ('fixed' | 'amount' | 'percent'), `priceDelta`, `pricePercent`, `priceBase` ('price' | 'compare_at'), optional `roundTo` (number or string, e.g. 0.25 or "0.25" — storefront rounds displayed price to nearest), and optionally `byProduct: { [productId]: { price, priceMode, ... } }`. Within a product override, optional `byVariant: { [variantId]: { price, priceMode, ... } }` sets a different price per product variant (SKU), so each size/option can have its own test price (like Intelligems’ product/variant table). Control is fixed mode with no price set.

---

## Control variant

- **Control** = “use catalog price.” In the wizard this is **Fixed price** with **no value** (empty).
- The storefront does **not** paint any price when the assigned variant is control (or when `priceMode === 'control'`); the theme’s catalog price is shown.
- For **amount** or **percent** modes, leave the value empty if you want that variant to behave like control (script will not apply a calculated price).

---

## Validation (wizard)

The wizard validates price tests on **Traffic**, **Code**, and **Review** steps:

| Rule                                | When                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Fixed price ≥ 0                     | When fixed mode and a value is entered                                    |
| Amount ($ off/on) is a valid number | When amount mode and a value is entered                                   |
| Percent between -100 and 100        | When percent mode and a value is entered                                  |
| Selected products required          | When Product scope is “Selected products only” and no products are chosen |
| Traffic allocation = 100%           | On Traffic and Review                                                     |

---

## Price tests: discounts and increases

RipX supports both **discounts** (lower price) and **price increases** (higher price):

| Mode                  | Discount                       | Increase                       |
| --------------------- | ------------------------------ | ------------------------------ |
| **Fixed price**       | Set price &lt; catalog         | Set price &gt; catalog         |
| **$ off/on (amount)** | Negative delta (e.g. −5)       | Positive delta (e.g. +5)       |
| **% off/on**          | Positive % (e.g. 10 = 10% off) | Negative % (e.g. −10 = 10% on) |

**Why test price increases:** A small price increase can significantly improve profit if conversion stays stable. A/B testing validates whether a higher price is accepted before you roll it out. Best practice: run tests for 2–4 weeks with enough conversions per variant for significance.

**Checkout alignment for increases:** If you test control $29 vs variant $34: set catalog to the **highest** price ($34), then use a Discount Function or automatic discount to give the control segment $5 off so they pay $29. Same pattern as discount-only tests: catalog = max test price; discounts bring lower arms down.

---

## Different price per product (multi-product tests)

You can run **one price test across multiple products** and set a **different price (or % / amount) per product** for each variant.

**How it works:** When the test targets more than one product, the variant configuration can include optional **per-product overrides** (`byProduct`): for each product ID you set the price (or $ off/on, % off/on) for that variant. Within a product, optional **per-variant overrides** (`byVariant[variantId]`) let you set a different price per Shopify product variant (SKU). On the PDP, the storefront resolves: base config → product override → product-variant override, then applies the rule for the currently selected variant. So you can set e.g. Size S = $29, Size M = $31, Size L = $33 for the same test variant.

**Use cases:** Test “10% off on premium SKUs, $5 off on economy” in one experiment; or fixed prices per product (Product A = $29, Product B = $39 for variant B) without creating separate tests. **Per-SKU:** Different test price per product variant (e.g. each size or color), matching the granularity of tools like Intelligems’ manual table (product/variant rows × groups).

**Best practice:** Use “Same price for all products” when the same rule applies (e.g. 10% off everywhere). Use “Different price per product” when you want product-specific prices or rules (e.g. different fixed prices or different % per product).

---

## Targeting: site-wide only (no options in Targeting step)

Price test **targeting is always site-wide**. In the wizard, the **Targeting** step shows a fixed “Site wide” scope with no options to change. Updated prices are intended to show **everywhere on the site** where the test applies — including product pages and, where the theme supports it, **in sidecart** (cart drawer / mini-cart). The storefront injects cart attributes (`_ripx_price_test`, `_ripx_variant`) so a Discount Function can align checkout with the test price; themes that render cart line items in the DOM may show the test price in sidecart when the script can find and update those elements (theme-dependent).

## Product scope: all products vs selected products (Variant configuration only)

**Where to set it:** The choice between “all products” and “selected products” is **only in Variant configuration** (Product scope). The Targeting step does not expose this; it only shows “Site wide”.

| Scope                      | Behavior                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All products**           | The test runs on every product page (and, where supported, in sidecart). The same variant price rule (e.g. 10% off) is applied on any PDP. Use for store-wide pricing experiments.                                                                                                                                          |
| **Selected products only** | You choose which products (by ID) in Variant configuration. The storefront applies the price change **only on the PDP of those products** (and in sidecart for those items when detectable); other product pages show catalog price and are not in the test. Use to test price on a subset (e.g. one category, a few SKUs). |

**How "selected products" works:** The test payload includes `target_type: 'product'` and `target_ids: [gid1, gid2, ...]`. On each product page the script reads the current product ID (from the page). It only runs the price test and applies the discount when that ID is in `target_ids`. So the discount applies **only for those products**; no DOM change or variant assignment for other PDPs.

**Sidecart:** Cart drawer / mini-cart line items are often rendered with catalog prices by the theme. Showing the test price in sidecart requires either (a) the storefront script to find and update line-item price elements in the cart UI (theme-dependent selectors), or (b) a Discount Function so checkout and any cart UI that reads discounted totals show the test price. RipX injects cart attributes so a Discount Function can align **checkout**; sidecart display is best-effort where the theme’s cart DOM is detectable.

**Checkout alignment for selected products:** If you use a Discount Function or automatic discount to align checkout with the test price, ensure it applies only when the cart contains one of the targeted products (e.g. by product ID or line-item attribute), so you don't discount unrelated products.

---

## Statistical significance and run duration

Price tests need enough data to distinguish real effects from noise.

- **Confidence level:** 95% (p &lt; 0.05) is the usual standard; 99% for high-stakes pricing.
- **Statistical power:** Aim for 80% so you don’t miss real improvements.
- **Run duration:** At least **2–4 weeks**; avoid stopping early to reduce false positives.
- **Sample size:** Aim for **200–300+ conversions per variant** (or use a sample-size calculator). Detecting a 10–20% relative lift is realistic.
- **One change at a time:** Isolate price so conversion/revenue changes are attributable.

Set the **significance level** (e.g. 95%) in RipX Goal &amp; Metrics for consistent evaluation.

---

## 1. Why price testing on Shopify is hard

| Layer                  | Challenge                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Storefront (PDP)**   | Themes render price in many DOM shapes; variant switches re-render nodes.                                                                                                                                           |
| **Cart / drawer**      | Line items use **catalog** prices from Shopify; JS cannot change what the **checkout** charges without platform hooks.                                                                                              |
| **Checkout**           | Only **Shopify Plus** (legacy Checkout Scripts) or **Shopify Functions** (e.g. Cart Transform) can adjust **paid** price per segment. Standard stores have no public API to change checkout line price arbitrarily. |
| **Feeds & ads**        | Google Shopping, Meta, email feeds read **Shopify catalog** prices. If PDP shows a different price than the feed, users see “bait and switch.”                                                                      |
| **Bundles**            | Shopify allows **one Cart Transform per line item**. Bundle apps and price-test Functions **conflict** (documented by Intelligems and Shopify constraints).                                                         |
| **Multi-currency**     | Markets / FX: test prices in default currency; other markets often need fixed price lists or partner setup (e.g. Global-E).                                                                                         |
| **Subscriptions**      | Recharge / Stay.ai / etc. need coordinated integration for true subscription price tests.                                                                                                                           |
| **Compliance & trust** | Avoid discriminatory pricing; keep deltas reasonable; disclose where required.                                                                                                                                      |

---

## 2. How leading tools solve it

### A. **Shopify Functions (Cart Transform) + “highest price in catalog”** (e.g. Intelligems)

1. Set Shopify product price to the **maximum** price in the experiment (feeds + PDP baseline).
2. At **cart/checkout**, a **Function** applies adjustments so each segment sees its test price (often as line discounts or transformed lines).
3. **Pros:** Paid price matches test; works with modern checkout.
4. **Cons:** Plus / Functions deployment, bundle conflict, app-specific setup, merchant plan limits.

### B. **Checkout Scripts (Shopify Plus, legacy)**

1. Same “highest price in Shopify” pattern.
2. Script **reduces** price for lower buckets at checkout (cannot increase above line price the same way Functions can).
3. **Cons:** Plus only; Shop Pay may show discount line items; being phased toward Functions.

### C. **Duplicate / unlisted products**

1. One SKU per price point; redirect or swap product per cohort.
2. **Pros:** True catalog price per variant.
3. **Cons:** Feed duplication, inventory sync, cleanup after test, SEO duplication unless excluded.

### D. **Display-only (DOM) price change**

1. JavaScript changes **visible** price on PDP (and sometimes cart UI).
2. **Pros:** Works on any plan; no Functions.
3. **Cons:** **Checkout charges catalog price** unless combined with discounts — good for **perceived price / messaging** tests or when combined with automatic discounts, **not** for true paid-price experiments without checkout integration.

---

## 3. Common merchant problems

1. **Cart/checkout mismatch** — Customer sees $29 on PDP, pays $39 at checkout → support tickets, trust loss.
2. **Theme breaks** — Price lives in Shadow DOM, React island, or dynamic section; script misses selector.
3. **Variant change flicker** — Correct price flashes then resets when buyer switches variant.
4. **Google Shopping vs site** — Feed shows lower price than site or reverse.
5. **ERP sync** — NetSuite etc. overwrite Shopify price and break “highest price” strategy.
6. **Bundles + price test** — Only one transform wins.
7. **Analytics** — Revenue attributed to wrong variant if checkout price ≠ displayed price.

---

## 4. Best practices (industry)

1. **Align paid price with experiment** — Use Functions/Scripts or duplicate products; avoid display-only for revenue claims.
2. **Set catalog to max test price** when using checkout adjustments — feeds show high; onsite can show lower for test cells (better UX than high ads + low site).
3. **Document limitations** in-app for merchants.
4. **Stability on PDP** — Observers + broad selectors + reapply on `variant:change` / section load.
5. **Use store currency** — Format with `Shopify.formatMoney` or `Intl` + shop currency.
6. **End tests cleanly** — Archive duplicates; revert catalog prices; update feeds.

---

## 5. RipX today vs roadmap

### Today (RipX)

- **Assignment:** Cookie/session-based variants via RipX API.
- **Price test:** Storefront script updates **displayed** price **on the product page (PDP) only** — scoped to the main product (not cart drawers, related-product sections, or collection grids). Uses store currency, observers, and variant/section events. **Product targets only:** collection targeting does not match PDP, so price tests must target one or more **products** (not collections alone).
- **Checkout alignment hook:** Add-to-cart forms are injected with cart attributes `_ripx_price_test` and `_ripx_variant` so a Discount Function (when deployed) can read them and apply the right discount at checkout. Until that Function exists, **checkout remains Shopify catalog price**.
- **Gap vs Intelligems-class:** No Cart Transform / Checkout Script today — **PLP/collection card prices** are not swapped yet (same cohort price on every card would be wrong without per-product assignment).

### Roadmap (optional, advanced)

| Initiative                                 | Effort | Benefit                                                    |
| ------------------------------------------ | ------ | ---------------------------------------------------------- |
| **Shopify Function app extension**         | High   | True checkout-aligned price tests for eligible merchants.  |
| **Automatic discount codes per cohort**    | Medium | Approximate lower-price arms without Plus (complex rules). |
| **Collection / quick-buy loops**           | Medium | Apply display price across listing cards.                  |
| **Admin “price test readiness” checklist** | Low    | Feeds, bundles, currency warnings.                         |

---

## 6. Configuration approaches (fixed vs relative)

| Approach                                                | Pros                                                                | Cons                                                                        | Checkout alignment                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Fixed price per variant** (table: variant → price)    | Exact control; same UX as “duplicate product” tests.                | One price per cohort; multi-product tests need many rows or separate tests. | If catalog = max test price, use discount/Function at checkout to match.                               |
| **Fixed amount on/off** (e.g. +$5 or −$5 for a variant) | One setting applies to all products in test; easy “site-wide” feel. | Less control per product; catalog must be same currency/scale.              | Merchant can set catalog high and use automatic “$X off” discount per segment (manual or app).         |
| **Percent off** (e.g. 10% off for variant B)            | Scales across products; good for “sale” tests.                      | Percent of what (compare-at vs price) can confuse.                          | Same as amount: discount at checkout or Cart Transform.                                                |
| **Both** (choose per variant: fixed or delta/%)         | Flexibility: control for hero products, delta for rest.             | More UI; need to document when each is used.                                | Per-variant fixed → catalog = that price or max; delta/percent → catalog = base, discount at checkout. |

**Recommendation:** Support **both** in the wizard: per-variant **price mode** (Fixed price | Amount off/on | Percent off) and one **value** per variant. Table: Variant name | Mode | Value. Control often has “Use catalog” (no override); test variants have fixed 24.99 or “−5” ($ off) or “10” (% off).

---

## 7. Checkout impact and “fake” perception

- **Display-only (no checkout change):** Customer sees $29 on PDP but pays $39 at checkout → feels like a bait-and-switch, support tickets, trust loss. **Not acceptable** for true price experiments if the merchant wants to charge the displayed price.
- **Ways to align checkout with displayed price:**
  1. **Shopify Plus + Cart Transform / Functions:** Backend applies line-level discount or price override per segment; paid price matches test. Best UX; requires Plus and (often) one Cart Transform per store.
  2. **Catalog = max test price + discount at checkout:** Set Shopify catalog to the **highest** test price. For lower test cells, apply an automatic or Function-based discount so charged price = displayed price. Feeds (Google, Meta) show the high price; PDP and checkout show the discounted price for that segment.
  3. **Discount codes per cohort:** Generate a unique code per variant and show it on PDP (“Use code X for this price”). Checkout matches, but UX is clunky and codes can leak.
  4. **Display-only for “messaging” tests:** If the goal is to test **perception** (e.g. “was $39, now $29”) and the merchant is OK charging catalog price, document clearly that checkout will show catalog; use for copy tests, not true price experiments.

**RipX today:** Display-only on PDP. To avoid “fake” feeling, we document: (1) set catalog to the **highest** test price when possible, (2) use automatic discounts or Plus/Functions so checkout matches display, or (3) use price tests only for messaging/perception when catalog price is acceptable.

---

## 8. Cart Transform vs Discount Functions (Shopify APIs)

| Aspect            | Cart Transform                                                                                                                                                                        | Discount Functions                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Limit**         | **One** cart transform per store.                                                                                                                                                     | Up to **25** discount functions per store.                                                        |
| **Use case**      | Override line item price, title, image; bundles (merge/expand lines).                                                                                                                 | Apply product/order/shipping discounts; can target by cart attributes, buyer, cart lines.         |
| **Plan**          | Development stores or **Shopify Plus** only for `lineUpdate` operations.                                                                                                              | Works on standard plans (automatic/code discounts).                                               |
| **Selling plans** | **Incompatible:** Shopify rejects `lineExpand`, `linesMerge`, and `lineUpdate` when a selling plan (subscription) is present. Price-test transforms cannot run on subscription items. | Partially supported (e.g. recurring orders); function not re-run when recurring order is created. |
| **Bundles**       | One transform wins; bundle apps and price-test transforms **conflict** if both use Cart Transform.                                                                                    | Discounts can stack per combination rules; no conflict with bundle presentation.                  |

**Implication for RipX:** A future Cart Transform–based price test would consume the store’s single transform slot and would not work on subscription products. A **Discount Function** that reads a cart attribute (e.g. `ripx_variant_id`) and applies a per-line or order discount is an alternative that doesn’t consume the Cart Transform slot and can coexist with bundles.

---

## 9. compare_at_price and “percent off list”

- **Liquid:** `variant.compare_at_price` is in currency subunits (cents); use the `money` filter for display.
- **Theme JSON:** Some product JSON (e.g. `#ProductJson`) and Storefront API expose `compare_at_price`; endpoints have been reported to sometimes omit it — theme-dependent.
- **Display:** Many themes show “Was $X, now $Y” using `.price--compare` or a separate compare-at element. RipX avoids painting over compare-at nodes (e.g. `.price:not(.price--compare)`) so we don’t overwrite “Was” with the test price.
- **Percent off:** Merchants often mean “X% off **list** (compare-at)” not off current price. Supporting a **price base** (`price` vs `compare_at`) for amount/percent modes lets “10% off compare-at” work when the theme exposes `compare_at_price` in JSON. **Fallback:** If the theme omits `compare_at_price` (or it is null), the storefront falls back to the variant's **selling price** so amount/percent still apply.

---

## 10. Variant change (PDP): recompute and paint

When the visitor changes the selected product variant (e.g. size or color), the displayed test price must reflect the **new** variant's catalog price for amount/percent modes. The storefront listens for `variant:change`, `shopify:section:load`, `product:update`, and the variant input `change` event; **recomputes** the test price from the current variant's catalog (or compare-at) and **repaints** the PDP price nodes. Fixed price mode repaints the same value. If catalog (or compare-at when used as base) is missing for the new variant, the script does **not** overwrite the DOM, so the theme's catalog price stays visible instead of a stale test price.

---

## 11. Subscriptions and selling plans

- **Cart Transform:** No `lineUpdate` (or merge/expand) when a **selling plan** is attached to the line. Subscription products cannot use Cart Transform for price overrides.
- **Display-only:** Themes may show subscription pricing (e.g. “$X/month”); overwriting the main price node can clash with subscription UI or leave compare/savings wrong. Document that price tests are best used on one-time purchase products unless the theme clearly separates one-time vs subscription price nodes.
- **Discount Functions:** Partially supported on recurring orders; logic may not re-run on every recurrence.

---

## 12. Multi-currency and markets

- **Markets / FX:** Storefront and checkout can show a market-specific currency. RipX format uses `getShopCurrency()` (theme/Shopify.currency) so displayed test price is in the same currency as the rest of the page.
- **Catalog source:** Product JSON and meta usually expose prices in shop (or presentment) currency. Testing in the **default** (shop) currency is most reliable; multi-currency storefronts may need separate tests or fixed prices per market.
- **Best practice:** Run price tests in the primary market/currency; document that other markets may see catalog price or need manual alignment.

---

## 13. Price test readiness checklist

Before running a price test, merchants (and in-app guidance) should confirm:

1. **Checkout alignment** — If the goal is “charged price = displayed price,” catalog should be set to the **highest** test price and discounts/Functions used at checkout for lower arms; or accept display-only for perception tests.
2. **Feeds & ads** — Google Shopping, Meta, etc. use catalog. If catalog is raised to max test price, feeds show that; PDP and checkout can show the discounted price per segment.
3. **Bundles** — If the store uses a bundle app that uses Cart Transform, a Cart Transform–based price test would conflict (one transform per store). Prefer Discount Functions or display-only for those stores.
4. **Subscriptions** — Selling plans block Cart Transform price overrides. On subscription products, use display-only with caution (theme may show subscription price in a different node).
5. **Currency** — Test in shop/default currency first; multi-currency requires care (same catalog in all currencies or market-specific strategy).
6. **Product targeting** — RipX applies PDP price only when the page is a **product** page and the product is in the test target list; collection-only targeting does not change PDP price.

---

## 14. Troubleshooting

| Symptom                           | Check                                                                                                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Price doesn’t update on PDP       | Test targets **products** (not collection-only). Confirm you’re on a product page for a targeted product. Ensure the RipX script loads (e.g. App Proxy or embed with correct `shop`).                                                                                                                      |
| Wrong price after variant change  | Theme must expose variant in `input[name="id"]` or product JSON; RipX listens for `variant:change` and variant input `change`. If theme doesn’t fire these, price may lag. If catalog price is missing for the new variant, the script leaves the theme's price visible instead of painting a stale value. |
| Amount/percent mode shows nothing | Catalog price is read from `#ProductJson` or `ShopifyAnalytics.meta.product`. If the theme doesn’t output product JSON or meta, use **fixed price** instead. Enable script `DEBUG` (e.g. `?ab_debug=1`) to see console logs.                                                                               |
| Compare-at base does nothing      | Many themes omit `compare_at_price` in product JSON. Use **Selling price** as base, or set compare-at in Shopify admin and confirm theme exposes it in the product object.                                                                                                                                 |
| Checkout shows different price    | Display-only tests don’t change checkout. Set catalog to the highest test price and use automatic discounts or Plus/Functions so checkout matches; or use for perception tests only.                                                                                                                       |
| Debug: is the script applying?    | When a price test is active on the PDP, the main product root has `data-ripx-price-test="<testId>"`. Inspect the DOM to confirm the test is running.                                                                                                                                                       |

---

## 15. References

- **Intelligems (competitor / inspiration):** [Price testing FAQs](https://docs.intelligems.io/price-testing/price-testing-faqs). For a deep comparison and improvement ideas, see **docs/research/INTELLIGEMS_RESEARCH.md**.
- [Convert — Shopify price testing guide](https://www.convert.com/blog/shopify-ab-testing/shopify-price-testing-guide/)
- [Shopify Cart Transform Function API](https://shopify.dev/docs/api/functions/reference/cart-transform) — one per store; selling plans block lineUpdate.
- [Shopify Discount Function API](https://shopify.dev/docs/api/functions/latest/discount) — up to 25 functions; cart attributes for targeting.
- [discountAutomaticAppCreate](https://shopify.dev/docs/api/admin-graphql/2025-01/mutations/discountAutomaticAppCreate) for segment-based automatic discounts.
- [Liquid: variant object](https://shopify.dev/docs/api/liquid/objects/variant) — price, compare_at_price in subunits.
- [A/B testing sample size and statistical significance](https://convertibles.dev/pages/ab-test-calculator) — calculators and guidance.

---

---

## 16. RipX implementation notes

- **Storefront:** `applyPriceTest()` runs only on PDP; it skips when `priceMode === 'control'` or when fixed mode has no price. Product scoping: when `target_type === 'product'` and `target_ids` is set, price is applied only when the current page product ID is in `target_ids`; otherwise all product pages get the test (all-products). On variant change (e.g. size/color), the script recomputes the test price for amount/percent modes and repaints; if catalog (or compare-at) is missing for the new variant, it does not overwrite the DOM so the theme's price remains visible.
- **Backend:** Test payload includes `target_type` and `target_ids` (array of product IDs/GIDs) when Product scope is “Selected products only.” `getTestsByShop` and `getActiveTestsForStorefront` parse `target_ids` from JSON so the script config receives `targetIds` for product-scoped tests.
- **Inference:** `testType.js` infers template_key `price` when variant config contains `price`, `priceMode`, `priceDelta`, or `pricePercent`.

---

_Last updated: In-app Documentation cross-ref; variant change recompute; compare-at fallback; implementation notes and troubleshooting. Revisit when Shopify exposes multi-transform or simpler checkout price APIs._

For other test types (content, split-URL, template, shipping, offer, checkout, combination), see **docs/research/ALL_TEST_TYPES.md**. The in-app **Documentation → Price testing (Shopify)** section summarizes this guide and adds troubleshooting and readiness checks. For competitor insight and improvement ideas, see **docs/research/INTELLIGEMS_RESEARCH.md**. For **advanced research** (competitor matrix, Shopify platform state, sequential testing, MDE, segmentation, and the recommended “best approach” for RipX), see **docs/research/ADVANCED_PRICE_TESTING_RESEARCH.md**. For an actionable implementation plan (catalog warning, CSV roll-out, quick-fill, Discount Function, etc.), see **docs/research/PRICE_TEST_IMPLEMENTATION_ROADMAP.md**.
