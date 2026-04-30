# Detailed Setup Guide - Step by Step

This guide provides **extremely detailed, step-by-step instructions** for setting up your AB testing tool from scratch. Follow each step carefully.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Database Configuration](#database-configuration)
4. [Shopify App Setup](#shopify-app-setup)
5. [Environment Configuration](#environment-configuration)
6. [Running the Application](#running-the-application)
7. [Creating Your First Test](#creating-your-first-test)
8. [Storefront Integration](#storefront-integration)
9. [Webhook Configuration](#webhook-configuration)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Step 1: Install Required Software

#### 1.1 Install Node.js

**For macOS:**

```bash
# Using Homebrew (recommended)
brew install node@18

# Verify installation
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

**For Windows:**

1. Visit https://nodejs.org/
2. Download the LTS version (18.x or higher)
3. Run the installer
4. Verify in Command Prompt:

```cmd
node --version
npm --version
```

**For Linux (Ubuntu/Debian):**

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

#### 1.2 Install PostgreSQL

**For macOS:**

```bash
brew install postgresql@14
brew services start postgresql@14

# Verify
psql --version
```

**For Windows:**

1. Visit https://www.postgresql.org/download/windows/
2. Download and run the installer
3. Remember the password you set for the `postgres` user
4. Verify installation

**For Linux:**

```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### 1.3 Install Redis (Optional but Recommended)

**For macOS:**

```bash
brew install redis
brew services start redis

# Verify
redis-cli ping  # Should return PONG
```

**For Windows:**

1. Visit https://github.com/microsoftarchive/redis/releases
2. Download and install
3. Or use WSL (Windows Subsystem for Linux)

**For Linux:**

```bash
sudo apt-get install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

#### 1.4 Install Git

**For macOS:**

```bash
brew install git
```

**For Windows/Linux:**

- Download from https://git-scm.com/downloads

---

## Initial Setup

### Step 2: Clone/Navigate to Project Directory

```bash
# Navigate to your project directory
cd /Users/m.a.k.ripon/Desktop/DEV

# Verify you're in the right directory
pwd  # Should show /Users/m.a.k.ripon/Desktop/DEV
ls   # Should show project files
```

### Step 3: Install Project Dependencies

#### 3.1 Install Root Dependencies

```bash
# Install all backend dependencies
npm install

# This will install:
# - Express.js (web framework)
# - PostgreSQL client
# - Shopify API SDK
# - And all other dependencies listed in package.json
```

**Expected output:**

```
added 245 packages, and audited 246 packages in 15s
```

**If you see errors:**

- Make sure Node.js is installed correctly
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again
- Check your internet connection

#### 3.2 Install Frontend Dependencies

```bash
# Navigate to frontend directory
cd frontend

# Install frontend dependencies
npm install

# This will install:
# - React
# - Shopify Polaris
# - Vite (build tool)
# - And other frontend dependencies

# Go back to root
cd ..
```

**Expected output:**

```
added 180 packages, and audited 181 packages in 12s
```

---

## Database Configuration

### Step 4: Set Up PostgreSQL Database

#### 4.1 Create Database User (if needed)

```bash
# Connect to PostgreSQL
psql postgres

# In PostgreSQL prompt, create user (if needed)
CREATE USER shopify_ab_user WITH PASSWORD 'your_secure_password';

# Grant privileges
ALTER USER shopify_ab_user CREATEDB;

# Exit
\q
```

#### 4.2 Create Database

```bash
# Create the database
createdb shopify_ab_testing

# Or with specific user:
createdb -U shopify_ab_user shopify_ab_testing

# Verify database was created
psql -l | grep shopify_ab_testing
```

**Expected output:**

```
shopify_ab_testing | shopify_ab_user | UTF8     | en_US.UTF-8 | en_US.UTF-8 |
```

#### 4.3 Run Database Migrations

```bash
# Make sure you're in the project root
cd /Users/m.a.k.ripon/Desktop/DEV

# Run migrations
npm run migrate
```

**This will:**

1. Create the `tests` table
2. Create the `test_assignments` table
3. Create the `events` table
4. Create the `promo_links` table
5. Create the `notifications` table
6. Create all necessary indexes

**Expected output:**

```
🔄 Running database migrations...
  Running 001_initial_schema.sql...
  ✅ 001_initial_schema.sql completed
  Running 002_add_advanced_features.sql...
  ✅ 002_add_advanced_features.sql completed
✅ All migrations completed successfully!
```

**If you see errors:**

- Check that PostgreSQL is running: `pg_isready`
- Verify database exists: `psql -l`
- Check your DATABASE_URL in .env (see next section)

---

## Shopify App Setup

### Step 5: Create Shopify Partner Account

1. **Go to Shopify Partners:**
   - Visit https://partners.shopify.com
   - Click "Sign up" or "Log in"

2. **Create Partner Account:**
   - Fill in your details
   - Verify your email

3. **Create Development Store:**
   - In Partner Dashboard, click "Stores" → "Add store"
   - Choose "Development store"
   - Name it (e.g., "AB Testing Dev Store")
   - Click "Create store"

### Step 6: Create Shopify App

1. **In Partner Dashboard:**
   - Click "Apps" → "Create app"
   - Choose "Create app manually"

2. **App Details:**
   - **App name:** "AB Testing Tool" (or your preferred name)
   - **App URL:** `http://localhost:3000` (for development)
   - **Allowed redirection URL(s):** `http://localhost:3000/auth/callback`

3. **Configure API Scopes:**
   - Check these scopes:
     - `read_products`
     - `write_products`
     - `read_orders`
     - `write_orders`
     - `read_themes`
     - `write_themes`
     - `read_customers`
     - `read_checkouts`

4. **Save and Note Credentials:**
   - **API Key:** Copy this (starts with something like `abc123...`)
   - **API Secret Key:** Copy this (starts with something like `shpat_...`)
   - **Store these securely!**

### Step 7: Install App in Development Store

1. **In your development store admin:**
   - Go to "Apps" → "App and sales channel settings"
   - Click "Develop apps"
   - Find your app and click "Install"

2. **Authorize the app:**
   - Review permissions
   - Click "Install app"

---

## Environment Configuration

### Step 8: Configure Environment Variables

#### 8.1 Create .env File

```bash
# In project root
cd /Users/m.a.k.ripon/Desktop/DEV

# Copy example file
cp .env.example .env

# Open in editor (or use nano/vim)
open .env  # macOS
# or
nano .env  # Linux/macOS
# or
code .env  # VS Code
```

#### 8.2 Fill in Environment Variables

Edit `.env` with your actual values:

```env
# Shopify App Configuration
SHOPIFY_API_KEY=your_actual_api_key_here
SHOPIFY_API_SECRET=your_actual_api_secret_here
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_orders,read_themes,write_themes
APP_URL=http://localhost:3000
SHOPIFY_APP_URL=http://localhost:3000

# Database Configuration
# Format: postgresql://username:password@localhost:5432/database_name
DATABASE_URL=postgresql://shopify_ab_user:your_password@localhost:5432/shopify_ab_testing

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379

# JWT Secret (generate a random string)
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_random

# Environment
NODE_ENV=development

# Analytics
ANALYTICS_ENABLED=true
MIN_SAMPLE_SIZE=100
CONFIDENCE_LEVEL=0.95

# Logging
LOG_LEVEL=info
```

**Important Notes:**

- Replace `your_actual_api_key_here` with your Shopify API Key
- Replace `your_actual_api_secret_here` with your Shopify API Secret
- Replace `your_password` with your PostgreSQL password
- Generate a secure JWT secret (you can use: `openssl rand -base64 32`)

#### 8.3 Verify .env File

```bash
# Check that .env exists and has content
cat .env | grep -v "^#" | grep -v "^$"
```

You should see your configuration values (without comments).

---

## Running the Application

### Step 9: Start Development Servers

#### 9.1 Start Backend Server

**Terminal 1 - Backend:**

```bash
cd /Users/m.a.k.ripon/Desktop/DEV

# Start backend
npm run dev:backend
```

**Expected output:**

```
🚀 AB Testing App server running on port 3000
📊 Environment: development
```

**If you see errors:**

- Check that PostgreSQL is running: `pg_isready`
- Verify DATABASE_URL in .env
- Check that port 3000 is not in use: `lsof -i :3000`

#### 9.2 Start Frontend Server

**Terminal 2 - Frontend:**

```bash
cd /Users/m.a.k.ripon/Desktop/DEV/frontend

# Start frontend
npm run dev
```

**Expected output:**

```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:3001/
  ➜  Network: use --host to expose
```

#### 9.3 Verify Both Servers Are Running

1. **Backend health check:**

   ```bash
   curl http://localhost:3000/health
   ```

   Should return: `{"status":"ok","timestamp":"..."}`

2. **Frontend:**
   - Open browser: http://localhost:3001
   - You should see the app interface

---

## Creating Your First Test

### Step 10: Access the App

1. **Option A: Direct Access (Development)**
   - Open: http://localhost:3001
   - Add `?shop=your-dev-store.myshopify.com` to URL

2. **Option B: Through Shopify Admin**
   - In your development store admin
   - Go to Apps → Your AB Testing App
   - Click to open

### Step 11: Create a Price Test

1. **Click "Create Test" button**

2. **Fill in Test Details:**
   - **Name:** "My First Price Test"
   - **Type:** Select "Price Test"
   - **Target ID:** Enter a product ID from your store
     - To find product ID:
       - Go to Products in Shopify admin
       - Click a product
       - Look at URL: `/admin/products/123456789`
       - Use `123456789` as Target ID

3. **Configure Variants:**
   - **Control:**
     - Name: "Control"
     - Allocation: 50%
     - Price: Enter current price (e.g., 29.99)
   - **Variant A:**
     - Name: "Lower Price"
     - Allocation: 50%
     - Price: Enter test price (e.g., 24.99)

4. **Set Goal:**
   - Type: "Conversion"
   - Metric: "Revenue"

5. **Click "Create Test"**

6. **Start the Test:**
   - Click on your test
   - Click "Start Test" button
   - Test status should change to "Running"

---

## Storefront Integration

### Step 12: Add Tracking Script to Theme

#### 12.1 Access Theme Code

1. **In Shopify Admin:**
   - Go to "Online Store" → "Themes"
   - Click "Actions" → "Edit code"

2. **Find theme.liquid:**
   - In "Layout" folder
   - Click "theme.liquid"

#### 12.2 Add Tracking Script

**Before `</body>` tag, add:**

```liquid
<!-- AB Testing Tracker -->
<script>
  (function() {
    const CONFIG = {
      apiUrl: 'http://localhost:3000/api',
      cookieName: 'ab_test_user_id'
    };

    // Get or create user ID
    function getUserId() {
      let userId = getCookie(CONFIG.cookieName);
      if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        setCookie(CONFIG.cookieName, userId, 365);
      }
      return userId;
    }

    function getCookie(name) {
      const nameEQ = name + '=';
      const ca = document.cookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
      }
      return null;
    }

    function setCookie(name, value, days) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      const expires = 'expires=' + date.toUTCString();
      document.cookie = name + '=' + value + ';' + expires + ';path=/';
    }

    // Load tracking script
    const script = document.createElement('script');
    script.src = '{{ "storefront-script.js" | asset_url }}';
    script.defer = true;
    document.body.appendChild(script);
  })();
</script>
```

#### 12.3 Upload storefront-script.js

1. **In Theme Editor:**
   - Go to "Assets" folder
   - Click "Add a new asset"
   - Choose "Create a blank file"
   - Name it: `storefront-script.js`

2. **Copy Content:**
   - Open `/Users/m.a.k.ripon/Desktop/DEV/shopify/storefront-script.js`
   - Copy all content
   - Paste into the new asset file
   - **Important:** Update `apiUrl` in the script to your backend URL

3. **Save:**
   - Click "Save"

#### 12.4 Test Storefront Integration

1. **Visit your storefront:**
   - Go to your development store URL
   - Open browser console (F12)
   - Check for any errors

2. **Verify Script Loads:**
   - In console, type: `window.ABTestTracker`
   - Should return an object (not undefined)

---

## Webhook Configuration

### Step 13: Set Up Webhooks

#### 13.1 Register Webhook Endpoints

1. **In Shopify Partner Dashboard:**
   - Go to your app
   - Click "Webhooks"
   - Click "Create webhook"

2. **Create Order Webhook:**
   - **Event:** "Order creation"
   - **Format:** JSON
   - **URL:** `https://your-app-url.com/api/webhooks/orders/create`
     - For local development, use ngrok (see below)

3. **Create Product Webhook:**
   - **Event:** "Product update"
   - **Format:** JSON
   - **URL:** `https://your-app-url.com/api/webhooks/products/update`

#### 13.2 Use ngrok for Local Development

**Install ngrok:**

```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

**Start ngrok:**

```bash
# In a new terminal
ngrok http 3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

**Update webhook URLs:**

- Use: `https://abc123.ngrok.io/api/webhooks/orders/create`

**Important:** ngrok URL changes each time you restart it. For production, use a permanent URL.

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: "Cannot connect to database"

**Symptoms:**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solutions:**

```bash
# Check PostgreSQL is running
pg_isready

# If not running, start it
# macOS:
brew services start postgresql@14

# Linux:
sudo systemctl start postgresql

# Verify connection
psql -d shopify_ab_testing -c "SELECT 1;"
```

#### Issue 2: "Port 3000 already in use"

**Solutions:**

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev:backend
```

#### Issue 3: "Shopify API authentication failed"

**Solutions:**

- Verify API Key and Secret in .env
- Check that app is installed in development store
- Ensure OAuth callback URL matches exactly

#### Issue 4: "Frontend not loading"

**Solutions:**

```bash
# Clear node_modules and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install

# Check for errors in browser console
# Verify Vite is running on correct port
```

#### Issue 5: "Webhook signature verification failed"

**Solutions:**

- Verify SHOPIFY_API_SECRET in .env matches your app secret
- Check webhook URL is correct
- Ensure webhook is receiving POST requests with raw body

---

## Next Steps

After completing setup:

1. ✅ **Create your first test** (Step 10-11)
2. ✅ **Test storefront integration** (Step 12)
3. ✅ **Set up webhooks** (Step 13)
4. ✅ **Monitor test results** in Analytics dashboard
5. ✅ **Read API documentation** for advanced usage
6. ✅ **Deploy to production** when ready

---

## Getting Help

If you encounter issues:

1. **Check logs:**
   - Backend: Terminal running `npm run dev:backend`
   - Frontend: Browser console (F12)

2. **Verify configuration:**
   - All environment variables set correctly
   - Database is running and accessible
   - Shopify app is properly configured

3. **Review documentation:**
   - README.md - Overview
   - ARCHITECTURE.md - System design
   - IMPLEMENTATION_GUIDE.md - Detailed implementation

4. **Common fixes:**
   - Restart servers
   - Clear browser cache
   - Re-run database migrations
   - Verify all dependencies installed

---

**Congratulations!** You've completed the detailed setup. Your AB testing tool should now be running and ready to use! 🎉
