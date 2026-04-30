# Environment Variables Setup Guide

Your `.env` file has been created! Now you need to fill in your actual credentials.

## ✅ Step 1 Complete

The `.env` file has been created from `.env.example`.

## 📝 Step 2: Fill in Your Credentials

Open the `.env` file and replace the placeholder values with your actual credentials:

### 1. Shopify App Configuration

```env
SHOPIFY_API_KEY=your_actual_api_key_here
SHOPIFY_API_SECRET=your_actual_api_secret_here
```

**How to get these:**

1. Go to [Shopify Partner Dashboard](https://partners.shopify.com)
2. Click on "Apps" → Your app
3. Copy the **API Key** and **API Secret Key**
4. Paste them into your `.env` file

### 2. Database Configuration

```env
DATABASE_URL=postgresql://username:password@localhost:5432/shopify_ab_testing
```

**How to set this up:**

1. **If you have PostgreSQL installed:**

   ```bash
   # Create database
   createdb shopify_ab_testing

   # Update .env with your credentials
   # Format: postgresql://username:password@localhost:5432/database_name
   ```

2. **If using a cloud database:**
   - Copy the connection string from your provider
   - Paste it into `DATABASE_URL`

**Example:**

```env
DATABASE_URL=postgresql://postgres:mypassword@localhost:5432/shopify_ab_testing
```

### 3. JWT Secret

```env
JWT_SECRET=your_very_secure_random_secret_here
```

**Generate a secure secret:**

```bash
# Run this command to generate a random secret
openssl rand -base64 32
```

Copy the output and paste it into `JWT_SECRET` in your `.env` file.

### 4. App URLs

```env
APP_URL=http://localhost:3000
SHOPIFY_APP_URL=http://localhost:3000
```

**For development:** Keep these as `http://localhost:3000`

**For production:** Change to your actual domain:

```env
APP_URL=https://your-app-domain.com
SHOPIFY_APP_URL=https://your-app-domain.com
```

### 5. Redis (Optional but Recommended)

```env
REDIS_URL=redis://localhost:6379
```

**If Redis is installed locally:** Keep as is

**If using cloud Redis:** Update with your Redis URL

**If not using Redis:** You can leave this, but some features may be slower

## 🔒 Security Notes

- **Never commit `.env` to git** - It's already in `.gitignore`
- **Keep your secrets secure** - Don't share your `.env` file
- **Use different secrets for production** - Don't reuse development secrets

## ✅ Quick Checklist

Before running the app, make sure you have:

- [ ] `SHOPIFY_API_KEY` - Your Shopify app API key
- [ ] `SHOPIFY_API_SECRET` - Your Shopify app secret
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `JWT_SECRET` - Generated secure random string
- [ ] `APP_URL` - Your app URL (localhost for dev)
- [ ] `REDIS_URL` - Redis URL (optional)

## 🚀 Next Steps

After filling in your `.env` file:

1. **Install dependencies:**

   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

2. **Set up database:**

   ```bash
   # Create database (if not exists)
   createdb shopify_ab_testing

   # Run migrations
   npm run migrate
   ```

3. **Start the app:**
   ```bash
   npm run dev
   ```

## 🆘 Troubleshooting

### "Cannot connect to database"

- Check that PostgreSQL is running: `pg_isready`
- Verify your `DATABASE_URL` is correct
- Make sure the database exists: `psql -l | grep shopify_ab_testing`

### "Shopify API authentication failed"

- Verify your API key and secret are correct
- Check that your app is installed in your development store
- Ensure OAuth callback URL matches in Shopify Partner Dashboard

### "JWT_SECRET is not set"

- Make sure you've generated and set a JWT_SECRET
- Run: `openssl rand -base64 32` to generate one

---

**Your `.env` file is ready!** Just fill in the actual values and you're good to go! 🎉
