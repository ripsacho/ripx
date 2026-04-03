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
# Direct price override cart transform (Shopify Plus / dev stores):
# npm run shopify:cart-transform:prepare && shopify app deploy
```

Production deploy (host, SSH key, IP, and process manager) is environment-specific — keep those steps in your private runbook, not in the repo.

## Build in CI (local -> live)

This repo now includes GitHub Actions workflows for a "build in CI" release model:

- `.github/workflows/ci.yml` - lint, format-check, test, migrate (CI DB), and frontend build on PR/push.
- `.github/workflows/deploy-staging.yml` - on `develop` push (or manual run), builds backend Docker image in CI and deploys to staging.
- `.github/workflows/deploy-production.yml` - on `main` push (or manual run), builds backend Docker image in CI, pushes to GHCR, and deploys to the production host over SSH.
- Manual deploy supports `image_tag` input to redeploy/rollback a previously built image without rebuilding.

Required repository/environment secrets for production deploy:

- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_SSH_HOST`
- `DEPLOY_SSH_USER`
- `DEPLOY_SSH_PORT` (optional, default `22`)
- `DEPLOY_SSH_KNOWN_HOSTS` (optional, recommended)
- `DEPLOY_GHCR_USER`
- `DEPLOY_GHCR_PAT`
- `DEPLOY_CONTAINER_NAME` (optional, default `ripx-backend`)
- `DEPLOY_ENV_FILE_PATH` (optional, default `/opt/ripx/.env`)
- `DEPLOY_APP_PORT` (optional, default `3000`)
- `DEPLOY_HEALTHCHECK_URL` (optional, recommended)
- `DEPLOY_SMOKE_BASE_URL` (optional, recommended)
- `DEPLOY_SMOKE_ADMIN_BEARER` (optional, for authenticated smoke check)

Required repository/environment secrets for staging deploy:

- `STAGING_SSH_PRIVATE_KEY`
- `STAGING_SSH_HOST`
- `STAGING_SSH_USER`
- `STAGING_SSH_PORT` (optional, default `22`)
- `STAGING_SSH_KNOWN_HOSTS` (optional, recommended)
- `STAGING_GHCR_USER`
- `STAGING_GHCR_PAT`
- `STAGING_CONTAINER_NAME` (optional, default `ripx-staging-backend`)
- `STAGING_ENV_FILE_PATH` (optional, default `/opt/ripx/.env`)
- `STAGING_APP_PORT` (optional, default `3000`)
- `STAGING_HEALTHCHECK_URL` (optional, recommended)
- `STAGING_SMOKE_BASE_URL` (optional, recommended)
- `STAGING_SMOKE_ADMIN_BEARER` (optional, for authenticated smoke check)

Recommended GitHub branch protections:

- Require PRs into `main`.
- Require CI status checks (`CI / Validate and build`).
- Use protected `production` environment with manual approval.

### Release / rollback playbook

1. Merge PR to `develop` to deploy staging automatically.
2. Verify staging (health + smoke checks).
3. Merge PR to `main`.
4. Wait for `CI` to pass.
5. `Deploy Production (Build in CI)` runs automatically and deploys commit image tag.
6. For rollback: run `Deploy Production (Build in CI)` manually and set `image_tag` to last known good image tag.

### Copy-paste local -> deploy commands

Feature flow (recommended):

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<short-name>

# implement your change
npm run validate
npm run build

git add .
git commit -m "feat: <short summary>"
git push -u origin feature/<short-name>
```

Then open PR:

1. `feature/<short-name>` -> `develop` (staging deploy runs after merge)
2. Verify staging
3. `develop` -> `main` (production deploy runs after merge)

Hotfix flow:

```bash
git checkout main
git pull origin main
git checkout -b hotfix/<short-name>

# implement urgent fix
npm run migrate
npm run validate
npm run build

git add .
git commit -m "new fix"
git push -u origin hotfix/<short-name>
```

Then open PR `hotfix/<short-name>` -> `main`.

Rollback (no rebuild):

1. GitHub -> Actions -> `Deploy Production (Build in CI)`.
2. Click **Run workflow**.
3. Set `image_tag` to last known good tag.
4. Run workflow.

**Test & validate:** `npm run test` (backend + frontend), `npm run validate` (lint + test), `npm run build` (frontend). **Audit:** `npm run audit` (root + frontend).

**Health (unauthenticated, rate-limited):** `GET /live` or `GET /api/live` — liveness (no DB). `GET /ready` or `GET /api/ready` — readiness (DB + Redis, minimal JSON; 503 when DB is down). `GET /health` or `GET /api/health` — full JSON for the app (maintenance/announcement, version, uptime). Tune with `RATE_LIMIT_HEALTH_WINDOW_MS` and `RATE_LIMIT_HEALTH_MAX`.

**Checkout price QA:** **Settings → Installation → Checkout price test health** (calls authenticated `GET /api/settings/checkout-price-diagnostics` and returns full diagnostics). Public: `GET /api/track/price-checkout-diagnostics?shop=store.myshopify.com` returns a redacted payload by default (set `RIPX_PUBLIC_CHECKOUT_DIAGNOSTICS_FULL=true` only when you explicitly want full public output). **CLI (same checks, uses `.env`):** `npm run verify:price-pipeline` — optional `RIPX_VERIFY_SHOP=store.myshopify.com` with DB for tenant + running price-test count. **Signed-assignment migration checker:** `npm run verify:price-assignment-readiness` (optional `RIPX_VERIFY_SHOP=...` for synthetic signed/unsigned probe). See `extensions/ripx-checkout-discount/README.md`. **Docs:** [Shopify checkout resolver guide](docs/SHOPIFY_CHECKOUT_PRICE_RESOLVER.md). Roadmap: `backend/docs/PRODUCT_EXCELLENCE_ROADMAP.md`.

**Local admin:** In `.env` set `RIPX_ADMIN_SHOP_DOMAINS=your-store.myshopify.com` to access the Admin panel at `/admin` without setting DB roles. Production: see [docs/getting-started/ADMIN_SETUP.md](docs/getting-started/ADMIN_SETUP.md).

**Shopify app dev:** Run `npm run shopify:dev` (or `shopify app dev`). If the Cloudflare tunnel fails ("Could not start Cloudflare tunnel: max retries reached"), use localhost instead: `npm run shopify:dev:localhost` or `shopify app dev --use-localhost`. Localhost mode uses a local HTTPS proxy (no webhooks from Shopify to your machine).

**Storefront script (`script.js`):** The file embeds the current `activeTests` list. It is served with a **short cache** (default 120s, `RIPX_SCRIPT_CACHE_MAX_AGE` in `.env`) so new/updated tests show up quickly—older builds used a 1-year immutable cache and could hide live tests. After upgrading, do a hard refresh on the shop or wait for cache expiry.

## License

MIT
