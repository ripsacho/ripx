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

## "Wrong store approved" when adding a store

If you see **"You approved a different store"** when adding a store (e.g. ripperx-2) from another store's admin:

1. Use **Copy link for incognito** and open that link in a **new incognito/private** window.
2. Paste the link and complete the flow. When Shopify asks you to log in, log in to **the store you want to add** (e.g. ripperx-2), not the store you were viewing before.
3. The install link uses the same domain as the app's OAuth callback (e.g. `RIPX_OAUTH_REDIRECT_BASE`), so cookies and redirect stay consistent and only the intended store is connected.
