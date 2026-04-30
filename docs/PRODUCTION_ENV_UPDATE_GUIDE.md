# Production server: `.env` updates (step by step)

Use this when you change configuration on a host that runs RipX (e.g. `splitter.echologyx.com`). Pair with `.env.example` for variable descriptions.

## 0. Node.js version (before `npm install`)

RipX declares **`node >= 20.17`** in root `package.json`. On Ubuntu you may see `npm warn EBADENGINE` if the server still runs Node 18 — installs can succeed but tooling and future deps may break.

**Upgrade (example with nvm):**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reload shell, then:
nvm install 20
nvm use 20
node -v   # should be v20.17.x or newer
```

Or install **Node 20 LTS** from [NodeSource](https://github.com/nodesource/distributions) or your distro’s packages, then reinstall: `rm -rf node_modules frontend/node_modules && npm run install:all`.

**`npm audit`:** Review with `npm audit`; use `npm audit fix` where safe. Avoid `npm audit fix --force` on production without testing (it can bump majors).

**Never commit real `.env` files or paste secrets into chat, tickets, or screenshots.** If secrets were exposed, rotate them before anything else (see step 1).

---

## 1. If credentials may have been leaked

Do this **first** (order matters for avoiding a window where old + new keys conflict):

1. **PostgreSQL** — change the DB user password; update `DATABASE_URL` on the server.
2. **Shopify** — Partner Dashboard → your app → rotate **Client secret**; update `SHOPIFY_API_SECRET` in `.env`.
3. **JWT** — generate a new secret: `openssl rand -hex 32`; set `JWT_SECRET` in `.env` (invalidates existing login tokens / sessions).
4. **SMTP (e.g. AWS SES)** — create new SMTP credentials; update `SMTP_USER` / `SMTP_PASS` in `.env`.
5. **Restart** the Node process (PM2/systemd/docker) so the app reloads `.env`.

---

## 2. Add `SESSION_SECRET` (recommended for production)

RipX uses `SESSION_SECRET` for Express session signing. If unset, it falls back to `JWT_SECRET` and logs a warning.

1. Generate: `openssl rand -hex 32`
2. Add to `.env`:  
   `SESSION_SECRET=<paste generated value>`
3. Restart the app.

---

## 3. Lock down checkout price batch URL (`RIPX_CHECKOUT_PRICE_SECRET`)

If unset, anyone who discovers your batch URL could call `POST /api/track/price-resolve-batch`.

1. Generate a long random string (e.g. `openssl rand -hex 32`).
2. Add to **root** `.env`:  
   `RIPX_CHECKOUT_PRICE_SECRET=<your secret>`
3. From repo root on the server:  
   `npm run shopify:checkout-discount:sync-config`  
   (writes `extensions/ripx-checkout-discount/src/ripxConfig.js` from `.env`.)
4. **Rebuild and deploy** the checkout discount extension (e.g. `shopify app deploy` or your CI) so Shopify runs the updated function.
5. Restart the API if needed.

---

## 4. Align Shopify app identity (`SHOPIFY_API_KEY` / secret / TOML / Partner)

These must all describe the **same** app:

| Place                          | Must match                                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| `.env` `SHOPIFY_API_KEY`       | Partner Dashboard **Client ID**                                    |
| `.env` `SHOPIFY_API_SECRET`    | Partner **Client secret**                                          |
| `shopify.app.toml` `client_id` | Same Client ID (for CLI deploy/config)                             |
| Embedded UI                    | `VITE_SHOPIFY_API_KEY` = same Client ID **at frontend build time** |

**Steps**

1. In Partner Dashboard, copy **Client ID** and **Client secret**.
2. Update `.env` (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, and `VITE_SHOPIFY_API_KEY`).
3. Update `shopify.app.toml` `client_id` if you use Shopify CLI to push config.
4. Rebuild frontend: `npm run build` (so `VITE_*` is baked in).
5. Restart the server / redeploy.

---

## 5. Align OAuth URLs (fix `redirect_uri is not whitelisted`)

**Application URL** and **Allowed redirection URL(s)** in Partner Dashboard must use the **same hostname** as the `redirect_uri` RipX sends (usually `https://<your-domain>/api/auth/callback`).

1. Set in `.env` (production):  
   `APP_URL=https://your-domain.com`  
   `RIPX_OAUTH_REDIRECT_BASE=https://your-domain.com`  
   (no trailing slash on `RIPX_OAUTH_REDIRECT_BASE` is fine.)
2. In Partner Dashboard → App → URLs:
   - **Application URL**: `https://your-domain.com/`
   - **Allowed redirection URL(s)**: `https://your-domain.com/api/auth/callback`
3. Confirm what the API thinks it uses: open  
   `https://your-domain.com/api/auth/oauth-redirect-uri`  
   and compare `redirectUri` / `base` to the dashboard (exact string).
4. **Tunnel dev (`*.trycloudflare.com`)** — hostname changes when the tunnel restarts; update Partner Dashboard **and** `.env` each time, or use a **stable** domain for OAuth.

---

## 6. Align `SHOPIFY_SCOPES` with Partner + `shopify.app.toml`

1. List scopes in `.env` (`SHOPIFY_SCOPES`, comma-separated, no spaces).
2. Ensure Partner Dashboard app configuration includes those scopes (and any protected scopes are approved).
3. Keep `shopify.app.toml` `[access_scopes] scopes` consistent where you use CLI deploy, then push config if your workflow requires it.

---

## 7. Database TLS (`DATABASE_SSL_REJECT_UNAUTHORIZED`)

- **Postgres on the same VM, no TLS:** `DATABASE_SSL_REJECT_UNAUTHORIZED=false` is common.
- **Managed DB (RDS, etc.):** set `DATABASE_SSL_REJECT_UNAUTHORIZED=true` and add `DATABASE_SSL_CA` if the provider gives a CA bundle.

After changes, restart the app and verify `GET /api/ready` or `GET /api/health`.

---

## 8. Optional: `FRONTEND_URL`

Set when the **browser origin** for the UI differs from `APP_URL` (unusual for single-origin `npm start`).

- Magic links and some emails prefer `FRONTEND_URL`, then fall back to `APP_URL`.

---

## 9. After `git pull` on the server (checkout extension config)

If `extensions/ripx-checkout-discount/src/ripxConfig.js` is **generated** from `.env`, do not keep long-lived manual edits there.

1. `git restore extensions/ripx-checkout-discount/src/ripxConfig.js` (if Git blocks pull due to local changes).
2. `git pull`
3. `npm run shopify:checkout-discount:sync-config`
4. Rebuild/redeploy the extension if you ship it from this tree.

---

## 10. Production deploy checklist (minimal)

1. `.env` on server has required vars (see `.env.example` and sections above).
2. `npm run migrate` (if schema changed).
3. `npm run shopify:checkout-discount:sync-config` (if using checkout price + `.env` changed).
4. `npm run build` (frontend).
5. Restart API process.
6. Verify: `GET /live`, `GET /api/health`, and (if Shopify) embedded app load + OAuth install test.

---

## Quick reference: variables often added after first deploy

| Variable                     | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `SESSION_SECRET`             | Session cookie signing (don’t reuse JWT for long term).     |
| `RIPX_CHECKOUT_PRICE_SECRET` | Protects price-resolve-batch; sync extension after setting. |
| `RIPX_OAUTH_REDIRECT_BASE`   | Pins OAuth `redirect_uri` to match Partner Dashboard.       |
| `FRONTEND_URL`               | When UI origin ≠ `APP_URL`.                                 |
| `VITE_API_URL`               | Frontend build: API base if not same-origin `/api`.         |
| `VITE_SHOPIFY_APP_HANDLE`    | Optional: “Open in Shopify Admin” from domains/home.        |
| `LOG_LEVEL`                  | e.g. `info` in production.                                  |
| `SUPPORT_EMAIL_TO`           | Support ticket recipient (defaults toward `SMTP_FROM`).     |

For the full list, see **`.env.example`**.
