# RipX 🧪

**Professional AB Testing Platform for Shopify Stores**

RipX is a comprehensive, enterprise-grade AB testing platform designed specifically for Shopify merchants. Test product prices, content, shipping rates, and promotional offers to optimize conversion rates and maximize revenue.

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

4. **Shipping Rate Testing**
   - Dynamic shipping rate modifications
   - Threshold testing
   - Conversion impact analysis
   - Free shipping threshold experiments

5. **Offer Testing**
   - Promo Links (no promo codes needed)
   - Discount testing (percentage and fixed)
   - Time-limited offers
   - Usage limits per link

6. **Combination Testing** 🆕
   - Test multiple variables together (e.g., price + shipping)
   - Interaction effect analysis
   - Variable impact analysis
   - Full factorial designs

7. **Analytics & Reporting**
   - Real-time conversion tracking
   - Statistical significance calculations (Z-test)
   - Revenue impact analysis
   - Exportable reports (CSV, JSON)
   - Custom metrics support
   - Profit calculations with COGS
   - Custom event tracking

8. **Targeting & Segmentation** 🆕
   - Geographic targeting (country, region, city)
   - Device type targeting (desktop, mobile, tablet)
   - Customer segment targeting (new, returning, VIP)
   - Time-based targeting (time of day, day of week)
   - Custom targeting rules

9. **Webhooks Integration** 🆕
   - Automatic order tracking
   - Real-time conversion events
   - Product update synchronization
   - App uninstall handling

10. **Notifications** 🆕
    - Email notifications for test completion
    - Significance alerts
    - In-app notifications
    - Customizable notification preferences

11. **Advanced Features** 🆕
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
│  │      Database (PostgreSQL/MongoDB)    │  │
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
- **Database**: PostgreSQL (or MongoDB)
- **Shopify Integration**: Shopify Admin API, Storefront API
- **Session Management**: Redis (for traffic allocation)
- **Analytics**: Custom tracking + Shopify Analytics API

## 🚀 Getting Started

### Prerequisites

1. **Shopify Partner Account**
   - Sign up at [partners.shopify.com](https://partners.shopify.com)
   - Create a development store

2. **Development Tools**
   - Node.js 18+ and npm
   - Shopify CLI: `npm install -g @shopify/cli @shopify/theme`
   - PostgreSQL (or MongoDB)
   - Redis (for session management)

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

3. **Database Setup**
   ```bash
   # PostgreSQL
   createdb shopify_ab_testing
   npm run migrate
   
   # Or MongoDB
   mongod
   ```

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Install App in Development Store**
   ```bash
   shopify app dev
   ```

## 📁 Project Structure

```
shopify-ab-testing-app/
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

## 📚 Documentation

All project documentation has been organized into the [`docs/`](./docs/) folder for easy navigation:

- **[📖 Documentation Index](./docs/README.md)** - Complete documentation guide
- **[🚀 Getting Started](./docs/getting-started/)** - Setup and installation guides
- **[🏗️ Architecture](./docs/architecture/)** - System design and structure
- **[💻 Development](./docs/development/)** - Development guides and standards
- **[✨ Features](./docs/features/)** - Feature documentation and roadmap
- **[📊 Reports](./docs/reports/)** - Status reports and summaries
- **[🚢 Deployment](./docs/deployment/)** - Deployment guides
- **[📝 Other](./docs/other/)** - Additional resources

### Quick Links

- [Quick Start Guide](./docs/getting-started/QUICK_START.md) - Get started in 5 minutes
- [Development Guide](./docs/development/DEVELOPMENT_GUIDE.md) - Development workflow
- [Code Standards](./docs/development/CODE_STANDARDS.md) - Coding conventions
- [API Documentation](./docs/architecture/API_DOCUMENTATION.md) - API reference
- [Deployment Guide](./docs/deployment/DEPLOYMENT.md) - Production deployment

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
   - Redis: Redis Cloud or AWS ElastiCache

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

MIT License - feel free to use this as a starting point for your own AB testing tool.

## 🤝 Contributing

This is a template/starting point. Customize it based on your specific needs and requirements.

---

**Note**: This is a comprehensive guide and starting point. You'll need to implement the actual code based on your specific requirements and business logic.

