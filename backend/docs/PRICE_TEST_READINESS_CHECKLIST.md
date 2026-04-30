# Price test readiness checklist

Use this to confirm **storefront display**, **RipX API**, and (if eligible) **checkout alignment** are configured correctly.

---

## Legend

- **Required** — must pass for any price test value
- **Checkout** — only if you need charged totals at checkout to match the test (Shopify Plus + discount function)
- **Optional** — recommended for production

---

## 1. Tenant & backend

| #   | Check                                                                           | How to verify                                                                                                               |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Store/site is **registered** in RipX (My domains / install)                     | App opens for that shop; tests save under correct `shop_domain`                                                             |
| 1.2 | **`APP_URL`** is public **HTTPS** (no trailing slash issues; server normalizes) | Diagnostics show batch URL uses `https://`                                                                                  |
| 1.3 | **Database / migrations** applied                                               | App runs; tests CRUD works                                                                                                  |
| 1.4 | **Optional:** **`RIPX_CHECKOUT_PRICE_SECRET`** set in production                | Diagnostics: secret mode on; extension `ripxConfig.js` **must match** after `npm run shopify:checkout-discount:sync-config` |

---

## 2. Storefront script (all price tests)

| #   | Check                                                                                                                           | How to verify                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 2.1 | **App Proxy** OR direct **`/api/track/script.js?shop=…`** loads                                                                 | Network tab: `script.js` 200; `window.AB_TEST_RUNTIME_CONFIG` has `apiUrl`, `shopDomain`, `activeTests` |
| 2.2 | **Theme App Embed** enabled (**RipX App Embed**, target **head**) or equivalent snippet in **`<head>`** with **`defer`**        | Setup wizard / theme editor                                                                             |
| 2.3 | **Consent** — if **`RIPX_CONSENT_REQUIRED=true`**, marketing/consent allows script                                              | No RipX until consent granted                                                                           |
| 2.4 | **Short cache** — after starting/stopping tests, wait for **`RIPX_SCRIPT_CACHE_MAX_AGE`** or hard refresh                       | Stale script can hide new tests                                                                         |
| 2.5 | Test is **active for storefront**: **running**, OR stopped/completed with **`personalization_mode`** `personalized` / `rollout` | Matches `getActiveTestsForStorefront` logic                                                             |

---

## 3. Price test setup in RipX

| #   | Check                                                                                                               | How to verify                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 3.1 | Type **`price`** or **`pricing`**                                                                                   | Shown in UI / DB                                                                                         |
| 3.2 | **Checkout alignment:** **`target_type = product`** and product GIDs in **`target_ids`**                            | Collection-only tests: OK on **collection/PDP display**; **checkout function** needs **product** targets |
| 3.3 | **Variant config** valid: `priceMode` (`fixed` / `amount` / `percent`), not `control` for variants you want to show | Preview / PDP shows expected number                                                                      |
| 3.4 | **`priceBase: compare_at`** — product has **compare-at** in Shopify when using compare-at math                      | Resolver can return `compare_at_unavailable` if missing                                                  |
| 3.5 | **Catalog rule:** variant **Shopify price ≥ highest** test price when discounting **down** at checkout              | Otherwise fixed discount math may not apply as expected                                                  |
| 3.6 | **Optional:** **`roundTo`** set if you need stepped prices                                                          | Storefront + API both round                                                                              |

---

## 4. Cart → checkout (RipX line properties)

| #   | Check                                                                                                             | How to verify                            |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 4.1 | After add-to-cart, line item **properties** include **`_ripx_price_test`**, **`_ripx_variant`**, **`_ripx_shop`** | Cart JSON / Liquid / AJAX cart inspector |
| 4.2 | Preview links: **`/track/preview`** and **`/track/preview-storefront-test`** return 200 when needed               | DevTools → Network (draft preview)       |

---

## 5. Automated diagnostics (do this first)

| #   | Check                                                                                       | Where                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **Settings → Installation → Checkout price test health → Run check**                        | Authenticated UI; same JSON as public route                                                                                                 |
| 5.2 | **`GET /api/track/price-checkout-diagnostics?shop=YOUR_STORE.myshopify.com`**               | HTTPS, batch URL, secret mode, **running price test count**, **extension vs `.env` drift** (if `ripxConfig.js` is on the server filesystem) |
| 5.3 | If secret set: **`POST /api/track/price-resolve-batch`** with correct **`secret`** / header | 200 + `lines` shape                                                                                                                         |

---

## 6. Checkout discount function **(Checkout / Plus only)**

| #   | Check                                                                                                  | How to verify                                                  |
| --- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 6.1 | Store is **Shopify Plus** (or eligible) with **Discount Function network access**                      | Settings → Plan; Shopify docs                                  |
| 6.2 | **`npm run shopify:checkout-discount:prepare`** (or sync + typegen + build) succeeded                  | `extensions/ripx-checkout-discount` builds                     |
| 6.3 | **`ripxConfig.js`** batch URL + secret match **server** `.env`                                         | After `sync-config`                                            |
| 6.4 | **`shopify app deploy`** / **`shopify app dev`** so extension is on the **same app** as the storefront | Partner / CLI                                                  |
| 6.5 | Admin **Discounts** → automatic **product** discount using **this app’s function** — **active**        | Checkout shows discount pipeline                               |
| 6.6 | Smoke: line from running **product** price test → **checkout total** matches test price                | Allow ~**300s** Shopify fetch cache after changing a live test |

---

## 7. Manual smoke tests (quick)

1. **PDP** — open targeted product: displayed price matches assigned variant (or preview variant).
2. **Collection / cards** — if configured, card prices update (may need scroll / delay; reapply timers).
3. **Cart drawer** — price labels if theme exposes them; properties present.
4. **Checkout** — (Plus only) line total matches test price.
5. **Wrong bucket** — incognito / other user: assignment stable per cookie rules.

---

## 8. “All green” definition

| Scope               | “Working perfectly” means                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| **Storefront only** | Script loads, active test, correct PDP/collection/cart **display**, `_ripx_*` on lines, diagnostics OK |
| **+ Checkout**      | All above **plus** Plus, function deployed, discount active, checkout line totals match resolver       |

---

## 9. Common blockers

| Symptom                         | Likely cause                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| No script / empty `activeTests` | Proxy URL, wrong `shop`, embed off, tenant not registered                                           |
| No price change on PDP          | Targeting, test not running, wrong page, consent                                                    |
| Preview broken                  | Draft test: need **`preview-storefront-test`** + **`/track/preview`** 200; wrong product URL        |
| No `_ripx_*` on cart            | Script not on add-to-cart path, theme AJAX bypass                                                   |
| Checkout unchanged              | Not Plus, no network access, discount not using function, **collection-only** test, secret mismatch |
| 401 on batch                    | **`RIPX_CHECKOUT_PRICE_SECRET`** mismatch                                                           |
| 413 / no discount               | Batch response too large; reduce lines or limits                                                    |
| Stale checkout discount         | Shopify **~300s** fetch cache                                                                       |

---

## 10. Env reference (quick)

| Variable                                 | Role                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `APP_URL`                                | API origin; batch URL default                                                               |
| `RIPX_PRICE_RESOLVE_BATCH_URL`           | Override full batch POST URL                                                                |
| `RIPX_CHECKOUT_PRICE_SECRET`             | Protects resolve endpoints when set                                                         |
| `PRICE_RESOLVE_BATCH_MAX`                | Max lines per batch                                                                         |
| `RIPX_SCRIPT_CACHE_MAX_AGE`              | `script.js` cache seconds                                                                   |
| `RIPX_CONSENT_REQUIRED`                  | Gate script on consent                                                                      |
| `RIPX_DIAGNOSTICS_SKIP_EXTENSION_CONFIG` | If `true`, diagnostics do not read `extensions/.../ripxConfig.js` (minimal API-only deploy) |

---

## 11. Automated verification (step-by-step)

| Order | Command / action                                                                 | What it proves                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `npm run verify:price-pipeline`                                                  | `.env` → batch URL, HTTPS, path ends with `/api/track/price-resolve-batch`, secret mode, tunnel warning in prod, **`ripxConfig.js` vs `.env` drift** (repo layout) |
| 2     | `RIPX_VERIFY_SHOP=your.myshopify.com npm run verify:price-pipeline` (DB running) | Tenant registered + **count of running price tests**                                                                                                               |
| 3     | `npm run verify:price-pipeline -- --json`                                        | Machine-readable; exit **1** if `overall_status === error`                                                                                                         |
| 4     | `npm run test` (backend)                                                         | Resolver + diagnostics unit tests                                                                                                                                  |

**Deep dive (flow, ownership, backlog):** [PRICE_TEST_PIPELINE_RESEARCH.md](./PRICE_TEST_PIPELINE_RESEARCH.md)

---

**Related:** `extensions/ripx-checkout-discount/README.md`, `.env.example` (checkout price section).
