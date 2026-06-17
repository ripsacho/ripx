# Shopify dev preview: "Failed to start dev preview"

## Symptom

`shopify app dev` starts backend + Vite, then fails at **Preparing dev preview** with a generic error box and no obvious local crash.

With `--verbose`, the real error is usually visible, for example:

```text
Missing scope for webhook topic: products/update (read_products)
Failed to start dev preview.
```

## Root cause (RipX local app)

`shopify.app.local.toml` had:

- `scopes = ""` (empty)
- Webhooks for `products/update` (requires `read_products`)
- Stale `*.trycloudflare.com` URLs from previous tunnel sessions

Shopify rejects dev preview registration when declared webhooks need scopes that are not listed.

## Fix applied in repo

1. **`shopify.app.local.toml`** — full scopes (same as production) and **relative** webhook/app_proxy paths so CLI can rewrite URLs per tunnel.
2. **`scripts/verify-shopify-local-dev-ready.js`** — fails fast before dev if scopes/webhooks are inconsistent.
3. **`scripts/cleanup-shopify-dev-workers.js`** — stops orphaned Vite/nodemon workers after a failed run (fixes port `3001` / `9293` conflicts).
4. **`npm run shopify:dev:local:safe`** — runs cleanup + port guard + config checks, then `shopify app dev`.

## Recommended workflow

Use the safe command as the default local workflow:

```bash
# 1) Stop any old dev session (optional but helps)
npm run shopify:dev:clean

# 2) Start local Shopify dev safely
npm run shopify:dev:local:safe
```

When the tunnel host changes, sync `.env` (and extension batch URLs) to the **current** host:

```bash
npm run dev:switch-tunnel -- https://YOUR-CURRENT.trycloudflare.com ripx-plus.myshopify.com
```

Also add the same host in **Partner Dashboard → RipperX (local app)**:

- **Application URL** = tunnel host (no trailing path required for OAuth base)
- **Allowed redirection URL** = `https://YOUR-CURRENT.trycloudflare.com/api/auth/callback`

## Troubleshooting matrix

| Symptom                                                   | Most likely cause                                              | First action                                                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Missing scope for webhook topic`                         | `shopify.app.local.toml` scopes do not cover declared webhooks | Run `npm run shopify:guard:local`, then re-run `npm run shopify:dev:local:safe`                                 |
| Port `3001` or `9293` already in use                      | Orphan Vite, nodemon, or Shopify CLI worker                    | Run `npm run shopify:dev:clean`                                                                                 |
| Checkout still calls an old callback URL                  | Tunnel host changed after CarrierService was applied           | Run `npm run dev:switch-tunnel -- https://YOUR-CURRENT-HOST ripx-plus.myshopify.com`, then Apply Shipping again |
| Embedded app opens but storefront callbacks fail          | Localhost mode cannot receive public Shopify callbacks         | Use Cloudflare/ngrok tunnel mode for carrier callback QA                                                        |
| Full-screen loader does not appear after frontend changes | Admin iframe has stale Vite bundle or old `index.html`         | Restart frontend/dev command and hard refresh the embedded app                                                  |

## Cloudflare tunnel: "max retries reached" / `unexpected EOF`

If verbose logs show:

```text
failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": unexpected EOF
Could not start Cloudflare tunnel: max retries reached.
```

RipX config is usually fine — Shopify CLI cannot create a **trycloudflare.com** tunnel (network blip, Cloudflare outage, or local firewall/VPN).

**Option A — Retry** (often works after a few minutes):

```bash
npm run shopify:dev:local:safe
```

**Option B — Localhost mode** (no Cloudflare tunnel; good for embedded app UI + API):

```bash
npm run shopify:dev:local:localhost:safe
```

Shopify serves the app on a local HTTPS proxy. Webhooks from Shopify to your machine will not reach localhost; use this for Admin UI and checkout extension work.

**Option C — Your own tunnel** (when you need a public URL, e.g. storefront script):

1. In one terminal, start a tunnel to a fixed port (e.g. ngrok): `ngrok http 3000`
2. In another: `shopify app dev --config shopify.app.local.toml --tunnel-url https://YOUR-NGROK-HOST`
3. Sync env: `npm run dev:switch-tunnel -- https://YOUR-NGROK-HOST ripx-plus.myshopify.com`

## Activate the latest app version (ripperx-7 / ripperx-8)

`shopify app versions list` may show new versions, but **`shopify app release --version ripperx-N` often fails** with “Version could not be found” when that version was created by **dev preview** only (config snapshot), not a full **deploy**.

**Use deploy to create and release a proper version:**

```bash
npm run shopify:deploy:local:safe
```

**Prerequisite:** `.env` must contain a **public HTTPS** `APP_URL` (not `127.0.0.1`). Shopify rejects deploy when webhooks resolve to localhost.

If deploy fails with `Invalid value: "https://127.0.0.1/api/webhooks/..."`:

1. Start dev once so `.env` syncs to the current tunnel:
   ```bash
   npm run shopify:dev:local:safe
   ```
2. In another terminal, deploy:
   ```bash
   npm run shopify:deploy:local:safe
   ```

Or set APP_URL manually:

```bash
npm run dev:switch-tunnel -- https://YOUR-PUBLIC-HOST ripx-plus.myshopify.com
npm run shopify:deploy:local:safe
```

This script:

1. Resets stale `*.trycloudflare.com` hosts in `shopify.app.local.toml`
2. Verifies scopes/webhooks
3. Builds extensions
4. Temporarily sets `application_url` from `.env` `APP_URL` for deploy
5. Runs `shopify app deploy` (creates + **releases** the new version)
6. Restores `application_url` to `https://127.0.0.1/` for local dev

Do **not** rely on `shopify app release` for versions created during failed `shopify app dev` runs.

## "Network access must be requested and approved" (ripx-checkout-ui)

When releasing a version, if Shopify blocks with **ripx-checkout-ui** network access:

1. Partner Dashboard → **RipperX** (local app) → **API access** → **Allow network access in checkout UI extensions** → **Allow network access**
2. Redeploy or retry version release

Full steps: [SHOPIFY_CHECKOUT_UI_NETWORK_ACCESS.md](./SHOPIFY_CHECKOUT_UI_NETWORK_ACCESS.md)

Before every dev or deploy, stale tunnel hosts are cleared automatically:

```bash
npm run shopify:sanitize:local-toml
```

## If preview still fails

1. Run with verbose logs:
   ```bash
   npm run shopify:dev:local:verbose
   ```
2. Free stuck ports:
   ```bash
   npm run shopify:cleanup:workers
   lsof -nP -iTCP:3001 -sTCP:LISTEN
   lsof -nP -iTCP:9293 -sTCP:LISTEN
   ```
3. Re-run config checks:
   ```bash
   npm run shopify:guard:local
   ```
