# Multi-Platform Architecture

RipX supports both **Shopify** and **standalone** sites. The same backend and AB testing engine serve both.

## Platform Comparison

| Aspect | Shopify | Standalone |
|--------|---------|------------|
| Auth | OAuth (shop install) | API key |
| Tenant ID | `shop_domain` (e.g. `mystore.myshopify.com`) | `domain` (e.g. `example.com`) |
| Admin UI | Embedded in Shopify Admin | Standalone (same React app, API key auth) |
| Storefront script | `?shop=xxx.myshopify.com` | `?site=example.com` |
| Conversion tracking | Webhooks + storefront | Storefront + API |
| Promo links | Full (Shopify Discount API) | Limited |

## Authentication

### Shopify

1. Merchant installs app from Shopify App Store
2. OAuth flow stores access token in `shop_sessions`
3. Tenant upserted in `tenants` (platform: `shopify`)
4. All API requests: `?shop=xxx.myshopify.com` or `X-Shopify-Shop-Domain`

### Standalone

1. Register: `POST /api/tenants/standalone` with `{ "domain": "example.com" }`
2. Response includes `apiKey` (store securely; shown once)
3. All API requests: `X-RipX-API-Key: sk_xxx`

## Track API

Public endpoints (no auth). Tenant validated via `tenantExists()`:

- **Shopify:** Domain in `tenants` or `shop_sessions`
- **Standalone:** Domain in `tenants` with `platform=standalone`

### Script loading

- **Shopify:** `GET /api/track/script.js?shop=xxx.myshopify.com`
- **Standalone:** `GET /api/track/script.js?site=example.com`

### Track payload

Both use `shop_domain` in the request body/query (domain for tenant isolation).

## Frontend (Admin UI)

- **Shopify:** `shop` from URL/App Bridge; params sent with each request
- **Standalone:** `VITE_RIPX_API_KEY` or `localStorage.ripx_api_key`; header `X-RipX-API-Key`

## Environment

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | PostgreSQL |
| `JWT_SECRET` | yes | |
| `APP_URL` | yes | |
| `SHOPIFY_*` | no* | *Required unless `RIPX_STANDALONE_ONLY=true` |
| `RIPX_STANDALONE_ONLY` | no | `true` = Shopify disabled |

## Database

### tenants

```sql
id UUID PRIMARY KEY
platform VARCHAR(20)  -- 'shopify' | 'standalone'
domain VARCHAR(255) UNIQUE
api_key_hash VARCHAR(64)   -- standalone only
api_key_prefix VARCHAR(12)
created_at, updated_at
```

### Backward compatibility

- Existing `shop_domain` columns unchanged
- Shopify shops backfilled into `tenants` on migration 013
- OAuth callback upserts tenant on each install

## Quick Start (Standalone)

1. Run migrations (includes `013_add_tenants_table.sql`)
2. Register site: `curl -X POST https://your-api/api/tenants/standalone -H "Content-Type: application/json" -d '{"domain":"example.com"}'`
3. Save `apiKey` from response
4. Add script to site: `<script src="https://your-api/api/track/script.js?site=example.com"></script>`
5. Open admin with `VITE_RIPX_API_KEY=sk_xxx` or set `localStorage.ripx_api_key`
