# Theme Test Strategy Master Plan

Last updated: 2026-04-09
Owner: Product + Engineering
Status: Phase A delivered, Phase B/C in progress

Execution update (2026-04-05):

- Phase A hardening delivered in code: preflight v2 checks, force-start reason + audit, theme runtime telemetry, troubleshooting guide.
- Phase B started: `theme_redirect` mode added across wizard, validation, preflight, and storefront mode normalization.
- Phase C started: SRM-aware risk signals and rollout recommendation outputs added to health/report surfaces.
- Added deeper Phase B checks: control parity, redirect origin/path parity, and visual QA baseline hooks in preflight.
- Added Phase C UI surfacing: SRM/high-risk alerts and direct markdown report download in Test Detail.
- Launch path now supports persisted visual QA start metadata through preflight/start flow.
- Added preflight severity filters in launch modals and visual QA metadata in report outputs.

## 1) Purpose

This plan defines how RipX will become best-in-class for Shopify Theme Type Testing by combining:

- Shopify-native test UX (easy and safe for operators)
- Deterministic and low-flicker delivery (high runtime reliability)
- Strong experimentation governance (preflight, canary, guardrails, holdouts)
- Business-impact analytics (profit + conversion, not only CTR)

## 2) Current RipX approach (baseline)

RipX currently runs a structured Theme Test model with:

- Theme contract in variant config:
  - `themeMode`: `template_switch`, `section_variant`, `asset_flag`
  - variant fields: `themeTemplateHandle`, `themeId`, `sectionId`, `bodyClass`
- Deterministic storefront apply path:
  - normalized runtime config
  - `data-ripx-*` attributes + theme variant events
- Activation safety:
  - preflight endpoint (`GET /api/tests/:id/preflight`)
  - guarded start path with optional `force=true`
  - canary controls (`canary_percent`, `canary_days`)
  - guardrail auto-stop and rollback logic
- UI controls:
  - launch safety modal in Test Detail + Test List
  - card-level preflight readiness badges

## 3) Market research summary

## 3.1 Shopify-focused tools

- Shoplift:
  - strong no-code theme/template testing in Shopify workflows
  - theme customizer-first UX
  - anti-flicker and one-click winner apply positioning
- Intelligems:
  - broad experimentation (content/theme + price/shipping/offers)
  - strong profit framing and segmentation
  - theme testing as part of larger commercial optimization suite

## 3.2 Enterprise experimentation platforms

- Optimizely:
  - mature holdout and governance patterns
  - robust experimentation program-level measurement
- VWO:
  - practical anti-flicker and QA guidance
  - operational troubleshooting depth
- AB Tasty:
  - strong traffic governance and allocation controls
  - bucketed repartition and dynamic allocation ideas

## 3.3 Gap to exploit

No single tool consistently combines:

- Shopify-native theme operations
- hard runtime reliability SLOs
- experiment governance depth
- margin-aware analytics

RipX should own this combined position.

## 4) Strategic goals (12-month)

- Goal A: Best launch reliability for theme tests
  - Preflight catch rate > 85%
  - Runtime apply success > 99% p95
- Goal B: Best operator safety
  - 100% launches through preflight path
  - forced starts tracked with reason
- Goal C: Best decision quality
  - higher confident-decision rate in 14 days
  - lower false winner rollouts via guardrails + SRM checks
- Goal D: Best business relevance
  - profit-aware reporting for theme tests
  - clear winner rollout path with rollback automation

## 5) Product principles

- Deterministic over magical
- Safety by default, override by exception
- Fast operator workflow with clear diagnostics
- Business metrics over vanity metrics
- Backward compatible evolution of test contracts

## 6) Target architecture

## 6.1 Execution modes for Theme Type Test

Support four modes under one Theme Test type:

1. `asset_flag` (current): class/attribute flag driven
2. `section_variant` (current): section-targeted variant logic
3. `template_switch` (current): template-level switching
4. `theme_redirect` (new): full-theme swap/redirect style experience for whole-theme redesign tests

Each mode should pass a mode-specific preflight checklist.

## 6.2 Runtime reliability stack

- Assignment early in lifecycle (before large visual paint changes)
- Scoped anti-flicker strategy (only impacted regions where possible)
- Timeout fail-safe to control experience
- Observable runtime events:
  - assignment created
  - variant applied
  - apply timeout/fallback
  - recovery path

## 6.3 Governance + policy stack

- Start gating via preflight API
- Canary orchestration with configurable days
- Guardrails with multi-action rollback policy:
  - stop test
  - rollback to lower rollout %
  - fallback to control-only
- Program-level holdout support
- Mutual exclusion beyond simple group key (interaction graph)

## 6.4 Analytics + reporting stack

- Test report should include:
  - conversion + revenue + quality score
  - guardrail outcomes
  - canary stage transitions
  - runtime health counters
- Add impact framing:
  - projected uplift/loss with confidence and risk notes

## 7) Phased roadmap

## Phase A - Hardening (0-4 weeks)

Objective: stabilize launch and runtime quality.

Scope:

- Expand preflight checks:
  - theme/template existence checks
  - section/key integrity checks
  - variant contract strictness checks
- Add runtime telemetry counters and logs for apply pipeline
- Add preflight result persistence (optional table or KV entry)
- Add forced-start reason capture

Exit criteria:

- preflight checks cover > 90% known launch failures
- zero critical lint/test regressions

## Phase B - Native fidelity (4-8 weeks)

Objective: improve test fidelity for full-theme scenarios.

Scope:

- Add `theme_redirect` mode
- Winner apply flow with dry-run and rollback checkpoint
- Theme parity checks between control and variant theme artifacts
- Visual QA snapshot baseline (desktop/mobile)

Exit criteria:

- successful end-to-end full-theme test without manual code hacks
- rollback validated in staging

## Phase C - Decision intelligence (8-12 weeks)

Objective: improve statistical and rollout confidence.

Scope:

- Add SRM auto-alert in start/monitor workflows
- Introduce risk-aware rollout recommendations
- Add Bayesian decision view (optional, behind feature flag)
- Add guardrail policy templates per test risk profile

Exit criteria:

- measurable reduction in bad rollouts
- improved confidence/readiness signal quality in reports

## Phase D - Differentiation (12+ weeks)

Objective: outcompete on workflow and enterprise readiness.

Scope:

- Theme Test Studio UX (guided mode + advanced mode)
- Git/CI friendly experiment promotion flow
- Role-based permissions for force start and rollout
- Enterprise integrations for analytics export and alerting

Exit criteria:

- launch-to-live time reduced significantly
- admin and growth teams can run safely without engineering bottlenecks

## 8) Detailed backlog by stream

## 8.1 Backend stream

- [x] Extend preflight checks for mode-specific compatibility
- [ ] Add preflight persistence schema (optional)
- [x] Add forced-start reason in audit log payload
- [x] Add `theme_redirect` mode support in test contract + runtime payload
- [ ] Add guardrail policy presets (min visitors, rollback target, cooldown)
- [ ] Add runtime health endpoint fields for theme test apply performance

## 8.2 Frontend stream

- [ ] Theme Test wizard mode helper with guided hints
- [ ] Preflight panel with grouped sections and fix recommendations
- [ ] Launch modal improvements:
  - [ ] severity filters
  - [ ] one-click re-run preflight
  - [x] forced-start reason input
- [ ] Theme Test Studio surface for mode-specific setup and QA

## 8.3 Storefront/runtime stream

- [ ] Scoped anti-flicker controls per mode
- [x] apply-time instrumentation marks
- [x] fallback path hardening for delayed assignment/apply
- [ ] compatibility fallback for missing selectors/sections

## 8.4 Data/analytics stream

- [ ] Extend report schema with runtime and guardrail diagnostics
- [ ] Add canary stage history model
- [ ] Add business-impact summary blocks in report output

## 8.5 QA/operations stream

- [ ] Build reusable staging checklist per mode
- [ ] Add browser/device matrix smoke suite
- [ ] Add visual regression baseline for high-traffic templates

## 9) KPIs and SLOs

Operational:

- p95 apply-success >= 99%
- preflight API p95 <= 400ms (excluding optional deep checks)
- launch failure rate due to avoidable config issues down by 70%

Product:

- median setup-to-launch time < 15 minutes
- % tests launched with canary >= 60% for high-risk modes
- % launches using force start <= 10%

Business:

- higher confident winner rate
- lower rollback incidents after full rollout

## 10) Risks and mitigations

- Risk: Anti-flicker hurts page speed
  - Mitigation: scoped hiding, timeout caps, performance budget alerts
- Risk: Theme parity issues across stores
  - Mitigation: preflight parity checks + compatibility warnings
- Risk: Operators bypass safety with force start
  - Mitigation: force reason required + audit + alert on repeated force usage
- Risk: Contract drift between frontend/backend/runtime
  - Mitigation: shared schema tests + compatibility adapters

## 11) Dependencies

- Stable storefront script versioning and rollout process
- Reliable test analytics ingestion
- Audit logging and admin permissions
- Optional visual QA infrastructure for snapshots

## 12) Suggested next sprint (execution starter)

Sprint objective: finish Phase A hardening.

Target deliverables:

- [x] Preflight check set v2 (theme parity + section/template integrity)
- [x] Force-start reason requirement in launch modal and backend audit
- [x] Runtime telemetry counters for apply success/timeout/fallback
- [x] Preflight check docs and troubleshooting guide

Definition of done:

- code + tests + docs merged
- lint/tests green
- staging validation complete on at least 2 themes and 2 page types

## 13) Decision log template (for future updates)

Use this template whenever strategy changes:

- Date:
- Decision:
- Why:
- Alternatives considered:
- Impacted modules:
- Rollout plan:
- Rollback plan:
