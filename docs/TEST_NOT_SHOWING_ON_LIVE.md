# Test works in preview but not on live URL

If your test runs when you use the **preview link** (e.g. with `?ab_preview=1` or from the RipX editor) but **does not show on the live store URL**, use this checklist.

## Why preview behaves differently

- **Preview:** The app forces the test variant for the preview test ID and does not apply normal targeting (product/collection/URL). So you always see the test.
- **Live:** The storefront script only shows a test when:
  1. The script is loaded on the store with the correct shop domain.
  2. The test is in the **active** list for that shop (status Running, or personalized/rollout).
  3. **Targeting** matches the current page (product, collection, or URL/segment rules).
  4. The **assignment API** (`/track/variant`) returns a variant (URL pattern, device, and other segment rules must match).

---

## 1. Script is loaded on the live store

- **Shopify:** The RipX script must be installed via **App embed** or **App Proxy** so the storefront loads it with `?shop=your-store.myshopify.com`.
  - Check: Open the live store page → View source (or Network tab) → look for the RipX script URL (e.g. `/apps/ripx/script.js` or your proxy path). If it’s missing, add the app block/embed in the theme or configure the App Proxy in Partner Dashboard.
- **Standalone:** The script must be included with `?site=yourdomain.com` (or your backend’s equivalent) so the backend can resolve the domain and return active tests.

If the script is not loaded, or loaded without `shop`/`site`, the config will have no (or wrong) `activeTests` and no test will run.

---

## 2. Test is active for that shop

- In RipX, the test must be **Running** (or in a state that’s included in “active” tests, e.g. personalized/rollout).
- The test’s **shop/domain** must match the store where you’re testing. If you have multiple stores, ensure the test is for the same shop as the live URL.

---

## 3. Page targeting matches the live URL

### Product / collection targeting

- If the test targets **specific product(s)** or **collection(s)**, the **live page** must be that product or collection page.
- The storefront detects “current product” from `window.ShopifyAnalytics.meta.product.id` or `[data-product-id]` (and similar for collection). If your theme doesn’t set these, the script may think you’re not on a product/collection page and skip the test.
- **Check:** Open the **live product page** (same product as in targeting). If the test only runs on “product X”, it will not run on the homepage or another product.

### URL / segment targeting

- If the test has **URL pattern** or **page rules** (e.g. “only on homepage”, “only on /collections/…”), the **live URL** (path or full URL, depending on rule) must match.
- Preview often uses a URL that matches (e.g. the exact product URL). On live, if you’re on a different path or query, the rule may not match and the backend will not assign a variant.

**What to do:**

- In RipX, open the test → **Targeting** (or Segments).
- Note the **Target type** (e.g. Product, Collection, Homepage) and **URL / page rules**.
- On live, open the **exact** page type and URL that match those rules (e.g. the chosen product page, or the homepage).

---

## 4. Debug mode: see why a test is skipped

On the **live store page** (where the test should run):

1. Open DevTools → Console.
2. Before the page loads the RipX script, run:
   ```js
   window.__RIPX_DEBUG__ = true;
   ```
3. Reload the page (so the script runs with debug on).

You should see logs such as:

- **“No active tests in config”**  
  → Script not getting the right shop/domain, or no active tests for that shop. Fix script installation and test status/shop.

- **“Test skipped (target mismatch): … targetType=product … current product=none”**  
  → You’re not on a product page, or the theme doesn’t expose product ID. Use a product page and/or fix theme so the script can read the current product/collection.

- **“Test skipped (no variant assigned)”**  
  → Backend did not assign a variant (URL pattern, device, or other segment rules don’t match). Adjust targeting so the live URL and context match, or confirm URL/segment rules in the test.

---

## 5. Quick checks

| Check                            | What to do                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Script on live page              | View source / Network: script URL present and requested with correct `shop` or `site`.                           |
| Test status                      | RipX: test is **Running** and for the **same shop** as the live store.                                           |
| Same page as targeting           | Live URL is the same “type” as in targeting (e.g. that product page, or homepage if targeting homepage).         |
| URL / page rules                 | Targeting URL or page rules match the live path/URL (no typo, correct regex).                                    |
| Theme exposes product/collection | On a product page, in console run `window.ShopifyAnalytics?.meta?.product?.id` or check for `[data-product-id]`. |

---

## Summary

- **Preview** bypasses targeting, so it always shows the test.
- **Live** requires: script loaded with correct shop/site, test active for that shop, **and** targeting (product/collection/URL/segments) to match the **exact** live page you’re on.
- Use **`window.__RIPX_DEBUG__ = true`** and reload the live page to see in the console why a test is skipped (no config, target mismatch, or no variant assigned).
