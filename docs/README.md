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

| Command                                         | Description                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                   | Backend + frontend dev servers                                                                                                       |
| `npm run build`                                 | Build frontend for production                                                                                                        |
| `npm start`                                     | Start production server                                                                                                              |
| `npm run migrate`                               | Run database migrations (skips already-applied; see [DATABASE_MANAGEMENT.md](DATABASE_MANAGEMENT.md))                                |
| `npm run migrate:mark-applied`                  | One-off: mark all current migrations as applied (for DBs migrated before tracking)                                                   |
| `npm run test:backend`                          | Run backend tests                                                                                                                    |
| `npm run shopify:checkout-discount:prepare`     | Install deps, sync `ripxConfig.js` from `.env`, typegen + WASM build (needs [Shopify CLI](https://shopify.dev/docs/api/shopify-cli)) |
| `npm run shopify:checkout-discount:sync-config` | Regenerate `extensions/ripx-checkout-discount/src/ripxConfig.js` only                                                                |

## Environment

See `.env.example` for required variables. Essential: `DATABASE_URL`, `JWT_SECRET`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `APP_URL`.

**Production / server updates (secrets, OAuth, checkout extension, deploy order):** [PRODUCTION_ENV_UPDATE_GUIDE.md](PRODUCTION_ENV_UPDATE_GUIDE.md).

## Documentation

All project documentation lives in the `docs/` folder, including:

- **SHOPIFY_SHIPPING_TEST_RUNBOOK.md** – Shipping execution readiness, provider setup, cart-qualified product targeting, cleanup, and rollout QA
- **ADMIN_CONTROL_PANEL_SPEC.md** – Full admin panel specification and advanced research
- **PROJECT_COMPLETION_AUDIT.md** – Current completion status, verification evidence, and prioritized next steps
- **UI_WCAG_CONTRAST_CHECKLIST.md** – Verified contrast ratios for Settings/Setup/Sidebar UI polish
- **getting-started/ADMIN_SETUP.md** – How to designate admins (local env vs production DB)
- **DATABASE_MANAGEMENT.md** – Migrations (tracking, run, mark-applied), pool config, health, transactions, backups
- **EVENT_SCALABILITY.md** – Event/audit schema, tenant_id indexes, partitioning path
- **getting-started/** – Setup, env, database, migrations
- **development/CODE_IMPROVEMENTS.md** – Prioritized code and structure improvements (TestWizard split, tests, CI, constants)
- **architecture/** – API, data flow, structure
- **features/** – Roadmap, status, enhancements; **FUTURE_IMPLEMENTATION_PLAN.md** – Phased roadmap (config, compliance, enterprise, AI)
- **guides/** – Branding, settings, next steps
- And more.

## License

MIT
