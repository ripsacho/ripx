# Set Up RipX as a Shopify App on Your Server

Follow these steps in order. Use your real domain: **https://splitter.echologyx.com**

---

## Step 1: Get your Shopify app credentials

1. Open a browser and go to: **https://partners.shopify.com**
2. Log in and click **Apps** in the left menu.
3. Click your **RipX** app (or create one if you haven’t).
4. In the app, go to **App setup** (or **Configuration**).
5. Find and note:
   - **Client ID** (e.g. `e7a7d74e7aaa14162e3951a559bda6c1`)
   - **Client secret** — click **Show** or **Reveal** and copy it. You will use it only in the server `.env`; never commit it to git.

---

## Step 2: Set URLs in Shopify Partner Dashboard

Still in **App setup** (or **Configuration**):

1. Find **App URL** and set it to:
   ```text
   https://splitter.echologyx.com
   ```
2. Find **Allowed redirection URL(s)** (or **Redirect URLs**) and add exactly:
   ```text
   https://splitter.echologyx.com/api/auth/callback
   ```
3. Click **Save**.

---

## Step 3: Edit the server `.env` file

1. SSH into your server:
   ```bash
   ssh -i /path/to/your/key.pem ubuntu@3.11.139.224
   ```
2. Open the env file:
   ```bash
   nano ~/RipX/.env
   ```
3. Apply the changes below. **Replace only what’s in the right column.**

---

## Step 4: Exact `.env` changes

Do these **one by one** in `~/RipX/.env`:

| Line to find or add     | What to set                                                                                            | Where the value comes from                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `SHOPIFY_API_KEY=`      | Your app’s **Client ID** (e.g. `e7a7d74e7aaa14162e3951a559bda6c1`)                                     | Partner Dashboard → App setup → Client ID                  |
| `SHOPIFY_API_SECRET=`   | Your app’s **Client secret** (long string)                                                             | Partner Dashboard → App setup → Client secret (click Show) |
| `VITE_SHOPIFY_API_KEY=` | **Same value as SHOPIFY_API_KEY** (Client ID)                                                          | Copy from SHOPIFY_API_KEY                                  |
| `ALLOWED_ORIGINS=`      | `https://splitter.echologyx.com,http://3.11.139.224,https://admin.shopify.com,https://*.myshopify.com` | Use this exactly (one line, no spaces after commas)        |

- If a line is missing, add it (same variable name and value as in the table).
- Do **not** use placeholders like `your_shopify_api_key` or `your-domain.com` in production.

---

## Step 5: Example of a correct `.env` (Shopify part)

After editing, the **Shopify and CORS** part of `~/RipX/.env` should look like this (with your real secret):

```env
# App URL - must be your live domain with https
APP_URL=https://splitter.echologyx.com

# Shopify (from Partner Dashboard → App setup)
SHOPIFY_API_KEY=e7a7d74e7aaa14162e3951a559bda6c1
SHOPIFY_API_SECRET=shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_orders,read_themes,write_themes

# Same as SHOPIFY_API_KEY (needed for app inside Shopify Admin)
VITE_SHOPIFY_API_KEY=e7a7d74e7aaa14162e3951a559bda6c1

# CORS - your app URL + Shopify admin (use one line, no line breaks)
ALLOWED_ORIGINS=https://splitter.echologyx.com,http://3.11.139.224,https://admin.shopify.com,https://*.myshopify.com
```

Replace `shpss_xxxxxxxx...` with your real **Client secret** from Step 1.

---

## Step 6: Save and restart the app

1. In `nano`: press **Ctrl+O**, then **Enter** to save. Press **Ctrl+X** to exit.
2. Restart the app so it reads the new env:
   ```bash
   pm2 restart ripx
   ```

---

## Step 7: Install the app on a store

**Option A — From Partner Dashboard**

1. Go to **partners.shopify.com** → **Apps** → your app.
2. Click **Test your app** (or **Select store**).
3. Choose a development store and confirm. The app will open in Shopify Admin.

**Option B — Install link**

Open this in a browser (replace `YOUR-STORE` with your store’s subdomain):

```text
https://splitter.echologyx.com/api/auth?shop=YOUR-STORE.myshopify.com
```

Example: if your store is `my-store.myshopify.com`, use:

```text
https://splitter.echologyx.com/api/auth?shop=my-store.myshopify.com
```

---

## Checklist (quick check)

- [ ] Partner Dashboard: **App URL** = `https://splitter.echologyx.com`
- [ ] Partner Dashboard: **Redirect URL** = `https://splitter.echologyx.com/api/auth/callback`
- [ ] Server `.env`: **SHOPIFY_API_KEY** = your Client ID (no placeholder)
- [ ] Server `.env`: **SHOPIFY_API_SECRET** = your Client secret (no placeholder)
- [ ] Server `.env`: **VITE_SHOPIFY_API_KEY** = same as SHOPIFY_API_KEY
- [ ] Server `.env`: **ALLOWED_ORIGINS** = includes `https://splitter.echologyx.com` and Shopify origins (no `your-domain.com`)
- [ ] Ran **pm2 restart ripx** after editing `.env`
- [ ] Installed the app on a store and opened it from Shopify Admin

---

## If something goes wrong

- **Blank screen in Shopify Admin:** Confirm `VITE_SHOPIFY_API_KEY` is set and equal to `SHOPIFY_API_KEY`, and that you restarted with `pm2 restart ripx`. Rebuild and redeploy the frontend if you changed env after the last build.
- **“Redirect URI mismatch”:** The redirect URL in Partner Dashboard must be exactly `https://splitter.echologyx.com/api/auth/callback` (no trailing slash, https).
- **App won’t load:** Run `curl -s https://splitter.echologyx.com/health` and check `pm2 logs ripx` for errors.

---

## “Refused to connect” in Shopify Admin iframe (step-by-step)

If the app opens fine at **https://splitter.echologyx.com** in a normal tab but shows **“refused to connect”** when opened from **Apps** inside your store admin, work through these in order:

1. **Confirm CSP `frame-ancestors` (on server)**

   ```bash
   curl -sI "https://splitter.echologyx.com/?shop=ripper-elx.myshopify.com" | grep -i content-security-policy
   ```

   You should see `frame-ancestors https://ripper-elx.myshopify.com https://admin.shopify.com` (replace `ripper-elx` with your store). If you see `frame-ancestors 'self'` only, the request from the iframe may not include `?shop=`; the app now also allows embedding when the request comes from Shopify (Referer). Redeploy the latest backend and restart: `git pull && pm2 restart ripx --update-env`.

2. **No extra `X-Frame-Options`**  
   On the server: `grep -r "X-Frame-Options\|add_header" /etc/nginx/`  
   If Nginx adds `X-Frame-Options`, remove it for the app’s server block so only CSP controls framing.

3. **Partner Dashboard URLs**  
   App URL = `https://splitter.echologyx.com`, Redirect URL = `https://splitter.echologyx.com/api/auth/callback`. No trailing slash, no port.

4. **CORS**  
   The app allows `https://admin.shopify.com` and any `https://*.myshopify.com` origin in code. Keep `ALLOWED_ORIGINS` in `.env` including `https://splitter.echologyx.com` and `https://admin.shopify.com` (see Step 4). Restart after env changes: `pm2 restart ripx --update-env`.

5. **Browser**  
   Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or try an incognito/private window so old headers aren’t cached.

6. **What URL the iframe loads**  
   In browser DevTools → Network, open your app from Apps in Shopify Admin. Click the first document request to `splitter.echologyx.com`. Check **Request URL**: it should contain `shop=YOUR-STORE.myshopify.com`. If it doesn’t, the “App URL” in Partner Dashboard may be wrong or the app may be opening via a redirect that drops the query string; fix the App URL to `https://splitter.echologyx.com` and open the app again from Apps.
