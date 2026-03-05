# RipX

**AB Testing Platform for Shopify and Standalone Sites**

RipX is an A/B testing platform for Shopify and standalone e-commerce sites. Test prices, content, shipping, and offers to optimize conversion.

**Full documentation:** [docs/README.md](docs/README.md) — quick start, project structure, scripts, and links to all specs and guides.

## Quick commands

```bash
npm run install:all
cp .env.example .env
npm run dev:db && npm run migrate
# If the DB already had migrations applied before tracking: npm run migrate:mark-applied (once)
npm run dev
```

**Test & validate:** `npm run test` (backend + frontend), `npm run validate` (lint + test), `npm run build` (frontend). **Audit:** `npm run audit` (root + frontend).

**Health:** `GET /health` or `GET /api/health` returns app status and DB/Redis checks (503 when DB is down).

**Local admin:** In `.env` set `RIPX_ADMIN_SHOP_DOMAINS=your-store.myshopify.com` to access the Admin panel at `/admin` without setting DB roles. Production: see [docs/getting-started/ADMIN_SETUP.md](docs/getting-started/ADMIN_SETUP.md).

**Shopify app dev:** Run `npm run shopify:dev` (or `shopify app dev`). If the Cloudflare tunnel fails ("Could not start Cloudflare tunnel: max retries reached"), use localhost instead: `npm run shopify:dev:localhost` or `shopify app dev --use-localhost`. Localhost mode uses a local HTTPS proxy (no webhooks from Shopify to your machine).

## License

MIT
