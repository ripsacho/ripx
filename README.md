# RipX

**AB Testing Platform for Shopify and Standalone Sites**

RipX is an AB testing platform supporting Shopify and standalone e-commerce sites. Test prices, content, shipping rates, and offers to optimize conversion.

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL
- (Optional) Redis for sessions

### Run Locally

```bash
# Install dependencies
npm install
cd frontend && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with DATABASE_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, JWT_SECRET

# Database
npm run dev:db          # Start Postgres + Redis (Docker)
npm run migrate         # Run migrations

# Start dev servers
npm run dev             # Backend (3000) + Frontend (5173)
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
├── extensions/            # Shopify theme extension
└── shopify/               # Storefront script
```

## Key Scripts

| Command                | Description                    |
| ---------------------- | ------------------------------ |
| `npm run dev`          | Backend + frontend dev servers |
| `npm run build`        | Build frontend for production  |
| `npm start`            | Start production server        |
| `npm run migrate`      | Run database migrations        |
| `npm run test:backend` | Run backend tests              |

## Environment

See `.env.example` for required variables. Essential: `DATABASE_URL`, `JWT_SECRET`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `APP_URL`.

## License

MIT
