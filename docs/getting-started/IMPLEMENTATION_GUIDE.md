# Implementation Guide - Step by Step

This guide walks you through implementing the AB testing tool from scratch.

## Phase 1: Setup and Configuration

### Step 1: Environment Setup

1. **Install Dependencies**
   ```bash
   npm install
   cd frontend && npm install
   ```

2. **Configure Environment Variables**
   - Copy `.env.example` to `.env`
   - Fill in your Shopify API credentials
   - Set up database connection string
   - Configure Redis URL

3. **Set Up Database**
   ```bash
   # Create PostgreSQL database
   createdb shopify_ab_testing
   
   # Run migrations
   npm run migrate
   ```

### Step 2: Shopify App Setup

1. **Create Shopify App**
   - Go to [Shopify Partner Dashboard](https://partners.shopify.com)
   - Create a new app
   - Note your API Key and Secret

2. **Configure App Settings**
   - Set App URL: `http://localhost:3000`
   - Set Allowed redirection URL(s): `http://localhost:3000/auth/callback`
   - Request scopes: `read_products`, `write_products`, `read_orders`, `write_orders`

3. **Install Shopify CLI**
   ```bash
   npm install -g @shopify/cli @shopify/theme
   ```

## Phase 2: Backend Implementation

### Step 3: Database Schema

The database schema is defined in `backend/migrations/001_initial_schema.sql`. Run it:

```bash
npm run migrate
```

This creates:
- `tests` table: Stores test configurations
- `test_assignments` table: Tracks user-to-variant assignments
- `events` table: Stores conversion events

### Step 4: Core Services

The core services are already implemented:

1. **AB Test Engine** (`backend/src/services/abTestEngine.js`)
   - Handles variant selection
   - Manages test lifecycle
   - Validates test configurations

2. **Traffic Allocator** (`backend/src/services/trafficAllocator.js`)
   - Distributes traffic evenly
   - Uses consistent hashing

3. **Analytics Service** (`backend/src/services/analytics.js`)
   - Calculates conversion rates
   - Computes statistical significance
   - Measures revenue impact

4. **Shopify Service** (`backend/src/services/shopifyService.js`)
   - Integrates with Shopify APIs
   - Updates products/prices
   - Handles webhooks

### Step 5: API Endpoints

The API routes are implemented:

- `POST /api/tests` - Create test
- `GET /api/tests` - List tests
- `GET /api/tests/:id` - Get test details
- `PUT /api/tests/:id` - Update test
- `DELETE /api/tests/:id` - Delete test
- `POST /api/tests/:id/start` - Start test
- `POST /api/tests/:id/stop` - Stop test
- `GET /api/analytics/tests/:id` - Get analytics
- `POST /api/track` - Track conversion
- `GET /api/track/variant` - Get user's variant

### Step 6: Start Backend Server

```bash
npm run dev:backend
```

The server will run on `http://localhost:3000`

## Phase 3: Frontend Implementation

### Step 7: Frontend Setup

1. **Install Frontend Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start Frontend Dev Server**
   ```bash
   npm run dev
   ```

The frontend will run on `http://localhost:3001`

### Step 8: Frontend Components

Components are implemented:

1. **Dashboard** - Lists all tests
2. **Test Creator** - Wizard for creating tests
3. **Test Detail** - View and manage individual tests
4. **Analytics** - View test results and statistics

### Step 9: Shopify App Bridge Integration

To integrate with Shopify Admin:

1. **Install App Bridge**
   ```bash
   cd frontend
   npm install @shopify/app-bridge @shopify/app-bridge-react
   ```

2. **Update App.jsx** to use App Bridge Provider:
   ```jsx
   import { Provider } from '@shopify/app-bridge-react';
   
   function App() {
     const config = {
       apiKey: process.env.SHOPIFY_API_KEY,
       host: new URLSearchParams(window.location.search).get('host'),
       forceRedirect: true
     };
     
     return (
       <Provider config={config}>
         {/* Your app */}
       </Provider>
     );
   }
   ```

## Phase 4: Storefront Integration

### Step 10: Theme App Extension

Create a theme app extension to inject the tracking script:

1. **Create Extension Directory**
   ```bash
   mkdir -p shopify/extensions/ab-test-tracker
   ```

2. **Create `shopify/extensions/ab-test-tracker/snippets/ab-test-tracker.liquid`**
   ```liquid
   <script src="{{ 'storefront-script.js' | asset_url }}" defer></script>
   ```

3. **Add to Theme**
   - In your theme's `theme.liquid`, add:
   ```liquid
   {% render 'ab-test-tracker' %}
   ```

### Step 11: App Proxy Setup

Set up an app proxy to serve the tracking script:

1. **Create Proxy Route** in your Shopify app settings
   - Subpath prefix: `apps`
   - Subpath: `ab-test`
   - Proxy URL: `https://your-app-url.com/api/proxy`

2. **Implement Proxy Handler** in `backend/src/routes/proxyRoutes.js`

## Phase 5: Testing

### Step 12: Create Your First Test

1. Start both servers:
   ```bash
   npm run dev
   ```

2. Navigate to your app in Shopify Admin

3. Click "Create Test"

4. Fill in test details:
   - Name: "Product Price Test"
   - Type: "Price"
   - Target: Product ID
   - Variants:
     - Control: $29.99 (50%)
     - Variant A: $24.99 (50%)

5. Click "Create Test"

6. Start the test

### Step 13: Verify Storefront Integration

1. Visit your storefront
2. Check browser console for tracking script
3. Verify variant assignment in cookies
4. Complete a test purchase
5. Check analytics dashboard for conversion data

## Phase 6: Advanced Features

### Step 14: Add More Test Types

Extend the system to support:

1. **Content Testing**
   - Modify product descriptions
   - Test different images
   - A/B test headlines

2. **Shipping Testing**
   - Test different shipping rates
   - Test free shipping thresholds

3. **Theme Testing**
   - Test different theme variants
   - Test layout changes

### Step 15: Enhanced Analytics

Add:

1. **Real-time Updates**
   - WebSocket connections
   - Live dashboard updates

2. **Advanced Metrics**
   - Revenue per visitor
   - Customer lifetime value
   - Segment analysis

3. **Export Reports**
   - CSV export
   - PDF reports
   - Email summaries

## Phase 7: Deployment

### Step 16: Production Setup

1. **Hosting**
   - Deploy backend to Heroku/AWS/DigitalOcean
   - Deploy frontend to Vercel/Netlify
   - Set up PostgreSQL database
   - Configure Redis

2. **Environment Variables**
   - Update all URLs to production
   - Set secure JWT secret
   - Configure production database

3. **Shopify App Store**
   - Complete app listing
   - Add screenshots
   - Write documentation
   - Submit for review

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check DATABASE_URL in .env
   - Verify PostgreSQL is running
   - Check database permissions

2. **Shopify API Errors**
   - Verify API credentials
   - Check OAuth flow
   - Ensure scopes are correct

3. **Frontend Not Loading**
   - Check Vite dev server
   - Verify proxy configuration
   - Check browser console for errors

4. **Tracking Not Working**
   - Verify storefront script is loaded
   - Check API endpoint URLs
   - Verify CORS settings

## Next Steps

1. **Add Authentication**
   - Implement proper Shopify OAuth
   - Add session management
   - Secure API endpoints

2. **Add Webhooks**
   - Listen for order events
   - Auto-track conversions
   - Sync product data

3. **Add Targeting**
   - Geographic targeting
   - Device targeting
   - Customer segment targeting

4. **Add Notifications**
   - Email alerts for test results
   - Slack integration
   - Dashboard notifications

5. **Add Multi-variate Testing**
   - Support for more than 2 variants
   - Factorial designs
   - Interaction effects

## Resources

- [Shopify App Development Docs](https://shopify.dev/docs/apps)
- [Shopify Admin API](https://shopify.dev/docs/api/admin)
- [Shopify Polaris](https://polaris.shopify.com)
- [AB Testing Best Practices](https://www.optimizely.com/optimization-glossary/ab-testing/)

