# Calculations and statistics – audit

Where calculations live, how they stay consistent, and conventions used across RipX.

---

## Source of truth

| Concept                          | Backend                                                                                                           | Frontend                                                 | Notes                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Significance threshold**       | `backend/src/constants/index.js` → `STATISTICAL_THRESHOLD.P_VALUE` (0.05)                                         | N/A                                                      | Default p-value threshold; overridden per shop by `confidence_level` (threshold = 1 − confidence). |
| **Shop confidence level**        | `shop_settings.confidence_level` (0.8–1), admin overrides in `shop_settings.overridden_by_admin_confidence_level` | Settings UI: 90%, 95%, 99% → 0.9, 0.95, 0.99             | Clamped to [0.8, 1]; default 0.95. Used to derive significance threshold.                          |
| **Min / max sample size**        | `settingsRoutes.js` and `adminRoutes.js`: 10–10000                                                                | Settings presets; SampleSizeCalculator                   | Bounds repeated in backend; could be moved to constants.                                           |
| **Conversion rate**              | `analytics.js` → `calculateConversionRate(c, v)` = (c/v)\*100                                                     | Display only (from API)                                  | Single implementation in backend.                                                                  |
| **Significance (2 variants)**    | `analytics.js` → `calculateSignificance` (Z-test or Fisher)                                                       | Display only                                             | Threshold from shop confidence in `getTestAnalytics`.                                              |
| **Significance (multi-variant)** | `analytics.js` → `calculateMultiVariantSignificance` (chi-square + pairwise)                                      | Display only                                             | Same threshold from shop.                                                                          |
| **Revenue impact**               | `analytics.js` → `calculateRevenueImpact` (impact, impactPercent, RPV)                                            | Display only                                             | Backend-only.                                                                                      |
| **Sample size formula**          | N/A                                                                                                               | `SampleSizeCalculator.jsx` → two-proportion formula, MDE | Used for planning only; backend does not compute required sample size.                             |

---

## Flow: confidence level → significance

1. **Settings**: User sets confidence level (e.g. 95%) → stored as 0.95 in `shop_settings.confidence_level` (or admin override).
2. **Analytics**: `getTestAnalytics(testId, shopDomain)` loads `confidence_level` for that shop, then:
   - `significanceThreshold = 1 - confidence_level` (e.g. 0.05 for 95%).
   - Calls `calculateSignificance` / `calculateMultiVariantSignificance` with `significanceThreshold`.
3. **Result**: `significant: true` when p-value < threshold; health and auto-stop use this flag, not a hardcoded 0.05.

So:

- **Test health**: Uses `test.significance.significant` (respects shop confidence).
- **Auto-stop**: Uses `getTestAnalytics` → significance already uses shop confidence; no hardcoded 0.05 in decision.

---

## Rounding and display

- **p-value**: Rounded to 4 decimal places (`Math.round(pValue * 10000) / 10000`).
- **Confidence (as %)** and **lift**: 2 decimal places.
- **Revenue / impact / RPV**: 2 decimal places.
- **Wilson score interval**: 2 decimal places (percent 0–100).
- **Bayesian probability to beat control**: 3 decimal places.

---

## Edge cases (backend)

- **Conversion rate**: Returns 0 when visitors ≤ 0 or conversions not finite.
- **Significance**: Returns `significant: false`, `pValue: 1`, `confidence: 0` when insufficient data; uses Fisher for small samples (total n < 30 or expected cell < 5).
- **Revenue impact**: RPV and impact percent handle zero visitors/revenue without division errors.

---

## Tests

- **Backend**: `analyticsSrm.test.js`, `analyticsBayesian.test.js`; analytics service methods are covered.
- **Frontend**: Sample size calculator and settings presets are in UI; no separate unit tests for formula (formula is standard two-proportion power).

---

## Possible future improvements

- **Constants**: Done – `SETTINGS_BOUNDS` in `backend/src/constants/index.js` (MIN_SAMPLE_SIZE, MAX_SAMPLE_SIZE, CONFIDENCE_LEVEL_MIN/MAX, DEFAULT_CONFIDENCE_LEVEL, DEFAULT_MIN_SAMPLE_SIZE) is used in settings routes, admin routes, and analytics default confidence.
- **Wilson interval**: Currently uses z for 0.95 and 0.99 only; could derive z from shop confidence for consistency.
