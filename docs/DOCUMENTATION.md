# RipX Complete Documentation

**Version 1.0.0** | Professional A/B Testing Platform for Shopify and Standalone Sites

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Dashboard](#3-dashboard)
4. [Tests](#4-tests)
5. [Test Wizard](#5-test-wizard)
6. [Analytics](#6-analytics)
7. [Heatmap & Funnel](#7-heatmap--funnel)
8. [Settings](#8-settings)
9. [Integrations (GA4, BigQuery)](#9-integrations-ga4-bigquery)
10. [Promo Links](#10-promo-links)
11. [Export](#11-export)
12. [API Reference](#12-api-reference)
13. [Storefront Integration](#13-storefront-integration)
14. [Multi-Platform](#14-multi-platform)

---

## 1. Overview

RipX is an enterprise-grade A/B testing platform that supports **Shopify** and **standalone** (non-Shopify) e-commerce sites. Run price tests, content experiments, shipping tests, and promotional offers with statistical rigor.

### Key Capabilities

- **8 Test Types**: Price, Onsite Edit, Split URL, Template, Theme, Shipping, Offer, Checkout
- **Multi-Variant**: A/B, A/B/C, and multivariate tests with custom traffic allocation
- **Statistical Engine**: Z-test, p-value, confidence intervals, sample size calculator
- **Advanced Analytics**: Time-series, funnel, heatmap, event explorer
- **Integrations**: GA4, BigQuery, outbound webhooks
- **Targeting**: Device, country, customer segment, custom rules

---

## 2. Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- Shopify Partner account (for Shopify) OR API key (for standalone)

### Installation

```bash
git clone <repo>
cd RipX
npm install
cp .env.example .env
# Edit .env with credentials
npm run migrate
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT tokens |
| `APP_URL` | Yes | Base URL (e.g. https://your-app.com) |
| `SHOPIFY_API_KEY` | Shopify | From Partner Dashboard |
| `SHOPIFY_API_SECRET` | Shopify | From Partner Dashboard |
| `SHOPIFY_SCOPES` | Shopify | OAuth scopes |
| `GA4_MEASUREMENT_ID` | Optional | For GA4 event forwarding |
| `GA4_API_SECRET` | Optional | GA4 Measurement Protocol secret |
| `GCP_PROJECT_ID` | Optional | For BigQuery export |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional | Path to GCP service account JSON |

---

## 3. Dashboard

The Dashboard provides an overview of all tests and key metrics.

### Features

- **Quick Stats**: Total tests, running tests, completed tests
- **Progress Ring**: Visual indicator of active test health
- **Quick Start**: One-click creation for Price, Content, Shipping, Offer tests
- **Recent Tests**: List of latest tests with status badges
- **Tips**: Contextual tips for running effective experiments

### Navigation

- **Dashboard** (`/`) – Home
- **All Tests** (`/tests`) – Test list with filters
- **Create Test** (`/tests/new`) – Test wizard
- **Analytics** (`/analytics`) – Cross-test analytics

---

## 4. Tests

### Test Lifecycle

1. **Draft** – Created but not started
2. **Running** – Active, collecting data
3. **Stopped** – Manually stopped
4. **Completed** – Reached end date or auto-stopped

### Test Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Price** | Test product/collection prices | Find optimal pricing |
| **Onsite Edit** | Edit/hide DOM elements | CTA text, images |
| **Split URL** | Test alternate URLs | Landing pages |
| **Template** | Compare templates | Theme sections |
| **Theme** | Full theme test | Redesigns |
| **Shipping** | Shipping rates/thresholds | Free shipping tests |
| **Offer** | Discounts, promos | Conversion boosts |
| **Checkout** | Checkout customizations | Friction reduction |

### Traffic Allocation

- Drag sliders to set variant percentages
- Holdout group: exclude % of traffic from test
- Equal split button for 50/50
- Minimum 1% per variant
- **Add/Remove variants**: Dynamically add or remove variants; changes persist on save

### Variant Display & Data Flow

RipX ensures variant counts and configurations display correctly across all views:

| View | Source | Behavior |
|------|--------|----------|
| **List** | `GET /api/tests` | Each test includes `variant_count`; uses `getVariantCount()` for display |
| **Detail** | `GET /api/tests/:id` or placeholder from navigation | Refetches on mount; uses `listTest`/`createdTest` as placeholder when navigating |
| **Wizard** | `initialData` from parent | Syncs from server when variant count differs; remounts on count change |

**Navigation flow:**
- **List → Detail**: Passes `listTest` in state; shows immediately while refetch runs
- **Create/Clone → Detail**: Pre-populates cache; navigates with `createdTest`; no loading flash
- **Save**: Updates cache from response; invalidates queries; wizard remounts with new key

**Test type display:** Uses `goal.template_key` when variant config is empty (e.g. new onsite-edit tests show "Onsite Edit" not "Theme").

---

## 5. Test Wizard

The Test Wizard guides you through creating a test in steps.

### Steps

**With template selection:**
1. **Select Test Type** – Choose a test template (Price, Content, Shipping, etc.)
2. **Traffic Allocation** – Set traffic distribution across variants
3. **Targeting & Segmentation** – Scope (where), device, audience (who), holdout — dedicated full step
4. **Goal & Metrics** – Primary goal (conversion, revenue, AOV), conversion window, statistical design — dedicated full step
5. **Variant Configuration** – Configure each variant (code, URLs, prices, etc.)
6. **Review & Create** – Summary and launch

**Without template (edit mode):**
1. **Traffic Allocation** – Set traffic distribution
2. **Targeting & Segmentation** – Scope, device, audience, holdout
3. **Goal & Metrics** – Primary goal and conversion settings
4. **Variant Configuration** – Configure variants
5. **Review & Save** – Summary and save

### Goal Types

- **Revenue** – Total sales (with optional COGS for profit tracking)
- **Conversion** – Purchase rate / count of goal events
- **AOV** – Average order value
- **Secondary events** – Optional: add to cart, newsletter signup, custom events

### Targeting Options

- **Device**: All, desktop, mobile, tablet
- **Customer**: All, new, returning
- **Countries**: Whitelist or blacklist
- **Presets**: Save targeting for reuse

---

## 6. Analytics

### Test Analytics

Per-test analytics include:

- **Variant Metrics**: Visitors, conversions, conversion rate, revenue, AOV
- **Statistical Significance**: p-value, confidence, lift, winner
- **Time Series**: Performance over time
- **Segmentation**: Filter by device, country

### Tabs

- **Overview** – Key metrics and charts
- **Funnel** – Conversion funnel by step
- **Heatmap** – Click and scroll heatmaps
- **Events** – Event explorer and custom events

### Metrics Explained

- **p-value**: Probability the observed difference is due to chance. &lt; 0.05 = significant.
- **Confidence**: 1 − p-value, expressed as %. 95%+ = strong evidence.
- **Lift**: % improvement of winner over control.

---

## 7. Heatmap & Funnel

### Heatmap

- **Click Heatmap**: 10×10 grid of click density per page/variant
- **Scroll Heatmap**: Scroll depth distribution (0–100%)
- **Filters**: Page URL, variant, date range
- **Data**: Auto-captured by storefront script

### Funnel

- **Default Steps**: Visitors → Add to Cart → Purchase
- **Custom Steps**: Define in test goal `funnel_steps`
- **Segmentation**: Device, country
- **Compare Mode**: Single variant vs compare

---

## 8. Settings

Configure installation, test defaults, integrations, appearance, and targeting presets. See [Settings Guide](./guides/SETTINGS_GUIDE.md) for full documentation.

### Installation Tab

- **Storefront Snippet**: Copy and add to site `<head>`
- **Script URL**: Alternative single-script installation
- **Setup Wizard**: Guided setup for Shopify stores

### General Tab

- **Minimum Sample Size** (10–10,000): Visitors before showing results
- **Confidence Level** (0.8–1): Statistical threshold (0.95 = 95%)
- **Auto-stop**: Stop tests when significance reached
- **Webhooks**: URL and event triggers (test_complete, significance)

### Integrations Tab

- **GA4**: Status, config hint
- **BigQuery**: Status, incremental/full export buttons
- **Refresh**: Reload integration status

### Appearance Tab

- **Theme**: Light, Dark, or Auto (by time of day). Changes apply immediately.

### Targeting Presets Tab

- Save targeting configurations for reuse
- Delete presets from list
- Create presets in Test Wizard

---

## 9. Integrations (GA4, BigQuery)

### GA4

1. GA4 Admin → Data Streams → Measurement Protocol API secrets
2. Create secret, add to `.env`:
   - `GA4_MEASUREMENT_ID=G-XXXXXXXXXX`
   - `GA4_API_SECRET=your_secret`
3. Events forwarded with `ab_test_id`, `ab_variant_id`, `ab_shop` user properties

### BigQuery

1. Create GCP project, enable BigQuery
2. Service account with BigQuery Data Editor
3. Add to `.env`:
   - `GCP_PROJECT_ID=your-project`
   - `GCP_DATASET=ripx_analytics`
   - `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`
4. Create tables: `backend/docs/bigquery_schema.sql`
5. Export via Settings → Integrations or `POST /api/analytics/bigquery/export`

### Tables Exported

| Table | Type | Description |
|-------|------|-------------|
| events | Incremental | Conversion, view, click, custom events |
| heatmap_events | Incremental | Click/scroll data |
| tests | Full only | Test snapshots |

---

## 10. Promo Links

Create shareable links that apply discounts without promo codes.

- **Per-test promo links**: Each variant can have a promo link
- **No code required**: Link applies discount automatically
- **Usage limits**: Optional per-link limits
- **Track conversions**: Via link attribution

---

## 11. Export

### Report Export

- **Format**: CSV or JSON
- **Date Range**: All time, 7/30/90 days
- **Contents**: Test info, variant metrics, significance, funnel
- **Endpoint**: `GET /api/analytics/tests/:id/export?format=csv`

### BigQuery Export

- **Incremental**: New events since last export
- **Full**: Events + tests snapshot
- **Trigger**: Settings UI or API

---

## 12. API Reference

### Health Check (unauthenticated)

| Method | Endpoint | Description |
|--------|----------|--------------|
| GET | `/health` | Health status (status, db, timestamp) |
| GET | `/api/health` | Same as above (for API consistency) |

Response: `{ "status": "ok"|"degraded", "timestamp": "...", "db": "ok"|"error" }`

### Authentication

- **Shopify**: `?shop=xxx.myshopify.com` or `X-Shopify-Shop-Domain`
- **Standalone**: `X-RipX-API-Key` or `Authorization: Bearer <api_key>`

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tests` | List tests |
| POST | `/api/tests` | Create test |
| GET | `/api/tests/:id` | Get test |
| PUT | `/api/tests/:id` | Update test |
| POST | `/api/tests/:id/start` | Start test |
| POST | `/api/tests/:id/stop` | Stop test |
| GET | `/api/analytics/tests/:id` | Test analytics |
| POST | `/api/track` | Track event |
| POST | `/api/track/heatmap` | Heatmap events |
| GET | `/api/track/script.js` | Storefront script |
| GET | `/api/settings` | Get settings |
| PUT | `/api/settings` | Update settings |

Full API docs: `/api-docs` (Swagger UI)

---

## 13. Storefront Integration

### Script Loading

**Shopify:**
```html
<script src="https://your-app.com/api/track/script.js?shop=your-shop.myshopify.com"></script>
```

**Standalone:**
```html
<script src="https://your-app.com/api/track/script.js?site=example.com"></script>
```

### Track Conversion

```javascript
// Via storefront script (automatic for Shopify orders)
// Or manual:
fetch('/api/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    test_id: 'uuid',
    user_id: 'user_xxx',
    shop_domain: 'your-shop.myshopify.com',
    event_type: 'conversion',
    event_value: 99.99,
    event_name: 'purchase', // optional
    metadata: {} // optional
  })
});
```

### Heatmap

Click and scroll events are captured automatically when the script is loaded. No extra code needed.

---

## 14. Multi-Platform

### Shopify

- OAuth install flow
- Shop domain from install
- Webhooks for orders, products, app uninstall
- App embed + app proxy for storefront script

### Standalone

1. Register: `POST /api/tenants/standalone` with `{ "domain": "example.com" }`
2. Receive API key in response
3. Add script: `?site=example.com`
4. Admin: Enter API key at `/connect` or set `VITE_RIPX_API_KEY`

---

## Support

- **Docs**: `docs/` folder
- **API Docs**: `/api-docs` in running app
- **Integrations**: `docs/INTEGRATIONS.md`
- **Troubleshooting**: `CURSOR_TROUBLESHOOTING.md`
