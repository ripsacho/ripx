# RipX Price Test Flow

This runbook documents the end-to-end price-test path so future debugging can start from the right handoff point. Price tests intentionally use two layers:

- Storefront JavaScript changes the visible product-page price and adds signed RipX line properties before cart add.
- Shopify Functions use those properties to align cart/checkout pricing where Shopify allows it.

## 1. Test Setup In Admin

Owner files:

- `frontend/src/components/TestWizard/TestWizard.jsx`
- `frontend/src/components/TestWizard/wizardValidation.js`
- `frontend/src/components/TestWizard/wizardVariantConfigHelpers.js`
- `frontend/src/components/TestWizard/testWizardConfig.js`
- `frontend/src/utils/previewUrl.js`
- `frontend/src/components/TestCreator/TrafficAllocationSlider.jsx`

Flow:

1. The wizard builds the price-test config. The important fields are `type`, `target_type`, `target_ids`, variant `config`, `priceApplicationMethod`, and matrix overrides under `byProduct` / `byVariant`. Defaults and config key shape live in the helper/config files, not only in the main wizard component.
2. Validation must accept root-level prices and matrix-only prices. If a product/variant row has the only configured price, `configHasPriceDeep` in `wizardValidation.js` is the guard that should pass it.
3. Preview links are built by `previewUrl.js`. Normal preview includes debug UI; simple preview adds `ab_preview_simple=1` and should not pollute live sessions.
4. Price tests can use all-products targets. Admin values such as `all_products` must normalize to storefront `all-products`.
5. `TrafficAllocationSlider.jsx` is shared allocation UI for multiple test types; only its preview/simple-preview actions are price-flow specific through parent handlers.

Debug first:

- Confirm the saved test has `type: price` or normalized `pricing -> price`.
- Confirm matrix config exists under the selected non-control variant.
- Confirm the preview URL has `ab_preview_test`, `ab_preview_variant`, and `ab_preview_domain`. `ab_preview=1` is expected on generated links, but persisted `__ripx_preview_ctx_v1__` / `window.name` or `ab_preview_test` can still drive preview behavior without it.

## 2. Script Runtime Config

Owner files:

- `backend/src/utils/storefrontScriptRuntime.js`
- `backend/src/routes/proxyRoutes.js`
- `shopify/storefront-script.js`
- `frontend/public/ripx-storefront.js`

Flow:

1. The app proxy serves `/apps/ripx/script.js`.
2. `buildStorefrontRuntimeConfig` embeds `apiUrl`, `shopDomain`, `version`, consent flags, and active test metadata into the storefront runtime.
3. `SCRIPT_VERSION` controls storefront cache invalidation. Keep it aligned across `backend/src/utils/storefrontScriptRuntime.js`, `frontend/src/constants/app.js`, `extensions/ripx-theme/blocks/ripx-app-embed.liquid`, and `extensions/ripx-theme/assets/ripx-app-embed-loader.js`.
4. `mapTestToStorefrontPayload` normalizes DB fields for the browser, including price test target type and product ID lists.
5. Static `activeTests` contains targeting metadata, not full variant price matrices. Variant config arrives from live `/track/variants` or preview `/track/preview` / `/track/preview-storefront-test`.

Debug first:

- On storefront console, run `window.RipX?.version`.
- If it is `undefined`, inspect whether `/apps/ripx/script.js` is present in `document.scripts`.
- If scripts are missing, check the theme app embed, app proxy route, and storefront password/custom theme restrictions before debugging price math.

## 3. Live Bucketing

Owner files:

- `shopify/storefront-script.js`
- `backend/src/routes/trackRoutes.js`
- `backend/src/services/abTestEngine.js`

Flow:

1. For live sessions only, `getVariantCachePromise` sends active test IDs plus page context to `/api/track/variants`. Preview mode skips this live batch to avoid polluting assignments.
2. The request includes current URL/pathname, product ID, collection ID, device, customer type, traffic source, UTM data, session count, and JS targeting results.
3. `/api/track/variants` validates tenant/test IDs, builds the backend context, and calls `abTestEngine.getVariantsBatch` or `getVariant`.
4. The response is signed with assignment proof before returning to the browser. Search for `withAssignmentSignature`, `signPriceAssignment`, and fields such as `assignment_sig`, `assignment_ts`, and `assignment_user`.
5. The browser records live diagnostics using `window.RipX.qa()` / `window.RipX.liveDiagnostics()`.

Debug first:

- Network filter: `/track/variants`.
- Response should contain the test ID under `variants`.
- If not assigned, inspect `diagnostics.context`, target mismatch logs, test status, traffic allocation, and segment rules.
- For price/pricing/offer/shipping tests, legacy product URL patterns such as `/products/` may be intentionally ignored by `isUserEligible` for product-scoped targeting. Do not treat that exception as a generic URL targeting failure.
- Use `?ripx_live=1` or `?ripx_clear_preview=1` to clear stale preview context before testing live behavior.

## 4. Preview Bucketing

Owner files:

- `frontend/src/utils/previewUrl.js`
- `backend/src/routes/pricePreviewBootstrap.js`
- `shopify/storefront-script.js`
- `frontend/public/ripx-storefront.js`

Flow:

1. Normal preview opens a controlled app-proxy document for price tests: `/apps/ripx/price-preview-bootstrap-v1?url=...`.
2. `pricePreviewBootstrap.js` persists preview context in `sessionStorage` and `window.name`, mounts the target product page, then injects the RipX app-proxy script early.
3. The price preview route is implemented by `backend/src/routes/pricePreviewBootstrap.js` and registered from `backend/src/routes/proxyRoutes.js`; failures usually triage through app-proxy registration, CSP, and preview request validation.
4. `init` merges the preview test into `CONFIG.activeTests` even when the test is draft or not present in active embedded config.
5. `getVariant` uses preview endpoints/cache and never creates live assignments for preview sessions.
6. Price tests use the price-preview bootstrap for debug and customer/copy modes because cart-line properties must be injected before theme cart scripts run. Customer-view/copy links add `ab_preview_simple=1`; the bootstrap hides its UI, seeds `sessionStorage`, and removes the `ab_preview*` params from the visible address bar so the page feels like a live storefront while the preview context remains sticky.

Debug first:

- `sessionStorage.getItem('__ripx_preview_ctx_v1__')`
- `window.__RIPX_BOOTSTRAP_OK__`
- `window.__RIPX_PREVIEW_MERGE__`
- Customer-view/copy links only: `window.__RIPX_SIMPLE_PREVIEW_CLEAN_URL__`
- On the price bootstrap shell: `window.RipXPricePreview?.debugStatus?.()`
- On the loaded product runtime: `window.RipX?.debugStatus?.()`

## 5. Storefront Price Application

Owner files:

- `shopify/storefront-script.js`
- `frontend/public/ripx-storefront.js`

Flow:

1. `init` loops over active/preview tests and filters them through `shouldRunPriceTestOnCurrentPage`.
2. `applyPriceTest` gets the assigned variant and resolves the effective config for the current product and selected Shopify variant.
3. `getEffectivePriceConfig` applies config precedence: base config, root `byVariant`, product `byProduct`, then product `byVariant`.
4. Price math resolves fixed, amount, or percent mode and rounds if needed.
5. The script paints only main PDP price elements and avoids cart drawer, recommendations, and unrelated product cards.
6. The script remembers target and discount units so dynamically rendered cart forms can still receive the correct attributes.

Debug first:

- `window.RipX?.debugStatus?.()`
- `window.RipX?.debugThemeStats?.()`
- Confirm `data-ripx-price="1"` appears on PDP price elements.
- Confirm target mismatch logs show correct `currentProductId` for all-products/product-specific targets.

## 6. Cart Attribute Handoff

Owner files:

- `shopify/storefront-script.js`
- `frontend/public/ripx-storefront.js`

Flow:

1. `injectPriceTestCartAttributes` builds hidden line properties such as `_ripx_price_test`, `_ripx_variant`, `_ripx_shop`, `_ripx_target_unit`, `_ripx_discount_unit`, `_ripx_assignment_sig`, `_ripx_assignment_ts`, `_ripx_assignment_user`, and `_ripx_price_method`.
2. `applyRipxStateToCartForms` writes those hidden inputs into any current or newly inserted add-to-cart forms.
3. Cart add/change/update interceptors patch JSON, form, and URL-encoded bodies through `patchCartAddBodyForRipx`.
4. In price-preview bootstrap mode, `sections_url` is rewritten back to the real product path so Shopify returns the theme's normal cart drawer sections.

Debug first:

- After add to cart, inspect `/cart.js`.
- Cart line `properties` should include `_ripx_price_test`, `_ripx_variant`, `_ripx_shop`, assignment signature fields, `_ripx_price_method`, and target/discount fields when needed.
- If properties are missing, check whether theme add-to-cart bypassed forms/interceptors or replaced the form after injection.

## 7. Cart And Checkout Price Alignment

Owner files:

- `extensions/ripx-checkout-discount/src/cart_lines_discounts_generate_fetch.js`
- `extensions/ripx-checkout-discount/src/cart_lines_discounts_generate_run.js`
- `extensions/ripx-cart-transform/src/cart_transform_run.js`
- `backend/src/services/priceTestCheckoutResolve.js`
- `backend/src/routes/trackRoutes.js`

Flow:

1. Price tests use the Cart Transform direct API only. The storefront stamps cart lines with `_ripx_price_method=direct_price_override`, `_ripx_target_unit`, and assignment proof fields; Cart Transform applies `lineUpdate.fixedPricePerUnit`.
2. The checkout discount extension remains available for offer/shipping/checkout discount surfaces, but direct-shaped price-test lines are skipped by fetch and local fallback so stale carts cannot revive the old discount path.
3. Shopify documents Cart Transform `lineUpdate` as available only on development stores or Shopify Plus stores, and rejects it for subscription/selling-plan lines. If checkout does not change on a non-Plus production shop, this is a Shopify capability limit rather than a resolver/config issue.
4. `priceTestCheckoutResolve.js` still replays effective price config precedence for diagnostics and legacy resolver calls, including `byProduct` and `byVariant`, but it should not create checkout discounts for price tests.

Debug first:

- Settings diagnostics should detect the cart transform function and report it as installed/available for the target shop.
- Price-test cart lines must include `_ripx_target_unit`, `_ripx_price_method=direct_price_override`, `_ripx_assignment_sig`, `_ripx_assignment_ts`, and `_ripx_assignment_user` for both lower and higher target prices.
- Checkout discount config (`RIPX_PRICE_RESOLVE_BATCH_URL`, `RIPX_CHECKOUT_PRICE_SECRET`) is not the primary price-test execution path anymore; keep it valid for other discount-based test types.

Operator endpoints:

- App-authenticated: `/api/settings/checkout-price-diagnostics?domain=shop.myshopify.com`
- App-authenticated: `/api/settings/cart-transform/status?domain=shop.myshopify.com`
- App-authenticated: `/api/settings/shopify-functions-inventory?domain=shop.myshopify.com`
- Function-facing: `/api/track/price-checkout-diagnostics?shop=shop.myshopify.com`

## 8. Data Contracts And Expected Good State

Preview URL contract:

- Required for a chosen arm: `ab_preview_test`, `ab_preview_variant`, and `ab_preview_domain`.
- Expected on generated links: `ab_preview=1`.
- Customer-view/copy links add `ab_preview_simple=1` and open through `/apps/ripx/price-preview-bootstrap-v1?url=...`; the bootstrap should hide its UI and clean the visible address bar after the product document is mounted.
- Full Shopify debug preview also opens through `/apps/ripx/price-preview-bootstrap-v1?url=...`, but keeps the debug status bar visible.

Runtime assignment contract:

- Live storefront request: `/api/track/variants?test_ids=...&shop_domain=...&current_product_id=...`.
- Successful response: `variants[testId]` exists and includes `variantId`, `variantName`, `config`, `assignment_sig`, `assignment_ts`, and `assignment_user`.
- The storefront then resolves `config` for current product/variant and writes the chosen price to PDP DOM.

Cart line property contract:

- Minimum marker fields: `_ripx_price_test`, `_ripx_variant`, `_ripx_shop`.
- Checkout validation fields: `_ripx_assignment_sig`, `_ripx_assignment_ts`, `_ripx_assignment_user`.
- Direct price fields: `_ripx_target_unit`, `_ripx_price_method=direct_price_override`, plus assignment proof fields.
- Legacy/native fields may exist on old carts, but new price-test execution should not depend on `native_variant_price` or `discounted_checkout_price`.

Checkout discount fetch contract:

- `extensions/ripx-checkout-discount/src/cart_lines_discounts_generate_fetch.js` sends `{ shop, lines }` to `/api/track/price-resolve-batch`.
- Each line should include `line_id`, `test_id`, `assignment_variant`, assignment proof fields, `product_id`, `variant_id`, `line_total`, `qty`, and optional compare-at fields.
- Lines with `_ripx_price_method=direct_price_override` or direct-shaped price fields (`_ripx_target_unit` / `_ripx_discount_unit` without offer markers) are skipped by the discount function because price tests are owned by Cart Transform.

Checkout resolver expected output:

- Good price-test direct row: no checkout discount row is needed; Cart Transform should apply the line update from `_ripx_target_unit`.
- Useful negative reasons from legacy resolver calls include `invalid_assignment_signature`, `product_not_in_test`, `unknown_assignment_variant`, `no_variant_config`, `compare_at_unavailable`, `selected_direct_price_override`, and `auto_selected_direct_price_override`.
- `cart_lines_discounts_generate_run.js` converts successful rows into `productDiscountsAdd`; if the discount instance is order-only, it emits one `orderDiscountsAdd` subtotal candidate.
- If Shopify fetch fails or never runs, the run target has a local fallback that uses `_ripx_discount_unit`, offer fields, or `_ripx_target_unit` from cart-line attributes.

## 9. Failure Decision Tree

Start with script load:

1. If `window.RipX?.version` is missing, debug app embed/app proxy/script injection first.
2. If version exists but `/track/variants` has no assignment, debug test status, targeting, traffic allocation, segment rules, and stale preview state.
3. If assignment exists but PDP price does not change, debug `applyPriceTest`, `getEffectivePriceConfig`, selected Shopify variant ID, and PDP price selectors.
4. If PDP price changes but `/cart.js` has no `_ripx_*` properties, debug cart form injection and fetch/XHR cart interceptors.
5. If `/cart.js` has `_ripx_*` properties but checkout does not change, inspect Cart Transform deployment/install state, Plus/dev-store capability, selling-plan lines, and `_ripx_price_method`.
6. If `/cart.js` has `_ripx_price_method=discounted_checkout_price` for a price test, the storefront/runtime is stale; rebuild/redeploy the app embed script so price tests stamp `direct_price_override`.
7. If only preview works, retest live with `?ripx_live=1` and verify the test is actually returned by `/track/variants`.

Fast browser checks:

```js
window.RipX?.version;
window.RipX?.qa?.();
window.RipX?.debugStatus?.();
window.__RIPX_PREVIEW_MERGE__;
window.RipXPricePreview?.debugStatus?.();
fetch('/cart.js')
  .then(r => r.json())
  .then(c => c.items.map(i => i.properties));
```

`window.RipX.debugStatus()` now includes a `cart` section:

- `cart.hasRipxLines`: at least one cart line has RipX line properties.
- `cart.readyForCheckoutDiscount`: line properties are sufficient for the signed discount path.
- `cart.readyForCartTransform`: line properties are sufficient for direct Cart Transform.
- `cart.missingByLine`: exact missing `_ripx_*` fields per cart line.

Fast server/app checks:

```js
await fetch('/api/settings/checkout-price-diagnostics?domain=shop.myshopify.com', {
  credentials: 'include',
}).then(r => r.json());
await fetch('/api/settings/cart-transform/status?domain=shop.myshopify.com', {
  credentials: 'include',
}).then(r => r.json());
await fetch('/api/settings/shopify-functions-inventory?domain=shop.myshopify.com', {
  credentials: 'include',
}).then(r => r.json());
```

## 10. Diagnostics Checklist

Browser console:

```js
window.RipX?.version;
window.RipX?.qa?.();
window.RipX?.liveDiagnostics?.();
window.RipX?.debugStatus?.();
sessionStorage.getItem('__ripx_preview_ctx_v1__');
sessionStorage.getItem('__ripx_live_diagnostics_v1__');
localStorage.getItem('__ripx_live_diagnostics_v1__');
document.cookie.split('; ').filter(v => v.startsWith('ripx_ab_state='));
fetch('/cart.js')
  .then(r => r.json())
  .then(c =>
    c.items.map(i => ({
      title: i.title,
      product_id: i.product_id,
      variant_id: i.variant_id,
      properties: i.properties,
    }))
  );
```

Network filters:

- `/apps/ripx/script.js`
- `/api/track/variants`
- `/api/track/preview`
- `/api/track/preview-health`
- `/api/track/preview-storefront-test`
- `/cart/add`
- `/cart/change`
- `/cart/update`
- `/cart.js`

Common root causes:

- `window.RipX` undefined: runtime script was not injected or app embed/app proxy failed.
- Test absent from `/track/variants`: status, target, segment, traffic allocation, or stale preview contamination.
- PDP price changes but cart line does not: cart attributes were not injected or were stripped by theme cart code.
- Cart line has attributes but checkout does not change: Shopify Function not installed, wrong application method, missing signatures, or direct override unsupported.
- Preview works but live does not: preview context is forcing a variant; retest with `?ripx_live=1`.
