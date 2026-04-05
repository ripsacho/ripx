# RipX cart transform function

This Shopify Function powers `Direct Price Override` for RipX price tests on:

- Shopify Plus stores
- development stores

It reads RipX line item properties already injected by `shopify/storefront-script.js` and applies
`lineUpdate` operations with `fixedPricePerUnit`.

## What it reads

- `_ripx_price_test`
- `_ripx_variant`
- `_ripx_target_unit`
- `_ripx_price_method`
- `_ripx_price_application_method` (fallback)
- `__ripx_price_application_method` (legacy fallback)

The function only overrides lines where the resolved price method is `direct_price_override`.

## Important constraints

- When `_ripx_price_method === direct_price_override`, the function applies the target unit price whether it is above or below the current line unit price (merchant-selected method on the variant).
- Method selection is strict: this function only runs when the selected method is `direct_price_override`.
- Method switching/fallback belongs to `auto` logic in storefront resolution, not inside this function.
- Shopify allows a maximum of one cart transform function per store.
- `lineUpdate` is only available on Plus / dev stores.
- Shopify rejects `lineUpdate` operations when selling plans are involved. RipX skips those lines.
- This function has no network access; it depends entirely on the storefront-injected RipX line properties.

## Local workflow

From repo root:

```bash
npm run shopify:cart-transform:install
npm run shopify:cart-transform:typegen
npm run shopify:cart-transform:build
```

Or full prep:

```bash
npm run shopify:cart-transform:prepare
```

Then deploy with your app extensions as usual:

```bash
shopify app deploy
shopify app deploy --config shopify.app.ripperx.toml
```

## Verify on the store

In the embedded app, open **App settings → Installation → Shopify Functions (this app)** and use **Refresh validation**. You should see the cart transform listed under Admin API `shopifyFunctions`. No running price test is required for deployment or validation.

## Fixed-amount verification check (doc-style)

To run a controlled verification using Shopify's `fixedPricePerUnit` behavior, set a cart attribute:

- Key: `_ripx_cart_transform_test_amount`
- Value: decimal unit amount (for example `642.95`)

When this attribute is present, RipX uses that amount as the cart-transform unit target for eligible
`direct_price_override` lines (instead of per-line `_ripx_target_unit`). Remove the attribute to return
to normal behavior.
