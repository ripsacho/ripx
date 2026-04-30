# App Proxy Signature Verification – Research Summary

This document summarizes research on Shopify App Proxy HMAC signature verification so the implementation and troubleshooting stay accurate.

---

## 1. Official algorithm (Shopify docs)

**Source:** [Authenticate app proxies](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies)

1. Take the **request query string** (as received).
2. Parse it (e.g. `Rack::Utils.parse_query` / `querystring.parse`) so values are **URL-decoded**.
3. **Remove** the `signature` parameter.
4. For each param: `"#{key}=#{Array(value).join(',')}"` (duplicate keys → comma‑joined values; empty → `key=`).
5. **Sort** these strings alphabetically.
6. **Concatenate** with **no delimiter** (no `&` between pairs).
7. Compute **HMAC-SHA256** with:
   - **Key:** application shared secret (same as Client secret in Partner Dashboard → Client credentials).
   - **Message:** the concatenated string (UTF‑8).
   - **Output:** hex digest.
8. Compare to the `signature` query param using a **constant-time** compare.

**Important:** App proxy uses **no `&`** between key=value pairs. OAuth HMAC uses `&`; using the wrong format causes “invalid signature”.

---

## 2. Shared secret = Client secret

- The “shared secret” used for the proxy signature is the **Client secret** from **Partner Dashboard → Your app → Client credentials**.
- There is no separate “App Proxy secret”; the same app’s Client secret is used for proxy request verification.
- Ref: [Where do I find "shared secret" for app proxies?](https://community.shopify.com/c/shopify-apps/where-do-i-find-quot-shared-secret-quot-for-app-proxies/m-p/1862368) — “Client credentials” in the same app.

---

## 3. Parameters and encoding

- **path_prefix:** Sent URL‑encoded (e.g. `%2Fapps%2Fripx`). For the signature **message** use the **decoded** value (e.g. `/apps/ripx`), as in the Ruby example.
- **logged_in_customer_id:** Always present; **empty string** when no customer. Must be included in the message as `logged_in_customer_id=` (empty value).
- **Duplicate keys** (e.g. `extra=1&extra=2`): In the message use **one** key with **comma‑joined** values: `extra=1,2`. (Ruby: `Array(v).join(',')`.)
- **New parameters:** Shopify may add more params over time; include **all** non‑signature params in the message (dynamic handling, no hardcoded list).

---

## 4. Common causes of “invalid signature”

| Cause                    | What to do                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wrong secret**         | Use the **Client secret** of the **same app** that has the App Proxy (Client credentials in Partner Dashboard). Copy‑paste; no extra spaces.                                                    |
| **Wrong app**            | App Proxy is tied to one app. `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` must be that app’s Client ID and Client secret.                                                                        |
| **OAuth-style message**  | Do not join params with `&`. Use sorted key=value with **no** delimiter.                                                                                                                        |
| **Missing/empty params** | Include every param Shopify sends (including `logged_in_customer_id=` when empty). Some frameworks drop empty params.                                                                           |
| **Query string altered** | Reverse proxies or load balancers can reorder or re-encode the query. Use the **raw** query from the request URL for verification when possible; our code uses `req.originalUrl` and parses it. |
| **Duplicate keys**       | Use a single `key=value1,value2` (comma‑joined), not two separate `key=value` pairs.                                                                                                            |

---

## 5. Implementation notes in this project

- **Message building:** `buildSignatureMessage(params)` matches the Ruby spec: sort keys, `key=value` with array values joined by `,`, empty as `''`, no delimiter between pairs.
- **Query source:** We take the query from `req.originalUrl` and parse with `querystring.parse` so we use the same decoding as the docs and preserve empty params.
- **Secret:** `SHOPIFY_API_SECRET` is trimmed (leading/trailing spaces removed) before use.
- **Comparison:** `crypto.timingSafeEqual` for the signature comparison.
- **Fallback:** If verification fails with the parsed raw query, we could try again with `req.query` in case the raw URL was rewritten by a proxy (optional).

---

## 6. References

- [Authenticate app proxies](https://shopify.dev/docs/apps/build/online-store/app-proxies/authenticate-app-proxies) – official algorithm and Ruby examples.
- [validateHmac Does Not Work For Proxy Requests (shopify-api-js #878)](https://github.com/Shopify/shopify-api-js/issues/878) – proxy vs OAuth delimiter difference.
- [Invalid signature with App Proxy (Remix #455)](https://github.com/Shopify/shopify-app-js/issues/455) – params must be preserved through the stack.
- [Node.js gist (NeverOddOrEven)](https://gist.github.com/NeverOddOrEven/3f2809ba368f6f5ce7b4a1923058b92e) – unescape then sort then join; note: duplicate keys should be comma‑joined per Ruby, not repeated.
- [Where do I find shared secret for app proxies?](https://community.shopify.com/c/shopify-apps/where-do-i-find-quot-shared-secret-quot-for-app-proxies/m-p/1862368) – shared secret = Client credentials.
