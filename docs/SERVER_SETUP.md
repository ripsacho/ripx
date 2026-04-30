# RipX Server Setup Guide

Complete step-by-step guide to deploy RipX on Ubuntu (e.g. AWS EC2 at 3.11.139.224).

---

## Part 1: Connect to Server

### 1.1 Set PEM permissions (on your Mac)

```bash
chmod 400 /Users/m.a.k.ripon/Downloads/RipX-kp.pem
```

### 1.2 SSH into server

```bash
ssh -i /Users/m.a.k.ripon/Downloads/RipX-kp.pem ubuntu@3.11.139.224
```

Type `yes` when asked about host key. You should see `ubuntu@ip-xxx:~$`.

---

## Part 2: System Update & Base Packages

### 2.1 Update system

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 Install Git and curl

```bash
sudo apt install -y git curl
```

---

## Part 3: Install Node.js 18

### 3.1 Add NodeSource repository

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
```

### 3.2 Install Node.js

```bash
sudo apt install -y nodejs
```

### 3.3 Verify

```bash
node -v
# Should show v18.x.x
npm -v
```

---

## Part 4: Install PostgreSQL 14

### 4.1 Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
```

### 4.2 Start and enable PostgreSQL

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 4.3 Create database and user

```bash
sudo -u postgres psql
```

In the PostgreSQL prompt, run (replace `your_secure_password` with a strong password):

```sql
CREATE USER ripon WITH PASSWORD '123+Echo123+';
CREATE DATABASE ripx_db OWNER ripon;
GRANT ALL PRIVILEGES ON DATABASE ripx_db TO ripon;
\q
```

### 4.4 Generate a secure password (optional)

On your Mac or server:

```bash
openssl rand -base64 24
```

Use that output as the database password.

---

## Part 5: Install Redis (Optional but Recommended)

### 5.1 Install Redis

```bash
sudo apt install -y redis-server
```

### 5.2 Start and enable Redis

```bash
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

### 5.3 Verify Redis

```bash
redis-cli ping
# Should return PONG
```

---

## Part 6: Install PM2 (Process Manager)

```bash
sudo npm install -g pm2
```

---

## Part 7: Deploy RipX

### 7.1 Clone repository

```bash
cd ~
git clone https://github.com/ripsacho/ripx.git RipX
cd RipX
```

Or if using a specific branch:

```bash
git checkout ripon
```

### 7.2 Install dependencies

```bash
npm install
cd frontend && npm install && cd ..
```

### 7.3 Build frontend for production

```bash
npm run build
```

**Why build on the server (and not use a build from your PC)?**  
The frontend is built with **Vite**, which bakes environment variables into the JavaScript at **build time**. If you build on your PC, the bundle can end up with:

- **API URL** – Without `VITE_API_URL`, the app uses `/api` (same-origin), which is correct when the backend serves the frontend. If your local `.env` has `VITE_API_URL=http://localhost:3000`, that value is embedded in the bundle; on the live site the browser would call `localhost`, which fails.
- **Other VITE\_ vars** – e.g. `VITE_SHOPIFY_APP_HANDLE`, `VITE_RIPX_API_KEY` – if set locally, they get embedded and may be wrong for production.

Building on the server (after `git pull`) uses the server’s `.env` (or no VITE\_ overrides), so the bundle gets the right production behavior. To **build locally and still deploy**, create a `frontend/.env.production` with production values (e.g. leave `VITE_API_URL` unset for same-origin, or set `VITE_API_URL=https://your-api.com`), then run `cd frontend && npm run build` and commit/push `frontend/dist`.

### 7.4 Create .env file

```bash
nano ~/RipX/.env
```

Paste and edit (replace placeholders):

```env
NODE_ENV=production
PORT=3000

# Database (use password from Step 4.3)
DATABASE_URL=postgresql://ripon:123+Echo123+@localhost:5432/ripx_db

# Redis (if installed)
REDIS_URL=redis://localhost:6379

# JWT Secret - generate with: openssl rand -hex 32
JWT_SECRET=your_64_char_hex_string_here

# App URL - use your server IP or domain
APP_URL=http://3.11.139.224:3000

# Shopify (from Shopify Partner Dashboard)
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_orders,read_themes,write_themes

# CORS - must include the exact URL you use in the browser (protocol + host + port). No trailing slash.
ALLOWED_ORIGINS=http://3.11.139.224:3000,https://your-domain.com
```

Save: `Ctrl+X`, then `Y`, then `Enter`.

**If you see "Not allowed by CORS" in the browser:** Add the **exact** address from your browser’s address bar to `ALLOWED_ORIGINS` (e.g. `http://3.11.139.224:3000` or `https://ripx.example.com`). Then run `pm2 restart ripx`.

### 7.5 Generate JWT secret (on server)

```bash
openssl rand -hex 32
```

Copy the output and paste it as `JWT_SECRET` in `.env`.

### 7.6 Run database migrations

```bash
cd ~/RipX
npm run migrate
```

You should see migrations running successfully.

### 7.7 Start app with PM2

```bash
cd ~/RipX
pm2 start backend/src/app.js --name ripx
```

### 7.8 Save PM2 process list

```bash
pm2 save
```

### 7.9 Enable PM2 to start on boot

```bash
pm2 startup
```

Run the command it outputs (it will look like `sudo env PATH=...`).

### 7.10 Verify app is running

```bash
pm2 status
pm2 logs ripx --lines 20
```

### 7.11 Test locally on server

```bash
curl http://localhost:3000/health
```

Should return JSON with `"status":"ok"`.

---

## Part 8: Nginx Reverse Proxy (Recommended)

### 8.1 Install Nginx

```bash
sudo apt install -y nginx
```

### 8.2 Create Nginx config

```bash
sudo nano /etc/nginx/sites-available/ripx
```

Paste (replace `3.11.139.224` with your domain when you have one):

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _ 3.11.139.224;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Save: `Ctrl+X`, `Y`, `Enter`.

### 8.3 Disable default site (prevents 404 on assets)

The default Nginx site tries to serve files from /var/www/html and returns 404 for /assets/\*. Disable it:

```bash
sudo rm /etc/nginx/sites-enabled/default
```

### 8.4 Enable RipX site

```bash
sudo ln -s /etc/nginx/sites-available/ripx /etc/nginx/sites-enabled/
```

### 8.5 Test Nginx config

```bash
sudo nginx -t
```

### 8.6 Restart Nginx

```bash
sudo systemctl restart nginx
```

---

## Part 9: Firewall

### 9.1 Allow SSH, HTTP, HTTPS

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Type `y` when prompted.

### 9.2 Check status

```bash
sudo ufw status
```

---

## Part 10: Verify Deployment

### 10.1 From your Mac (or browser)

```bash
curl http://3.11.139.224/health
```

Or open in browser: `http://3.11.139.224`

### 10.2 Update APP_URL in .env (if using Nginx)

If you're accessing via `http://3.11.139.224` (port 80), update `.env`:

```env
APP_URL=http://3.11.139.224
```

Then restart:

```bash
pm2 restart ripx
```

---

## Part 11: SSL with Let's Encrypt (When You Have a Domain)

### 11.1 Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 11.2 Get certificate

```bash
sudo certbot --nginx -d yourdomain.com
```

Follow prompts. Certbot will update Nginx and set up auto-renewal.

### 11.3 Update .env for HTTPS

```env
APP_URL=https://yourdomain.com
```

```bash
pm2 restart ripx
```

---

## Part 12: Connect Shopify App

**For a clear, step-by-step checklist** (what to set in Partner Dashboard, exact `.env` lines, and install link), see **[docs/getting-started/SHOPIFY_APP_SERVER_SETUP.md](getting-started/SHOPIFY_APP_SERVER_SETUP.md)**.

**Important:** Shopify requires **HTTPS** for OAuth. You need either a domain with SSL (Part 11) or a tunnel (e.g. Cloudflare Tunnel) before connecting.

### 12.1 Get HTTPS (choose one)

**A) Cloudflare Tunnel (quick, no domain needed):**

```bash
# On server
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
./cloudflared tunnel --url http://localhost:80
```

Use the `*.trycloudflare.com` URL shown (e.g. `https://abc-xyz.trycloudflare.com`).

**B) Domain + Certbot (Part 11):** Use your domain with SSL.

### 12.2 Update Shopify Partner Dashboard

1. Go to [partners.shopify.com](https://partners.shopify.com) → Your app → **App setup**
2. **App URL:** `https://your-domain.com` (or your tunnel URL)
3. **Allowed redirection URL(s):** add `https://your-domain.com/api/auth/callback`
4. Save

### 12.3 Update server .env

```bash
nano ~/RipX/.env
```

Set (use your HTTPS URL):

```env
APP_URL=https://your-domain.com
SHOPIFY_API_KEY=e7a7d74e7aaa14162e3951a559bda6c1
SHOPIFY_API_SECRET=your_secret_from_partner_dashboard
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_orders,read_themes,write_themes
VITE_SHOPIFY_API_KEY=e7a7d74e7aaa14162e3951a559bda6c1
ALLOWED_ORIGINS=http://3.11.139.224,https://your-domain.com,https://admin.shopify.com,https://*.myshopify.com
```

Restart:

```bash
pm2 restart ripx
```

### 12.4 Install the app on your store

1. **From Partner Dashboard:** Apps → Your app → **Test your app** → choose a store
2. **Or use install link:** `https://your-domain.com/api/auth?shop=yourstore.myshopify.com`

Replace `yourstore` with your store’s myshopify.com subdomain.

---

## Part 13: Admin Panel on Server

The admin panel (Users, Domains, Tests, Audit log, etc.) is already in the app. You only need to **designate who is an admin**.

### 13.1 Ensure migrations are run

Admin uses the `users.role` column (migration `029_add_admin_support.sql`). If you’ve run migrations before, you’re fine. If unsure:

```bash
cd ~/RipX
npm run migrate
```

### 13.2 (Optional) Quick admin via env

To give a shop admin access **without touching the database**, add to `~/RipX/.env`:

```env
RIPX_ADMIN_SHOP_DOMAINS=your-store.myshopify.com
```

Multiple shops (comma-separated):

```env
RIPX_ADMIN_SHOP_DOMAINS=store1.myshopify.com,store2.myshopify.com
```

Then:

```bash
pm2 restart ripx
```

That shop can open the app and see **Admin** in the sidebar. Prefer the database method below for production so access is auditable.

### 13.3 (Recommended) Admin via database

1. **Have the future admin open the app once** (install from Shopify or connect with API key and load the dashboard). That creates a row in `users`.

2. **Find their `shop_domain`** (if needed):

   ```bash
   sudo -u postgres psql -d ripx_db -c "SELECT shop_domain, role, updated_at FROM users ORDER BY updated_at DESC LIMIT 10;"
   ```

3. **Set admin role** (replace with the real shop domain):

   ```bash
   sudo -u postgres psql -d ripx_db -c "UPDATE users SET role = 'admin' WHERE shop_domain = 'your-store.myshopify.com';"
   ```

4. That user logs in again; they’ll see **Admin** in the sidebar and can open **Admin → Overview**, Users, Domains, Tests, Audit log, etc.

### 13.4 (Optional) Admin API key for scripts

To call the admin API from scripts (e.g. cron) without logging in as a shop:

```env
ADMIN_API_KEY=your-secret-long-random-key
```

Then send the header on requests: `X-Admin-API-Key: your-secret-long-random-key`. Keep this key secret; do not commit it.

---

## Part 14: Updating the App (Future Deploys)

### 14.1 Pull latest code

On the server, `frontend/dist/` is often modified by a previous `npm run build`. So **before** every pull, discard local changes to the built files so the pull does not fail:

```bash
cd ~/RipX
git restore frontend/dist/
# or: git checkout -- frontend/dist/
git pull origin ripon
```

If you skip this and see “Your local changes would be overwritten by merge”, run `git restore frontend/dist/` then run `git pull` again.

**Optional (one-time, on your local repo):** To avoid tracking built files and never see this on the server, remove the `!frontend/dist/` line from `.gitignore` so `dist/` is ignored. Deploy = pull + `npm run build` on the server; the server must run the build every time.

### 14.2 Install dependencies (if package.json changed)

```bash
npm install
cd frontend && npm install && cd ..
```

### 14.3 Rebuild frontend

```bash
npm run build
```

### 14.4 Run migrations (if any new ones)

```bash
npm run migrate
```

### 14.5 Restart app

```bash
pm2 restart ripx
```

---

## Quick Reference

| Task          | Command                        |
| ------------- | ------------------------------ |
| View logs     | `pm2 logs ripx`                |
| Restart app   | `pm2 restart ripx`             |
| Stop app      | `pm2 stop ripx`                |
| App status    | `pm2 status`                   |
| Nginx restart | `sudo systemctl restart nginx` |

---

## Ports and .env Verification

### Port summary

| Port     | Service       | Who uses it | Notes                                          |
| -------- | ------------- | ----------- | ---------------------------------------------- |
| **80**   | Nginx (HTTP)  | Public      | Redirects to 443 if SSL; or proxies to 3000    |
| **443**  | Nginx (HTTPS) | Public      | Proxies to backend on 3000                     |
| **3000** | RipX (Node)   | Nginx only  | Set by `PORT` in .env; not exposed to internet |
| **5432** | PostgreSQL    | RipX only   | In `DATABASE_URL` (localhost:5432)             |
| **6379** | Redis         | RipX only   | In `REDIS_URL` (localhost:6379)                |

- **Correct:** Internet → 80/443 (Nginx) → 3000 (Node) → 5432 (Postgres), 6379 (Redis).
- **Wrong:** Exposing 3000 to the internet (no Nginx) or wrong host/port in DATABASE_URL / REDIS_URL.

### .env checklist (production)

| Variable                           | Example / rule                                  | Check                                                                    |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`                         | `production`                                    | Required for serving frontend and production behavior                    |
| `PORT`                             | `3000`                                          | Backend listens here; Nginx must proxy to this port                      |
| `APP_URL`                          | `https://splitter.echologyx.com`                | No port (Nginx serves 80/443); used for OAuth, links, CORS               |
| `DATABASE_URL`                     | `postgresql://user:pass@localhost:5432/ripx_db` | Host `localhost`, port `5432`, correct DB name and user/pass             |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false`                                         | Only if DB uses self-signed cert (e.g. local Postgres)                   |
| `REDIS_URL`                        | `redis://localhost:6379`                        | Host `localhost`, port `6379`; optional but recommended for jobs/session |
| `JWT_SECRET`                       | Long random string (32+ chars)                  | Required; never default/placeholder in production                        |
| `ALLOWED_ORIGINS`                  | `https://splitter.echologyx.com,...`            | Must include your app URL and Shopify admin if used                      |

- Do **not** put `:3000` in `APP_URL` when using Nginx (users hit 80/443).
- Optional: `SHOPIFY_*`, `VITE_SHOPIFY_API_KEY` if you use the Shopify app.

### Commands to verify (run on server)

**1. Backend listening on 3000**

```bash
sudo ss -tlnp | grep 3000
# or: sudo lsof -i :3000
```

Expected: process (e.g. node) listening on `*:3000` or `0.0.0.0:3000`.

**2. PostgreSQL on 5432**

```bash
sudo ss -tlnp | grep 5432
psql -U ripon -d ripx_db -h localhost -c "SELECT 1 AS ok;"
```

Expected: postgres listening on 5432 and query returns `ok = 1`.

**3. Redis on 6379**

```bash
sudo ss -tlnp | grep 6379
redis-cli ping
```

Expected: redis-server on 6379 and `PONG`.

**4. Nginx on 80 and 443**

```bash
sudo ss -tlnp | grep -E ':80 |:443 '
sudo nginx -t
```

Expected: nginx listening on 80 and 443, and `nginx: configuration is ok`.

**5. Env and health**

```bash
cd ~/RipX
grep -E '^PORT=|^APP_URL=|^DATABASE_URL=|^REDIS_URL=' .env
curl -s http://localhost:3000/health | head -c 300
```

Expected: `PORT=3000`, `APP_URL=https://splitter.echologyx.com`, valid `DATABASE_URL` (with `localhost:5432`), `REDIS_URL=redis://localhost:6379`, and health JSON with `"status":"ok"`.

**6. Firewall (optional)**

```bash
sudo ufw status
```

Expected: 22, 80, 443 allowed; 3000, 5432, 6379 **not** in public rules (only localhost).

---

## Troubleshooting

### App won't start

```bash
pm2 logs ripx
# Check for DATABASE_URL, JWT_SECRET errors
```

### Database connection failed

```bash
sudo systemctl status postgresql
psql -U ripon -d ripx_db -h localhost -c "SELECT 1;"
```

### Port 80 not accessible

- Check security group / firewall allows port 80
- `sudo ufw status`
- `sudo systemctl status nginx`
