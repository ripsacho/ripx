# RipX Roadmap

Single source of truth for feature planning. See also [PROJECT_REVIEW_AND_RECOMMENDATIONS.md](../PROJECT_REVIEW_AND_RECOMMENDATIONS.md).

---

## Quick Wins (Done / In Progress)

| Item                       | Status                                                     |
| -------------------------- | ---------------------------------------------------------- |
| Promo Links route & nav    | ✅ Done (route exists; Test Detail links for offer tests)  |
| Settings backend           | ✅ Done (shop_settings table, GET/PUT /api/settings)       |
| Notifications              | ✅ Done (API, TopBar dropdown, test-complete notification) |
| Documentation organization | ✅ Done (vision/, archive/, consolidated)                  |

---

## Phase 1: Stability & Gaps (4–6 weeks)

| #   | Task                                            | Effort   | Status      |
| --- | ----------------------------------------------- | -------- | ----------- |
| 1   | Add core unit + integration tests               | 1–2 wks  | In progress |
| 2   | Fix storefront flicker (inline script or proxy) | 2–5 days | Pending     |
| 3   | Combination Testing UI                          | 3–5 days | Pending     |
| 4   | Promo Links link from Analytics for offer tests | 1 day    | Pending     |

---

## Phase 2: Features & Quality (6–10 weeks)

| #   | Task                                        | Effort   |
| --- | ------------------------------------------- | -------- |
| 7   | Bayesian stats option                       | 1–2 wks  |
| 8   | Experiment YAML import/export               | 1 wk     |
| 9   | Custom Metrics UI                           | 1 wk     |
| 10  | Multi-Segment Analytics (filter by segment) | 3–5 days |
| 11  | Test templates / presets                    | 1 wk     |

---

## Phase 3: Differentiators (10+ weeks)

| #   | Task                                     | Effort  |
| --- | ---------------------------------------- | ------- |
| 12  | Multi-Armed Bandit mode                  | 2–3 wks |
| 13  | AI hypothesis suggestions                | 4+ wks  |
| 14  | Edge decisioning (if scaling demands it) | 4–6 wks |

---

## Vision (Future)

See [FUTURISTIC_AB_TEST_PLAN.md](../vision/FUTURISTIC_AB_TEST_PLAN.md) for long-term AI/edge/RL ideas. RipX stays Shopify-first; use as inspiration only.

---

## Related Docs

- [FEATURES_IMPLEMENTED.md](./FEATURES_IMPLEMENTED.md) – What’s done
- [FUTURE_PLAN.md](./FUTURE_PLAN.md) – Detailed gap analysis
- [PROJECT_REVIEW_AND_RECOMMENDATIONS.md](../PROJECT_REVIEW_AND_RECOMMENDATIONS.md) – Full review
