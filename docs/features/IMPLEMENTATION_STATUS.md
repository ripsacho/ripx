# RipX Implementation Status

**Last updated:** February 2025

This document reviews features documented in the README against the actual codebase: what is implemented, what is not, and what cannot be implemented (and why).

---

## ✅ Implemented

### 1. Multi-Variant Testing
- **Status:** ✅ Implemented
- **Evidence:** `abTestEngine.js`, `trafficAllocator.js`, `TrafficAllocationSlider.jsx`, `TestWizard.jsx`
- Traffic allocation slider, add/remove variants, cookie-based persistence, consistent hashing, custom code editor per variant

### 2. Test Types (8 Types)
- **Status:** ✅ Implemented (UI + backend)
- **Evidence:** `TestWizard.jsx` (TEST_TEMPLATES), `testType.js` utils, `validators.js`
- Pricing, Onsite Edit, Split URL, Template, Theme, Shipping, Offer, Checkout — all selectable in wizard and stored correctly

### 3. Advanced Analytics
- **Status:** ✅ Implemented
- **Evidence:** `analytics.js`, `analyticsRoutes.js`, `Analytics.jsx`, `AnalyticsOverview.jsx`, `timeSeriesService.js`
- Real-time dashboard, time-series, Z-test/p-value, test health score, sample size calculator, revenue impact

### 4. User Experience
- **Status:** ✅ Implemented
- **Evidence:** `Sidebar.jsx`, `TopBar.jsx`, `TestWizard.jsx`, `TestList.jsx`, `TestDetail.jsx`
- Collapsible sidebar, top bar with user menu, 5-step wizard, traffic allocation UI, test cloning

### 5. Shipping Rate Testing
- **Status:** ⚠️ Partially implemented
- **Backend:** Test type and config (`rate` in variants) supported
- **Storefront:** No `applyShippingTest` logic — storefront only applies `price` and `customCode` tests
- **Why:** Dynamic shipping rate changes require Shopify Functions (Carrier Service API) or cart/checkout extensions; not achievable via storefront JS alone

### 6. Offer Testing (Promo Links)
- **Status:** ✅ Implemented
- **Evidence:** `promoLinkRoutes.js`, `promoLinkService.js`, `PromoLinks.jsx`, `promo_links` table
- Discount (percentage/fixed), expiry, max_uses; no promo codes needed

### 7. Analytics & Reporting
- **Status:** ✅ Implemented
- **Evidence:** `exportRoutes.js`, `exportService.js`, `Export.jsx`
- CSV and JSON export via `GET /api/analytics/tests/:id/export?format=csv|json`

### 8. Targeting & Segmentation
- **Status:** ✅ Implemented (backend + segments)
- **Evidence:** `targetingService.js`, `abTestEngine.isUserEligible`, `segments.js`, `TestWizard.jsx` (segments step)
- Device, customer (new/returning), countries, traffic_source, url_pattern, min_sessions
- `targetingService.js` has geographic/device/customer/time targeting; `abTestEngine` uses a simpler `segments` model (device, customer, countries, traffic_source, url_pattern, min_sessions)

### 9. Webhooks Integration
- **Status:** ✅ Implemented
- **Evidence:** `webhookRoutes.js`, `webhook_events` table
- `orders/create`, `products/update`, `app/uninstalled` — HMAC-verified, idempotent via `webhook_events`

### 10. Notifications
- **Status:** ✅ Implemented (in-app only)
- **Evidence:** `notificationRoutes.js`, `notificationService.js`, `TopBar.jsx`, `notifications` table
- In-app notifications, read/unread, mark-all-read; TopBar fetches and displays them

### 11. Advanced Features
- **Custom metrics:** `customMetricsService.js` — revenue, profit, conversion_rate, AOV, custom events, COGS
- **COGS:** Supported in `customMetricsService.calculateProfit` (percentage, fixed per order)
- **Export:** CSV, JSON
- **Docker:** `Dockerfile`, `docker-compose.yml`
- **Logging:** `utils/logger.js`

### 12. Storefront Script
- **Status:** ✅ Implemented
- **Evidence:** `storefront-script.js`, `trackRoutes.js`, `proxyRoutes.js`
- Variant assignment, batch fetch (reduces flicker), conversion tracking, context (device, country, traffic_source, session_count) for targeting

---

## ❌ Not Implemented (Backend/Service Exists, No UI or Route)

### 1. Combination Testing
- **Status:** ❌ Backend only, no UI, no route
- **Evidence:** `combinationTestService.js` has `createCombinationTest`, `generateCombinations`, `getCombinationResults`
- **Not used by:** `testRoutes.js`, `TestWizard.jsx` — no combination test creation flow
- **To implement:** Add combination template to wizard, route `POST /api/tests/combination` (or extend `POST /api/tests` with type `combination`)

### 2. Email Notifications
- **Status:** ❌ Scaffolded only
- **Evidence:** `notificationService.sendTestCompletionNotification`, `sendSignificanceNotification` — `console.log` only
- **Why:** No email provider (SendGrid, SES, etc.) integrated
- **To implement:** Add `SENDGRID_API_KEY` or similar, wire up actual email sending

### 3. Full TargetingService UI
- **Status:** ⚠️ Partial
- **Evidence:** `Targeting.jsx` has geographic, device, customer segment UI; `TestWizard` uses simpler `segments` (device, customer, countries, traffic_source, url_pattern, min_sessions)
- **TargetingService** supports region/city, time-based, custom rules — not exposed in UI

### 4. Custom Metrics / COGS UI
- **Status:** ❌ Backend only
- **Evidence:** `customMetricsService.js` supports COGS, profit, custom events, custom formulas
- **Not used by:** Analytics UI, export, or test config
- **To implement:** Add goal/metric config (e.g. custom metric, COGS) in TestWizard or Settings, and surface in Analytics

---

## 🚫 Cannot Implement (or High Effort)

### 1. Checkout Customizations (Test Type)
- **Status:** 🚫 Cannot implement via storefront JS
- **Why:** Shopify Checkout is a locked, hosted experience. Third-party apps cannot modify checkout UI (trust badges, images, etc.) via storefront scripting. Customization requires Shopify Checkout Extensions (Shopify Functions / UI Extensions), which are a separate build surface.
- **What exists:** Test type "Checkout" is available in wizard; storefront does not apply any checkout-specific logic.

### 2. Shipping Rate Modifications (Storefront-Side)
- **Status:** 🚫 Cannot implement via storefront JS
- **Why:** Shipping rates are determined by Shopify’s Carrier Service API or cart/checkout extensions. Storefront JS cannot alter shipping rates dynamically.
- **What exists:** Test type "Shipping" and config (`rate` in variants) exist; backend can store and run tests, but no storefront application of shipping changes.

### 3. Template / Theme Switching
- **Status:** ⚠️ Partially possible
- **Why:** Changing templates requires theme or section switching. Some stores use multiple themes; switching via JS is limited. Theme testing typically needs theme app extensions or a separate theme-switching flow.
- **What exists:** Test type "Template" and "Theme" exist; storefront does not apply template/theme changes.

### 4. Split URL Testing
- **Status:** ⚠️ Partially possible
- **Why:** Requires redirecting users to a different URL. Can be done via JS (`window.location`), but UX is a full page redirect and may affect SEO.

### 5. Onsite Edit (Code Injection)
- **Status:** ⚠️ Implemented
- **Evidence:** `applyCustomCode` in storefront applies CSS/JS per variant
- **Caveat:** Requires theme elements to be targetable; themes may not expose data attributes or selectors needed for edits.

---

## Summary Table

| Feature | Status | Notes |
|--------|--------|-------|
| Multi-variant testing | ✅ | Full |
| 8 test types | ✅ | UI + storage |
| Analytics | ✅ | Full |
| UX (sidebar, wizard, etc.) | ✅ | Full |
| Export (CSV, JSON) | ✅ | Full |
| Promo links | ✅ | Full |
| Webhooks | ✅ | Full |
| In-app notifications | ✅ | Full |
| Targeting (segments) | ✅ | device, customer, countries, traffic_source, url_pattern, min_sessions |
| Storefront price + custom code | ✅ | Full |
| COGS / custom metrics | ⚠️ | Backend only, no UI |
| Combination testing | ❌ | Backend only, no UI/route |
| Email notifications | ❌ | Scaffolded only |
| Shipping (storefront) | 🚫 | Not possible via storefront JS |
| Checkout customizations | 🚫 | Requires Checkout Extensions |
| Template/theme switching | ⚠️ | Limited by Shopify |

---

## Recommendations

1. **Combination testing:** Add UI in TestWizard and a route for combination tests.
2. **Email notifications:** Integrate SendGrid, SES, or similar; add notification preferences in Profile/Settings.
3. **Custom metrics / COGS:** Add UI to configure goal metrics and COGS in test creation or settings.
4. **README / docs:** Consider aligning README with this status (e.g. mark shipping/checkout as “supported as test type; storefront application limited by Shopify platform”).
