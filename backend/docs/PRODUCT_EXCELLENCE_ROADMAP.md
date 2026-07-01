# RipX product excellence roadmap

Research-backed priorities to compete with premium Shopify experimentation tools (e.g. Intelligems-class SaaS) while leaning into RipX’s strengths: **self-hosting, data ownership, Shopify + standalone, and transparent checkout pricing architecture**.

> **Positioning wedge (recommended):** _“Experimentation for teams that need checkout-accurate price tests, full data control, and hybrid Shopify / non-Shopify surfaces.”_

---

## 1. What “best” means (dimensions)

| Dimension                                | SaaS leaders               | RipX target                                                          |
| ---------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Time-to-first experiment                 | Excellent (guided install) | Close gap with **diagnostics + templates**                           |
| Checkout / price integrity               | Mature, vendor-maintained  | Match with **Discount Function + resolver**; win on **transparency** |
| Merchant UX                              | Visual editors, support    | Invest in **wizard + health dashboards**                             |
| Total cost at scale                      | Subscription + order tiers | **Win** on TCO (infra vs. $100s–$1000s/mo)                           |
| Compliance / data residency              | Vendor DPA                 | **Win** when data must stay in your cloud                            |
| Edge cases (subscriptions, B2B, markets) | Often productized          | **Honest matrix**: support or explicitly block + message             |
| Operations                               | Low merchant burden        | **You** own monitoring, extension releases, runbooks                 |

---

## 2. Competitive research summary (2025–2026)

**Category leaders** combine: (1) storefront assignment, (2) **charged price alignment** via Shopify primitives (Cart Transform, discounts, duplicate SKU strategies, Plus checkout features), (3) analytics framed around revenue/margin, (4) strong onboarding and QA tooling.

**Merchant pain points** (generic, tool-agnostic):

1. **“It looked right on the product page but checkout was wrong.”** → Need end-to-end verification and clear failure modes.
2. **Theme / AJAX cart variance** → `line_item.properties` dropped or altered by apps.
3. **Plan / entitlement confusion** (Plus, network access for Functions).
4. **Trust in analytics** → definitions of visitor/session/order, peeking, sample ratio mismatch.
5. **Operational fear** → “What if the discount function breaks?” → kill switches, monitoring.

RipX should **own (5)** and **instrument (1–2)** better than generic docs alone.

---

## 3. Implemented building blocks (this repo)

| Item                                              | Purpose                                                         |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `POST /api/track/price-resolve-batch`             | Single round-trip for Discount Function `fetch`                 |
| `GET /api/track/price-checkout-diagnostics`       | Public QA (optional `?shop=`)                                   |
| `GET /api/settings/checkout-price-diagnostics`    | Same payload with session shop (Settings UI)                    |
| `scripts/write-ripx-checkout-config.js`           | Keep extension `ripxConfig.js` aligned with `APP_URL` / secrets |
| `docs/SHOPIFY_CHECKOUT_PRICE_RESOLVER.md` (local) | Operator checklist (if present in your tree)                    |

**Shopify Function fetch constraints** (from [performance & resilience](https://shopify.dev/docs/apps/build/functions/network-access/performance-and-resilience)): `readTimeoutMs` **100–2000** (RipX extension uses **2000**); response **~100KB** max; Shopify-side **response cache** (~300s success, shorter on errors) can briefly delay reflecting test changes at checkout.

**Backend hardening (implemented):** batch resolver loads unique tests via **`getTestsByIds` (single query)** with fallback to parallel `getTestById`; **compact JSON** per line by default (`RIPX_PRICE_BATCH_FULL_RESPONSE` for full shape); **HTTP 413** if JSON would exceed configurable max (default **95KB**); **structured logs** `price_resolve_batch` / `price_resolve_batch_response_too_large` / **`price_resolve_batch_slow`** (threshold **`PRICE_BATCH_SLOW_LOG_MS`**, default 800); **timing-safe** checkout secret compare; **UUID map keys** normalized in batch DB load; **stricter rate limit** on public `GET …/price-checkout-diagnostics` (default **120/15min**, `RATE_LIMIT_PRICE_DIAGNOSTICS_MAX`).

---

## 4. Phased roadmap

### Phase A — Reliability & trust (0–6 weeks)

- [x] **Diagnostics endpoint** for batch URL, HTTPS, secret mode, batch limits, optional running `price` test count.
- [x] **Settings UI** — **Store settings → Advanced**: checkout diagnostics runs the same checks; standalone shows an info banner about Shopify-only checkout alignment.
- [ ] **Structured metrics**: counters for `price-resolve-batch` 4xx/5xx/latency (Prometheus or logs).
- [ ] **E2E smoke** (Playwright): script load + cart with properties (dev store).

### Phase B — Merchant experience (6–12 weeks)

- [ ] **Test templates** (e.g. “Collection price test”) with prefilled goals and guardrails.
- [ ] **Guardrails**: max discount %, min visitors before significance nudges, global “disable checkout discounts” kill switch.
- [ ] **Support matrix** in UI: subscriptions, bundles, B2B → supported / beta / not supported.

### Phase C — Analytics depth (12–24 weeks)

- [ ] **Metric definitions** surfaced in UI (tooltip + docs link).
- [ ] **Holdouts** and optional **CUPED** / variance reduction (advanced).
- [ ] **Warehouse export UX**: one-click BigQuery / Snowflake alignment with existing export hooks.

### Phase D — Platform / enterprise (ongoing)

- [ ] **Multi-store org** model, RBAC, audit log, SSO (SAML).
- [ ] **SLA-oriented** runbooks: extension rollback, secret rotation, incident comms template.

---

## 5. Moats that are hard for SaaS to copy

1. **Hybrid Shopify + standalone** with one assignment and API surface.
2. **Full transparency** of checkout pricing path (open code + diagnostics).
3. **Data stays in customer VPC** for regulated industries.
4. **Deep customization** (custom metrics, internal workflows, approvals).

---

## 6. What not to claim

Avoid marketing **“better than all tools everywhere.”** Claim a **wedge** and prove it with **diagnostics, uptime, and clear support boundaries**.

---

## References (external)

- Shopify: Checkout extensibility, Discount Functions, network access requirements (official Shopify docs; verify current API version).
- Intelligems and peers: public pricing and feature pages (for category expectations, not implementation detail).
