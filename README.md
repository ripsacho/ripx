# RipX

**AB Testing Platform for Shopify and Standalone Sites**

RipX is an A/B testing platform for Shopify and standalone e-commerce sites. Test prices, content, shipping, and offers to optimize conversion.

**Full documentation:** [docs/README.md](docs/README.md) — quick start, project structure, scripts, and links to all specs and guides.

**Production `.env` / deploy steps:** [docs/PRODUCTION_ENV_UPDATE_GUIDE.md](docs/PRODUCTION_ENV_UPDATE_GUIDE.md).

## Quick commands

```bash
npm run install:all
cp .env.example .env
npm run dev:db && npm run migrate
# If the DB already had migrations applied before tracking: npm run migrate:mark-applied (once)
npm run dev
npm run shopify:dev   # or: shopify app dev --reset
npm run build         # production frontend build
# Checkout price function (Shopify Plus + network access): set APP_URL / secrets in .env, then:
# npm run shopify:checkout-discount:prepare && shopify app deploy
```

Production deploy (host, SSH key, IP, and process manager) is environment-specific — keep those steps in your private runbook, not in the repo.

**Test & validate:** `npm run test` (backend + frontend), `npm run validate` (lint + test), `npm run build` (frontend). **Audit:** `npm run audit` (root + frontend).

**Health (unauthenticated, rate-limited):** `GET /live` or `GET /api/live` — liveness (no DB). `GET /ready` or `GET /api/ready` — readiness (DB + Redis, minimal JSON; 503 when DB is down). `GET /health` or `GET /api/health` — full JSON for the app (maintenance/announcement, version, uptime). Tune with `RATE_LIMIT_HEALTH_WINDOW_MS` and `RATE_LIMIT_HEALTH_MAX`.

**Checkout price QA:** **Settings → Installation → Checkout price test health** (calls `GET /api/settings/checkout-price-diagnostics`). Public: `GET /api/track/price-checkout-diagnostics?shop=store.myshopify.com`. **CLI (same checks, uses `.env`):** `npm run verify:price-pipeline` — optional `RIPX_VERIFY_SHOP=store.myshopify.com` with DB for tenant + running price-test count. See `extensions/ripx-checkout-discount/README.md`. **Docs:** [backend/docs/PRICE_TEST_READINESS_CHECKLIST.md](backend/docs/PRICE_TEST_READINESS_CHECKLIST.md) · [backend/docs/PRICE_TEST_PIPELINE_RESEARCH.md](backend/docs/PRICE_TEST_PIPELINE_RESEARCH.md). Roadmap: `backend/docs/PRODUCT_EXCELLENCE_ROADMAP.md`.

**Local admin:** In `.env` set `RIPX_ADMIN_SHOP_DOMAINS=your-store.myshopify.com` to access the Admin panel at `/admin` without setting DB roles. Production: see [docs/getting-started/ADMIN_SETUP.md](docs/getting-started/ADMIN_SETUP.md).

**Shopify app dev:** Run `npm run shopify:dev` (or `shopify app dev`). If the Cloudflare tunnel fails ("Could not start Cloudflare tunnel: max retries reached"), use localhost instead: `npm run shopify:dev:localhost` or `shopify app dev --use-localhost`. Localhost mode uses a local HTTPS proxy (no webhooks from Shopify to your machine).

**Storefront script (`script.js`):** The file embeds the current `activeTests` list. It is served with a **short cache** (default 120s, `RIPX_SCRIPT_CACHE_MAX_AGE` in `.env`) so new/updated tests show up quickly—older builds used a 1-year immutable cache and could hide live tests. After upgrading, do a hard refresh on the shop or wait for cache expiry.

## License

MIT
