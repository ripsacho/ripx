# RipX

**AB Testing Platform for Shopify and Standalone Sites**

RipX is an AB testing platform supporting Shopify and standalone e-commerce sites. Test prices, content, shipping rates, and offers to optimize conversion.

## Quick Start

### Prerequisites

- Node.js **20.17+** (LTS recommended; `lint-staged`, `@shopify/polaris-icons`, and other deps require Node 20+)
- PostgreSQL
- (Optional) Redis for sessions

### Run Locally

```bash
# Install dependencies (or: npm run install:all — includes checkout discount extension deps)
npm install
cd frontend && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with DATABASE_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, JWT_SECRET

# Database
npm run dev:db          # Start Postgres + Redis (Docker)
npm run migrate         # Run migrations

# Start dev servers
npm run dev             # Backend (3000) + Frontend (3001 by default)
```

### Production Build

```bash
npm run build           # Build frontend
npm start               # Start backend (serves frontend from backend)
```

## Project Structure

```
ripx/
├── backend/
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/      # Business logic (abTestEngine, analytics, etc.)
│   │   ├── models/        # Database models
│   │   ├── middleware/    # Auth, error handling
│   │   └── app.js         # Express app
│   └── migrations/       # SQL migrations
├── frontend/
│   └── src/
│       ├── components/    # React UI (Dashboard, TestCreator, Analytics)
│       ├── hooks/         # useTests, useAnalytics
│       └── services/      # API client
├── extensions/
│   ├── ripx-theme/        # Theme app extension (storefront embed block)
│   ├── ripx-checkout-discount/  # Shopify Function — Offer-test discount path (Plus / network access)
│   └── ripx-cart-transform/     # Shopify Function — Price-test Direct Price Override path
├── docs/                  # Documentation (specs, guides, research)
└── shopify/               # Storefront script
```

## Key Scripts

| Command                                     | Description                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run dev`                               | Backend + frontend dev servers                                                                        |
| `npm run build`                             | Build frontend for production                                                                         |
| `npm start`                                 | Start production server                                                                               |
| `npm run migrate`                           | Run database migrations (skips already-applied; see [DATABASE_MANAGEMENT.md](DATABASE_MANAGEMENT.md)) |
| `npm run migrate:mark-applied`              | One-off: mark all current migrations as applied (for DBs migrated before tracking)                    |
| `npm run test:backend`                      | Run backend tests                                                                                     |
| `npm run shopify:dev:local:safe`            | Start Shopify CLI with local config guards, worker cleanup, and port checks                           |
| `npm run shopify:deploy:local:safe`         | Deploy local/dev Shopify extensions using the local deploy wrapper                                    |
| `npm run shopify:deploy:production:safe`    | Guard production config, prepare extensions, then deploy the production Shopify app                   |
| `npm run shopify:extensions:prepare`        | Prepare checkout discount/UI, cart transform, payment, and delivery customization extensions          |
| `npm run verify:shipping-readiness`         | Check shipping scopes, callbacks, and resolver readiness before applying shipping tests               |
| `npm run verify:price-pipeline`             | Validate checkout price resolver and extension config alignment                                       |
| `npm run verify:price-assignment-readiness` | Validate signed assignment proof and checkout price readiness                                         |
| `npm run verify:oauth`                      | Check OAuth host/redirect configuration                                                               |
| `npm run diagnose:shop`                     | Inspect a shop's tenant/session/config state during support recovery                                  |
| `npm run index-support-kb`                  | Rebuild SupportAI knowledge-base embeddings after docs or FAQ changes                                 |

## Environment

See `.env.example` for required variables. Essential: `DATABASE_URL`, `JWT_SECRET`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `APP_URL`.

**Production / server updates (secrets, OAuth, checkout extension, deploy order):** [PRODUCTION_ENV_UPDATE_GUIDE.md](PRODUCTION_ENV_UPDATE_GUIDE.md).

## Documentation

All project documentation lives in the `docs/` folder, including:

- **SHOPIFY_SHIPPING_TEST_RUNBOOK.md** – Shipping execution readiness, provider setup, cart-qualified product targeting, cleanup, and rollout QA
- **SHOPIFY_CHECKOUT_PRICE_RESOLVER.md** – Checkout price resolver, assignment proof, diagnostics, and production guardrails
- **SHOPIFY_CHECKOUT_UI_NETWORK_ACCESS.md** – Checkout UI extension network access setup and troubleshooting
- **SHOPIFY_DEV_PREVIEW_FIX.md** – Local Shopify preview, tunnel, App Proxy, and storefront embed troubleshooting
- **THEME_TEST_PREFLIGHT_AND_TROUBLESHOOTING.md** – Theme test preflight checks, selector readiness, and launch troubleshooting
- **PRICE_TEST_INTEGRATION.md** – Price test storefront, cart, checkout, and publishing behavior
- **SHOPIFY_HOSTED_APP_SETUP.md** – Hosted Shopify app setup, App Proxy, OAuth, and embedded app notes
- **EMBED_TUNNEL.md** – Tunnel/App Proxy troubleshooting for embedded Shopify development
- **OAUTH_ADD_STORE.md** and **OAUTH_FIX.md** – OAuth add-store flow and recovery notes
- **TEST_NOT_SHOWING_ON_LIVE.md** – Storefront troubleshooting when a live test is not visible
- **THEME_TEST_STRATEGY_MASTER_PLAN.md** – Theme testing strategy and rollout approach
- **API_AND_OPERATIONS_REFERENCE.md** – Current API route-map, diagnostics surfaces, and operations script reference
- **ADMIN_CONTROL_PANEL_SPEC.md** – Full admin panel specification and advanced research
- **PROJECT_COMPLETION_AUDIT.md** – Current completion status, verification evidence, and prioritized next steps
- **UI_WCAG_CONTRAST_CHECKLIST.md** – Verified contrast ratios for Settings/Setup/Sidebar UI polish
- **getting-started/ADMIN_SETUP.md** – How to designate admins (local env vs production DB)
- **getting-started/SHOPIFY_APP_SERVER_SETUP.md** – Server-side Shopify app setup steps
- **getting-started/DEV_STORE_AND_LIVE_APP.md** – Dev store and live app separation guidance
- **research/ALL_TEST_TYPES.md**, **research/SHOPIFY_PRICE_TESTING.md**, and **research/SHIPPING_TEST_COMPETITIVE.md** – Research references for test type strategy
- **DATABASE_MANAGEMENT.md** – Migrations (tracking, run, mark-applied), pool config, health, transactions, backups
- **EVENT_SCALABILITY.md** – Event/audit schema, tenant_id indexes, partitioning path
- **development/CODE_IMPROVEMENTS.md** – Prioritized code and structure improvements (TestWizard split, tests, CI, constants)
- **features/** – Roadmap, status, enhancements; **FUTURE_IMPLEMENTATION_PLAN.md** – Phased roadmap (config, compliance, enterprise, AI)
- **archive/** – Historical architecture, setup, guide, and presentation material kept for reference
- And more.

## License

MIT
