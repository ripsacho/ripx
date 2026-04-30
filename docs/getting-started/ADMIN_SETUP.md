# Admin Panel Setup Guide

This guide explains how to designate and manage **platform admins** for the RipX admin panel (Users, Domains, Tests, Audit log, etc.).

---

## Quick start: create your first admin (production server)

Use this if your app is already running on the server (e.g. **splitter.echologyx.com**) and you want to make a Shopify store an admin.

1. **Install and open the app once**  
   From Shopify Admin, open your app for the store that should be admin (e.g. **ripper-elx.myshopify.com**). Complete OAuth if prompted. That ensures a session exists and (if your app creates it) a `users` row may exist.

2. **SSH into the server** and connect to PostgreSQL:

   ```bash
   ssh -i /path/to/key.pem ubuntu@YOUR_SERVER_IP
   psql -U ripon -d ripx_db
   ```

   (Use your actual DB user and database name from `DATABASE_URL` in `.env`.)

3. **Create or update the admin user** in the database:

   ```sql
   -- List recent shops (to confirm the exact shop_domain)
   SELECT shop_domain, role, status FROM users ORDER BY updated_at DESC LIMIT 10;
   ```

   If your shop is not in the list, insert a row then set the role:

   ```sql
   -- Replace with your store’s myshopify.com domain
   INSERT INTO users (shop_domain, role, status, created_at, updated_at)
   VALUES ('ripper-elx.myshopify.com', 'admin', 'active', NOW(), NOW())
   ON CONFLICT (shop_domain) DO UPDATE SET role = 'admin', status = 'active', updated_at = NOW();
   ```

   If the shop already exists, just set the role:

   ```sql
   UPDATE users SET role = 'admin', status = 'active', updated_at = NOW()
   WHERE shop_domain = 'ripper-elx.myshopify.com';
   ```

4. **Reload the app** in Shopify Admin. In the sidebar you should see **Admin** (Overview, Users, Domains, Tests, Audit log). Open **Admin → Overview** to confirm.

**Alternative (no DB):** Add the shop to env in `~/RipX/.env` and restart:

```env
RIPX_ADMIN_SHOP_DOMAINS=ripper-elx.myshopify.com
```

Then run `pm2 restart ripx --update-env`. This works but is less auditable; prefer the database role in production.

---

## Local development

For local development you can grant admin access **without touching the database** using an environment variable.

### Option A: Env list (recommended for local)

1. Open `.env` and add your dev shop domain(s), comma-separated:

   ```env
   RIPX_ADMIN_SHOP_DOMAINS=my-dev-store.myshopify.com
   ```

   Multiple shops:

   ```env
   RIPX_ADMIN_SHOP_DOMAINS=store1.myshopify.com,store2.myshopify.com
   ```

2. **Restart the backend** so it picks up the new env (e.g. stop and run `npm run dev` again). Any request authenticated as one of those shops (e.g. after OAuth or with that shop in the URL) will have admin access.

3. In the app, open the sidebar and click **Admin**, or go to `/admin`. You should see Overview, Users, Domains, Tests, and Audit log.

**Note:** `RIPX_ADMIN_SHOP_DOMAINS` is intended for local/dev. In production, use the database role (see Production below) so admin assignment is auditable and not dependent on env.

### Option B: Admin API key (optional, for scripts)

You can call the admin API from scripts or tools without logging in as a shop:

1. In `.env` set a secret key:

   ```env
   ADMIN_API_KEY=your-secret-admin-key-here
   ```

2. Send it on every admin API request:

   ```bash
   curl -H "X-Admin-API-Key: your-secret-admin-key-here" \
        -H "Content-Type: application/json" \
        http://localhost:3000/api/admin/stats
   ```

**Security:** Keep `ADMIN_API_KEY` secret. Do not commit it to git or expose it in the frontend.

---

## Production: designating the first admin

In production, admin access is controlled by the **database**: the `users` table has a `role` column. Only users with `role = 'admin'` or `role = 'superadmin'` can access `/api/admin/*` (unless `RIPX_ADMIN_SHOP_DOMAINS` or `ADMIN_API_KEY` is set).

### Step 1: Ensure the user row exists

Admins are identified by **shop domain** (Shopify) or the primary domain of an account. The `users` table has one row per shop (keyed by `shop_domain`). That row is created when the user first visits the app (e.g. after OAuth and loading the dashboard or profile).

- If the store has already logged in at least once, a `users` row exists.
- If not, have the future admin open the app once (install the app or connect with API key and load the dashboard). Then proceed to Step 2.

### Step 2: Set the admin role in the database

Connect to your **production database** with a client (psql, TablePlus, etc.) and run:

```sql
-- Replace 'your-store.myshopify.com' with the exact shop domain of the admin
UPDATE users
SET role = 'admin'
WHERE shop_domain = 'your-store.myshopify.com';
```

To grant **superadmin** (same as admin for now, but can be used for future permission tiers):

```sql
UPDATE users
SET role = 'superadmin'
WHERE shop_domain = 'your-store.myshopify.com';
```

**How to find the exact `shop_domain`:**

- From your DB: `SELECT shop_domain FROM users ORDER BY updated_at DESC LIMIT 20;`
- From the app: the URL often contains `?shop=xxx.myshopify.com` when opened from Shopify Admin.

### Step 3: Verify

1. Log in to the RipX app as that shop (or with an API key that resolves to that shop).
2. In the sidebar you should see **Admin** under a “Platform” section.
3. Open **Admin** → Overview. You should see platform stats and the other admin pages (Users, Domains, Tests, Audit log).

### Step 4: Add more admins (optional)

Repeat Step 2 for each additional shop that should have admin access:

```sql
UPDATE users SET role = 'admin' WHERE shop_domain = 'another-store.myshopify.com';
```

Or use the admin UI: once you have one admin, they can open **Admin → Users**, find the user, and use the **Role** control (if you add a role dropdown in the UI) or you continue to use SQL for role assignment.

---

## Production: removing admin access

To revoke admin access for a shop:

```sql
UPDATE users SET role = NULL WHERE shop_domain = 'store-to-revoke.myshopify.com';
```

To lock the account entirely (they cannot use the app until unlocked):

```sql
UPDATE users SET status = 'locked' WHERE shop_domain = 'store-to-revoke.myshopify.com';
```

Unlock:

```sql
UPDATE users SET status = 'active' WHERE shop_domain = 'store-to-revoke.myshopify.com';
```

---

## Production: optional ADMIN_API_KEY

For support scripts or internal tools you can set `ADMIN_API_KEY` in production and call the admin API with the `X-Admin-API-Key` header. Prefer **database roles** for human admins so actions are tied to a shop identity in the audit log. Use a strong random value and restrict who can see the env var.

---

## Email (magic-link) login (standalone)

For **standalone** (non-Shopify) mode, RipX supports passwordless login by email:

1. **Request a login link**
   - `POST /api/auth/send-login-link` with body `{ "email": "admin@example.com" }`.
   - The server creates a one-time token and sends an email with a link (or logs the link if email is not configured).

2. **Verify and sign in**
   - User opens the link: `GET /api/auth/verify-email?token=...`
   - Server validates the token and returns a JWT (or redirects if `redirect_uri` is provided). The frontend can store the JWT and use it for API calls.

3. **Environment**
   - **Database:** Run migration `033_add_email_verification_tokens.sql` so the `email_verification_tokens` table exists.
   - **Stub mode (default):** Set `RIPX_EMAIL_VERIFICATION_STUB=true` (or leave unset) so the server **logs** the magic link instead of sending email (useful for local dev).
   - **Real email:** Configure an email provider (e.g. SendGrid, Resend) in `emailVerificationService.sendVerificationEmail` and do not set the stub; the server will send the link to the user’s inbox.

4. **Admin access with email login**
   - The user row is keyed by the verified email (or linked account). To grant admin after they have logged in once, set their role in the database (e.g. `UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';` if your schema uses `email`), or use the same shop/account-based role as above if the standalone app ties email to a “shop” or account id.

For API details, see `backend/src/routes/authRoutes.js` (send-login-link, verify-email) and `backend/src/services/emailVerificationService.js`.

---

## Summary

| Environment    | How to get admin access                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| **Local**      | Set `RIPX_ADMIN_SHOP_DOMAINS=your-store.myshopify.com` in `.env`.                                     |
| **Production** | Run `UPDATE users SET role = 'admin' WHERE shop_domain = '...';` for the shop.                        |
| **Scripts**    | Set `ADMIN_API_KEY` and send `X-Admin-API-Key` header.                                                |
| **Standalone** | Use email magic-link (`/api/auth/send-login-link`, `/api/auth/verify-email`); then assign role in DB. |

For full admin capabilities and roadmap, see [ADMIN_CONTROL_PANEL_SPEC.md](../ADMIN_CONTROL_PANEL_SPEC.md).
