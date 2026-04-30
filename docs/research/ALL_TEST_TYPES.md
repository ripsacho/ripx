# RipX test types — research & implementation guide

Reference for every test type: how it works, platform limits, and how to improve it.

---

## Overview

| Type                              | Storefront behavior                   | Checkout / backend                  | Notes                                                         |
| --------------------------------- | ------------------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| **Price**                         | PDP display + cart attributes         | Catalog unless Discount Function    | Product scope: all or selected. See SHOPIFY_PRICE_TESTING.md. |
| **Content / Onsite edit / Theme** | Custom CSS/JS injected per variant    | N/A                                 | DOM-only                                                      |
| **Split URL**                     | Redirect to variant URL when assigned | N/A                                 | Run before other tests                                        |
| **Template**                      | Config only; theme must support       | N/A                                 | Often needs theme or app                                      |
| **Shipping**                      | Config only                           | Needs Plus/Functions for real rates | Assignment only today                                         |
| **Offer**                         | Config only                           | Needs discount code or Function     | Assignment only today                                         |
| **Checkout**                      | Config only                           | Plus/Checkout Extensions            | Assignment only today                                         |
| **Combination**                   | Composes price + shipping (etc.)      | Per factor                          | Each factor needs its own alignment                           |

---

## Price test (summary)

In-app: **Documentation** → **Price testing (Shopify)**. Full research: **docs/research/SHOPIFY_PRICE_TESTING.md**.

**What it does:** Changes the **displayed** price on the product page (PDP) per variant. Supports fixed price, $ off/on (amount), and % off/on (percent). Control = catalog price (fixed with no value). Supports **price increases** (positive amount, negative %) as well as discounts.

**Product scope (variant config only):** “All products” (test on every PDP) or “Selected products only” (test only on chosen product IDs). Targeting step is site-wide only; no URL/segment options for price tests.

**Variant config fields:** `price`, `priceMode` ('fixed' | 'amount' | 'percent'), `priceDelta`, `pricePercent`, `priceBase` ('price' | 'compare_at'), optional `byProduct: { [productId]: { ... } }` for per-product overrides.

**Validation:** Fixed price ≥ 0; amount must be a valid number; percent between -100 and 100; when scope is “Selected products only,” at least one product must be selected. Validated on Traffic, Code, and Review steps.

**Variant change:** On PDP, when the visitor changes variant (e.g. size), the script recomputes the test price for amount/percent modes and repaints; if catalog is missing for the new variant, the theme’s price is left visible.

**Checkout:** Display-only; charged price = catalog unless you use a Discount Function (cart attributes `_ripx_price_test`, `_ripx_variant` are injected for that).

---

## 1. Content / Onsite edit / Theme

**What it does:** Injects custom CSS and/or JavaScript per variant so you can change copy, hide elements, or alter layout without editing the theme.

**How it works today:**

- Variant config: `customCss`, `customJs`, or combined `code` (optional `<style>` / `<script>` blocks).
- Storefront: `applyCustomCode(testId, variant)` adds `<style data-ab-test="...">` and `<script data-ab-test="...">` to the page.
- Scoped by test id so multiple tests don’t clash.

**Best practices:**

- Use specific selectors (e.g. `#product-title`, `.product__price`) so theme updates don’t break tests.
- Prefer CSS over JS when possible (performance, fewer flickers).
- Visual editor (if used) should output the same structure as the code editor for consistency.

**Limitations:**

- No server-side rendering; content is client-only (SEO impact if critical content is changed).
- Shadow DOM and some app-rendered areas may not be targetable.
- Heavy JS can slow LCP; keep payloads small.

**Improvements:**

- Document selector best practices and common theme patterns in-app.
- Optional: sanitize or limit inline script length to reduce risk.

---

## 2. Split URL

**What it does:** Sends visitors to different URLs per variant (e.g. `/pages/landing-a` vs `/pages/landing-b`) for full-page tests.

**How it works today:**

- Variant config: `url` (full or path-relative URL).
- Storefront: **Redirect** — when the assigned variant has a non-empty `config.url` and it differs from the current location, the script sets `window.location.href` to that URL. Control (empty url) stays on current page.
- Redirect runs early in init so the rest of the test logic (e.g. price, custom code) applies on the destination page.

**Best practices:**

- Use full URLs (same origin) or same-origin path so cookies and script stay valid.
- Ensure destination pages exist and return 200.
- Avoid redirect loops: variant URLs should not point back to a page that re-assigns and redirects again (use targeting so only one test applies per URL).

**Limitations:**

- Cross-origin redirects can lose session if cookies are not shared.
- One redirect per page load; multiple split-URL tests on the same URL can conflict (first-applied wins unless we define priority).

**Improvements:**

- Validate URL format in wizard (required for non-control variants).
- Optional: allow “path only” and prepend `window.location.origin`.

---

## 3. Template

**What it does:** Intended to let each variant see a different theme template (e.g. `product.alternate`, `collection.fullwidth`).

**How it works today:**

- Variant config: `template` (template name/suffix).
- Storefront: **No automatic application.** Shopify template is chosen at request time (server-side). Changing template from client-side JS is not supported; you’d need theme logic that reads a cookie/param and switches, or a theme app extension.

**Best practices:**

- Use for **documentation** of which template each variant should use; merchant or developer must implement the switch (e.g. theme that checks a cookie set by RipX and serves different template).
- Alternatively, use **Split URL** to send users to different URLs that each use a different template.

**Improvements:**

- In-app copy: “Template is for your reference; apply it via your theme or Split URL.”
- Optional: backend or script could set a cookie (e.g. `ripx_template_variant`) for the theme to read.

---

## 4. Shipping

**What it does:** You define a “shipping rate” or free-shipping threshold per variant to test impact on conversion.

**How it works today:**

- Variant config: `rate` (number or null for control).
- Storefront: **No application.** Shopify shipping is determined by cart, address, and shipping profile. Real rate overrides require Shopify Plus (Scripts) or **Shopify Functions** (delivery customization, rate overrides).

**Best practices:**

- RipX can **assign** variant (e.g. “free shipping” vs “standard”); actual application needs:
  - **Shopify Functions:** Delivery customization function that reads a cart attribute (e.g. `_ripx_variant`) and returns different rates or free shipping.
  - Or a **discount** that gives “free shipping” for a segment (Discount Function or automatic discount).
- Set cart attribute for shipping variant (same pattern as price) so a future Function can use it.

**Improvements:**

- In-app banner: “Shipping rates are not changed automatically. Use Shopify Plus/Functions or a free-shipping discount to apply the rate for each variant.”
- Optional: inject `_ripx_shipping_variant` (or reuse `_ripx_variant`) when a shipping test is active so a Delivery Function can read it.

---

## 5. Offer (discount)

**What it does:** You define a discount (percent off, fixed amount off, or free shipping) per variant.

**How it works today:**

- Variant config: `discount_type` ('percent' | 'fixed' | 'free_shipping'), `discount_value`.
- Storefront: **No application.** Checkout applies discounts from Shopify Admin (codes, auto discounts) or Discount Functions. RipX only assigns the variant.

**Best practices:**

- To apply the offer at checkout:
  - **Discount Function** that reads a cart attribute (e.g. `_ripx_variant`) and applies the matching discount.
  - Or create **discount codes** per variant and show the code in the variant (clunky but works without Functions).
- Reuse the same cart-attribute injection as price tests so one Function can handle both price and offer tests (by test id + variant).

**Improvements:**

- In-app banner: “Offers are not applied at checkout automatically. Use a Discount Function that reads cart attributes, or share discount codes per variant.”
- Validation: discount value ≥ 0; percent ≤ 100.

---

## 6. Checkout

**What it does:** Intended to test checkout UI (trust badges, copy, images) or checkout flow.

**How it works today:**

- Variant config: free-form (e.g. which creative to show).
- Storefront: **No application.** Checkout is hosted by Shopify; changes require **Checkout UI Extensions** or legacy Scripts (Plus). RipX can assign variant for analytics; the merchant needs an extension that reads the variant (e.g. from cookie or from a cart attribute passed through) and renders the right content.

**Best practices:**

- Use for **assignment + analytics** only unless you have a Checkout Extension that reads RipX variant (e.g. from cookie `ripx_*` or cart attribute).
- Document: “Checkout experience tests require a Checkout UI Extension that uses the assigned variant.”

**Improvements:**

- In-app copy: “Checkout tests assign a variant for analytics. To change checkout content, use a Checkout UI Extension that reads the assigned variant (e.g. from cart attribute).”

---

## 7. Combination

**What it does:** Tests two or more factors together (e.g. price variant × shipping variant) to measure interaction effects.

**How it works today:**

- Variants are combinatorial (e.g. Control+Control, Price A+Control, Control+Shipping A, Price A+Shipping A). Each variant has config for each factor (e.g. `price`, `rate`).
- Storefront: **Per-factor.** Price is applied if config has price fields; shipping/offer are not applied (same as single shipping/offer). Combination only changes assignment and config shape.

**Best practices:**

- Same as for each factor: price display + cart attributes; shipping/offer need Functions or manual setup.
- Ensure analytics record the full variant (e.g. “Price A + Shipping A”) so you can analyze interactions.

**Improvements:**

- Banner: “Each factor (price, shipping, offer) follows the same rules as single-factor tests. Price display and cart attributes apply; shipping/offer need Functions or discounts.”

---

## 8. Summary: what runs where

| Test type   | PDP display   | Cart attributes      | Checkout / shipping applied by |
| ----------- | ------------- | -------------------- | ------------------------------ |
| Price       | Yes (script)  | Yes (injected)       | Discount Function (optional)   |
| Content     | Yes (CSS/JS)  | No                   | N/A                            |
| Split URL   | Redirect only | No                   | N/A                            |
| Template    | No            | No (optional cookie) | Theme / app                    |
| Shipping    | No            | Optional             | Delivery Function / Plus       |
| Offer       | No            | Same as price        | Discount Function / codes      |
| Checkout    | No            | Optional             | Checkout Extension             |
| Combination | Per factor    | Per factor           | Per factor                     |

---

## Validation (wizard) by test type

| Type          | Validations                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Price**     | Fixed ≥ 0; amount = valid number; percent ∈ [-100, 100]; selected products required when scope = product; allocation = 100%. |
| **Split URL** | Non-empty variant URL must be valid (same-origin or full URL).                                                               |
| **Offer**     | Discount value ≥ 0; percent discount ≤ 100.                                                                                  |
| **All**       | Test name; goal metric; traffic allocation 100%; target ID when target type requires it.                                     |

---

_Last updated: Price test summary; in-app Documentation cross-ref; validation-by-type table. See SHOPIFY_PRICE_TESTING.md for full price-test research._
