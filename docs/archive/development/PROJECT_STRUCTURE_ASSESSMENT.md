# RipX Project Structure Assessment

**Date:** February 2025

This document provides a concise audit of the RipX codebase structure, identifies gaps, and recommends improvements.

---

## 1. Current Structure Overview

### Backend (`backend/src/`)

| Layer           | Status | Notes                                                                        |
| --------------- | ------ | ---------------------------------------------------------------------------- |
| **Routes**      | ✅     | 15+ route files; handlers in routes (no separate controllers)                |
| **Models**      | ✅     | test, user, analytics, shopSession, tenant, heatmap, targetingPreset         |
| **Services**    | ✅     | 15+ services (abTestEngine, analytics, shopify, trafficAllocator, etc.)      |
| **Middleware**  | ✅     | auth, errorHandler                                                           |
| **Utils**       | ✅     | database, logger, response, validators, segments, testType                   |
| **Jobs**        | ✅     | Bull queues: scheduledTests, archive, guardrail, autoStop, significanceAlert |
| **Config**      | ✅     | sessionStore, swagger                                                        |
| **Controllers** | ❌     | Not used; logic lives in routes (acceptable for current size)                |

### Frontend (`frontend/src/`)

| Layer          | Status | Notes                                                                   |
| -------------- | ------ | ----------------------------------------------------------------------- |
| **Components** | ✅     | Feature-based (Dashboard, TestList, Analytics, etc.)                    |
| **Hooks**      | ✅     | useTests, useAnalytics, useAnimatedCounter, useCursorGlow, useMouseTilt |
| **Services**   | ✅     | api.js, profileApi.js                                                   |
| **Constants**  | ✅     | routes, status, colors                                                  |
| **Utils**      | ✅     | theme, dataTableStyles, testType                                        |

### Infrastructure

| Item                | Status                          |
| ------------------- | ------------------------------- |
| Dockerfile          | ✅                              |
| docker-compose.yml  | ✅ (Postgres + Redis + Backend) |
| Migrations          | ✅ (22 migrations)              |
| Husky + lint-staged | ✅                              |

---

## 2. Gaps & Shortages

### 2.1 Testing

| Area                | Current                          | Gap                                     |
| ------------------- | -------------------------------- | --------------------------------------- |
| Backend unit tests  | 2 files (abTestEngine, testType) | Low coverage; no route/service tests    |
| Frontend unit tests | Jest in package.json, no tests   | No component or hook tests              |
| E2E tests           | 1 Playwright spec (app.spec.js)  | Minimal; only title/load check          |
| Test scripts        | `npm run test` → backend only    | Frontend `npm test` exists but no tests |

### 2.2 CI/CD

| Item                  | Status                             |
| --------------------- | ---------------------------------- |
| GitHub Actions        | ✅ test-and-build, lint (advisory) |
| Pre-commit            | Husky + lint-staged                |
| Pre-push              | Runs backend tests                 |
| Automated tests on PR | ✅                                 |

### 2.3 Developer Experience

| Item                   | Status                    |
| ---------------------- | ------------------------- |
| Node version pinning   | ✅ .nvmrc                 |
| Docker dev workflow    | ✅ docker-compose.dev.yml |
| API docs               | Swagger at /api-docs ✅   |
| Environment validation | ✅ On startup             |

### 2.4 Code Organization

| Item        | Status                                                            |
| ----------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| Controllers | Routes contain logic; fine for size, could extract if routes grow |
| Validation  | validators.js + inline in routes                                  | Consider centralized request validation (e.g. express-validator) |
| TypeScript  | ❌ JS only                                                        | Optional; adds type safety                                       |

### 2.5 Documentation

| Item         | Status                        |
| ------------ | ----------------------------- |
| docs/ folder | ✅ Tracked in version control |
| README       | ✅ Comprehensive              |
| CONTRIBUTING | ✅ Coding standards           |
| API docs     | Swagger ✅                    |

---

## 3. Recommended Improvements (Prioritized)

### High Priority

1. **Add CI pipeline** – ✅ Applied
2. **Pin Node version** – ✅ Applied
3. **Expand backend tests** – Add tests for critical routes
4. **Docker dev compose** – ✅ Applied

### Medium Priority

5. **Frontend unit tests** – Add Vitest + component tests
6. **Track docs** – ✅ Applied

### Lower Priority

7. **Extract controllers** – When routes exceed ~200 lines
8. **Request validation layer** – express-validator
9. **TypeScript migration** – Optional

---

## 4. Tools & Ideas Summary

### Already in Use

- **Backend:** Express, PostgreSQL, Redis, Bull, Helmet, rate-limit, Swagger
- **Frontend:** React, Vite, Polaris, TanStack Query, Recharts, Playwright
- **Dev:** ESLint, Prettier, Husky, lint-staged, nodemon

### Worth Adding

| Tool              | Purpose                        |
| ----------------- | ------------------------------ |
| Vitest            | Fast frontend unit tests       |
| express-validator | Centralized request validation |

---

## 5. Quick Wins Applied

1. **`.nvmrc`** – Node 18
2. **`.github/workflows/ci.yml`** – Test + build; lint (advisory)
3. **`docker-compose.dev.yml`** – Local Postgres + Redis
4. **Unified lint scripts** – `npm run lint`, `npm run lint:fix`
5. **Pre-push hook** – Runs backend tests
6. **`validators.test.js`** – Unit tests
7. **`.env.example`** – Docker dev URLs
8. **`package-lock.json`** – Tracked
9. **README** – Database setup options
10. **CI install logic** – `npm ci` when lock file exists

### Note on Lint

~40 pre-existing lint issues. CI runs lint with `continue-on-error: true`. Run `npm run lint:fix` to auto-fix.

---

## 6. Standardization Additions

| Item                     | Purpose                  |
| ------------------------ | ------------------------ |
| **LICENSE**              | MIT                      |
| **SECURITY.md**          | Vulnerability reporting  |
| **.prettierignore**      | Exclude build outputs    |
| **nodemon.json**         | Backend watch config     |
| **package.json engines** | Node >=18                |
| **.gitignore**           | Test artifacts           |
| **.dockerignore**        | Build context exclusions |

---

_Generated as part of project structure review._
