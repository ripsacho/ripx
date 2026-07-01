# RipX Store Settings — Redesign Research & Implementation Plan

Last updated: 2026-06-25

## Problem statement

The store settings page (`/app/:domain/settings`) was functionally complete but presented as an **internal diagnostics console** rather than a merchant-friendly settings experience. Users landed on tables, badges, KPI grids, and “Debug JSON” before they understood what to do next.

## Current architecture (as implemented)

| Item                   | Detail                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| **Route**              | `/app/:domain/settings?tab=installation\|general\|integrations\|presets\|advanced`                      |
| **Main files**         | `Settings.jsx` (~2.57k LOC logic), `SettingsPageShell.jsx` + header/rail/display shell                  |
| **Layout modes**       | `tabbed` (default) vs `all` (scroll + rail)                                                             |
| **Sections**           | Store setup, Testing defaults, Integrations, Targeting presets, Advanced                                |
| **Extracted sections** | `sections/StoreSettings*.jsx` (5 files)                                                                 |
| **Primitives**         | `SetupProgressHeader`, `SetupStepRow`, `SettingsTabIntro`, `SettingsSectionLead`, `SectionTitleWithTip` |
| **Config / utils**     | `config/settingsConstants.js`, `config/settingsSectionHelp.js`, `utils/formatRelativeTime.js`           |
| **Modals**             | `modals/InstallSnippetModal.jsx`, `modals/WebhooksSettingsModal.jsx`                                    |
| **Related**            | `Profile.jsx` (user prefs), `SetupWizard.jsx` (onboarding funnel)                                       |

### File tree

```
frontend/src/components/Settings/
├── Settings.jsx
├── Settings.module.css
├── config/
│   ├── settingsConstants.js
│   ├── settingsSectionHelp.js
│   └── settingsTabs.js
├── modals/
│   ├── DeletePresetModal.jsx
│   ├── InstallSnippetModal.jsx
│   └── WebhooksSettingsModal.jsx
├── primitives/
│   ├── SetupProgressHeader.jsx
│   ├── SetupStepRow.jsx
│   ├── SettingsTabBar.jsx
│   ├── SettingsTabIntro.jsx
│   ├── SettingsSectionLead.jsx
│   ├── SectionTitleWithTip.jsx
│   └── SettingsPrimitives.module.css
├── sections/
│   ├── index.js
│   ├── StoreSettingsStoreSetupSection.jsx
│   ├── StoreSettingsTestingDefaultsSection.jsx
│   ├── StoreSettingsIntegrationsSection.jsx
│   ├── StoreSettingsTargetingPresetsSection.jsx
│   └── StoreSettingsAdvancedSection.jsx
└── utils/
    ├── checkoutDiagCache.js
    ├── formatRelativeTime.js
    └── storeHealthChecks.js
```

### Why it felt like debugging (before)

1. **Hero KPI grid** — 4 metrics on a settings page
2. **Command bar** — “Run diagnostics”, “Sync checkout UI” on non-setup views
3. **Installation checklist** — HTML `<table>` with engineer labels
4. **Triple navigation** — tabs + left rail + jump chips + command bar
5. **Monolith** — no extracted section components; dead diagnostics JSX
6. **Copy** — “App settings”, “Installation”, “Run diagnostics”

### What works now

- Tabbed default with Profile-style intros (eyebrow + description)
- Store setup progress bar + step list (no checklist table)
- Diagnostics moved to **Advanced** tab (not modals)
- Testing defaults preset cards with one-click apply
- GA4 / BigQuery integration tiles
- Merchant copy: Store settings, Store setup, Check setup, Technical details

## Target information architecture

```
Store settings
├── Store setup        (tab=installation)
├── Testing defaults   (tab=general)
├── Integrations       (tab=integrations)
├── Targeting presets  (tab=presets)
└── Advanced           (tab=advanced — diagnostics, preview probes, JSON export)
```

## Design principles

1. **Settings ≠ dashboard** — no KPI grid on settings landing
2. **One primary action per context** — “Check setup” not three equal CTAs
3. **Progress over tables** — step list with % complete
4. **Plain language** — “Store setup”, “Check setup”, “Technical details”
5. **Progressive disclosure** — health checks in `<details>`, debug in Advanced tab

## Implementation phases

### Phase 1 — Quick wins + store setup UX ✅

- [x] Document research (this file)
- [x] Default layout → tabbed
- [x] Rename page/tabs to merchant language
- [x] Remove hero KPI metrics grid
- [x] Limit command bar to store setup context
- [x] Store setup progress bar + step list
- [x] Rename Debug → Technical details / Open Advanced
- [x] Remove dead diagnostics block
- [x] Tab intros in tabbed mode
- [x] Calmer shell and panel cards
- [x] Auth reset step only when Shopify auth failed
- [x] Sidebar / TopBar → “Store settings”
- [x] Advanced tab with `StoreSettingsAdvancedSection`
- [x] Extract all five section components + shared primitives
- [x] Shared `settingsConstants.js` + `formatRelativeTime`
- [x] Extract install snippet + webhooks + delete preset modals
- [x] `config/settingsTabs.js` + tab routing tests
- [x] `SettingsTabBar` primitive + checkout diag cache util

### Phase 2 — Component extraction ✅ (partial shell split deferred)

- [x] `sections/StoreSettingsStoreSetupSection.jsx`
- [x] `sections/StoreSettingsTestingDefaultsSection.jsx`
- [x] `sections/StoreSettingsIntegrationsSection.jsx`
- [x] `sections/StoreSettingsTargetingPresetsSection.jsx`
- [x] `sections/StoreSettingsAdvancedSection.jsx`
- [x] `primitives/` — SetupStepRow, SettingsSectionLead, etc.
- [x] `modals/` — InstallSnippetModal, WebhooksSettingsModal
- [x] Thin `SettingsPageShell.jsx` shell (tabs + routing layout)
- [x] `TechnicalHealthChecksPanel` with grouped layout + stat summary

### Phase 3 — Visual system (ongoing)

- [x] Calmer cards on settings shell
- [x] Advanced tab subdued styling (`.settingsTabAdvanced`)
- [ ] Shared settings tokens in `index.css`
- [ ] Align Profile + Settings primitives fully

### Phase 4 — Copy & docs alignment (in progress)

- [x] Settings page merchant copy
- [x] Sidebar, TopBar, breadcrumbs
- [x] SetupWizard links
- [x] OAuthSuccess, Support, assistant FAQs, TestWizard help
- [x] Documentation.jsx references + Advanced tab docs
- [x] README checkout QA path updated
- [x] Component tests for settings tabs, health checks, preset resolution, formatRelativeTime

### Phase 5 — Validation

- 5-user task test: “Is my store ready to run a price test?”
- Target: answer in < 30 seconds
- Track: Advanced section opens < 15% of visits

## Success metrics

| Metric                                   | Target |
| ---------------------------------------- | ------ |
| Time to answer setup readiness           | < 30s  |
| Clicks to attach discount function       | ≤ 3    |
| Settings bounce rate                     | ↓ 25%  |
| Support tickets mentioning “diagnostics” | ↓ 40%  |

## Remaining opportunities

1. Split `Settings.jsx` routing/shell into `SettingsPage.jsx` (~500 LOC target for shell)
2. Move checkout diag fetch hooks into a `useStoreSettingsData` hook
3. Add Vitest coverage for preset apply + tab routing
4. Remove legacy `all` layout mode if usage stays low
