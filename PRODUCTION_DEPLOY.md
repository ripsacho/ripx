# RipX – Production deployment (server runbook)

After you **push** to the server and **pull** in the app directory, run these steps on the server to go live.

---

## 1. Environment file

Ensure `.env` exists in the **project root** (same folder as `package.json`). If not:

```bash
cp .env.example .env
```

Edit `.env` and set at least:

| Variable          | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `NODE_ENV`        | `production`                                                       |
| `PORT`            | Port the app listens on (e.g. `3000`)                              |
| `DATABASE_URL`    | PostgreSQL connection string for production DB                     |
| `JWT_SECRET`      | Strong random string (32+ chars). e.g. `openssl rand -hex 32`      |
| `APP_URL`         | Full backend URL (e.g. `https://api.yourdomain.com`)               |
| `FRONTEND_URL`    | Full frontend URL if different (e.g. `https://app.yourdomain.com`) |
| `ALLOWED_ORIGINS` | Comma-separated origins (include APP_URL and FRONTEND_URL)         |

If you use **Shopify** (not standalone-only):

- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_SCOPES` (e.g. `read_products,write_products,read_orders`)

If **standalone-only** (no Shopify):

- `RIPX_STANDALONE_ONLY=true`

Optional but recommended:

- `REDIS_URL` – for sessions and background jobs (scheduled tests, archive).
- `SESSION_SECRET` – or it falls back to `JWT_SECRET`.
- SMTP vars – for magic-link and OTP emails (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).

---

## 2. Install dependencies

From project root:

```bash
npm ci
cd frontend && npm ci && cd ..
```

(Use `npm install` if you don’t have `package-lock.json`.)

---

## 3. Build frontend

Required so the backend can serve the SPA from `frontend/dist` in production.

If the app is served from the **same origin** as the API (e.g. one domain for both), you can build with:

```bash
NODE_ENV=production npm run build
```

If the frontend is on a **different origin** (e.g. `https://app.yourdomain.com` and API at `https://api.yourdomain.com`), set the API base URL at build time:

```bash
NODE_ENV=production VITE_API_URL=https://api.yourdomain.com/api npm run build
```

(Or add `VITE_API_URL=https://api.yourdomain.com/api` to `.env` before building; Vite reads it during `npm run build`.)

---

## 4. Run database migrations

```bash
npm run migrate
```

This applies any new SQL migrations and skips already-applied ones. If this is the first deploy and the DB was migrated elsewhere, you can mark migrations as applied:

```bash
npm run migrate:mark-applied
```

(Only if you’re sure the DB schema is already up to date.)

---

## 5. Create first super admin

Set the email for the first super admin in `.env`:

- `RIPX_SUPERADMIN_EMAIL=your-admin@example.com`  
  or
- `RIPX_ADMIN_EMAIL=your-admin@example.com`

Then run once:

```bash
npm run ensure-superadmin
```

That user will be created/updated as accepted and `superadmin` so they can log in (e.g. with 6-digit code) and manage others.

---

## 6. Start the app

**Option A – Direct (foreground)**

```bash
NODE_ENV=production node backend/src/app.js
```

Or:

```bash
NODE_ENV=production npm start
```

**Option B – PM2**

```bash
NODE_ENV=production pm2 start backend/src/app.js --name ripx
pm2 save
pm2 startup   # if first time
```

**Option C – systemd**

Use a unit file that sets `NODE_ENV=production` and `WorkingDirectory` to the project root, and runs `node backend/src/app.js`.

---

## 7. Verify

- **Health:**  
  `curl -s https://your-domain/health` or `curl -s https://your-domain/api/health`  
  Should return JSON with `status` and DB/Redis checks.

- **Frontend:**  
  Open your app URL in a browser; you should see the login/connect page.

- **Admin:**  
  Log in with the super admin email (OTP or magic link); open `/admin` if you use the admin panel.

---

## Quick one-time checklist (after git pull)

```bash
# 1) Env (create/edit .env first)
cp .env.example .env   # if needed, then edit .env

# 2) Install
npm ci && cd frontend && npm ci && cd ..

# 3) Build frontend
NODE_ENV=production npm run build

# 4) Migrate DB
npm run migrate

# 5) First super admin (set RIPX_SUPERADMIN_EMAIL or RIPX_ADMIN_EMAIL in .env)
npm run ensure-superadmin

# 6) Start (example with PM2)
NODE_ENV=production pm2 start backend/src/app.js --name ripx
pm2 save
```

---

## Troubleshooting

| Issue               | Check                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| Blank page or 404   | `NODE_ENV=production` and `frontend/dist` exists (run `npm run build`).               |
| DB errors           | `DATABASE_URL` correct; DB is up; migrations ran (`npm run migrate`).                 |
| Cannot log in       | First admin created? Run `npm run ensure-superadmin` with email set in `.env`.        |
| 401 on API          | CORS: add your frontend origin to `ALLOWED_ORIGINS` in `.env`.                        |
| Jobs/session issues | Set `REDIS_URL` if you use Redis; otherwise in-memory session and no background jobs. |
