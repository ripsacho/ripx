# Running the app in Shopify Admin (embed / tunnel)

When opening the app inside **Shopify Admin** (embedded iframe), use the **production build** and point your tunnel at the **backend**. Otherwise you can get a blank page and console errors.

**Note:** Embedded App Bridge is disabled (`embedded={false}`) so the app does not use `postMessage` to the parent. Polaris UI and all app features work; redirects use our own `redirectToAppUrl` / `getConnectUrl`.

If the embed still shows a blank area or a console postMessage error from Shopify's script (e.g. `render-common`), the app shows **"Open app in new tab"** on load or on error so you can use the app in a new tab. Rebuild after pulling changes (`npm run build`), then hard refresh the embed.

## Why

- The **dev** frontend (`npm run dev`) serves `index.html` with `<script src="/src/main.jsx">`. The browser then requests `/src/App.jsx` and other source files. If the tunnel or server returns 404/500 for those, the app fails to load (blank page).
- The **production** build serves a single bundle from `/assets/...`, so there are no `/src/*` requests and the app loads reliably behind a tunnel.

## Steps

1. **Build the frontend**

   ```bash
   cd frontend && npm run build
   ```

2. **Run the backend** (it will serve the built app from `frontend/dist` when that folder exists)

   ```bash
   cd backend && node src/app.js
   ```

   Or with env:

   ```bash
   NODE_ENV=production node backend/src/app.js
   ```

3. **Point your tunnel (e.g. Cloudflare Tunnel) at the backend**
   - URL: `http://localhost:3000` (or whatever port the backend uses).
   - Do **not** point the tunnel at the Vite dev server when testing the embed.

4. **Set the app URL in Shopify Partner Dashboard** to your tunnel URL (e.g. `https://xxx.trycloudflare.com`).

## App URL in Shopify Partner Dashboard

Set **App URL** to the exact URL of your app (e.g. `https://xxx.trycloudflare.com`). It must match the iframe origin exactly (protocol and host). If it doesn’t, App Bridge can throw a postMessage SecurityError and the embed may show a blank page.

## Console messages you can ignore

- **CSP: "upgrade-insecure-requests is ignored in report-only policy"**  
  Comes from Shopify’s Admin script, not your app. Safe to ignore.

- **postMessage origin mismatch**  
  The app patches `parent.postMessage` so that when our code uses the iframe origin by mistake, we use `https://admin.shopify.com` instead. If you still see this, ensure App URL in Partner Dashboard matches your tunnel URL.

## Dynamic OAuth URL (works for any domain)

The app derives the OAuth `redirect_uri` from env and request so it works for any deployment:

1. **`RIPX_OAUTH_REDIRECT_BASE`** (recommended) – If set, this is **always** used as the base for `redirect_uri` and install links. Set it to the **exact** Application URL in Shopify Partner Dashboard (e.g. `https://splitter.echologyx.com`). **Do not** use a dynamic tunnel URL (e.g. `https://xxx.trycloudflare.com`) — it changes when the tunnel restarts and Shopify will reject OAuth. Use a **stable** custom domain and point it at your app. See [docs/OAUTH_FIX.md](docs/OAUTH_FIX.md).
2. **Request host / `callback_base`** – If not using the env var, the app uses the request host or the frontend’s `callback_base` query param.
3. **`APP_URL` / `FRONTEND_URL`** – Fallback when the request host is localhost or missing.

**Verify:** After deployment, call `GET /api/auth/oauth-redirect-uri` (from the same host as your app). The response includes `partnerDashboard.applicationUrl` and `partnerDashboard.allowedRedirectionUrl` — copy these into Partner Dashboard. If `isDynamicTunnel: true`, switch to a stable URL and see docs/OAUTH_FIX.md. The server also logs the expected callback URL at startup when Shopify is configured.

### Configuration decision tree

- **Single public URL** (e.g. `https://app.example.com`)  
  → Set `APP_URL` to that URL. Do **not** set `RIPX_OAUTH_REDIRECT_BASE`. In Partner Dashboard set Application URL and Allowed redirection URL(s) to the same host. The app will use the request host or `APP_URL`.

- **Tunnel in front** (e.g. users open `https://abc.trycloudflare.com`, but you want a stable Application URL)  
  → Set `RIPX_OAUTH_REDIRECT_BASE=https://your-stable-domain.com` and set Partner Dashboard to that domain. Set `APP_URL` to the URL the server sees (tunnel or stable). OAuth will always use the stable domain for `redirect_uri`.

- **Request host is localhost** (e.g. reverse proxy forwards to `localhost:3000`)  
  → Set `APP_URL` (or `FRONTEND_URL`) to the public URL users use. The app uses that as the OAuth base when the request host is localhost. Optionally set `RIPX_OAUTH_REDIRECT_BASE` to the same value so it’s explicit.

- **Multiple domains** (e.g. app on `app.example.com`, API on `api.example.com`)  
  → Use one domain for OAuth (Shopify requires one Application URL). Set `RIPX_OAUTH_REDIRECT_BASE` to that domain (e.g. `https://app.example.com`) and add `api.example.com` to `RIPX_OAUTH_ALLOWED_HOSTS` only if you need it for other checks. Partner Dashboard Application URL and callback must use the same host.

## "The installation link for this app is invalid"

Shopify shows this on the **Install app** / grant screen when the OAuth request does not match the app’s configuration in the **Shopify Partner Dashboard**. Common causes:

| Cause                      | What to check                                                                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Host mismatch**          | The host of `redirect_uri` (e.g. `https://app.example.com/api/auth/callback`) must match the **Application URL** host exactly. No different subdomain, no http vs https mismatch.                                                                          |
| **Callback not allowed**   | The full callback URL must appear in **Allowed redirection URL(s)**. Add exactly `https://<your-host>/api/auth/callback` (no trailing slash).                                                                                                              |
| **Client ID mismatch**     | The grant URL’s `client_id` must match **Client ID** in Partner Dashboard and `SHOPIFY_API_KEY` in `.env`. If you have multiple apps (e.g. dev vs prod), the link was generated for one app but the dashboard/open app is another.                         |
| **Typos / trailing slash** | Application URL and Allowed redirection URL(s) must be exact. No trailing slash on the base URL; include `https://`.                                                                                                                                       |
| **Stale link**             | After changing Partner Dashboard or env, get a **new** install or connect link; old links keep the previous `redirect_uri`.                                                                                                                                |
| **Non-standard port**      | If your app is served with a port in the URL (e.g. `https://app.example.com:8443`), Application URL and Allowed redirection URL(s) must include that port. The app uses the full origin (including port) when derived from the request or `callback_base`. |

**Fix (works for any domain):**

1. **Partner Dashboard → Your app → App setup → URLs**
   - Set **Application URL** to the exact URL where the app is served (e.g. `https://your-app.example.com`). No trailing slash.
   - In **Allowed redirection URL(s)**, add exactly:  
     `https://your-app.example.com/api/auth/callback`  
     (same host as Application URL). Replace `your-app.example.com` with your actual app host.

2. **Server `.env`**
   - So the app always uses that host for OAuth (even when requests come via tunnel or another domain), set:
     ```bash
     RIPX_OAUTH_REDIRECT_BASE=https://your-app.example.com
     ```
     Use the same URL as in Partner Dashboard. Omit this if you use a single public URL and set `APP_URL` to it; the app will derive the base from the request or `APP_URL`.
   - Ensure `SHOPIFY_API_KEY` matches the **Client ID** shown in Partner Dashboard (and in the grant URL as `client_id=`). If they differ, Shopify can treat the link as invalid.

3. **Retry**
   - Get a **new** install or connect link (from Domains → Connect, or the install-link API). Old links were built with the previous (mismatched) `redirect_uri` and stay invalid.

If you use a tunnel (e.g. Cloudflare), either use the tunnel URL everywhere (Application URL + Allowed redirection URL(s) + `APP_URL`), or use your stable domain everywhere and set `RIPX_OAUTH_REDIRECT_BASE` to that domain; don’t mix hosts between dashboard and `redirect_uri`.

### Verification checklist

1. **Server startup** – When Shopify is configured, the server logs `expectedCallback: "https://.../api/auth/callback"`. That must match Partner Dashboard.
2. **Live check** – Open `https://<your-app-host>/api/auth/oauth-redirect-uri` in a browser (or `curl`). Copy `partnerDashboard.applicationUrl` and `partnerDashboard.allowedRedirectionUrl` into Partner Dashboard.
3. **Same host** – Call the verification URL from the **same host** users use (e.g. via tunnel if that’s how they open the app); otherwise the returned base may differ from the one used during install.
4. **Port** – If you use a non-standard port (e.g. `:8443`), the response will include it; copy the values exactly into Partner Dashboard.

## "Wrong store approved" when adding a store

If you see **"You approved a different store"** when adding a store (e.g. ripperx-2) from another store's admin:

1. Use **Copy link for incognito** and open that link in a **new incognito/private** window.
2. You’ll see a short **instruction page**; click **Continue to Shopify**, then when Shopify asks you to log in, log in to **the store you want to add** (e.g. ripperx-2), not the store you were viewing before.
3. The install link uses the same domain as the app's OAuth callback (from `RIPX_OAUTH_REDIRECT_BASE` or the request), so cookies and redirect stay consistent.

**Full guide:** See [docs/OAUTH_ADD_STORE.md](docs/OAUTH_ADD_STORE.md) for why this happens and how to avoid it.

## References

- [Shopify: redirect_uri and Application URL must have matching hosts](https://community.shopify.dev/t/cant-complete-oauth-install-redirect-uri-and-application-url-must-have-matching-hosts/18824)
- [Shopify: OAuth verification (HMAC)](https://shopify.dev/docs/apps/build/authentication-authorization/get-access-tokens/auth-code-grant/implement-auth-code-grants-manually) — the app verifies HMAC using all callback query parameters (including `host`) so Shopify’s redirect is accepted.
