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

This writes `src/ripxConfig.js` from root `.env`:

- `RIPX_CHECKOUT_ASSIGNMENT_URL` (or `APP_URL + /api/track/checkout-assignment`)
- `RIPX_CHECKOUT_CONVERSION_URL` (or `APP_URL + /api/track/checkout-conversion`)
- `RIPX_CHECKOUT_PRICE_SECRET`
- `RIPX_CHECKOUT_UI_TEST_ID` (optional default test id)
- `RIPX_CHECKOUT_UI_SHOP_DOMAIN` (optional default shop domain)

## Deploy

1. Ensure the extension is part of your app deployment (`shopify app deploy`).
2. In Checkout Editor, add the **RipX checkout UI experiment** block.
3. Configure checkout test targeting so checkout has a valid test id context.
4. Verify assignment API + conversion API logs from the backend.

## Notes

- If `RIPX_CHECKOUT_PRICE_SECRET` is enabled on the backend, this extension sends it in header/body for both API calls.
- Production checkout experience tests should use `checkout_sections` on each assigned variant. Legacy fields such as `checkout_title`, `checkout_message`, and `checkout_cta_label` are still normalized for backward compatibility.
- Structured checkout sections can include a stable `id` per section (for example `trust-box` or `shipping-promise`). RipX emits that value as `checkout_section_id` in checkout analytics events.
- Product list sections support manual, cart-related, and collection-fed sources. The `product_display_layout` prop supports `stacked_cards`, `compact_rows`, `two_column_grid`, and `comparison_table`.
- Assignment responses include `checkout_phase` (`experience`, `payment_method`, or `delivery_method`). The extension uses that value instead of inferring phase from config fields.
- Runtime diagnostics are emitted as `checkout_runtime_diagnostic` when assignment fails, no assignment is returned, no renderable checkout sections exist for an experience phase, or an offer apply action fails.
- Payment and delivery checkout phases emit phase-level analytics (`checkout_phase_impression`) plus planning signals (`checkout_payment_method_action`, `checkout_delivery_method_action`, and `checkout_customization_match`). Shopify Functions execute the actual payment/delivery changes without network access, so these signals identify assigned configuration, not Shopify's final method rendering result.
