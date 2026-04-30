# Add your hosted server (splitter.echologyx.com) as the Shopify app and enable embedded app + auto script

This guide walks through adding **splitter.echologyx.com** as your Shopify app URL, making it the embedded app for stores, and ensuring the storefront script auto-installs via App Proxy + App Embed.

---

## Overview

| Step                      | What it does                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| 1. Server & env           | Your app runs at `https://splitter.echologyx.com`; `.env` points OAuth and proxy there.             |
| 2. shopify.app.toml       | App config uses `splitter.echologyx.com` so CLI and Partner Dashboard stay in sync.                 |
| 3. Partner Dashboard URLs | Application URL and Allowed redirection URL(s) = `https://splitter.echologyx.com` and callback.     |
| 4. App Proxy              | Partner Dashboard App Proxy sends `https://<store>/apps/ripx/script.js` → your server.              |
| 5. Theme extension        | Deploy/link the RipX theme extension so stores can enable the “RipX App Embed” in the theme editor. |
| 6. Store install + embed  | Merchant installs app, enables embed → script loads automatically on the storefront.                |

---

## Prerequisites

- App is **deployed and running** at `https://splitter.echologyx.com` (backend serves frontend from `frontend/dist` and handles `/api/*`).
- You have access to **Shopify Partner Dashboard** for the app.
- **SHOPIFY_API_KEY** and **SHOPIFY_API_SECRET** from Partner Dashboard (Client ID and Client secret).

---

## Step 1: Server environment (.env on splitter.echologyx.com)

On the server (or in the environment used by splitter.echologyx.com), set:

```bash
# Required for OAuth and script proxy
APP_URL=https://splitter.echologyx.com
RIPX_OAUTH_REDIRECT_BASE=https://splitter.echologyx.com

# Must match Partner Dashboard → App setup → Client ID
SHOPIFY_API_KEY=<your_client_id_from_partner_dashboard>
SHOPIFY_API_SECRET=<your_client_secret>

# Scopes (include read_online_store_pages for targeting)
SHOPIFY_SCOPES=read_products,write_products,read_orders,read_online_store_pages

# Rest of your env (DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS, etc.)
ALLOWED_ORIGINS=https://splitter.echologyx.com,https://admin.shopify.com
```

- **APP_URL** is used for App Proxy target URL and any server-generated links.
- **RIPX_OAUTH_REDIRECT_BASE** must match the Application URL in Partner Dashboard so OAuth uses `https://splitter.echologyx.com/api/auth/callback`.
- **SHOPIFY_API_KEY** must equal the app’s **Client ID** in Partner Dashboard; otherwise install/redirect URLs are rejected.

- **App Proxy and same app:** The app where you configured the App Proxy (subpath `ripx`) must be the same app whose **Client ID** = `SHOPIFY_API_KEY` and **Client secret** = `SHOPIFY_API_SECRET`. If you have multiple apps, use the credentials of the app that has the App Proxy.

Restart the backend after changing `.env`.

---

## Step 2: Update shopify.app.toml for production URL

In the project root, set the app URL and callback to your hosted domain (no tunnel URL):

```toml
# shopify.app.toml
application_url = "https://splitter.echologyx.com"
embedded = true

[auth]
redirect_urls = [ "https://splitter.echologyx.com/api/auth/callback" ]
```

Keep `client_id` as your app’s Client ID (same as SHOPIFY_API_KEY). **client_id** in this file is the app linked to this repo. On the server, **SHOPIFY_API_KEY** must match the **Client ID** of the app that has the App Proxy and OAuth configured (same or a different production app). Use **no trailing slash** in `application_url`. Commit so future deploys and CLI use the same URL.

---

## Step 3: Partner Dashboard — Application URL and redirect

1. Go to [Shopify Partner Dashboard](https://partners.shopify.com) → **Apps** → your app (RipX).
2. **App setup** → **URLs**:
   - **Application URL:** `https://splitter.echologyx.com` (no trailing slash).
   - **Allowed redirection URL(s):** add exactly:
     - `https://splitter.echologyx.com/api/auth/callback`
3. Save.

Optional check: open `https://splitter.echologyx.com/api/auth/oauth-redirect-uri` in a browser; the JSON should show `redirectUri` and `base` as `https://splitter.echologyx.com/...`. If not, fix `RIPX_OAUTH_REDIRECT_BASE` and Partner Dashboard to match.

---

## Step 4: Partner Dashboard — App Proxy (script URL)

App Proxy makes `https://<store>.myshopify.com/apps/ripx/script.js` hit your server so the theme embed can load the script from the store’s domain.

1. In Partner Dashboard → your app → **App setup** → **App proxy** (or **Configuration** → **App proxy**).
2. Add a proxy:
   - **Subpath prefix:** `apps`
   - **Subpath:** `ripx`
   - **Proxy URL:** `https://splitter.echologyx.com/api/proxy`  
     **Important:** Use the base URL **without** `/script.js`. Shopify appends the path (e.g. `/script.js`) to this URL. If you include `/script.js` here, you get a double path and a "Not found" error.
3. Save.

Result: a request to `https://<store>.myshopify.com/apps/ripx/script.js?...&signature=...` is forwarded by Shopify to `https://splitter.echologyx.com/api/proxy/script.js` with the same query (including `shop`, `signature`, etc.). Your backend serves the storefront script and validates the signature.

---

## Step 5: Deploy the theme extension (App Embed)

The RipX **App Embed** is in `extensions/ripx-theme/`. It injects the script tag `https://{{ request.host }}/apps/ripx/script.js` into the store theme. Merchants enable it in the theme editor so the script auto-installs.

**Option A — Shopify CLI (recommended)**

From the project root:

```bash
# Link the app to your Partner app (if not already)
shopify app config link

# Deploy the theme extension so the embed is available to installed stores
shopify app deploy
```

**Option B — Manual / existing app**

If the app is already created and you only need the extension:

```bash
cd extensions/ripx-theme
shopify app deploy
# or: shopify theme extension push (depending on CLI version)
```

After deploy, the **RipX App Embed** appears in the theme editor for any store that has installed your app.

---

## Step 6: Store flow — Install app and enable script (auto install)

1. **Install the app** on the store:
   - From Partner Dashboard: **Test your app** → open the install link for the store, or
   - Share the app’s install URL with the merchant (e.g. from your app’s “Connect” or marketing page).
2. Merchant approves and is redirected to your app at `https://splitter.echologyx.com`.
3. **Enable the embed** (one-time per theme):
   - In the store: **Online Store** → **Themes** → **Customize**.
   - In the theme editor: **App embeds** (or **Theme settings** → **App embeds**).
   - Find **RipX App Embed** and **enable** it.
   - Save.
4. **Script is now auto-installed:** every storefront page loads `https://<store>.myshopify.com/apps/ripx/script.js`, which is proxied to your server. No manual script tag in theme code is required.

Merchants can open the app from **Apps** in Shopify Admin; the app loads in the iframe (embedded) from `https://splitter.echologyx.com` because Application URL is set to that domain.

---

## Verification checklist

| Check                      | How                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App loads in Shopify Admin | Open the app from the store’s **Apps**; it should load inside Admin (embedded) from `https://splitter.echologyx.com`.                                                                                                                  |
| OAuth and install          | Install (or add store) from your app; no “installation link invalid” or “redirect_uri and application url must have matching hosts”.                                                                                                   |
| OAuth redirect helper      | Open `https://splitter.echologyx.com/api/auth/oauth-redirect-uri`; copy `partnerDashboard.applicationUrl` and `partnerDashboard.allowedRedirectionUrl` into Partner Dashboard if anything was wrong.                                   |
| App Proxy                  | In the app (when logged in as a connected store), go to **Setup** or **Documentation** and use “Verify Script URL” or open `https://<store>.myshopify.com/apps/ripx/script.js?v=1` in a browser; it should return JavaScript, not 404. |
| Embed detected             | After enabling the embed and saving the theme, the app’s setup/status should show “Script detected” or the script URL returns 200.                                                                                                     |

---

## Common issues

### “The installation link for this app is invalid”

- **Application URL** and **Allowed redirection URL(s)** in Partner Dashboard must use **exactly** `https://splitter.echologyx.com` (and `https://splitter.echologyx.com/api/auth/callback`).
- **SHOPIFY_API_KEY** in `.env` must match the app’s **Client ID** in Partner Dashboard.
- **RIPX_OAUTH_REDIRECT_BASE** in `.env` must be `https://splitter.echologyx.com` (no trailing slash).
- Get a **new** install link after changing URLs; old links keep the previous `redirect_uri`.

See [docs/OAUTH_FIX.md](OAUTH_FIX.md) for more detail.

### “redirect_uri and application url must have matching hosts”

- Use **one** stable URL everywhere: Application URL, Allowed redirection URL(s), and `RIPX_OAUTH_REDIRECT_BASE` all with host `splitter.echologyx.com`.
- Do **not** use a dynamic tunnel URL (e.g. `*.trycloudflare.com`) for OAuth.

### `https://<store>.myshopify.com/apps/ripx/script.js?v=1` shows error page / 404 / Unauthorized

When the script URL shows an error page (or 404, or “Unauthorized”), check the following:

1. **Server env: APP_URL and SHOPIFY_API_SECRET**
   - **APP_URL** must be the full URL of your app (e.g. `https://splitter.echologyx.com`) so the proxy target and runtime config are correct.
   - **SHOPIFY_API_SECRET** must match the **Client secret** of the same app in Partner Dashboard. If it’s wrong, signature verification fails and the backend returns 401 (you may see “Unauthorized” or an error page).

2. **Script file exists on the server**  
   The backend reads `shopify/storefront-script.js` from the project root (relative to where the app runs). If you deploy only part of the repo, ensure the `shopify` folder and `storefront-script.js` are present. If the file is missing, the server logs “Storefront script file missing or unreadable” and returns 503.

3. **Proxy URL is reachable**  
   From a machine that can reach your server:  
   `curl -I "https://splitter.echologyx.com/api/proxy/script.js?shop=uq4axu-rn.myshopify.com"`  
   (Without the signature you’ll get 401 in production; that’s expected. The important part is that the request reaches your server and returns 401, not connection refused or 502.)

**Quick checklist (for Unauthorized):** APP_URL and SHOPIFY_API_SECRET correct on server → `shopify/storefront-script.js` present on server.

**What you see when opening the script URL in a browser:**

- **Shopify 404 or “This page could not be found”** → The request never reached your app. Configure App Proxy in Partner Dashboard (subpath prefix `apps`, subpath `ripx`, proxy URL `https://<your-app>/api/proxy`) and ensure the store has the app installed.
- **“Unauthorized” or JSON `{ "success": false, "error": "Unauthorized", "hint": "Signature invalid..." }`** → The request reached your server but signature verification failed. **Fix:** (1) Set `SHOPIFY_API_SECRET` on the server to the exact **Client secret** from Partner Dashboard → your app → **Client credentials** (same app that has the App Proxy). Copy-paste; no extra spaces (the server trims spaces). (2) If you need the script to load before the secret is fixed (e.g. staging), set `RIPX_APP_PROXY_SKIP_VERIFY=true` on the server **only when NODE_ENV is not production** — the script will load but do not use this in production.
- **“Unauthorized” with hint “App proxy requests must include signature”** → You opened the proxy URL directly (e.g. from your server’s domain) without going through the store URL. Always use the store URL: `https://<store>.myshopify.com/apps/ripx/script.js?v=1`.
- **“Script temporarily unavailable”** → The file `shopify/storefront-script.js` is missing on the server. Deploy the `shopify` folder to the app’s project root.

- **JSON `{"success":false,"error":"Not found","path":"/api/proxy/script.js/script.js..."}`** → The Proxy URL in Partner Dashboard must be the **base** URL only: `https://<your-app>/api/proxy` (no `/script.js`). Shopify appends the path; if you included `/script.js` you get a double path and 404.

For a full list of signature-failure causes and the exact verification algorithm, see [APP_PROXY_SIGNATURE_RESEARCH.md](APP_PROXY_SIGNATURE_RESEARCH.md).

### Embed not showing in theme editor

- Deploy the theme extension: `shopify app deploy` (or push the `extensions/ripx-theme` extension).
- The store must have **installed** the app first; then the RipX App Embed appears under App embeds.

### Blank page when opening app in Shopify Admin

- **Application URL** in Partner Dashboard must be exactly `https://splitter.echologyx.com` (same origin as the iframe).
- Backend must serve the **production** frontend from `frontend/dist` (run `npm run build` in frontend and serve from backend).
- See [EMBED_TUNNEL.md](../EMBED_TUNNEL.md) for more.

---

## Summary: splitter.echologyx.com as Shopify app

| Item                                 | Value                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Application URL (Partner Dashboard)  | `https://splitter.echologyx.com`                                                      |
| Allowed redirection URL(s)           | `https://splitter.echologyx.com/api/auth/callback`                                    |
| App Proxy target (Partner Dashboard) | `https://splitter.echologyx.com/api/proxy` (Shopify appends path e.g. /script.js)     |
| App Proxy subpath                    | Prefix `apps`, subpath `ripx` → store URL `https://<store>/apps/ripx/script.js`       |
| RIPX_OAUTH_REDIRECT_BASE             | `https://splitter.echologyx.com`                                                      |
| APP_URL                              | `https://splitter.echologyx.com`                                                      |
| Script auto-install                  | Theme extension “RipX App Embed” enabled in theme editor → script loads via App Proxy |

After completing the steps above, your server at **splitter.echologyx.com** is the Shopify app and embedded app; stores that install the app and enable the RipX App Embed get the storefront script automatically.
