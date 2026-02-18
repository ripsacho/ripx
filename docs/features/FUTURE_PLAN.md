# RipX Future Plan

> Comprehensive roadmap for new features, improvements, UI consistency, and technical fixes.  
> Consolidates findings from project review and outstanding items from previous plans.

**Location:** `docs/features/FUTURE_PLAN.md` (all planning docs live in `docs/`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [New Features](#2-new-features)
3. [Existing Feature Improvements](#3-existing-feature-improvements)
4. [UI & UX Improvements](#4-ui--ux-improvements)
5. [Missing & Mismatched UI Fixes](#5-missing--mismatched-ui-fixes)
6. [Technical & Infrastructure](#6-technical--infrastructure)
7. [From Previous Plans (Not Yet Implemented)](#7-from-previous-plans-not-yet-implemented)
8. [Prioritized Roadmap](#8-prioritized-roadmap)
9. [Appendix: File Reference](#appendix-file-reference)

---

## 1. Executive Summary

RipX is a Shopify AB testing platform with a solid core: multi-variant testing, analytics, scheduling, targeting, and export. This plan identifies gaps, inconsistencies, and opportunities to mature the product into a polished, enterprise-ready tool.

**Key gaps identified (from project review):**
- PromoLinks component exists but has no route/navigation
- Settings persist to mock only (no backend)
- Logout and Notifications are placeholders
- Combination testing backend exists but no frontend
- Several UI patterns are inconsistent across pages

**Related docs:** `FEATURE_ROADMAP.md`, `COMPREHENSIVE_ROADMAP.md`, `FUTURE_ENHANCEMENTS.md`, `NEXT_STEPS.md`, `STRATEGIC_PLAN.md`, `reports/FEATURES_STATUS_REPORT.md`

---

## 2. New Features

### 2.1 Promo Links Management (High Priority)

**Current state:** `PromoLinks.jsx` exists and uses `/api/promo-links/test/:testId`, but there is **no route** in `App.jsx`. Users cannot reach it.

**Proposed:**
- Add route: `/tests/:id/promo-links` 
- Add "Promo Links" tab or secondary action in Test Detail (for offer-type tests)
- Add quick link in Analytics when test type is `offer`

### 2.2 Combination Testing UI (Medium Priority)

**Current state:** Backend has `combinationTestService.js`; README mentions "Test multiple variables together." No frontend.

**Proposed:**
- New test type: "Combination" in Test Wizard
- UI to select multiple variables (e.g., price + shipping)
- Integration effect analysis view in Analytics

### 2.3 Notifications Center (Medium Priority)

**Current state:** TopBar has a notifications icon with a badge, but `onClick={() => {}}` — no behavior.

**Proposed:**
- Implement notifications dropdown (test completed, significance reached, etc.)
- Backend: `notificationService.js` exists — wire to webhooks/events
- Mark as read, preferences (email/push)

### 2.4 Custom Metrics UI (Low–Medium Priority)

**Current state:** `customMetricsService.js` exists.

**Proposed:**
- Settings or Test Config: define custom metrics
- Analytics: show custom metrics per variant
- Document how to fire events from storefront script

### 2.5 Multi-Segment Analytics (Low Priority)

**Current state:** Segments (device, customer, countries) are stored; analytics may not be split by segment.

**Proposed:**
- Analytics view: filter by segment
- Breakdown table: conversions by device/country/customer segment

### 2.6 Test Templates / Presets (Low Priority)

**Proposed:**
- Save successful test configs as templates
- "Start from template" when creating new test

---

## 3. Existing Feature Improvements

### 3.1 Test Creation & Editing

| Improvement | Description |
|-------------|-------------|
| **Unified wizard** | TestCreator uses `showTemplateStep=true`, TestDetail uses `showTemplateStep=false`. Consider consistent step flow. |
| **Save code UX** | Improve "Unsaved changes" snapshot logic on code step (partially addressed). |
| **Validation feedback** | Show validation errors more prominently before submit. |
| **Draft autosave** | Persist draft state to avoid data loss on tab close. |

### 3.2 Analytics

| Improvement | Description |
|-------------|-------------|
| **Date range picker** | Allow custom date range for time-series and analytics. |
| **Real-time refresh** | Optional auto-refresh for running tests. |
| **Export** | Ensure Export button works and downloads correct format (CSV/JSON). |
| **Empty states** | Better messaging when no data yet. |

### 3.3 Settings

| Improvement | Description |
|-------------|-------------|
| **Backend persistence** | Settings use `setTimeout` mock — implement `PUT /api/settings` and load from backend. |
| **Store-level config** | Min sample size, confidence level, auto-stop per shop. |

### 3.4 Profile

| Improvement | Description |
|-------------|-------------|
| **Shopify user sync** | Profile uses fallback defaults; integrate with Shopify Admin API. |
| **Logout behavior** | TopBar "Logout" has empty handler — implement redirect or OAuth logout. |

### 3.5 Setup Wizard

| Improvement | Description |
|-------------|-------------|
| **Success state** | Clear "Setup complete" with next steps. |
| **Re-check button** | Allow manual re-check of proxy/embed status. |

---

## 4. UI & UX Improvements

### 4.1 Navigation & Layout

| Item | Current | Proposed |
|------|---------|----------|
| **Profile** | Only via TopBar | Add "Profile" to sidebar for discoverability |
| **Promo Links** | No nav | Add under Test Detail for offer tests |
| **Export** | Via Analytics button | Keep; ensure breadcrumb consistency |

### 4.2 Visual Consistency

- Page titles: consistent "Page Title" + optional "Subtitle"
- Empty states: standardize image, copy, CTA across Dashboard, TestList, Analytics
- Cards: use `PageShell` and shared Card styles everywhere

### 4.3 Accessibility

- Keyboard nav for wizard, modals, tables
- ARIA labels for sidebar, TopBar icons
- Focus management in modals

### 4.4 Responsive Design

- Mobile sidebar overlay
- DataTables: horizontal scroll or card view on small screens
- Responsive chart containers

---

## 5. Missing & Mismatched UI Fixes

### 5.1 Critical Fixes

| Issue | Location | Fix |
|-------|----------|-----|
| **PromoLinks unreachable** | `App.jsx` | Add route `/tests/:id/promo-links` and link from Test Detail (offer tests) |
| **Logout does nothing** | `TopBar.jsx` | Implement logout: clear session, redirect |
| **Notifications do nothing** | `TopBar.jsx` | Wire to notifications dropdown (even if empty initially) |
| **Settings mock save** | `Settings.jsx` | Replace `setTimeout` with real API call |

### 5.2 UI Inconsistencies

- **DataTable button styling:** `setupDataTableButtonStyling()` in multiple components — consider global CSS fix
- **TopBar logout color:** MutationObserver + interval — fragile; prefer CSS class or theme variable
- **Error messages:** Generic "Failed to load" → more specific errors with recovery hints

---

## 6. Technical & Infrastructure

### 6.1 Backend

- **Duplicate routes:** `testRoutes.js` has duplicate `PUT /:id/variants/allocation` and `PUT /:id/variants/codes` — remove legacy
- **Export route auth:** Ensure `req.shopDomain` set for export
- **API versioning:** Consider `/api/v1/` prefix

### 6.2 Frontend

- **Route constants:** Add `PROMO_LINKS(id)` to `constants/routes.js`
- **Error boundary:** Add Sentry or similar in production
- **Cache control:** Extend `_t` cache-busting where needed

### 6.3 Database

- Ensure migration 008 (`segments`, `holdout_percent`) is applied and saved by Test Wizard
- Add indexes for frequent queries (tests by shop, status)

---

## 7. From Previous Plans (Not Yet Implemented)

Items below were planned in earlier docs but not implemented. High-value ones are included here for the consolidated roadmap.

**Sources:** `COMPREHENSIVE_ROADMAP.md`, `FEATURE_ROADMAP.md`, `NEXT_STEPS.md`, `reports/FEATURES_STATUS_REPORT.md`, `FUTURE_ENHANCEMENTS.md`, `STRATEGIC_PLAN.md`

### Real-Time & Live Features (P0 in earlier plans)

| Item | Source | Notes |
|------|--------|-------|
| **WebSocket Integration** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP, FEATURES_STATUS_REPORT | Real-time dashboard, live visitor count, instant conversions |
| **Live Preview Mode** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Preview variants before launching, side-by-side comparison |
| **Push Notifications** | FEATURES_STATUS_REPORT, FUTURE_ENHANCEMENTS | Browser push for significant results |

### Test Management (P0)

| Item | Source | Notes |
|------|--------|-------|
| **Auto-Start/Stop background job** | IMPLEMENTATION_PLAN, FEATURES_STATUS_REPORT | Cron to execute scheduled tests; UI exists, backend job missing |
| **Test Templates Library** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Industry-specific templates, marketplace — basic templates exist |
| **Test Archive** | NEXT_STEPS | Organize old/completed tests |
| **Bulk Actions** | NEXT_STEPS, FEATURES_STATUS_REPORT | Bulk stop, bulk archive — bulk start exists |

### Analytics (P0–P1)

| Item | Source | Notes |
|------|--------|-------|
| **Segmentation & Cohort Analysis** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Performance by device, geo, customer segment |
| **Advanced Statistical Analysis** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Bayesian, sequential testing, confidence interval viz |
| **Funnel Analysis** | FUTURE_ENHANCEMENTS, FEATURE_ROADMAP | Conversion funnel visualization |
| **PDF/Excel Export** | FUTURE_ENHANCEMENTS, NEXT_STEPS | Beyond CSV/JSON |
| **Scheduled Reports** | FUTURE_ENHANCEMENTS | Automated email reports |
| **Revenue Impact Calculator** | COMPREHENSIVE_ROADMAP | Projected annual impact, ROI |

### Automation (P1)

| Item | Source | Notes |
|------|--------|-------|
| **Auto-Stop on Significance** | FUTURE_ENHANCEMENTS, FEATURE_ROADMAP | Stop when winner clear |
| **Auto-Implement Winners** | FUTURE_ENHANCEMENTS | Deploy winning variant |
| **Smart Traffic Allocation** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Multi-armed bandit, Thompson sampling |
| **AI Test Recommendations** | COMPREHENSIVE_ROADMAP, STRATEGIC_PLAN | AI suggests what to test |

### Advanced Testing (P1)

| Item | Source | Notes |
|------|--------|-------|
| **Full MVT Support** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Multi-variate, factorial design, interaction effects |
| **Visual Test Builder** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Drag-and-drop, WYSIWYG |
| **Behavioral Targeting** | FEATURE_ROADMAP, FUTURE_ENHANCEMENTS | Cart value, purchase history, CLV |
| **Geographic/Device Targeting** | COMPREHENSIVE_ROADMAP | Country, browser, OS — basic exists, expand |

### Enterprise & Scale (P1–P2)

| Item | Source | Notes |
|------|--------|-------|
| **Multi-User Support** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Roles, permissions, activity logs |
| **Custom Reports** | FEATURE_ROADMAP | Report builder, scheduled delivery |
| **GraphQL API** | COMPREHENSIVE_ROADMAP, STRATEGIC_PLAN | REST exists; GraphQL layer |
| **GDPR Compliance** | FEATURE_ROADMAP, COMPREHENSIVE_ROADMAP | Data export, right to deletion |

### Performance & Infra (P0 in tech roadmap)

| Item | Source | Notes |
|------|--------|-------|
| **Redis Caching** | STRATEGIC_PLAN, COMPREHENSIVE_ROADMAP | Session/cache layer |
| **Message Queue (Bull/BullMQ)** | STRATEGIC_PLAN, IMPLEMENTATION_PLAN | Background jobs |
| **Monitoring (APM, Sentry)** | STRATEGIC_PLAN, NEXT_STEPS | Error tracking, performance |
| **CI/CD Pipeline** | COMPREHENSIVE_ROADMAP | GitHub Actions, automated tests |
| **Code Splitting / Lazy Loading** | COMPREHENSIVE_ROADMAP, NEXT_STEPS | Frontend performance |

### UX & Support (P1–P2)

| Item | Source | Notes |
|------|--------|-------|
| **Onboarding Wizard** | COMPREHENSIVE_ROADMAP, FEATURE_ROADMAP | Interactive tutorial, first test guided |
| **Keyboard Shortcuts** | FUTURE_ENHANCEMENTS, NEXT_STEPS | Power user features |
| **WCAG 2.1 AA** | FUTURE_ENHANCEMENTS, FEATURE_ROADMAP | Accessibility compliance |
| **Mobile App** | COMPREHENSIVE_ROADMAP, STRATEGIC_PLAN | iOS/Android — long-term |

---

## 8. Prioritized Roadmap

### Phase 1: Quick Wins (1–2 weeks)

1. Add PromoLinks route and link from Test Detail for offer tests
2. Implement logout in TopBar (redirect / clear session)
3. Add Profile to sidebar navigation
4. Fix Settings to persist to backend (add API if missing)
5. Remove duplicate routes in `testRoutes.js`
6. Global fix for DataTable button styling

### Phase 2: Core UX (2–4 weeks)

1. Notifications dropdown (even if "no notifications" initially)
2. Improve empty states and error messages
3. Date range picker for Analytics
4. Backend persistence for Settings
5. Ensure Export works correctly
6. Auto-start/stop background job (for scheduled tests)

### Phase 3: New Features (4–8 weeks)

1. Combination Testing UI
2. Custom Metrics configuration and display
3. Segment breakdown in Analytics
4. Test templates / presets
5. WebSocket integration (real-time dashboard)
6. Live Preview Mode

### Phase 4: Advanced (8–16 weeks)

1. Full MVT support
2. Advanced statistical analysis (Bayesian, etc.)
3. Auto-stop on significance
4. Visual test builder (or enhanced code editor)
5. Third-party integrations (GA4, Klaviyo, etc.)

### Phase 5: Polish & Scale (Ongoing)

1. Accessibility audit and fixes
2. Performance optimization (Redis, code splitting)
3. Multi-user support
4. GraphQL API
5. E2E tests for critical flows

---

## Appendix: File Reference

| Component | Path | Notes |
|-----------|------|-------|
| PromoLinks | `frontend/src/components/PromoLinks/PromoLinks.jsx` | No route |
| Targeting | `frontend/src/components/Targeting/Targeting.jsx` | Used in TestWizard |
| Export | `frontend/src/components/Export/Export.jsx` | Route exists |
| Settings | `frontend/src/components/Settings/Settings.jsx` | Mock save |
| TopBar | `frontend/src/components/Layout/TopBar.jsx` | Logout/notifications empty |
| Sidebar | `frontend/src/components/Layout/Sidebar.jsx` | No Profile/PromoLinks |
| combinationTestService | `backend/src/services/combinationTestService.js` | No frontend |
| notificationService | `backend/src/services/notificationService.js` | No UI |

---

**Related documentation:**
- [Feature Roadmap](./FEATURE_ROADMAP.md)
- [Comprehensive Roadmap](./COMPREHENSIVE_ROADMAP.md)
- [Future Enhancements](./FUTURE_ENHANCEMENTS.md)
- [Features Status Report](../reports/FEATURES_STATUS_REPORT.md)
- [Implementation Plan](../reports/IMPLEMENTATION_PLAN.md)
- [Next Steps](../guides/NEXT_STEPS.md)
- [Strategic Plan](../guides/STRATEGIC_PLAN.md)

*Last updated: February 2025. Update as features ship.*
