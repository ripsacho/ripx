# Theme Test Preflight and Troubleshooting

This guide explains how to launch theme tests safely, how forced starts are audited, and how to debug runtime theme application issues.

## Launch workflow

1. Open the **Launch safety check** modal from `TestDetail` or `TestList`.
2. Run **Preflight**.
3. Fix blocking errors when possible.
4. If you must bypass errors, enable **Force start** and provide a clear **force-start reason**.
5. Optionally set visual QA launch metadata (`visual_qa_baseline_id`, `visual_qa_checked_at`, `visual_qa_required`).
6. Start the test.

## What preflight validates

Preflight now checks:

- Test is in a startable status (`draft`, `stopped`, `completed`)
- Variant count and allocation integrity
- Canary settings (`traffic_ramp_percent`, `traffic_ramp_days`)
- Guardrail recommendation
- Conflict checks (experiment group overlap and target overlap)
- Theme integrity checks:
  - Required template handle for `template_switch`
  - Required section ID for `section_variant`
  - Required redirect URL for `theme_redirect`
  - Template handle format validity
  - Section ID format validity
  - Theme mode parity recommendation across actionable non-control variants
  - Template/section reference diversity and target-alignment warnings
  - Control parity check (non-control variants must differ from control signature)
  - Redirect origin parity warning for cross-origin redirects
  - Visual QA hooks (`goal.visual_qa`) for baseline presence and recency
  - Template-target integrity warnings for product-scoped template-switch tests

## Force start policy

When `force=true`:

- `force_reason` is required
- Minimum reason length is 8 characters
- Start action is recorded in audit logs with:
  - Whether force was applied
  - Force reason
  - Preflight error/warning counts
  - Effective canary settings
  - Visual QA launch metadata (when provided)

## Runtime telemetry for theme application

The storefront runtime now tracks theme application counters:

- `attempts`
- `applied`
- `retried` (body-not-ready retry path)
- `timedOut` (body wait timeout)
- `fallbacks` with per-reason counts

Use browser console:

- `window.RipX.debugThemeStats()` to print and return theme runtime stats
- `window.RipX.debugThemeStats({ reset: true })` to reset counters
- `window.RipX.debugStatus()` to include `diagnostics.themeStats`

## Risk and SRM signals

Test health now includes:

- SRM detection summary (`health.srm`)
- Risk classification (`health.riskSignals`)
- Rollout guidance (`health.rolloutRecommendation`)

In Test Detail:

- SRM/high-risk warnings surface near the hero controls
- You can download a concise markdown report via **Report (MD)**
- Launch preflight details can be filtered by severity (errors/warnings/passed)

## Common issues and fixes

- **Preflight error: template handle required**
  - Add `themeTemplateHandle` (or `template`) for non-control `template_switch` variants.
- **Preflight error: section ID required**
  - Add `sectionId` for non-control `section_variant` variants.
- **Preflight error: invalid template handle**
  - Use lowercase handle-safe format like `product`, `collection`, `page-about`.
- **Preflight error: invalid section ID**
  - Use ID characters compatible with section identifiers (`letters`, `numbers`, `.`, `_`, `:`, `-`).
- **Preflight error: variants identical to control**
  - Update one or more non-control variants so their mode/config/code differs from control.
- **Preflight warning: cross-origin redirect URL**
  - Prefer same-store relative paths for attribution consistency and reduced risk.
- **Runtime fallback/timeouts increase**
  - Verify script loads in `<head>` with `defer`.
  - Check theme structure and delayed body rendering.
  - Re-run with `window.RipX.setDebug(true)` and inspect console logs.

## Suggested operator checklist

- Preflight has zero blocking errors.
- Canary launch values are intentional.
- Guardrails are enabled.
- Theme mode is consistent for the test.
- Any forced launch has a specific, actionable reason.
