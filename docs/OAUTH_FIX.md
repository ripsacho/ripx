# OAuth "redirect_uri and application url must have matching hosts" — Fix

If Shopify shows **"The redirect_uri and application url must have matching hosts"** when installing or adding a store, the app is sending a `redirect_uri` whose **host** does not match the **Application URL** configured in your Shopify Partner Dashboard.

## Root cause

- **Partner Dashboard** (and `shopify.app.toml`) define: **Application URL** and **Allowed redirection URL(s)**.
- The app sends `redirect_uri = <base>/api/auth/callback` when starting OAuth.
- Shopify allows the callback **only if** the host of `redirect_uri` is the **same** as the host of the Application URL.

If your `.env` has `RIPX_OAUTH_REDIRECT_BASE` or `APP_URL` set to a **different** host (e.g. a dynamic tunnel like `xxx.trycloudflare.com`) than what is in Partner Dashboard (e.g. `https://splitter.echologyx.com`), the hosts do not match and OAuth fails.

**Common mistake:** Setting `RIPX_OAUTH_REDIRECT_BASE` or App URL in Partner Dashboard to a **tunnel URL** (e.g. `https://something.trycloudflare.com`). That URL changes every time the tunnel restarts, so after a restart the app sends a new host and Shopify rejects it. Always use a **stable** domain (e.g. custom hostname) for OAuth.

## Fix (one stable URL everywhere)

1. **Pick one stable URL** that will never change for OAuth:
   - Prefer the same URL as in **shopify.app.toml** → `application_url` (e.g. `https://splitter.echologyx.com`).
   - Do **not** use a dynamic URL (e.g. `https://something.trycloudflare.com`) — it changes when the tunnel restarts and will break OAuth again.

2. **In Shopify Partner Dashboard**
   - Go to **Your app → App setup → URLs**.
   - Set **Application URL** to that stable URL (e.g. `https://splitter.echologyx.com`).
   - Set **Allowed redirection URL(s)** to exactly:  
     `https://splitter.echologyx.com/api/auth/callback`  
     (same host, path `/api/auth/callback`).

3. **In your app `.env`**
   - Set:
     ```bash
     RIPX_OAUTH_REDIRECT_BASE=https://splitter.echologyx.com
     ```
   - Use the **same** URL you used in Partner Dashboard (no trailing slash).
   - You can keep `APP_URL` as your tunnel or dev URL for other uses; OAuth will use `RIPX_OAUTH_REDIRECT_BASE` for `redirect_uri` and install links.

4. **Ensure the stable URL reaches your app**
   - `https://splitter.echologyx.com` must point to the same backend as your app (e.g. Cloudflare Tunnel with custom hostname, or your server’s domain). If you only have a tunnel URL (e.g. `xxx.trycloudflare.com`), configure a **custom hostname** (e.g. `splitter.echologyx.com`) in the tunnel so that both the tunnel and OAuth use the same stable host.

5. **Restart the app** after changing `.env`.

## Verify

- Open: `https://splitter.echologyx.com/api/auth/oauth-redirect-uri` (use your actual stable URL).
- You should see:
  - `redirectUri`: `https://splitter.echologyx.com/api/auth/callback`
  - `base`: `https://splitter.echologyx.com`
  - `isDynamicTunnel`: `false`
- If `isDynamicTunnel` is `true` or the host differs from Partner Dashboard, fix `RIPX_OAUTH_REDIRECT_BASE` and Partner Dashboard as above.

## Checklist

- [ ] **One stable URL** for OAuth (e.g. `https://splitter.echologyx.com`), not a dynamic tunnel URL.
- [ ] **Partner Dashboard** → App setup → Application URL = that stable URL.
- [ ] **Partner Dashboard** → Allowed redirection URL(s) includes `https://<that-host>/api/auth/callback`.
- [ ] **`.env`** → `RIPX_OAUTH_REDIRECT_BASE=https://<that-host>` (same as Partner Dashboard, no trailing slash).
- [ ] **`.env`** → `SHOPIFY_API_KEY` matches the **Client ID** of that app in Partner Dashboard (and `client_id` in `shopify.app.toml`). If they differ, OAuth is for a different app and redirect_uri is validated against that app’s URLs.
- [ ] **Stable domain** (e.g. splitter.echologyx.com) resolves to your app (e.g. Cloudflare Tunnel with custom hostname, or your server).
- [ ] **Restart the backend** after changing `RIPX_OAUTH_REDIRECT_BASE` or `SHOPIFY_API_KEY` so the new values are used.

## Summary

| Item                                           | Value                                              |
| ---------------------------------------------- | -------------------------------------------------- |
| Application URL (Partner Dashboard)            | `https://splitter.echologyx.com`                   |
| Allowed redirection URL(s) (Partner Dashboard) | `https://splitter.echologyx.com/api/auth/callback` |
| `RIPX_OAUTH_REDIRECT_BASE` in `.env`           | `https://splitter.echologyx.com`                   |

All three must use the **same host**. Do not use a dynamic tunnel host (e.g. `*.trycloudflare.com`) for OAuth.

See also: [OAUTH_ADD_STORE.md](./OAUTH_ADD_STORE.md) for adding stores and avoiding the "wrong store" flow.
