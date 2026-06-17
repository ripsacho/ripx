# Shipping Test Competitive Research

RipX shipping tests should make the checkout delivery experience controllable, auditable, and easy to QA.

## Table stakes

- Merchants can control the checkout method title, subline, price, and delivery promise for app-calculated rates.
- Merchants can compare additive preview rates against native Shopify rates or replace native methods cleanly.
- Diagnostics show whether Shopify has called the carrier callback and what rate payload RipX returned.
- The wizard preview matches live checkout closely enough for non-technical merchants to trust it before QA.

## RipX advantages to protect

- CarrierService + Delivery Customization are separated clearly: CarrierService creates rates; Delivery Customization hides, renames, or reorders existing options.
- Variant assignment uses signed cart-line attributes, so checkout behavior can follow experiment cohorts.
- Multi-rate rows let one variant simulate Economy, Standard, and Express without separate tests.
- Current Shopify setup discovery gives merchants real profile/zone/rate context before apply.

## Gaps to keep closing

- Delivery promise presets currently skip weekends but do not know merchant holidays or fulfillment cutoffs.
- Provider-backed `carrier_quote` is still limited to static/country-table providers until real carrier integrations are added.
- Native Shopify control copy remains outside RipX. The app should explain this clearly instead of pretending to own it.
- Duplicate native/app rate names can cause partial checkout rendering; diagnostics should keep warning before launch.

## Best-in-class checklist

1. Configure shopper-facing copy per variant and per rate row.
2. Preview title, subline, delivery promise, and price in the wizard.
3. Apply shipping resources without stale callback URLs after tunnel changes.
4. Run a live checkout QA order for each variant.
5. Re-run diagnostics and confirm the latest callback payload matches the preview.
