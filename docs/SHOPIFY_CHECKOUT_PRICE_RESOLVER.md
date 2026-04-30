# Shopify Checkout Price Resolver (RipX)

This guide explains how RipX storefront price tests align with Shopify checkout totals.

## Purpose

RipX storefront scripts can change displayed prices on PDP/collection/cart UI, but charged totals at checkout are controlled by Shopify.  
Checkout alignment is handled by the RipX Discount Function + batch resolver API:

- Extension fetch: `cart.lines.discounts.generate.fetch`
- API endpoint: `POST /api/track/price-resolve-batch`

## Required cart line properties

The storefront script must attach these line properties on add-to-cart:

- `_ripx_price_test`
- `_ripx_variant`
- `_ripx_shop`

The resolver uses these values to find the active test + assigned variant for each line.

## Core endpoints

- `GET /api/track/price-resolve` — single-line debug/QA resolver
- `POST /api/track/price-resolve-batch` — production checkout batch resolver
- `POST /api/track/checkout-assignment` — checkout-extension assignment fetch (checkout-scoped user id)
- `POST /api/track/checkout-conversion` — checkout-extension conversion tracking
- `GET /api/track/price-checkout-diagnostics` — setup diagnostics (public, redacted by default)
- `GET /api/settings/checkout-price-diagnostics` — full diagnostics via authenticated app session

## Auth and secret behavior

If `RIPX_CHECKOUT_PRICE_SECRET` is set:

- Resolver calls must include the same secret (`X-RipX-Price-Secret`, query, or JSON body support by endpoint)
- Secret mismatch returns `403`

In production, `RIPX_CHECKOUT_PRICE_SECRET` is required for resolver endpoints. If missing, resolver routes return `503` until configured.

For diagnostics visibility:

- Public `/api/track/price-checkout-diagnostics` is redacted by default.
- Set `RIPX_PUBLIC_CHECKOUT_DIAGNOSTICS_FULL=true` only when you intentionally need full diagnostics on the public route.
- Authenticated `/api/settings/checkout-price-diagnostics` always returns full diagnostics for the app UI.

## Checkout UI extension foundation API

Use these when building checkout-slot experiments (Shopify Plus):

- `POST /api/track/checkout-assignment`
  - Input: `shop|shop_domain|site`, `test_id`, `checkout_id` (plus optional targeting context)
  - Output: assigned variant id/name + config for that checkout-scoped identity (`checkout:<checkout_id>`)
- `POST /api/track/checkout-conversion`
  - Input: same identity fields + optional `event_name`, `event_value`, `metadata`
  - Output: conversion tracked against the assigned variant

Both endpoints use the same secret check as resolver routes when `RIPX_CHECKOUT_PRICE_SECRET` is configured (`X-RipX-Price-Secret`, query, or body `secret`).

Reference implementation: `extensions/ripx-checkout-ui` (`purchase.checkout.block.render`).

## Config sync

Keep extension config in sync with backend `.env`:

```bash
npm run shopify:checkout-discount:sync-config
```

This writes `extensions/ripx-checkout-discount/src/ripxConfig.js` from `APP_URL` (or `RIPX_PRICE_RESOLVE_BATCH_URL`) and `RIPX_CHECKOUT_PRICE_SECRET`.

## Quick verification

```bash
RIPX_VERIFY_SHOP=your-store.myshopify.com npm run verify:price-pipeline -- --json
```

Look for:

- `overall_status: "ok"`
- `tenant_registered: true`
- `extension_config_matches_env: ok`

Signed-assignment migration readiness:

```bash
RIPX_VERIFY_SHOP=your-store.myshopify.com npm run verify:price-assignment-readiness
```

This checks strict-mode config, storefront/extension wiring, and runs a synthetic unsigned vs signed resolver probe when a running price test exists.

## Common blockers

- App proxy / embed not loading script
- Missing `_ripx_*` line properties
- Extension config drift vs backend `.env`
- Missing Plus/network access requirements for checkout function
- Oversized batch requests/responses (`PRICE_RESOLVE_BATCH_MAX`, response size guardrails)

# Checkout price alignment: resolver API + RipX discount function

RipX can **compute the discount amount** for cart lines so a **Shopify Discount Function** (unified Discount API with **network access**) can charge the same price shoppers saw in the price test.

## Go-live checklist (automation + manual)

| Step | Who  | What                                                                                                                                   |
| ---- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | You  | Production RipX `.env`: **`APP_URL`**, optional **`RIPX_CHECKOUT_PRICE_SECRET`**.                                                      |
| 2    | Repo | `npm run shopify:checkout-discount:sync-config` → writes `extensions/ripx-checkout-discount/src/ripxConfig.js`.                        |
| 3    | Repo | `npm run shopify:checkout-discount:prepare` (or install + typegen + build separately).                                                 |
| 4    | You  | `shopify app deploy` so the function ships with your app.                                                                              |
| 5    | You  | **Shopify Admin → Discounts**: create/use a discount that runs **this app’s** discount function (**product** class).                   |
| 6    | You  | **Plus / Enterprise** + **network access** for discount functions (Shopify requirement).                                               |
| 7    | You  | Theme: classic **`/cart/add`** forms get RipX **`properties[_ripx_*]`** automatically; **AJAX** carts must send the same `properties`. |

After that, **checkout can match** the price test (subject to Shopify discount stacking rules).

## Storefront line item properties

The RipX script injects **line item properties** on `/cart/add` product forms using the standard Shopify shape:

`properties[_ripx_price_test]`, `properties[_ripx_variant]`, `properties[_ripx_shop]`

Optional (signed assignment proof, used when strict verification is enabled):

`properties[_ripx_assignment_sig]`, `properties[_ripx_assignment_ts]`, `properties[_ripx_assignment_user]`

(Leading `_` keeps them **hidden** from typical cart line item display in many themes — same pattern as other private metadata.)

| Property key            | Meaning                                                   |
| ----------------------- | --------------------------------------------------------- |
| `_ripx_price_test`      | RipX test UUID (same as `activeTests[].id`)               |
| `_ripx_variant`         | Assigned bucket id/name (same as variant API `variantId`) |
| `_ripx_shop`            | `*.myshopify.com` — used as `shop` for the batch resolver |
| `_ripx_assignment_sig`  | HMAC signature for assignment proof (optional)            |
| `_ripx_assignment_ts`   | Signature issued-at timestamp in ms (optional)            |
| `_ripx_assignment_user` | User id used when signature was issued (optional)         |

To enforce signed assignment verification at checkout, set:

- `RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT=true` (default when unset in production; set `false` only for temporary migration)
- `RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET=<strong secret>` (falls back to `RIPX_CHECKOUT_PRICE_SECRET` when omitted)

The Discount Function input query reads these as **per-line** `attribute(key: "...")` on each `CartLine`. It resolves **shop** for the batch POST from **cart** `attribute(_ripx_shop)` if set, otherwise the **first line** that has `_ripx_shop`.

**Themes that add to cart via AJAX** (no classic form POST) may not run this injection; use a [theme app extension](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions) or custom script to pass the same `properties` in the Cart API / Section Rendering API payload, or merge properties client-side before `fetch('/cart/add.js', ...)`.

### Storefront display vs checkout charge

- The theme script can only change **visible** prices in the online store (PDP, listings, cart UI). It cannot change line totals inside **Shopify Checkout**; that is what the **Discount Function + batch resolver** are for.
- **Preview links** (`?ab_preview=1` and test/variant params) now run the price pipeline on **product, collection, home/search/pages, and `/cart`** surfaces — not only `/products/...`, so cart and listing previews match normal targeting behavior.
- If checkout still shows catalog prices, verify each cart line has `_ripx_price_test`, `_ripx_variant`, and `_ripx_shop` (see table above), resolver diagnostics are green, and the automatic discount is **active** in Shopify Admin.

### Price and Offer selection behavior

- New **Price tests** are saved as `direct_price_override` (Direct Price Override path).
- **Offer tests** use the discount-function path for promotions.
- Legacy `auto` / `native_variant_price` / `discounted_checkout_price` values remain readable for older tests, but are not the default for new Price tests.

## APIs

### `GET /api/track/price-resolve` (single line)

`GET {APP_URL}/api/track/price-resolve` — use for debugging or single-line integrations.

### Query parameters

| Param                | Required | Description                                                                          |
| -------------------- | -------- | ------------------------------------------------------------------------------------ |
| `shop` or `site`     | Yes      | `store.myshopify.com` or standalone site domain (must match a RipX tenant).          |
| `test_id`            | Yes      | UUID — must match `_ripx_price_test`.                                                |
| `assignment_variant` | Yes      | Value of `_ripx_variant` from the line.                                              |
| `product_id`         | Yes      | Shopify product GID or numeric id (must be in the test’s product targets).           |
| `line_total`         | Yes      | Line **subtotal in presentment currency** (major units, e.g. `59.98` for 2× $29.99). |
| `qty`                | No       | Quantity (default `1`). Used to derive per-unit catalog from `line_total`.           |
| `variant_id`         | No       | Shopify variant GID or numeric id (for `byVariant` overrides in config).             |
| `currency`           | No       | Echoed back as `currencyCode` (informative only).                                    |
| `secret`             | If set   | Required when `RIPX_CHECKOUT_PRICE_SECRET` is set in RipX `.env`.                    |

Header alternative: `X-RipX-Price-Secret: <same value>`.

### `POST /api/track/price-resolve-batch` (recommended for Functions)

Single HTTP request for the whole cart (used by `extensions/ripx-checkout-discount`).

**Body (JSON)**

| Field            | Required                               | Description                                                                |
| ---------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `shop` or `site` | Yes                                    | Tenant domain (`store.myshopify.com` or standalone site).                  |
| `secret`         | If `RIPX_CHECKOUT_PRICE_SECRET` is set | Same as GET; can be sent in JSON body for `fetch` POSTs.                   |
| `lines`          | Yes                                    | Array (max **80** by default, overridable with `PRICE_RESOLVE_BATCH_MAX`). |

Each **line** object:

| Field                | Required | Description                                                                              |
| -------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `line_id`            | No       | Echoed back; use Shopify `CartLine` GID so the Function can match results (recommended). |
| `test_id`            | Yes      | UUID — `_ripx_price_test`.                                                               |
| `assignment_variant` | Yes      | `_ripx_variant`.                                                                         |
| `product_id`         | Yes      | Product GID or numeric id.                                                               |
| `variant_id`         | No       | Variant GID or numeric (for `byVariant` overrides).                                      |
| `line_total`         | Yes      | Line subtotal in presentment currency (major units).                                     |
| `qty`                | No       | Quantity (default `1`).                                                                  |

**Response (`200`)**

```json
{
  "success": true,
  "lines": [
    {
      "line_id": "gid://shopify/CartLine/1",
      "applies": true,
      "discountDecimal": "10.00",
      "targetLineDecimal": "19.99",
      "reason": null
    }
  ]
}
```

### Response (`200`) — GET single line

```json
{
  "success": true,
  "applies": true,
  "discountDecimal": "10.00",
  "targetLineDecimal": "19.99",
  "currencyCode": "USD",
  "reason": null
}
```

When no discount should apply:

```json
{
  "success": true,
  "applies": false,
  "discountDecimal": null,
  "targetLineDecimal": null,
  "currencyCode": null,
  "reason": "control_variant"
}
```

`reason` is safe to log; use it when debugging (`test_not_running`, `product_not_in_test`, `no_discount_needed`, etc.).

## Security

- Set **`RIPX_CHECKOUT_PRICE_SECRET`** in production so only your Function (or trusted servers) can call the endpoint.
- Line item properties / cart line attributes can be tampered with by a determined client; mitigations: keep tests short-lived, monitor `reason` / volume, set **`RIPX_CHECKOUT_PRICE_SECRET`**, and cap discounts in Shopify if possible.

## RipX extension (implemented)

This repo includes **`extensions/ripx-checkout-discount`**: a JavaScript Function targeting **`cart.lines.discounts.generate.fetch`** and **`.run`**, plus no-op delivery targets. It:

1. Resolves **shop** from cart attribute `_ripx_shop` or the first line’s `_ripx_shop` (storefront script injects line **`properties[...]`** with the RipX keys).
2. Reads per-line `_ripx_price_test` / `_ripx_variant`, builds `lines[]`, and **POSTs** to `price-resolve-batch`.
3. Applies **`fixedAmount`** discounts per **`cartLine.id`**, with selection strategy **`ALL`** so **each** eligible line is discounted (using **`FIRST`** would only apply **one** line in multi-line carts).
4. Skips discounts when the resolver HTTP status is not **2xx**, or when JSON is missing **`success`** / **`lines`**, or **`success: false`**.

Configure **`src/ripxConfig.js`** (`RIPX_PRICE_RESOLVE_BATCH_URL`, optional secret), then `shopify app function build --path extensions/ripx-checkout-discount`. See `extensions/ripx-checkout-discount/README.md`.

### Manual / alternate outline

1. Use the current Shopify CLI discount templates if you prefer to fork ([Discount API](https://shopify.dev/docs/api/functions/latest/discount)).
2. **Network access** (Plus / Enterprise): prefer **`POST /api/track/price-resolve-batch`** over many GETs.
3. If **fetch is not available**, use a **metafield**-backed config or duplicate-variant strategy (see [PRICE_TEST_INTEGRATION.md](./PRICE_TEST_INTEGRATION.md)).

Official references:

- [Product discounts](https://shopify.dev/docs/api/functions/latest/discount)
- [Discount Function network access](https://shopify.dev/docs/apps/build/discounts/network-access)

## Troubleshooting

| Symptom                                  | Things to check                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only **one** line discounted in checkout | Ensure the extension uses **`selectionStrategy: ALL`** (this repo does). Older snippets using **`FIRST`** only apply a single candidate.                                                                            |
| No discounts at all                      | Line **`properties`** missing: classic forms need `properties[_ripx_*]`; **AJAX** `/cart/add.js` must include a `properties` object. Confirm `RIPX_PRICE_RESOLVE_BATCH_URL` and optional secret in `ripxConfig.js`. |
| Resolver 403                             | Set matching **`RIPX_CHECKOUT_PRICE_SECRET`** on the server and in the function config.                                                                                                                             |
| `shop` not found in Function             | Ensure `_ripx_shop` is on the line or set a cart-level `_ripx_shop` attribute at checkout.                                                                                                                          |

## Catalog “high list” strategy

For **fixed** test prices below catalog, set the **Shopify catalog price** to the **highest** variant price in the experiment, then use the discount function to reduce lines to the test price — same pattern as Intelligems-style price tests.
