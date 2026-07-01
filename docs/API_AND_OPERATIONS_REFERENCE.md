# API and Operations Reference

This guide fills the gap between the in-app documentation and the live Swagger UI. Swagger is available at `/api-docs`, but newer route groups are not fully annotated yet. Use this page as the current route-map and operations checklist until the OpenAPI catalog is expanded.

## API Documentation Status

| Surface                       | Current status                                       | Source of truth                                                                    |
| ----------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Swagger UI                    | Available at `/api-docs`, but coverage is incomplete | `backend/src/config/swagger.js`, `backend/src/routes/*.js`                         |
| Merchant workflows            | Mostly documented in the in-app `/docs` page         | `frontend/src/components/Documentation/Documentation.jsx`                          |
| Shopify checkout and shipping | Strong runbook coverage, partial API contracts       | `docs/SHOPIFY_CHECKOUT_PRICE_RESOLVER.md`, `docs/SHOPIFY_SHIPPING_TEST_RUNBOOK.md` |
| Admin/operator routes         | Product specs exist, HTTP details are partial        | `docs/ADMIN_CONTROL_PANEL_SPEC.md`, `docs/PERMISSIONS.md`                          |

## Merchant API Groups

| Group             | Route examples                                                                               | Purpose                                                           | Notes                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Tests             | `GET /api/tests`, `POST /api/tests`, `POST /api/tests/:id/start`, `POST /api/tests/:id/stop` | Create, edit, launch, stop, and inspect experiments               | Prefer app UI for launch because it runs preflight and surfaces readiness warnings. |
| Launch readiness  | `GET /api/tests/:id/preflight`, `GET /api/tests/:id/checkout/readiness`                      | Validate launch blockers and checkout setup                       | Results power the launch preflight panel and checkout readiness actions.            |
| Analytics         | `GET /api/analytics/tests/:id`, `/funnel`, `/events`, `/decision`, `/heatmap`                | Test performance, funnels, events, decision support, and heatmaps | Heatmap screenshot upload and rollups are operator-sensitive.                       |
| Goal metrics      | `/api/goal-metrics/*`                                                                        | Custom conversion goals and metric definitions                    | Keep names clear for reporting and future test reuse.                               |
| Targeting presets | `/api/targeting-presets/*`                                                                   | Save and reuse audience/targeting configurations                  | Used from the Test Wizard and Settings.                                             |
| Promo links       | `/api/promo-links/*`                                                                         | Per-test/per-variant promotion links                              | Merchant-facing, but admin can also monitor usage.                                  |
| Support           | `/api/support/*`                                                                             | Tickets, threads, FAQ suggestions, SupportAI                      | Requires SMTP for production ticket delivery.                                       |
| RipX Agent        | `/api/support-agent/*`                                                                       | Store-aware diagnostics and confirmed actions                     | Keep write actions disabled until confirmation policy is verified.                  |

## Public Storefront and Shopify Routes

| Group                   | Route examples                                                              | Purpose                                                | Required safeguards                                                           |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Storefront script       | `GET /api/track/script.js`, App Proxy `/apps/ripx/script.js`                | Loads assignment, tracking, price, and heatmap runtime | App Proxy secret/signature and correct shop/site query.                       |
| Assignment and tracking | `POST /api/track`, variant assignment endpoints                             | Assign variants and record events                      | Rate limits, tenant/shop validation, consent gates when enabled.              |
| Checkout price resolver | `POST /api/track/price-resolve-batch`                                       | Resolve checkout line prices for price tests           | `RIPX_CHECKOUT_PRICE_SECRET` in production and signed assignment proof.       |
| Shipping resolver       | `POST /api/track/shipping-resolve-batch`                                    | Resolve shipping behavior for assigned carts           | Public URL must match extension config generated from `.env`.                 |
| Carrier callback        | `POST /api/track/shipping-carrier-rates`                                    | Shopify CarrierService rate callback                   | `APP_URL` or `RIPX_SHIPPING_CARRIER_CALLBACK_URL` must be publicly reachable. |
| Checkout UI             | `GET /api/track/checkout-assignment`, `POST /api/track/checkout-conversion` | Checkout extension assignment and conversion reporting | Checkout UI extension network access and generated config.                    |
| Client errors           | `POST /api/track/client-error`                                              | Storefront runtime error telemetry                     | Dedicated rate limit; avoid sending secrets in metadata.                      |

## Settings and Diagnostics Routes

| Area                 | Route examples                                                                                      | Use                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Installation         | `GET /api/settings/installation`                                                                    | Show App Proxy, script, and install snippets.                     |
| Shopify setup        | `GET /api/shopify/setup/status`, `GET /api/settings/shopify-functions-inventory`                    | Confirm app embed, scopes, and function inventory.                |
| Checkout diagnostics | `GET /api/settings/checkout-price-diagnostics`, `GET /api/settings/checkout-experience-diagnostics` | Verify checkout price and checkout UI readiness.                  |
| Price surfaces       | `GET /api/settings/price-surfaces`, `PUT /api/settings/price-surfaces`                              | Manage PDP/PLP/cart selectors and theme surface mapping.          |
| Integrations         | `GET /api/settings/integrations`, `PUT /api/settings/integrations`                                  | GA4 and BigQuery credentials/status.                              |
| Shop recovery        | `POST /api/settings/shop-session/reset`                                                             | Reset stale Shopify tokens/session state during support recovery. |

## Admin and Operator Routes

| Area             | Route examples                                                       | Use                                                                      |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| System health    | `/api/admin/system-health`, `/api/live`, `/api/ready`, `/api/health` | Deployment and runtime readiness checks.                                 |
| Jobs             | `/api/admin/jobs`, `/api/admin/jobs/:queueName/trigger`              | Inspect, retry, or trigger background workers.                           |
| Test health      | `/api/admin/test-health`, `/api/admin/conflicts`                     | Diagnose stale events, overlapping tests, and readiness issues.          |
| Mail delivery    | `/api/admin/mail-processes`, `/api/admin/mail-test-send`             | Debug OTP, magic link, support, and notification delivery.               |
| Feature controls | `/api/admin/feature-flags`, `/api/admin/test-type-controls`          | Stage features and hide/disable risky test types.                        |
| Event quality    | `/api/admin/event-catalog`, `/api/admin/client-errors`               | Inspect event freshness, client runtime failures, and telemetry quality. |
| Support ops      | `/api/admin/support-tickets`, support inbox routes                   | Triage merchant tickets and replies.                                     |
| Usage export     | `/api/admin/usage-export`                                            | Operational exports and reporting.                                       |

## Operations Scripts

| Command                                     | When to run                                                           | Notes                                                     |
| ------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm run migrate`                           | After pulling schema changes or before deploy                         | Runs unapplied migrations.                                |
| `npm run migrate:mark-applied`              | One-time recovery for databases migrated before tracking              | Use carefully; confirm schema state first.                |
| `npm run ensure-superadmin`                 | Bootstrap first production/admin user                                 | Uses `RIPX_SUPERADMIN_EMAIL` or `RIPX_ADMIN_EMAIL`.       |
| `npm run encrypt:integration-secrets`       | After setting `RIPX_SECRET_ENCRYPTION_KEY` in an existing environment | Re-encrypts stored GA4 and BigQuery secrets.              |
| `npm run remove-unlinked-tenants`           | Cleanup standalone tenants not linked to accounts                     | Run dry-run mode first if supported by the script output. |
| `npm run index-support-kb`                  | Rebuild SupportAI knowledge base                                      | Run after changing support docs or FAQ content.           |
| `npm run verify:analytics-queries`          | Check analytics query plans                                           | Add `-- --analyze` only when intentional.                 |
| `npm run verify:price-pipeline`             | Validate checkout price resolver/config alignment                     | Use before enabling price checkout tests.                 |
| `npm run verify:price-assignment-readiness` | Validate signed assignment proof and resolver readiness               | Use for production price test rollout.                    |
| `npm run verify:shipping-readiness`         | Validate shipping callbacks/scopes/config                             | Use before applying shipping tests.                       |
| `npm run diagnose:shop`                     | Debug one shop's tenant/session/config state                          | Useful when OAuth or app embed status looks stale.        |
| `npm run reset:shop-session`                | Reset a stale Shopify session                                         | Pair with OAuth reinstall/reconnect.                      |
| `npm run verify:oauth`                      | Check OAuth redirect and host config                                  | Use after tunnel/domain changes.                          |
| `npm run shopify:print:partner-urls`        | Generate Partner Dashboard URL checklist                              | Useful when aligning local tunnel URLs.                   |

## Documentation Priorities

1. Add OpenAPI annotations incrementally for the public storefront, tests, analytics, settings diagnostics, support, and admin health routes.
2. Keep merchant-facing decisions in the in-app `/docs` page, especially Price vs Offer vs Shipping vs Checkout.
3. Keep operational runbooks in markdown and link them from `docs/README.md`.
4. Avoid moving secrets or private deploy details into committed docs; document variable names and checks, not values.
