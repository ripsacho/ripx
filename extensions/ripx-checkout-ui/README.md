# RipX checkout UI extension

Checkout block extension (`purchase.checkout.block.render`) for Shopify Plus that:

- Fetches RipX variant assignment from `POST /api/track/checkout-assignment`
- Renders variant-driven checkout content in a merchant-placed checkout block
- Tracks extension interactions via `POST /api/track/checkout-conversion`

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
- This is intentionally a lightweight foundation: content can be fully controlled via assigned variant config fields (`checkout_title`, `checkout_message`, `checkout_cta_label`) and expanded later.
