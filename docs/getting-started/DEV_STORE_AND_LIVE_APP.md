# Dev Store and Live App: What to Do

You have:

- **Live app** on the server: `https://splitter.echologyx.com`
- **Dev store**: e.g. `makripon.myshopify.com`
- **Local dev**: `shopify app dev` (tunnel + frontend; backend must run separately)

Below is what to do in which situation.

---

## Recommendation: Use the live app with your dev store

**Yes — connect your dev store to the live app** for normal use. Then you can open the app from Shopify Admin anytime without running your Mac or a tunnel.

---

## Step 1: Point the app to the live URL (one-time)

1. Go to **[partners.shopify.com](https://partners.shopify.com)** → **Apps** → your RipX app → **App setup** (or **Configuration**).
2. Set:
   - **App URL:** `https://splitter.echologyx.com`
   - **Allowed redirection URL(s):** `https://splitter.echologyx.com/api/auth/callback`
3. **Save**.

(Your server `.env` should already have `APP_URL`, Shopify keys, and `ALLOWED_ORIGINS` as in [SHOPIFY_APP_SERVER_SETUP.md](SHOPIFY_APP_SERVER_SETUP.md).)

---

## Step 2: Install the app on your dev store (from the live URL)

1. In Partner Dashboard, open your app and click **Test your app** (or **Select store**).
2. Choose your **dev store** (e.g. makripon.myshopify.com) and confirm.
3. When asked, allow the app to install — it will use **https://splitter.echologyx.com** (your live app).
4. The app opens in Shopify Admin and loads from your **server** (no tunnel, no local run needed).

From now on, when you open the app from that dev store (Apps → RipX), it will use the **live app** at splitter.echologyx.com unless you are in a “dev preview” (see below).

---

## When to use what

| Goal                                           | What to do                                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use the app from Shopify Admin** (no coding) | Use the live app. Open the app from your dev store; it loads from `https://splitter.echologyx.com`. No local run, no tunnel.                                                                  |
| **Code and test changes on your Mac**          | Use local dev: run the **backend** and **shopify app dev**. The CLI will use a **tunnel** for that session; your dev store will load the app from the tunnel (your local frontend + backend). |

So:

- **Normal use / testing the “real” app:** Dev store is already connected to the **live app** after Step 1 and Step 2. Do nothing else.
- **Developing and testing code:** Run backend + `shopify app dev` (tunnel is expected and correct for that case).

---

## Local development (when you are coding)

The `ECONNREFUSED` errors happen because the **backend** was not running. The frontend (Vite) proxies `/api` to `http://localhost:3000`, so the backend must be up.

**Option A — Two terminals (recommended)**

1. **Terminal 1 — Backend**

   ```bash
   cd /Users/m.a.k.ripon/Desktop/RipX
   npm run dev:backend
   ```

   Leave it running. You should see the backend listening on port 3000.

2. **Terminal 2 — Shopify dev (frontend + tunnel)**
   ```bash
   cd /Users/m.a.k.ripon/Desktop/RipX
   shopify app dev
   ```
   The CLI will start the frontend and create a tunnel (e.g. `https://something.trycloudflare.com`). Your dev store will use that tunnel for this session. API calls go: browser → tunnel → your Mac (frontend) → proxy → backend on port 3000.

**Option B — One terminal (backend + frontend, then Shopify dev)**

1. In one terminal:

   ```bash
   cd /Users/m.a.k.ripon/Desktop/RipX
   npm run dev
   ```

   This starts both backend and frontend. Wait until both are up.

2. In a **second** terminal:
   ```bash
   cd /Users/m.a.k.ripon/Desktop/RipX
   shopify app dev
   ```
   The CLI may start its own frontend; if it does, it will use a different port and the tunnel. Ensure the CLI’s proxy target (or your Vite proxy) points to the same backend (e.g. `localhost:3000`). If the CLI starts the frontend, it usually proxies to the backend — just ensure the backend from step 1 is still running.

---

## Summary

| Question                                       | Answer                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Should I connect my dev store to the live app? | **Yes.** Set App URL and redirect URL to `https://splitter.echologyx.com` and install the app on the dev store. Then opening the app uses the live server.          |
| Why does local dev still use a tunnel?         | Because your app runs on your Mac; Shopify needs a public URL to reach it. The tunnel is only for that dev session.                                                 |
| Why did I get ECONNREFUSED?                    | The backend (port 3000) was not running. Run `npm run dev:backend` (or `npm run dev`) before or while running `shopify app dev`.                                    |
| Two different URLs for the same app?           | Yes: **live** = `https://splitter.echologyx.com` (server). **Local dev** = tunnel URL (your Mac). Use live for normal use; use local + tunnel only when developing. |
