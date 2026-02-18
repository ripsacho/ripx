# Quick Start Guide

Get your AB testing tool up and running in 15 minutes!

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] PostgreSQL installed and running
- [ ] Shopify Partner account
- [ ] Development store created

## Step 1: Install Dependencies (2 minutes)

```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

## Step 2: Configure Environment (3 minutes)

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   SHOPIFY_API_KEY=your_api_key
   SHOPIFY_API_SECRET=your_api_secret
   DATABASE_URL=postgresql://user:password@localhost:5432/shopify_ab_testing
   ```

## Step 3: Set Up Database (2 minutes)

```bash
# Create database
createdb shopify_ab_testing

# Run migrations
npm run migrate
```

## Step 4: Start Development Servers (1 minute)

```bash
# Start both backend and frontend
npm run dev
```

This will start:
- Backend API on `http://localhost:3000`
- Frontend on `http://localhost:3001`

## Step 5: Create Your First Test (5 minutes)

1. **Open your app** (integrate with Shopify Admin or access directly)

2. **Click "Create Test"**

3. **Fill in test details:**
   - Name: "My First Price Test"
   - Type: "Price"
   - Target ID: A product ID from your store
   - Control Price: $29.99
   - Variant A Price: $24.99

4. **Click "Create Test"**

5. **Start the test** by clicking "Start Test"

## Step 6: Verify It's Working (2 minutes)

1. **Check the dashboard** - Your test should appear
2. **View test details** - Click on your test
3. **Check analytics** - Navigate to analytics (will show data after visitors)

## Troubleshooting

### "Cannot connect to database"
- Make sure PostgreSQL is running: `pg_isready`
- Check your DATABASE_URL in `.env`
- Verify database exists: `psql -l | grep shopify_ab_testing`

### "Shopify API errors"
- Verify your API credentials in `.env`
- Check that your app is installed in your development store
- Ensure OAuth flow is configured correctly

### "Frontend not loading"
- Check that Vite dev server is running on port 3001
- Verify no port conflicts
- Check browser console for errors

## Next Steps

1. **Read the full README.md** for architecture details
2. **Check IMPLEMENTATION_GUIDE.md** for step-by-step implementation
3. **Integrate with Shopify Admin** using App Bridge
4. **Add storefront tracking** script to your theme
5. **Test with real traffic** on your development store

## Common Commands

```bash
# Development
npm run dev              # Start both servers
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only

# Database
npm run migrate          # Run migrations

# Production
npm run build            # Build frontend
npm start                # Start production server
```

## Getting Help

- Check the main README.md for detailed documentation
- Review IMPLEMENTATION_GUIDE.md for implementation details
- Check Shopify Dev Docs: https://shopify.dev/docs/apps

## What's Next?

Once you have the basic setup working:

1. ✅ **Integrate Shopify OAuth** - Proper authentication
2. ✅ **Add storefront script** - Track conversions
3. ✅ **Set up webhooks** - Auto-track orders
4. ✅ **Add more test types** - Content, shipping, offers
5. ✅ **Deploy to production** - Make it live!

Happy testing! 🚀

