# RipX 🧪

**Professional AB Testing Platform for Shopify and Standalone Sites**

[![CI](https://github.com/your-org/ripx/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/ripx/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RipX is a comprehensive, enterprise-grade AB testing platform supporting **Shopify** and **standalone** (non-Shopify) sites. One backend, one engine, multiple platforms. Test product prices, content, shipping rates, and promotional offers to optimize conversion rates and maximize revenue.

> **RipX** - Where data-driven decisions meet e-commerce excellence.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Features](#features)
4. [Project Structure](#project-structure)
5. [Documentation](#documentation)
6. [Development](#development)
7. [Deployment](#deployment)

## 🎯 Overview

RipX empowers Shopify merchants to:

- **Test Product Prices**: Run price experiments to find optimal pricing strategies
- **Test Content**: Experiment with themes, landing pages, and UX elements
- **Test Shipping Rates**: Optimize shipping thresholds and rates
- **Test Offers**: Create and test promotional offers without promo codes
- **Analytics Dashboard**: View real-time test results and statistical significance

## ✨ Features

### Core Features

1. **Multi-Variant Testing**
   - Support for A/B, A/B/C, and multivariate tests
   - Draggable traffic allocation slider (Intelligems-style)
   - Equal split button for instant 50/50 distribution
   - Add/remove variants dynamically
   - Custom code editor for each variant
   - Automatic traffic splitting with cookie-based persistence
   - Consistent hashing for reliable variant assignment

2. **Comprehensive Test Types** (8 Types)
   - **Pricing**: Test price points on products/collections
   - **Onsite Edit**: Edit/hide page elements without theme changes
   - **Split URL**: Test alternate URLs
   - **Template**: Compare different templates
   - **Theme**: Test theme redesigns
   - **Shipping**: Test shipping rates and thresholds
   - **Offer**: Test discounts and promotions
   - **Checkout**: Test checkout customizations

3. **Advanced Analytics**
   - Real-time dashboard with live metrics
   - Time-series analytics (performance over time)
   - Statistical significance (Z-test, p-value, confidence intervals)
   - Test health score system
   - Sample size calculator
   - Revenue impact analysis
   - Conversion rate tracking

4. **User Experience**
   - Collapsible sidebar navigation
   - Top bar with user menu
   - Intelligems-style modern UI
   - 5-step test creation wizard
   - Test type selection as first step
   - Visual traffic allocation
   - Test cloning functionality
   - Headline and description variations

5. **Shipping Rate Testing**
   - Dynamic shipping rate modifications
   - Threshold testing
   - Conversion impact analysis
   - Free shipping threshold experiments

6. **Offer Testing**
   - Promo Links (no promo codes needed)
   - Discount testing (percentage and fixed)
   - Time-limited offers
   - Usage limits per link

7. **Combination Testing** 🆕
   - Test multiple variables together (e.g., price + shipping)
   - Interaction effect analysis
   - Variable impact analysis
   - Full factorial designs

8. **Analytics & Reporting**
   - Real-time conversion tracking
   - Statistical significance calculations (Z-test)
   - Revenue impact analysis
   - Exportable reports (CSV, JSON)
   - Custom metrics support
   - Profit calculations with COGS
   - Custom event tracking

9. **Targeting & Segmentation** 🆕
   - Geographic targeting (country, region, city)
   - Device type targeting (desktop, mobile, tablet)
   - Customer segment targeting (new, returning, VIP)
   - Time-based targeting (time of day, day of week)
   - Custom targeting rules

10. **Webhooks Integration** 🆕
    - Automatic order tracking
    - Real-time conversion events
    - Product update synchronization
    - App uninstall handling

11. **Notifications** 🆕
    - Email notifications for test completion
    - Significance alerts
    - In-app notifications
    - Customizable notification preferences

12. **Advanced Features** 🆕
    - Custom metrics (beyond revenue/conversion)
    - COGS (Cost of Goods Sold) integration
    - Custom formula calculations
    - Export functionality
    - API-first architecture
    - Docker support
    - Comprehensive logging

## 🏗️ Architecture

### System Architecture

```
┌─────────────────┐
│  Shopify Store  │
└────────┬────────┘
         │
         │ (Shopify API)
         │
┌────────▼─────────────────────────────────────┐
│         AB Testing App Backend               │
│  ┌──────────────┐  ┌─────────────────────┐  │
│  │  API Server  │  │  Test Engine        │  │
│  │  (Express)   │  │  (Traffic Split)    │  │
│  └──────┬───────┘  └──────────┬──────────┘  │
│         │                     │              │
│  ┌──────▼─────────────────────▼──────────┐  │
│  │      Database (PostgreSQL)            │  │
│  │  - Tests, Variants, Analytics         │  │
│  └───────────────────────────────────────┘  │
└────────┬────────────────────────────────────┘
         │
         │ (REST/GraphQL)
         │
┌────────▼────────┐
│  React Frontend │
│  (Shopify Admin)│
└─────────────────┘
```

### Technology Stack

- **Backend**: Node.js + Express.js
- **Frontend**: React + Shopify Polaris
- **Database**: PostgreSQL
- **Shopify Integration**: Shopify Admin API, Storefront API
- **Session Management**: Redis (optional; in-memory fallback when not set)
- **Analytics**: Custom tracking + Shopify Analytics API

## 🚀 Getting Started

### Prerequisites

1. **Shopify Partner Account**
   - Sign up at [partners.shopify.com](https://partners.shopify.com)
   - Create a development store

2. **Development Tools**
   - Node.js 18+ and npm
   - Shopify CLI: `npm install -g @shopify/cli @shopify/theme`
   - PostgreSQL
   - Redis (optional; for session store)

3. **Shopify App Setup**
   - Create a new app in your Partner Dashboard
   - Note your API credentials (API Key, API Secret)

### Installation Steps

1. **Clone and Install Dependencies**

   ```bash
   cd /Users/m.a.k.ripon/Desktop/DEV
   npm install
   ```

2. **Environment Configuration**

   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

   Required env vars:
   - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_SCOPES`
   - `APP_URL`, `DATABASE_URL`, `JWT_SECRET` (use 32+ char random string; `openssl rand -hex 32`)
     Optional:
   - `SHOPIFY_ACCESS_TOKEN` (dev fallback only; not used in production)
   - `REDIS_URL` (session store; memory used if not set)
   - `SESSION_SECRET` (defaults to JWT_SECRET)
   - `SENTRY_DSN` (error reporting; scaffolded for future use)
   - `LOG_TRACK_EVENTS=true` (verbose AB test tracking logs)

3. **Database Setup**

   Option A – Local PostgreSQL:
   ```bash
   createdb shopify_ab_testing
   npm run migrate
   ```

   Option B – Docker (Postgres + Redis):
   ```bash
   npm run dev:db
   # Then in .env: DATABASE_URL=postgresql://ripx:ripx@localhost:5432/ripx_dev
   # And: REDIS_URL=redis://localhost:6379
   npm run migrate
   # To stop: npm run dev:db:stop
   ```

4. **Start Development Server**

   ```bash
   npm run dev
   ```

5. **Install App in Development Store**
   ```bash
   shopify app dev
   ```

### Connect to Shopify Partner App

1. Install Shopify CLI: `npm install -g @shopify/cli`
2. Link config to your Partner app:
   ```bash
   shopify app config link
   ```
3. Start the dev tunnel and install:
   ```bash
   shopify app dev
   ```
   Then open the install URL shown in the CLI.

### Shopify OAuth & Webhooks

- Start OAuth install by navigating to: `https://YOUR_APP_URL/api/auth?shop=your-shop.myshopify.com`
- OAuth stores access tokens in `shop_sessions`; no SHOPIFY_ACCESS_TOKEN in production.
- Configure Shopify webhooks (HMAC-verified, idempotent) at:
  - `POST /api/webhooks/orders/create`
  - `POST /api/webhooks/products/update`
  - `POST /api/webhooks/app/uninstalled`

### Storefront Script

- Use the configured script endpoint (includes runtime config):
  - `GET /api/track/script.js?shop=your-shop.myshopify.com&v=1`
- This script handles variant assignment and conversion tracking on the storefront.

### App Embed + App Proxy (Recommended)

1. Configure App Proxy in the Partner Dashboard:
   - Subpath prefix: `apps`
   - Subpath: `ripx`
   - Proxy URL: `https://YOUR_APP_URL/api/proxy/script.js`
2. Deploy the theme app extension and enable **RipX App Embed** in the theme editor.
3. The storefront will load:
   - `https://your-shop-domain/apps/ripx/script.js?v=1`

### Smoke Test Checklist

- **OAuth**: Install completes and redirects back; token stored in `shop_sessions`.
- **Storefront script**: `GET /api/track/script.js?shop=...&v=1` loads with runtime config (`apiUrl`, `activeTests`).
- **Webhooks**: Accept HMAC-signed requests; dedupe via `webhook_events` table; return 200 on duplicate.
- **Analytics**: Conversion events tracked via `POST /api/track`; webhook conversions logged when `LOG_TRACK_EVENTS=true`.

## 📁 Project Structure

See [Project Organization](./docs/guides/PROJECT_ORGANIZATION.md) for detailed structure and conventions.

```
ripx/
├── backend/
│   ├── src/
│   │   ├── controllers/      # Request handlers
│   │   ├── models/           # Database models
│   │   ├── services/         # Business logic
│   │   │   ├── abTestEngine.js    # Core AB testing logic
│   │   │   ├── trafficAllocator.js # Traffic splitting
│   │   │   ├── analytics.js       # Analytics calculations
│   │   │   └── shopifyService.js  # Shopify API integration
│   │   ├── middleware/       # Express middleware
│   │   ├── routes/          # API routes
│   │   ├── utils/           # Utility functions
│   │   └── app.js           # Express app setup
│   ├── migrations/          # Database migrations
│   └── tests/               # Backend tests
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── Dashboard/
│   │   │   ├── TestCreator/
│   │   │   ├── TestList/
│   │   │   ├── Analytics/
│   │   │   └── Settings/
│   │   ├── hooks/           # Custom React hooks
│   │   ├── utils/           # Frontend utilities
│   │   └── App.jsx          # Main app component
│   └── public/
├── shopify/
│   ├── app.liquid          # Shopify app embed
│   └── theme-extensions/   # Theme modifications
├── docs/                   # Additional documentation
├── .env.example
├── package.json
└── README.md
```

## 🔧 Core Components

### 1. AB Test Engine

The core engine that manages test execution:

- **Traffic Allocation**: Distributes visitors to variants using consistent hashing
- **Variant Selection**: Determines which variant a user sees
- **Session Persistence**: Ensures users see the same variant across sessions
- **Test Validation**: Ensures tests meet statistical requirements

### 2. Traffic Allocator

Handles visitor distribution:

- **Cookie-based Tracking**: Uses cookies to maintain variant assignment
- **Consistent Hashing**: Ensures even distribution
- **Traffic Splits**: Supports custom allocation percentages

### 3. Analytics Engine

Calculates test results:

- **Conversion Tracking**: Monitors goal completions
- **Statistical Significance**: Calculates p-values and confidence intervals
- **Revenue Impact**: Measures financial impact of variants
- **Real-time Updates**: Provides live test results

### 4. Shopify Integration Service

Manages Shopify API interactions:

- **Product Modifications**: Updates prices, descriptions, images
- **Theme Modifications**: Applies theme variants
- **Order Tracking**: Monitors conversions
- **Webhook Handling**: Processes Shopify events

## 🌐 Multi-Platform

RipX supports **Shopify** and **standalone** sites:

| Platform | Auth | Track Script |
|----------|------|--------------|
| **Shopify** | OAuth (shop install) | `?shop=xxx.myshopify.com` |
| **Standalone** | API key | `?site=example.com` |

**Standalone setup:**
1. Register: `POST /api/tenants/standalone` with `{ "domain": "example.com" }`
2. Add script: `<script src="https://your-api/api/track/script.js?site=example.com"></script>`
3. Open admin with API key: set `VITE_RIPX_API_KEY` or use `/connect` to enter it

See [Multi-Platform Architecture](./docs/architecture/MULTI_PLATFORM.md) for details.

## 📚 Documentation

All project documentation lives in [`docs/`](./docs/). Start with the [Documentation Index](./docs/README.md).

| Section | Description |
|---------|-------------|
| [Getting Started](./docs/getting-started/) | Setup, env, database, migrations |
| [Architecture](./docs/architecture/) | System design, API, multi-platform |
| [Development](./docs/development/) | Dev guide, code standards, structure assessment |
| [Features](./docs/features/) | Implementation status, roadmap |
| [Deployment](./docs/deployment/) | Production deployment |
| [Guides](./docs/guides/) | Branding, Git, assets |

## 📖 Implementation Guide

### Step 1: Database Schema

Create tables for:

- **Tests**: Test metadata (name, type, status, dates)
- **Variants**: Test variations (A, B, C, etc.)
- **Test Assignments**: User-to-variant mappings
- **Events**: Conversion events and interactions
- **Analytics**: Aggregated test results

### Step 2: Backend API

Implement REST endpoints:

- `POST /api/tests` - Create new test
- `GET /api/tests` - List all tests
- `GET /api/tests/:id` - Get test details
- `PUT /api/tests/:id` - Update test
- `DELETE /api/tests/:id` - Delete test
- `POST /api/tests/:id/start` - Start test
- `POST /api/tests/:id/stop` - Stop test
- `GET /api/tests/:id/analytics` - Get test analytics
- `POST /api/track` - Track conversion events

### Step 3: Frontend Components

Build React components:

- **Dashboard**: Overview of all tests
- **Test Creator**: Wizard for creating tests
- **Test Editor**: Modify existing tests
- **Analytics View**: Visualize test results
- **Settings**: App configuration

### Step 4: Shopify Integration

Implement:

- **App Proxy**: Serve test scripts to storefront
- **Theme App Extension**: Inject test code
- **Webhooks**: Listen for order events
- **Admin API**: Fetch/update store data

### Step 5: Testing Logic

Implement:

- **Variant Selection Algorithm**
- **Cookie Management**
- **Event Tracking**
- **Statistical Calculations**

## 📚 API Documentation

### Create Test

```http
POST /api/tests
Content-Type: application/json

{
  "name": "Product Price Test",
  "type": "price",
  "targetType": "product",
  "targetId": "123456789",
  "variants": [
    {
      "name": "Control",
      "allocation": 50,
      "config": {
        "price": 29.99
      }
    },
    {
      "name": "Variant A",
      "allocation": 50,
      "config": {
        "price": 24.99
      }
    }
  ],
  "goal": {
    "type": "conversion",
    "metric": "revenue"
  }
}
```

### Get Test Analytics

```http
GET /api/tests/:id/analytics

Response:
{
  "testId": "test_123",
  "status": "running",
  "startDate": "2024-01-01",
  "variants": [
    {
      "name": "Control",
      "visitors": 1000,
      "conversions": 50,
      "conversionRate": 5.0,
      "revenue": 1499.50,
      "avgOrderValue": 29.99
    },
    {
      "name": "Variant A",
      "visitors": 1000,
      "conversions": 75,
      "conversionRate": 7.5,
      "revenue": 1874.25,
      "avgOrderValue": 24.99
    }
  ],
  "statisticalSignificance": {
    "pValue": 0.02,
    "confidence": 98,
    "winner": "Variant A",
    "lift": 50
  }
}
```

## 🚢 Deployment

### Production Setup

1. **Hosting**
   - Backend: Heroku, AWS, or DigitalOcean
   - Database: Managed PostgreSQL (AWS RDS, Heroku Postgres)
   - Redis (optional): Redis Cloud or AWS ElastiCache

2. **Environment Variables**
   - `SHOPIFY_API_KEY`
   - `SHOPIFY_API_SECRET`
   - `DATABASE_URL`
   - `REDIS_URL`
   - `APP_URL`

3. **Shopify App Store Submission**
   - Complete app listing
   - Provide screenshots and documentation
   - Submit for review

### Security Considerations

- Use HTTPS for all communications
- Implement OAuth 2.0 for Shopify authentication
- Encrypt sensitive data
- Validate all user inputs
- Implement rate limiting
- Use secure session management

## 🔄 Next Steps

1. **Set up the project structure** (see project files)
2. **Configure your development environment**
3. **Implement core AB testing engine**
4. **Build the frontend dashboard**
5. **Integrate with Shopify APIs**
6. **Add analytics and reporting**
7. **Test thoroughly**
8. **Deploy to production**

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for guidelines.

---

**Note**: This is a comprehensive guide and starting point. You'll need to implement the actual code based on your specific requirements and business logic.
