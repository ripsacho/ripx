# Code and structure improvements

Prioritized list of improvements identified from a full-project review. Implement in order of impact and effort.

---

## Done (this pass)

- **Backend TEST_STATUS**: Replaced `PAUSED: 'paused'` with `STOPPED: 'stopped'` in `backend/src/constants/index.js` so constants match the DB constraint and API (which use `stopped`). Frontend already used `STOPPED: 'stopped'`.
- **Tests.status constraint**: Added migration `045_tests_allow_archived_status.sql` so `tests.status` can be `'archived'`. The archive job was setting `status = 'archived'` while the DB only allowed `draft`, `running`, `stopped`, `completed`; the migration prevents that update from failing.
- **Backend integration tests**: Added `backend/src/__tests__/integration/api.integration.test.js` with supertest: GET `/health`, GET `/api/health`, and GET `/api/nonexistent` (404). Database and maintenanceMode are mocked so tests run without a real DB. Jest setup sets `APP_URL`, `JWT_SECRET`, and Shopify env vars so the app loads in test. Backend test script uses `--forceExit` so Jest exits after integration tests (job processors keep handles open).
- **TestWizard config extraction**: Moved `TEST_TEMPLATES` and `TEST_TYPE_CATEGORIES` from `TestWizard.jsx` into `frontend/src/components/TestWizard/testWizardConfig.js`. TestWizard imports from the new file; reduces TestWizard.jsx by ~220 lines and keeps template data reusable.
- **TestWizard step config**: Moved step definitions and step IDs into `testWizardConfig.js`: `buildWizardSteps(showTemplateStep, mode)` and `getStepIds(showTemplateStep)`. TestWizard uses these instead of inline steps array and repeated `showTemplateStep ? n : n`; step IDs (targeting, goal, code, review, traffic) come from one place. Added `frontend/src/components/TestWizard/__tests__/testWizardConfig.test.js` for getStepIds, buildWizardSteps, and config shape.
- **CI (GitHub Actions)**: Added `.github/workflows/ci.yml` – on push/PR to main/master: install deps (root + frontend), lint backend and frontend, test backend and frontend, build frontend. Ensures broken or non-linting code is caught before merge.
- **Lazy route components**: Moved all `lazy()` route imports from `App.jsx` into `frontend/src/config/lazyRoutes.js`. App.jsx imports from there; keeps the list of route components in one place and shortens App.jsx.
- **Frontend unit tests**: Added Jest + Babel support in frontend (`babel-jest`, `@babel/preset-env`, `babel.config.cjs`, jest transform). Added `frontend/src/constants/__tests__/routes.test.js` – tests ROUTES static paths, app-scoped helpers (`appDashboard`, `appTests`, `appTestDetail`), `ROUTE_PATTERNS`, `MAIN_APP_PATHS`, and `APP_DOMAIN_PATTERN`. Establishes the pattern for more component/hook tests later.
- **App.jsx fix**: Defined missing `isMainAppRoute` used in shop-only redirect logic.
- **useAppRoutes test**: Extracted pure `getRoutesForDomain(domain)` to `frontend/src/utils/getRoutesForDomain.js` (used by `useAppRoutes`) and added `frontend/src/hooks/__tests__/useAppRoutes.test.js`. Tests legacy vs app-scoped route resolution without React or services.
- **Backend constants doc**: Documented in `backend/src/constants/index.js` that TEST_STATUS and TEST_TYPES are canonical for the API; frontend should use the same string values.
- **Backend response utils test**: Added `backend/src/__tests__/response.test.js` – tests sendSuccess, sendError, sendValidationError, sendNotFound, sendUnauthorized (status codes and response shape).
- **GET /api/config/legal integration test**: Added in `api.integration.test.js` – asserts 200 and legal config shape (termsUrl, privacyUrl).
- **Frontend status constants test**: Added `frontend/src/constants/__tests__/status.test.js` – asserts TEST_STATUS uses STOPPED (not PAUSED), API values present, labels and options; TEST_TYPES and STANDALONE_TEST_TYPE_IDS.
- **asyncHandler test**: Added `backend/src/__tests__/asyncHandler.test.js` – sync call, async throw, Promise reject forwarded to next; resolved handler does not call next.
- **Frontend testType utils test**: Added `frontend/src/utils/__tests__/testType.test.js` – getVariantCount and inferTemplateKeyFromVariants (pure helpers used by list/detail views).
- **Database init doc**: Comment in `backend/src/app.js` that dotenv must load before any module that uses database or env.
- **TestWizard validation extraction**: Moved step validation into pure `getWizardStepErrors(stepId, options)` in `frontend/src/components/TestWizard/wizardValidation.js`. TestWizard calls it with stepIds, formData, initialData, etc. Added `frontend/src/components/TestWizard/__tests__/wizardValidation.test.js` covering template, goal, targeting, traffic, code, and review steps (5- and 6-step flows). Validation rules are now unit-testable without React.
- **Frontend app constants test**: Added `frontend/src/constants/__tests__/app.test.js` – BREAKPOINTS (MOBILE/TABLET/DESKTOP), STORAGE_KEYS, INTERVALS (SESSION_CHECK, THEME_CHECK, etc.), APP_META (VERSION, NAME). Documents and guards values used by useSessionCheck, theme, and auth.
- **POST /api/track integration tests**: In `api.integration.test.js` – returns 400 when required fields (test_id, user_id, shop_domain) are missing; returns 400 for invalid test_id format. Mock maintenanceMode.getBlockListMessage and isMaintenanceActiveForDomain so track route middleware runs.
- **Validators coverage**: Added `validators.isValidUUID` and `validators.validateDomainForInput` tests in `backend/src/__tests__/validators.test.js`. isValidUUID is used across track, admin, test, analytics, and other routes; tests cover valid UUIDs, non-UUID strings, and empty/null. validateDomainForInput tests normalization and error messages.
- **POST /api/track/client-error integration tests**: Returns 400 when `error` is missing; returns 200 when `error` is present (payload contract documented).
- **Protected route integration test**: GET `/api/tests` without credentials returns 401 (documents that protected routes require auth).
- **NotFound home link**: Extracted pure `getNotFoundHome(domain, pathname)` in `frontend/src/utils/notFoundHome.js`; NotFound uses it for home path and label. Added `frontend/src/utils/__tests__/notFoundHome.test.js` (user panel vs app dashboard, falsy domain, pathname patterns).
- **UI and layout (full-project pass)**: ErrorBoundary error view wrapped in PageShell for consistent page/card styling. NotFound wrapped in PageShell; 404 content box styled with card-like border, background, and gradient top bar (design system). TopBar breadcrumbs extended for test sub-routes: Editor, Export, Promo links show “Test Details” as parent. See `docs/development/UI_FEATURES_LAYOUT.md` for feature/layout audit.
- **Breadcrumb util**: Extracted `getAppDomainFromPath` and `getBreadcrumb` to `frontend/src/utils/breadcrumb.js`; TopBar and Sidebar use it. Added `frontend/src/utils/__tests__/breadcrumb.test.js` (getAppDomainFromPath, getBreadcrumb for user panel, dashboard, tests, test sub-routes, admin, 404).
- **GET /api/config/legal**: Integration test added that POST returns 404 (GET-only endpoint).
- **Deep research doc**: Added `docs/development/DEEP_RESEARCH.md` – backend API surface (public vs authenticated), integration test coverage, frontend testable pure logic table, env/startup notes, file size/ownership. Use for prioritising next tests and refactors.
- **Credentials util**: Extracted `hasCredentialsFromSources(shopDomain, apiKey, emailToken)` to `frontend/src/utils/credentials.js`; `hasCredentials()` in api.js uses it. Added `frontend/src/utils/__tests__/credentials.test.js` (all empty, any source set, whitespace-only).
- **Health GET-only**: Integration test that POST /health returns 404.
- **Settings bounds constants**: Added `SETTINGS_BOUNDS` in `backend/src/constants/index.js` (MIN_SAMPLE_SIZE=10, MAX_SAMPLE_SIZE=10000, CONFIDENCE_LEVEL_MIN=0.8, CONFIDENCE_LEVEL_MAX=1, DEFAULT_CONFIDENCE_LEVEL=0.95, DEFAULT_MIN_SAMPLE_SIZE=100). Settings routes and admin shop-override route use these instead of magic numbers. Analytics service uses `SETTINGS_BOUNDS.DEFAULT_CONFIDENCE_LEVEL` when shop has no confidence_level. See `docs/development/CALCULATIONS.md`.
- **Navigation (AccountNav, Admin, Connect)**: Shared `AccountNav` for User panel and My domains (Home | My domains | Admin | Sign out). Admin sidebar footer: "Back to app" link. Connect: top bar with RipX and My domains. See UI_FEATURES_LAYOUT / conversation.
- **TEST_HEALTH constant**: Backend `TEST_HEALTH.MIN_VISITORS_PER_VARIANT = 50` used in autoStopProcessor and testHealthService (zero-conversion check). Removed unused `useNavigate` from AccountNav.
- **Integration test port conflict**: `backend/src/app.js` now starts the HTTP server only when run directly (`require.main === module`). When required by integration tests (`request(require('../../app'))`), the app is exported without calling `listen()`, so tests no longer hit `EADDRINUSE :::3000` when `npm run dev` or another process uses port 3000.

---

## Deep research (audit findings)

Findings from a deeper pass over the codebase; use for future improvements. **Full audit**: `docs/development/DEEP_RESEARCH.md` (API surface, test coverage, frontend pure-logic table, env notes).

- **Error handling**: No route does `res.json()` then `next(err)`; all API handlers use `asyncHandler` or return responses and let the centralized `errorHandler` (app.js) handle thrown errors. Response helpers (sendSuccess, sendError, etc.) are unit-tested.
- **asyncHandler coverage**: Route files wrap async handlers with `asyncHandler` consistently; unhandled rejections are forwarded to the error middleware.
- **useSessionCheck testability**: The hook depends on `apiGet` from services; to test interval/visibility logic without the API, extract a pure helper (e.g. `computeSessionCheckSchedule(intervalMs, initialDelayMs, visibilityState)`) or mock `apiGet` in tests.
- **Env validation**: No schema yet; optional next step is a small env schema (e.g. env-schema or joi) for required vars and types, documented in one place.
- **Backend route count**: Many route files (auth, admin, tests, track, etc.); integration tests currently cover health, 404, config/legal, and POST /api/track validation; expanding to auth or tests CRUD would require mocks or a test DB.
- **ErrorBoundary**: Root boundary in main.jsx wraps App; route-level boundary in App.jsx wraps Routes with resetKeys so navigation can clear error state. componentDidCatch logs in DEV and in production POSTs to `/track/client-error` (error message, stack, componentStack, url, shopDomain, userAgent). Try Again clears state; Go to Dashboard navigates to ROUTES.USER_PANEL and reloads.
- **hasCredentials**: In `frontend/src/services/api.js`, true when getShopDomain() or getApiKey() or getEmailToken() is truthy (localStorage). AuthGuard redirects to Connect when false. Testing would require mocking localStorage or extracting a pure “sources” helper.
- **validators.isValidUUID**: Used in track, admin, test, analytics, notification, targeting-preset, export routes for IDs. Now covered by unit tests (valid UUIDs, non-UUID, empty/null).

---

## High impact (recommended next)

### 1. Split TestWizard.jsx (~7,160 lines after config extraction)

**Issue**: Single very large file; hard to maintain, review, and test.

**Done**: Template and category config moved to `testWizardConfig.js`; step config (steps array and step IDs) also in `testWizardConfig.js` via `buildWizardSteps` and `getStepIds` (see “Done” above).

**Approach** (next steps):

- Extract **step panels** into components: e.g. `TemplateStep.jsx`, `VariantsStep.jsx`, `TargetingStep.jsx`, `CodeStep.jsx`, `ReviewStep.jsx`, each receiving `formData`, `onChange`, `errors` as props.
- **Validation**: Done – `getWizardStepErrors` lives in `wizardValidation.js` and is unit-tested (see “Done” above).
- Optionally extract **wizard state and navigation** into a custom hook (e.g. `useWizardState.js`) to keep the main component to orchestration and layout.

**Benefit**: Easier to test steps in isolation, smaller diffs, clearer ownership.

### 2. Backend API / integration tests

**Issue**: Only unit tests existed (validators, abTestEngine, analytics). Supertest was in devDependencies but not used.

**Done**: Health, 404, GET /api/config/legal (and POST → 404), POST /api/track validation, POST /api/track/client-error (400 when error missing, 200 when present), GET /api/tests 401 when unauthenticated; response utils unit test (see “Done” above). **Next**: Add tests for auth (e.g. connect-token), tests CRUD, or track/analytics with full mocks or test DB.

**Benefit**: Catches regressions in API contracts and auth/DB wiring.

### 3. Frontend unit tests

**Issue**: No Jest tests under `frontend/src`; only Playwright E2E smoke tests. `passWithNoTests: true` hides the gap.

**Done**: Routes test; Jest/Babel; useAppRoutes logic via `getRoutesForDomain`; status constants test; app constants test (INTERVALS, STORAGE_KEYS, BREAKPOINTS, APP_META); getNotFoundHome; getBreadcrumb/getAppDomainFromPath (breadcrumb.test.js); hasCredentialsFromSources (credentials.test.js) (see “Done” above).

**Approach** (next):

- Add component tests for small, pure components (e.g. status badges, form fields, shared UI).
- Add tests for `useSessionCheck` or other hooks (or extract pure logic and test it).
- Start with high-traffic or high-risk areas (e.g. Connect, AuthGuard, StoreSwitcher) before tackling TestWizard.

**Benefit**: Safer refactors (especially for TestWizard split) and documented behavior.

---

## Medium impact

### 4. App.jsx size and route config (~720 lines)

**Issue**: Many lazy imports and route definitions in one file; works but is harder to scan and change.

**Done**: Lazy imports moved to `frontend/src/config/lazyRoutes.js` (see “Done” above). Route tree (JSX) remains in App.jsx; optional next step is to move route list into a data structure and map over it.

**Benefit**: Clearer routing overview and easier addition of new routes.

### 5. Shared constants / single source of truth

**Issue**: Test status and test types are duplicated between backend and frontend with small differences (e.g. backend had PAUSED vs STOPPED; frontend has PRICING alias). Risk of drift.

**Done**: Backend constants file now documents that TEST_STATUS and TEST_TYPES are canonical for the API (see “Done” above).

**Approach** (optional next):

- Frontend can re-export or mirror with labels/options (e.g. `TEST_STATUS_LABELS`) but use the same value set as backend.
- Optionally introduce a small shared package or codegen from backend schema later.

**Benefit**: Fewer bugs from mismatched status/type values and clearer API contract.

### 6. CI (e.g. GitHub Actions)

**Done**: Workflow added (see “Done” above). **Optional**: Add a job that runs migrations against a test DB if integration tests later need it.

**Benefit**: Consistent checks on every change and fewer broken main branches.

---

## Lower priority / ongoing

- **Env validation**: Consider a small schema (e.g. env schema lib) for required/optional and types; keeps validation in one place and documents env.
- **Error handling**: Ensure no route calls `res.json()` then `next(err)`; keep using centralized `errorHandler` and response helpers. Response helpers (sendSuccess, sendError, etc.) are unit-tested in `backend/src/__tests__/response.test.js`.
- **Magic numbers / strings**: Quick pass for timeouts, retry delays, and user-facing strings; move to constants or config where appropriate.
- **Database init**: Documented in `app.js`: dotenv loads first so database and validateEnvironment see env (see “Done” above).

---

## Summary

| Area              | Change                                      | Status                                                                               |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Backend constants | TEST_STATUS PAUSED → STOPPED                | Done                                                                                 |
| Migrations        | Allow `archived` in tests.status            | Done                                                                                 |
| TestWizard        | Split into config, steps, validation, hooks | Config + step IDs/steps + validation done; panels next                               |
| Backend tests     | Add integration/API tests                   | Health, 404, config/legal, POST /api/track validation + response util test done      |
| Frontend tests    | Add component/hook tests                    | Routes, getRoutesForDomain, status, testType, app constants done; add more as needed |
| App.jsx           | Lazy imports + route config                 | Lazy done; optional: route data structure                                            |
| Shared constants  | Single source of truth for status/type      | Backend doc done; optional: frontend mirror                                          |
| CI                | GitHub Actions (lint, test, build)          | Done                                                                                 |
