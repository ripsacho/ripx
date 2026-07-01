# Checkout UI: network access approval (required to release versions)

## Symptom

When releasing or activating an app version on a dev store (Partner Dashboard or deploy), Shopify shows:

```text
Couldn't release version
Network access must be requested and approved in order for the ripx-checkout-ui extension to be published.
```

## Why

`extensions/ripx-checkout-ui` calls RipX APIs from checkout:

- `POST /api/track/checkout-assignment`
- `POST /api/track/checkout-conversion`

That requires **`network_access = true`** in `extensions/ripx-checkout-ui/shopify.extension.toml` (already set) **and** Partner Dashboard approval for the **same app** you are deploying (`shopify.app.local.toml` → RipperX local app, client id in that file).

Setting the TOML flag alone is not enough.

## Fix (one-time per app)

1. Open [Shopify Partner Dashboard](https://partners.shopify.com/) → **Apps** → **RipperX** (the app linked to `shopify.app.local.toml`, not production unless you deploy production config).
2. Go to **Configuration** → **API access** (or **API access** in the left nav).
3. Find **Allow network access in checkout UI extensions**.
4. Click **Allow network access** (or **Request access**).
5. If you see `Could not grant checkout ui extension scope 'read_checkout_external_data'`:
   - Complete **first name** and **last name** on your Partner account profile, then try again.

Approval is usually immediate for checkout UI network access.

## After approval

1. Deploy again (public `APP_URL` required — see [SHOPIFY_DEV_PREVIEW_FIX.md](./SHOPIFY_DEV_PREVIEW_FIX.md)):

   ```bash
   npm run shopify:deploy:local:safe
   ```

2. Or retry **Release** on the version in Partner Dashboard → **Versions**.

3. On the dev store: **Settings → Checkout** → add the **RipX checkout UI experiment** block if you use checkout experience tests.

## Store requirements

- **Shopify Plus** (or dev store with checkout extensibility) for checkout UI extensions.
- RipX backend URLs in extension config must be **HTTPS** and reachable from Shopify (tunnel or stable host).

## Verify extension config before deploy

```bash
npm run shopify:checkout-ui:sync-config
npm run shopify:guard:local
```

Confirm `extensions/ripx-checkout-ui/shopify.extension.toml` contains:

```toml
[extensions.capabilities]
api_access = true
network_access = true
```

## Related

- [extensions/ripx-checkout-ui/README.md](../extensions/ripx-checkout-ui/README.md)
- [Shopify: Enable checkout capabilities (network access)](https://shopify.dev/docs/apps/build/checkout/capabilities)
