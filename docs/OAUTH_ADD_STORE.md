# Adding a Shopify store via OAuth (and avoiding “wrong store”)

This doc explains why the “wrong store approved” issue happens and how the app avoids it and recovers.

**TL;DR** — When adding a store (e.g. ripperx-2): use **“Copy link for incognito”**, open that link in a **new incognito/private** window, follow the instruction page, then when Shopify asks you to log in, log in to **that store only**. The app always adds the store Shopify returns; if it’s not the one you wanted, the UI tells you how to add the other one.

**Quick steps (recommended)**

1. My domains → Add domain → enter the store (e.g. ripperx-2.myshopify.com) → **Copy link for incognito** (or **Continue to Shopify** if not in embed).
2. Open the link in a **new incognito/private** window (or same tab if standalone).
3. On the **instruction page**: do **Step 1** (Go to [store] admin, log in, then Back), then **Step 2** (Continue to Shopify).
4. When Shopify asks you to approve, check the address bar shows the correct store, then click Allow.
5. After approval, the store is connected. (Link expires in 10 minutes; get a new one from My domains if needed.)

---

## Flow (high level)

```
[My domains] → Add domain → Copy link for incognito
       ↓
[User] Opens link in incognito (same host as redirect_uri)
       ↓
GET /api/auth/install?shop=...&t=...&confirm=1  →  Instruction page
       ↓
User clicks "Continue to Shopify"
       ↓
GET /api/auth/install?shop=...&t=...  (no confirm)  →  Set cookies, redirect to Shopify
       ↓
Shopify: /admin/oauth/authorize?client_id=...&redirect_uri=...&state=...
       ↓
User approves (and logs into the store they want)
       ↓
Shopify redirects to: /api/auth/callback?shop=...&code=...&state=...&hmac=...
       ↓
Backend: verify HMAC → exchange code for token → add store → redirect to /connect/oauth-success or /connect
```

The **host** of the install link and the **redirect_uri** sent to Shopify must match the **Application URL** in the Shopify Partner Dashboard; set `RIPX_OAUTH_REDIRECT_BASE` to that URL when using tunnels or multiple domains.

---

## Why the callback can have a different shop

When you add a second store (e.g. **ripperx-2**) from another store’s admin or from My domains:

1. The app gives you an **install link** that points to our `/api/auth/install?shop=ripperx-2.myshopify.com&t=...`.
2. That page redirects you to **Shopify’s authorize URL**:  
   `https://ripperx-2.myshopify.com/admin/oauth/authorize?client_id=...&redirect_uri=...&state=...`
3. After you approve, **Shopify** redirects the browser back to our **callback** with `?shop=...&code=...&state=...`.

The `shop` in the callback is the store **Shopify** associates with the approval. That is usually the store whose admin you were on when you approved, which is not always the store in the install link:

- If you opened the install link in the **same browser** where you’re already logged into **another** store (e.g. uq4axu-rn), Shopify may treat the approval as for that store.
- If you’re **not** logged into ripperx-2 on that device, Shopify shows a login page; if you then log into a **different** store, the callback will have that store.
- **Multi-store staff**: one browser session can be tied to one store; opening the install link in that same session can still result in the callback being for that session’s store.

So the **host** of the authorize URL (`ripperx-2.myshopify.com`) does not by itself force the callback to be for that store; the **session / login** at approval time does.

## How we avoid the issue

### 1. Instruction page on the install link (`confirm=1`)

The install link includes `&confirm=1`. When you open it you see an **instruction page** with two steps:

- **Step 1**: Click "Go to [store] admin (then Back to return)" — you go to that store's admin, log in, then use the browser **Back** button to return to the instruction page. This puts you in that store's session so the approval is for the right store.
- **Step 2**: Click **"Continue to Shopify"** — we set cookies and redirect to Shopify; you approve; the address bar must show the store you want before you click Allow.

Do Step 1 before Step 2, in the same tab (or same incognito window). So you always establish the correct store session before approving.

### 2. Always add the store from the callback (no blocking)

If the callback’s `shop` is different from the one we had in the cookie (“intended” store), we **no longer block** the flow:

- We **always** complete the OAuth flow for the **shop** Shopify returned (after HMAC verification).
- We **add that store** and redirect you to success (or “sign in to link”).
- If it’s different from the store you requested, we add `requested_shop` to the redirect URL and the UI shows: “We connected [X]. You had requested [Y]; to add [Y] too, go to My domains and use ‘Copy link for incognito’ for [Y].”

So you never get stuck with “wrong store” and nothing added; you always get the store that was actually approved, plus clear instructions to add the other one if needed.

### 3. Best practice for “this store only”

To maximize the chance that the **correct** store is the one in the callback:

1. Use **"Copy link for incognito"** (embedded) or **"Continue to Shopify"** (standalone) for the store you want to add.
2. Open the link in a **new incognito/private** window if you have multiple stores (or same tab if standalone).
3. On the **instruction page**, do **Step 1** first: click "Go to [store] admin (then Back to return)", log in to that store, then use the browser **Back** button to return.
4. Then do **Step 2**: click **"Continue to Shopify"**. You'll go to Shopify to approve; the address bar must show the store you want before you click Allow.
5. **Before clicking Allow**, check the address bar — it should show the store you want (e.g. ripperx-2.myshopify.com). If it shows a different store, do not approve; use Back and repeat from Step 1.

Doing Step 1 before Step 2 (in the same tab) establishes that store's session so the approval is for the correct store.

## Technical notes

- **State/cookie**: We still send `state` and set `shopify_oauth_shop` so we know the “intended” store. If the callback shop matches, we link the store to your account when possible. If it differs, we add the callback shop and pass `requested_shop` for the UI.
- **HMAC**: We only complete the token exchange when the callback’s HMAC is valid (request is from Shopify).
- **Install link domain**: The install link uses the same base as the OAuth `redirect_uri` (e.g. `RIPX_OAUTH_REDIRECT_BASE`) so cookies set on `/auth/install` are on the same domain as the callback and the flow works reliably. Users open that URL (e.g. `https://splitter.echologyx.com/api/auth/install?...`); ensure that domain resolves to your app. See [OAUTH_FIX.md](./OAUTH_FIX.md) if the host does not match Partner Dashboard.

## Security

- **State**: Signed JWT (shop, email, exp) to prevent CSRF and to know intended shop and user for account linking.
- **HMAC**: Callback is only processed after verifying Shopify’s HMAC on the query string.
- **Install token**: One-time signed token (shop, email, 10‑minute expiry) for the install link; no token reuse.
- **Cookies**: `shopify_oauth_state` and `shopify_oauth_shop` are cleared after the callback (success or wrong-store); SameSite=Lax for cross‑redirect safety.
- **Audit**: Auth events (e.g. `shopify_connect_linked`, `shopify_connect_callback_differed`) are logged for compliance and debugging.

## Troubleshooting

**Shopify says "redirect_uri and application url must have matching hosts".**  
Set `RIPX_OAUTH_REDIRECT_BASE` in `.env` to the **exact** Application URL from Partner Dashboard (e.g. from `shopify.app.toml` → `application_url`). Do not use a dynamic tunnel URL (e.g. `*.trycloudflare.com`). See [OAUTH_FIX.md](./OAUTH_FIX.md).

**I already approved and the wrong store was connected.**  
The app now always adds the store that was approved. Go to **My domains** — you’ll see the store that was connected. If you still need the other store, use **“Copy link for incognito”** for that store, open it in an incognito window, and log in to that store when Shopify asks.

**The install link says it expired.**  
Links expire after 10 minutes. In **My domains**, click **Add domain** → add the Shopify store again → **Copy link for incognito** and use the new link.

**I used incognito but the wrong store was still connected.**  
Use the **“log into the store first”** flow: on the instruction page, open the **store admin** link (e.g. ripperx-2.myshopify.com admin) in a new tab, log in there, then return to the instruction tab and click **Continue to Shopify**. That way your session is already for the right store and the approval will be for it. Do not click Continue to Shopify before logging into that store’s admin in the same incognito window.

**I only have one store; do I need incognito?**  
No. If you have only one Shopify store, you can open the link in a normal tab. The instruction page still appears; click **Continue to Shopify** and approve. Use incognito when you have multiple stores so Shopify doesn’t use another store’s session.

---

## For developers

| Item                                 | Where                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redirect base (fixed host for OAuth) | `RIPX_OAUTH_REDIRECT_BASE` in `.env`; must match Partner Dashboard Application URL                                                                                                                                                                                                                                                      |
| Install link generation              | `GET /api/auth/install-link` (auth required); returns `{ url, expires_in_seconds }` (url includes `&confirm=1`)                                                                                                                                                                                                                         |
| Connect page (sign_in_to_connect)    | When user lands on Connect with `reason=sign_in_to_connect` and `shop=`, frontend fetches install-link and redirects to the instruction page (same Step 1/Step 2 flow)                                                                                                                                                                  |
| Install handler & confirm page       | `GET /api/auth/install` in `backend/src/routes/authRoutes.js`                                                                                                                                                                                                                                                                           |
| Callback & "always add" logic        | `GET /api/auth/callback` in same file; `requested_shop` appended when callback shop ≠ cookie                                                                                                                                                                                                                                            |
| Debug: expected redirect_uri         | `GET /api/auth/oauth-redirect-uri` returns `redirectUri`, `base`, and Partner Dashboard hints                                                                                                                                                                                                                                           |
| Audit events                         | `auditLogService.logAuthAction`: `shopify_connect_linked`, `shopify_connect_callback_differed`, `shopify_connect_rejected_linked_to_another`                                                                                                                                                                                            |
| Opening a domain from My domains     | `getShopDomain()` prefers domain from path `/app/:domain` over query `shop=` so the correct store loads; `getUrlWithEmbedParams(path, { shop })` sets `shop` in the URL when opening a domain in embed                                                                                                                                  |
| Store switcher / account stores      | Frontend passes `store` (from `getShopDomain()`) to `GET /account/stores` so backend returns that as `currentStore` when it’s in the user’s list; all dashboard navigations (DomainList, UserPanel, StoreSwitcher, Connect, OAuthSuccess) use `getUrlWithEmbedParams(..., { shop })` in embed so the opened store’s app loads correctly |

---

## References

- [OAUTH_MULTI_STORE_RESEARCH.md](./OAUTH_MULTI_STORE_RESEARCH.md) — Why the wrong store happens and why "log into store first" is the fix (research summary).
- Shopify: [Enable Shopify-managed installations](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation) (we use custom “add store” flow on top of that).
- Shopify: [Authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) for the redirect and callback.
- Community: OAuth callback `shop` can differ from the authorize URL when the user has multiple stores or the session is for another store.
