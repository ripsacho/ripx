# Shipping Wizard Unified Redesign Plan

## Objective

Build a single, user-friendly 4-step shipping wizard that replaces split offer/advanced/legacy flows while preserving existing backend shipping execution contracts.

## Final UX (Target)

1. **Step 1: Choose shipping test type**
   - Flat rate (replace)
   - Flat rate (add)
   - Free shipping
   - Free over threshold
   - Shipping discount (%)
   - Shipping discount ($)
   - Hide method
   - Rename method
   - Carrier/app rate
2. **Step 2: Hide existing methods (optional/required by type)**
   - Shopify method checkbox list
   - Required for replace/hide/rename
3. **Step 3: Configure shipping behavior**
   - For flat rate: rows with name, amount, date range, message, add/remove rows
   - For discounts/threshold: minimal relevant fields
   - For hide-only: no extra fields
4. **Step 4: Review and apply**
   - Simple summary
   - Blockers list
   - Preview
   - Diagnostics + Apply + Live refresh

## Constraints and Feasibility

### Feasible without backend redesign

- Unified wizard layout and step routing
- Right rail reduction/simplification
- Per-type dynamic fields in Step 3
- Shared review/apply surface

### Must keep current backend contracts

- Replacement flat rate uses `strategy: flat_rate` with `shipping_display_mode: replace_existing_methods`
- Hide/rename path encoded as `strategy: carrier_quote` + `execution_hint: delivery_customization`
- Apply pipeline still depends on:
  - Carrier service for replacement rate visibility
  - Delivery customization for hiding native methods

### Shopify behavior constraints

- Replace-mode hide only occurs when replacement rate is present at checkout
- Fresh cart assignment is required for accurate variant behavior

## Architecture Changes

### Current pain points

- Shipping module logic is embedded in `TestWizard.jsx` in a very large block.
- Two main guided flows (offer vs advanced) plus legacy mode.
- Duplicated progress/readiness patterns in main form and right rail tabs.

### New architecture

- Extract shipping wizard UI/state from `TestWizard.jsx` into dedicated shipping components.
- Use a single step state machine for all shipping types.
- Keep a compact preview companion and move actions to Step 4.

## Implementation Phases

### Phase 0 - Foundation (current kickoff)

- Add shared shipping wizard blueprint for test types and step keys.
- File: `frontend/src/components/TestWizard/shipping/config/shippingWizardBlueprint.js`

### Phase 1 - Extraction without behavior change

- Create `ShippingVariantStudio` container and move shipping rendering from `TestWizard`.
- Add `useShippingWizardState` hook for step navigation and per-type requirements.
- Keep existing logic paths intact during extraction.

### Phase 2 - Unified Step 1 and Step 2

- Build a new type selector using blueprint metadata.
- Standardize method-selection step rules by selected type.
- Remove split `scope/category` ambiguity.

### Phase 3 - Unified Step 3 Configure

- Build a single configure component with per-type sub-sections.
- Flatten duplicated field renderers into one map-driven form.

### Phase 4 - Review + Apply consolidation

- Replace right rail tab complexity with:
  - lightweight preview companion
  - review and operations in Step 4
- Integrate diagnostics/apply/live-refresh in one location.

### Phase 5 - Cleanup and migration

- Remove dual-flow branching (`usesOfferWizardFlow` and legacy split logic where possible).
- Remove duplicated checklist/progress UI.
- Keep backward compatibility for saved tests by mapping old metadata to new step state.

## Risks and Mitigations

1. **Regression in apply behavior**
   - Mitigation: preserve config field mapping, add targeted regression tests.
2. **Frontend readiness mismatch with backend validation**
   - Mitigation: define shared required-fields matrix from strategy + mode.
3. **Large refactor footprint**
   - Mitigation: phase extraction first with no behavior changes.

## Test Plan by Phase

- Unit:
  - `shippingConfig` readiness and strategy mapping
  - step routing requirements per type
- Integration:
  - replace flow (hide + replacement row)
  - add-rate flow
  - discount/threshold flows
- Manual:
  - diagnostics and apply for each major type
  - checkout verification with fresh cart assignment

## Current Implementation Structure (as-built)

The shipping studio has now been extracted into layered modules so `TestWizard.jsx` only orchestrates the flow.

### Developer Quick Start

1. Update shipping type metadata in `shipping/config/shippingWizardBlueprint.js`.
2. Implement/adjust guided step behavior in `shipping/panels/ShippingVariantEditorPanel.jsx`.
3. Keep shared bindings in `shipping/buildShippingVariantStudioBindings.js` as the single source for studio `state`, `actions`, and `renderers`.
4. Verify readiness and preview/apply messaging in shipping config utilities plus `shipping/panels/ShippingVariantRail.jsx`.
5. Validate end-to-end with `shippingConfig` unit tests and one manual fresh-cart checkout pass for replace/hide behavior.

### Component layering

- `frontend/src/components/TestWizard/TestWizard.jsx`
  - Decides when to render shipping studio and passes high-level bindings.
- `frontend/src/components/TestWizard/shipping/ShippingVariantStudio.jsx`
  - Top-level shipping studio orchestrator.
  - Connects grouped bindings (`state`, `actions`, `renderers`) to subcomponents.
- `frontend/src/components/TestWizard/shipping/panels/ShippingVariantWorkspaceShell.jsx`
  - Owns variant tabs, active panel header, workspace shell, and comparison strip.
- `frontend/src/components/TestWizard/shipping/panels/ShippingVariantEditorPanel.jsx`
  - Owns guided left-side editor steps (Type, Hide methods, Configure, Review).
- `frontend/src/components/TestWizard/shipping/panels/ShippingVariantRail.jsx`
  - Thin wrapper around `ShippingPreviewCompanion` (status chips + shopper mock preview only).
- `frontend/src/components/TestWizard/shipping/panels/ShippingReviewStepPanel.jsx`
  - Step 4 review, blockers, and all diagnostics/apply/live-debug operations.

### Binding helpers

- `frontend/src/components/TestWizard/shipping/buildShippingVariantStudioBindings.js`
  - Builds grouped studio contracts from `TestWizard` context:
    - `state` (display + derived values)
    - `actions` (mutations + operation handlers)
    - `renderers` (existing render helpers reused by panels)
- `frontend/src/components/TestWizard/shipping/hooks/useShippingVariantStudio.js`
  - Normalizes grouped contracts into concrete props expected by shell/editor/rail components.

### Extension guidelines

- Add new shipping type behavior in:
  - wizard blueprint: `shipping/config/shippingWizardBlueprint.js`
  - guided editor logic: `ShippingVariantEditorPanel.jsx`
  - readiness/review messaging: shipping config utilities and rail summary.
- Keep apply/diagnostics action wiring centralized in `buildShippingVariantStudioBindings.js` to avoid drift.
- Preserve backend field contracts (`strategy`, `execution_hint`, `shipping_display_mode`, `delivery_action`, method names/codes) when extending Step 3 fields.

## V3 Rollout and QA

The unified 4-step wizard ships behind the existing shipping studio flag:

- **Env:** `VITE_RIPX_SHIPPING_STUDIO_V2` (default on unless set to `0`, `false`, `off`, or `legacy`)
- **Local override:** `localStorage.ripx_shipping_studio_v2` (`1`/`true`/`on`/`enabled` forces on; `0`/`false`/`off`/`legacy` forces legacy sidebar flow)
- **CLI readiness helper:** run `npm run verify:shipping-wizard-v3` (or `npm run verify:shipping-wizard-v3 -- --strict`) before manual QA.
- **Dev render debug toggle:** set `localStorage.ripx_shipping_render_debug = 'enabled'` to log shipping studio render counts in browser devtools (dev mode only).

### Staged QA checklist

1. **Internal:** enable flag, walk all 9 test types through Steps 1–4, confirm save/edit round trips.
2. **Replace/hide flows:** after apply, open checkout with a **fresh cart** and verify hidden methods + replacement rates.
3. **Saved tests:** open legacy `shipping_wizard_path: advanced` configs; confirm `shipping_test_type` metadata maps to the correct Step 1 selection.
4. **Rollback:** set `VITE_RIPX_SHIPPING_STUDIO_V2=legacy` or `localStorage.ripx_shipping_studio_v2=legacy` to restore the pre-V3 sidebar editor without backend changes.
