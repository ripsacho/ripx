# RipX – Local Setup & Connection

Use this guide to connect and run RipX locally.

## Connect Locally

### 1. Install Dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` – PostgreSQL (e.g. `postgresql://ripx:ripx@localhost:5432/ripx_dev`)
- `JWT_SECRET` – `openssl rand -hex 32`
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` – from Shopify Partner Dashboard
- `APP_URL` – `http://localhost:3000`

### 3. Database

```bash
npm run dev:db    # Postgres + Redis via Docker
npm run migrate   # Run migrations
```

### 4. Start Dev Servers

```bash
npm run dev
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173

### 5. Shopify (optional)

```bash
shopify app dev
```

## Check It Works

- Backend health: `curl http://localhost:3000/health`
- Frontend: open http://localhost:5173
- API docs: http://localhost:3000/api-docs
