# OAuth “wrong store” with multiple stores — research summary

This doc summarizes what’s possible (and not) from Shopify’s side and how we address it.

## What we found

### 1. Shopify does not let you “force” the store in OAuth

- The **Admin API requires a store URL** to start OAuth (`https://{store}/admin/oauth/authorize`). You cannot do “log in first, then pick store” in one generic flow; the store is part of the authorize URL.
- The **callback `shop`** is set by **Shopify** based on **which store the user was in when they approved**. If after login Shopify sends them to a different store (e.g. “primary” or “last used”), the approval is for that store, not the one in the link.
- There is **no documented parameter** to “pin” or “force” the store. The store in the callback is determined by the user’s session/context at the moment they click Allow.

### 2. Why the “wrong store” happens

- User opens `https://ripperx-2.myshopify.com/admin/oauth/authorize?...` (correct store in the URL).
- They are not logged in → Shopify shows login.
- After login, Shopify may **redirect to another store** (e.g. uq4axu-rn) or show a store list; the user may end up approving in that context.
- So the **callback** returns `shop=uq4axu-rn` even though the link was for ripperx-2.

### 3. Approaches that don’t work or aren’t available

- **“Store selection after login”** — Not supported. OAuth must be started with a store domain; you can’t do a generic redirect and then have Shopify ask which store.
- **Custom parameter to force store** — Not supported. The callback `shop` is decided by Shopify from the approval context.
- **Relying only on “select the right store”** — Unreliable: Shopify may not show a clear list, or may default to another store.

### 4. Approach that does work: “Log into that store first”

- If the user **logs into the target store’s admin first** in the **same browser session** (e.g. same incognito window), then when they hit `https://ripperx-2.myshopify.com/admin/oauth/authorize`, they are **already in that store’s context**.
- Shopify then shows the approval screen for **that store** and the callback returns that store.
- So the fix is: **establish the session for the desired store before starting the OAuth redirect.**

## What we implemented

1. **Confirm page (install link with `confirm=1`)**
   - Step 1: “Go to [store] admin” → user opens `https://{store}/admin`, logs in, then uses **Back** to return.
   - Step 2: “Continue to Shopify” → we redirect to `https://{store}/admin/oauth/authorize`; user is already in that store, so approval is for that store.
   - All in the **same tab** (or same incognito window) so the store session is kept.

2. **Wrong-store banner on My domains**
   - When the callback was for a different store, we redirect to My domains and show a banner that explains the “log into store admin first” flow and “Copy link for incognito.”

3. **Docs**
   - [OAUTH_ADD_STORE.md](./OAUTH_ADD_STORE.md) and troubleshooting describe the same flow and link to this research.

## References

- Shopify: [Authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant) — store in URL, callback `shop` from Shopify.
- Community: [Select store on OAuth to install Shopify public app](https://community.shopify.com/t/select-store-on-oauth-to-install-shopify-public-app/161037) — store URL required upfront; no “pick store after login” in standard flow.
- GitHub: [shopify_app #1139](https://github.com/Shopify/shopify_app/issues/1139) — multi-shop session/domain handling.
- Shopify Help: [Logging in](https://help.shopify.com/en/manual/your-account/logging-in) — logging in at `store.myshopify.com/admin` is the standard way to be in that store’s context.
