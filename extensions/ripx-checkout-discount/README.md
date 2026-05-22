# RipX checkout discount function

JavaScript Shopify Function (**Discount API**, `cart.lines.discounts.generate.fetch` + `.run`) for RipX discount-style surfaces. Price tests now use the Cart Transform direct API; direct-shaped price-test lines are intentionally skipped here.

## Requirements

- **[Shopify CLI](https://shopify.dev/docs/api/shopify-cli)** 3.x on your machine for `shopify app function build` / `typegen` / `deploy` (or use `npm exec shopify` from `extensions/ripx-checkout-discount` after `npm install` there).
- **Shopify Plus / Enterprise** with **network access** enabled for discount functions ([docs](https://shopify.dev/docs/apps/build/discounts/network-access)) when you rely on fetch-based discount resolution.
- RipX storefront script must inject `properties[_ripx_*]` on add-to-cart.
- `**shopify.extension.toml` `api_version**` must be a supported Functions API release for your CLI; after changing it, run `shopify app function schema --path extensions/ripx-checkout-discount` then `typegen` and `build` (aligned with root `shopify.app.toml` webhook API where practical).

## Go-live checklist (what you must do)

RipX cannot click Shopify Admin for you. Work through this once per production app:

1. **RipX server** — Deploy backend with `**APP_URL`** = public HTTPS origin. Set `**RIPX_CHECKOUT_PRICE_SECRET**`in production`.env`(recommended). Use a long random value (e.g.`openssl rand -hex 32`); the API compares it with a **timing-safe\*\* check.
2. **Sync function config from `.env`** (repo root):

```bash
 npm run shopify:checkout-discount:sync-config
```

This writes `src/ripxConfig.js` from `APP_URL` (or `RIPX_PRICE_RESOLVE_BATCH_URL`) and `RIPX_CHECKOUT_PRICE_SECRET`. If Git shows this file modified after sync, treat it as a local/generated build artifact and do not commit the secret-bearing diff.

3. **Build the WASM** — From repo root:

```bash
 npm run shopify:checkout-discount:install
 npm run shopify:checkout-discount:typegen
 npm run shopify:checkout-discount:build
```

Or one shot (after `.env` is set): `npm run shopify:checkout-discount:prepare`.

4. **Deploy the app** — `shopify app deploy` (or your pipeline) so the function extension is on the same app as the storefront script.
5. **Shopify Admin → Discounts** — Create an automatic/app-backed product discount that uses this app’s discount function when using offer/discount surfaces.
6. **Smoke test** — Add a line for an offer/discount test and confirm the expected discount applies. For price tests, inspect the Cart Transform extension instead.

### Fast recovery (when diagnostics show config drift)

If `verify:price-pipeline` reports `extension_config_matches_env` drift, run from repo root:

```bash
npm run shopify:checkout-discount:sync-config
npm run shopify:checkout-ui:sync-config
npm run shopify:checkout-discount:build
shopify app deploy
RIPX_VERIFY_SHOP=ripperx-3.myshopify.com npm run verify:price-go-no-go -- --shop=ripperx-3.myshopify.com
```

This ensures extension config matches server `.env` and re-checks readiness with live shop context.

## Server-side QA (RipX API)

Before debugging checkout, verify the backend is configured for the Discount Function:

- **RipX app UI:** **Settings → Installation** → **Checkout price test health** → **Run check** — uses `**GET /api/settings/checkout-price-diagnostics`\*\* (session auth, same JSON as the public route; avoids browser CORS when the UI is on another origin).
- **Config API (session auth):**
  - `**GET /api/settings/checkout-price-function-config`\*\* — returns env + extension `ripxConfig.js` snapshot, masked secret previews, and drift status.
  - `**PUT /api/settings/checkout-price-function-config**` — writes extension `ripxConfig.js` using either explicit values (`batchUrl`, `checkoutSecret`, probe flags) or `{ "syncFromEnv": true }`.
- `**GET /api/track/price-checkout-diagnostics**` — no auth; batch URL, HTTPS, secret mode, batch max, and (when `src/ripxConfig.js` exists on the API filesystem) **drift vs server `.env`** — batch URL + `RIPX_CHECKOUT_PRICE_SECRET`. Omit with `**RIPX_DIAGNOSTICS_SKIP_EXTENSION_CONFIG=true**` in minimal images.
- `**GET /api/track/price-checkout-diagnostics?shop=your-store.myshopify.com**` — same, plus registered-tenant check and count of **running** tests with `type=price`.

See also `**backend/docs/PRODUCT_EXCELLENCE_ROADMAP.md`\*\* for the long-term product strategy.

## Behavior notes

- **Price tests** — Cart/checkout price alignment is owned by the Cart Transform extension using `_ripx_price_method=direct_price_override` and `_ripx_target_unit`; those lines are skipped by this function.
- `**priceBase: compare_at`** — The fetch query loads `compareAtAmountPerQuantity` from `CartLineCost` and sends `**compare_at_unit**` per line so the API matches storefront **amount/percent\*\* math off compare-at. If Shopify hides compare-at for the buyer, the API returns `compare_at_unavailable` for that mode (no discount).
- **Personalization / rollout** — Tests with status `stopped` or `completed` but `personalization_mode` `personalized` or `rollout` are treated as active for checkout (same as storefront `activeTests`).
- `**pricing` vs `price`\*\* — Both types are accepted in the resolver and in running-test counts.
- **Selection strategy `ALL`**: multiple cart lines each get their own fixed-amount discount. (`FIRST` would only apply one candidate.)
- **Method safety**: lines marked `_ripx_price_method` / `_ripx_price_application_method` as `direct_price_override` or direct-shaped price lines carrying `_ripx_target_unit` / `_ripx_discount_unit` without offer markers are excluded from discount application and local fallback.
- **HTTP errors**: if the batch URL returns a non-2xx status, or JSON without `success` / `lines`, the function applies no discounts.
- **Header** `X-RipX-Client: ripx-checkout-discount` is sent for server log filtering.
- **Shopify network limits** ([performance & resilience](https://shopify.dev/docs/apps/build/functions/network-access/performance-and-resilience)):
  - `**readTimeoutMs`** must be between **100 and 2000** (RipX uses **2000\*\*).
  - **Response size**: headers + body must stay under **~100KB** or Shopify returns 502.
  - **Caching**: Shopify caches successful fetch responses up to **~300s** per identical request key (same store); 5xx/429 cached shorter. After changing a live test, checkout may briefly reflect a cached discount until the cache entry expires.
- **RipX API**: `POST …/price-resolve-batch` loads all distinct `test_id`s in **one SQL query** when possible (stays under the 2s timeout). Responses default to **compact** `{ line_id, applies, discountDecimal }` per line; set `**RIPX_PRICE_BATCH_FULL_RESPONSE=true`** on the server if you need `reason` / `targetLineDecimal` for debugging. If the JSON would exceed Shopify’s size budget, RipX returns **HTTP 413\*\* (function then applies no discount — lower `PRICE_RESOLVE_BATCH_MAX` or cart complexity).

## Configure (details)

- `**npm run shopify:checkout-discount:sync-config`\*\* — generates `src/ripxConfig.js` from root `.env`:
  - `**RIPX_PRICE_RESOLVE_BATCH_URL**` if set, else `**APP_URL**` + `/api/track/price-resolve-batch`
  - `**RIPX_SHIPPING_RESOLVE_BATCH_URL**` if set, else `**APP_URL**` + `/api/track/shipping-resolve-batch`
  - `**RIPX_CHECKOUT_PRICE_SECRET**` optional
- `**npm run shopify:checkout-ui:sync-config`\*\* — generates ignored checkout UI config at `extensions/ripx-checkout-ui/src/ripxConfig.generated.js`.
- Or edit `**src/ripxConfig.js**` manually and run `**npm run shopify:checkout-discount:build**` only.

Then `**shopify app deploy**` / `**shopify app dev**` so Admin can attach the function to a discount.

## Files

- `src/cart_lines_discounts_generate_fetch.*` — builds the batch POST from cart lines + `_ripx_*` attributes.
- `src/cart_lines_discounts_generate_run.*` — applies **fixed amount** discounts per cart line from the JSON response.
- Delivery targets are no-ops (required when both line + delivery fetch targets exist in some setups).
