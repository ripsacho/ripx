# Deep research – codebase audit

Findings from deep passes over the RipX codebase. Use for prioritising tests, refactors, and documentation.

---

## Backend API surface

### Public / unauthenticated

| Path                      | Method  | Notes                                                             |
| ------------------------- | ------- | ----------------------------------------------------------------- |
| `/health`                 | GET     | App status, DB/Redis checks, version, uptime                      |
| `/api/health`             | GET     | Same as `/health`                                                 |
| `/api/config/legal`       | GET     | Terms URL, Privacy URL (from KV store). POST returns 404          |
| `/api/auth/*`             | various | Login, register, connect-token, send-login-link, verify-otp, etc. |
| `/api/tenants`            | POST    | Tenant registration (rate-limited)                                |
| `/api/track`              | POST    | Event tracking (validation: test_id UUID, user_id, shop_domain)   |
| `/api/track/client-error` | POST    | Client error reporting (requires `error` in body)                 |
| `/api/proxy/*`            | various | App proxy (signature-based)                                       |
| `/api/webhooks/*`         | POST    | Shopify/webhook (HMAC)                                            |

### Authenticated (API key / shop / email session)

| Prefix                     | Auth          | Notes                               |
| -------------------------- | ------------- | ----------------------------------- |
| `/api/me/*`                | email session | Domains, profile (standalone)       |
| `/api/account/*`           | authenticate  | Stores, API keys                    |
| `/api/dashboard/*`         | authenticate  | Dashboard stats                     |
| `/api/tests/*`             | authenticate  | CRUD, start, stop, clone, analytics |
| `/api/analytics/*`         | authenticate  | Analytics, events, heatmap          |
| `/api/shopify/*`           | shop session  | Shopify-specific                    |
| `/api/promo-links/*`       | authenticate  | Promo links                         |
| `/api/profile/*`           | authenticate  | Profile                             |
| `/api/settings/*`          | authenticate  | Settings                            |
| `/api/targeting-presets/*` | authenticate  | Targeting presets                   |
| `/api/notifications/*`     | authenticate  | Notifications                       |
| `/api/admin/*`             | requireAdmin  | Admin panel (many sub-routes)       |

### Integration tests (current)

- Health: GET /health (200, shape), GET /api/health (200), POST /health (404)
- 404 for unknown API path
- GET /api/config/legal (200, shape); POST /api/config/legal (404)
- POST /api/track (400 missing fields, 400 invalid test_id)
- POST /api/track/client-error (400 missing error, 200 with error)
- GET /api/tests without auth (401)
- Response utils (sendSuccess, sendError, etc.) – unit

### Gaps (optional next)

- Auth: connect-token exchange, send-login-link (would need mocked DB or test user)
- Tests CRUD: create/list/get with mocked DB
- Env validation: document required vars; optional schema at startup

---

## Frontend – testable pure logic

| Module                        | Export                                         | Tested | Notes                    |
| ----------------------------- | ---------------------------------------------- | ------ | ------------------------ |
| `constants/routes`            | ROUTES, ROUTE_PATTERNS, etc.                   | Yes    | routes.test.js           |
| `constants/status`            | TEST_STATUS, TEST_TYPES, etc.                  | Yes    | status.test.js           |
| `constants/app`               | BREAKPOINTS, STORAGE_KEYS, INTERVALS, APP_META | Yes    | app.test.js              |
| `utils/getRoutesForDomain`    | getRoutesForDomain                             | Yes    | useAppRoutes.test.js     |
| `utils/notFoundHome`          | getNotFoundHome                                | Yes    | notFoundHome.test.js     |
| `utils/breadcrumb`            | getAppDomainFromPath, getBreadcrumb            | Yes    | breadcrumb.test.js       |
| `utils/credentials`           | hasCredentialsFromSources                      | Yes    | credentials.test.js      |
| `utils/testType`              | getVariantCount, inferTemplateKeyFromVariants  | Yes    | testType.test.js         |
| `TestWizard/testWizardConfig` | getStepIds, buildWizardSteps, config           | Yes    | testWizardConfig.test.js |
| `TestWizard/wizardValidation` | getWizardStepErrors                            | Yes    | wizardValidation.test.js |

### Not yet extracted / tested

- **useSessionCheck**: interval and visibility logic; could extract `computeSessionCheckSchedule(intervalMs, initialDelayMs, visibilityState)` and test it.

---

## Backend – validation and middleware

- **validators**: isValidUUID, validateDomainForInput, sanitizeString, validateTestConfig, etc. – unit-tested.
- **asyncHandler**: forwards rejections to next – unit-tested.
- **auth middleware**: authenticate uses shop session, API key, or account; sendUnauthorized on failure. No double response (res.json then next).
- **Error handler**: Central errorHandler in app.js; routes use asyncHandler or return and let it handle throws.

---

## Env and startup

- **dotenv**: Loaded first in app.js; database and validateEnvironment depend on it.
- **validateEnvironment**: Logs missing/weak JWT_SECRET, DATABASE_URL, etc.; does not throw in test (NODE_ENV=test).
- **Required for production**: DATABASE_URL, JWT_SECRET, APP_URL; Shopify vars unless RIPX_STANDALONE_ONLY. Documented in .env.example and PRODUCTION_DEPLOY.md.
- **Optional**: Env schema (e.g. env-schema) for types and single place to document vars.

---

## File size and ownership

- **TestWizard.jsx**: ~7.1k lines; config and validation already extracted. Next: step panels (TemplateStep, VariantsStep, etc.) and optionally useWizardState.
- **App.jsx**: ~720 lines; lazy routes in lazyRoutes.js. Optional: route config as data + map.
- **Admin**: Many sub-pages (Users, Domains, Tests, Audit, …); shared AdminLayout and AdminPageLayout + AdminHero.

---

## Calculations and statistics

- **Single source of truth**: Conversion rate, significance (Z-test / Fisher / chi-square), revenue impact, and confidence intervals are computed in `backend/src/services/analytics.js`. Frontend displays API data only.
- **Significance threshold**: Default from `STATISTICAL_THRESHOLD.P_VALUE` (0.05); per-shop threshold = 1 − `shop_settings.confidence_level`. Used in `getTestAnalytics`, so auto-stop and test health use the shop’s confidence level (test health checks `significance.significant`, not a hardcoded p > 0.05).
- **Details**: See [CALCULATIONS.md](./CALCULATIONS.md) for formulas, rounding, edge cases, and possible improvements (e.g. centralising sample-size/confidence bounds in constants).

---

## Summary

- Backend: 75 tests (integration + unit). Frontend: 93 tests. All passing.
- Breadcrumb in `utils/breadcrumb.js`; credentials rule in `utils/credentials.js` (hasCredentialsFromSources); api.js hasCredentials() uses it.
- GET-only endpoints: POST /health → 404, POST /api/config/legal → 404.
- Deep research doc (this file) gives a route inventory, list of testable frontend logic, and calculations overview. Full calculation audit in CALCULATIONS.md.
