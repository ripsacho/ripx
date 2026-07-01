# RipX checkout UI extension

Checkout block extension (`purchase.checkout.block.render`) for Shopify Plus that:

- Fetches RipX variant assignment from `POST /api/track/checkout-assignment`
- Renders variant-driven checkout content in a merchant-placed checkout block
- Tracks extension interactions via `POST /api/track/checkout-conversion`
- Uses the server-owned `checkout_phase` from assignment responses for analytics consistency

## Configure

From repo root:

```bash
npm run shopify:checkout-ui:install
npm run shopify:checkout-ui:sync-config
```

This writes ignored local config at `src/ripxConfig.generated.js` from root `.env`:

- `RIPX_CHECKOUT_ASSIGNMENT_URL` (or `APP_URL + /api/track/checkout-assignment`)
- `RIPX_CHECKOUT_CONVERSION_URL` (or `APP_URL + /api/track/checkout-conversion`)
- `RIPX_CHECKOUT_PRICE_SECRET`
- `RIPX_CHECKOUT_UI_TEST_ID` (optional default test id)
- `RIPX_CHECKOUT_UI_SHOP_DOMAIN` (optional default shop domain)

## Before first publish (required)

`network_access = true` is already in `shopify.extension.toml`, but Shopify also requires **Partner Dashboard approval** or version release fails with:

`Network access must be requested and approved in order for the ripx-checkout-ui extension to be published.`

1. [Partner Dashboard](https://partners.shopify.com/) → your app (same app as `shopify.app.local.toml`) → **API access**
2. Under **Allow network access in checkout UI extensions** → **Allow network access**
3. If grant fails, complete first + last name on your Partner profile and retry

See [docs/SHOPIFY_CHECKOUT_UI_NETWORK_ACCESS.md](../../docs/SHOPIFY_CHECKOUT_UI_NETWORK_ACCESS.md).

## Deploy

1. Ensure the extension is part of your app deployment (`shopify app deploy` or `npm run shopify:deploy:local:safe`).
2. In Checkout Editor, add the **RipX checkout UI experiment** block.
3. Configure checkout test targeting so checkout has a valid test id context.
4. Verify assignment API + conversion API logs from the backend.

## Notes

- `src/ripxConfig.generated.js` is intentionally not committed because it can contain tunnel URLs and shared secrets. Commit `src/ripxConfig.example.js` only.
- If `RIPX_CHECKOUT_PRICE_SECRET` is enabled on the backend, this extension sends it in header/body for both API calls. Treat generated checkout UI builds as environment-specific artifacts.
- Production checkout experience tests should use `checkout_sections` on each assigned variant. Legacy fields such as `checkout_title`, `checkout_message`, and `checkout_cta_label` are still normalized for backward compatibility.
- Structured checkout sections can include a stable `id` per section (for example `trust-box` or `shipping-promise`). RipX emits that value as `checkout_section_id` in checkout analytics events.
- Product list sections support manual, cart-related, and collection-fed sources. The `product_display_layout` prop supports `stacked_cards`, `compact_rows`, `two_column_grid`, and `comparison_table`.
- Product lists can run in `display_only` mode or `add_to_cart` mode. Add-to-cart rows require a Shopify merchandise/ProductVariant GID (`merchandise_id` or `variant_gid`) and use checkout cart-line changes when Shopify exposes that API in the current checkout context.
- Collection-fed product lists are hydrated by `POST /api/track/checkout-assignment`, not by the extension directly. The backend resolves selected collections into product cards and now includes `enrichment_status` plus merchandise IDs when Admin API product data is available.
- Product-level analytics are emitted for impressions, clicks, add attempts, add successes, and add failures (`checkout_product_*`). Metadata includes section id, product/merchandise id, rank, source mode, strategy, action, and failure reason where applicable.
- Assignment responses include `checkout_phase` (`experience`, `payment_method`, or `delivery_method`). The extension prefers that server-owned value and only falls back to config inference for older assignment payloads.
- Runtime diagnostics are emitted as `checkout_runtime_diagnostic` for assignment failures, missing assignments, no renderable experience sections, unhydrated collection products, unavailable cart-line or discount-code APIs, and discount apply failures/exceptions.
- Payment and delivery checkout phases emit phase-level analytics (`checkout_phase_impression`) plus planning signals (`checkout_payment_method_action`, `checkout_delivery_method_action`, and `checkout_customization_match`). Shopify Functions execute the actual payment/delivery changes without network access, so these signals identify assigned configuration, not Shopify's final method rendering result.
