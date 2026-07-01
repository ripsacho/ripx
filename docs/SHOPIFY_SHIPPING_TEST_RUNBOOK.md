# Shopify Shipping Test Runbook

Use this runbook when rolling out RipX shipping tests on a Shopify store.

## What RipX Supports

- `discount_function` checkout runtime for `threshold_free_shipping`, `discount_percentage`, `discount_fixed`, and `free_shipping`
- `carrier_service` runtime for `flat_rate` and provider-backed `carrier_quote`
- `delivery_customization` auto-apply for Plus/dev stores when a variant hides, renames, or reorders existing delivery methods
- Cart-qualified product targeting for shipping tests: `all carts`, `carts with selected products`, and optional excluded products
- Managed resource cleanup for RipX-created carrier services, automatic discounts, and delivery customizations

## Environment Checklist

1. Add `read_shipping` and `write_shipping` to `SHOPIFY_SCOPES` and `shopify.app.toml`.
2. Keep `read_discounts` and `write_discounts` enabled for checkout delivery discounts.
3. Set `APP_URL`, or explicitly set:
   - `RIPX_SHIPPING_RESOLVE_BATCH_URL`
   - `RIPX_SHIPPING_CARRIER_CALLBACK_URL`
4. Set `RIPX_CHECKOUT_PRICE_SECRET` so checkout resolver endpoints are protected.
5. Keep `network_access = true` in `extensions/ripx-checkout-discount/shopify.extension.toml` for fetch-based shipping discounts.
6. Re-run `npm run shopify:checkout-discount:sync-config` before building the checkout discount extension.

## Readiness Flow

1. Run `npm run verify:shipping-readiness`.
2. Open the shipping test in RipX and run `Shipping diagnostics`.
3. Review the execution plan for:
   - adapter availability
   - running shipping conflicts
   - missing callback or resolve URLs
   - execution mode per variant:
     - `automatic`: RipX can provision Carrier Service or Delivery Customization resources automatically.
     - `discount-only`: the checkout discount function can adjust delivery options without provisioning a new Shopify resource.
     - `manual`: the variant still needs merchant follow-up because the adapter is unavailable, unsupported, or intentionally manual.
4. Run `Shipping dry run`.
5. If the report is clean, run `Apply shipping`.
6. Place a live checkout QA order for both control and treatment.

## Carrier Quote Providers

RipX now supports a provider-ready `carrier_quote` contract through CarrierService.

- `static_rate`: fixed quote amount for one fallback rate
- `country_table`: destination-aware fallback rates like `US:5.00,CA:7.50,*:9.00`

Provider configuration lives in variant metadata from the shipping wizard.

## Delivery Customization Rules

Delivery Customization does not generate shipping quote amounts. Use it only for existing checkout delivery options:

- `hide`: remove targeted delivery method names.
- `rename`: rename targeted delivery method names; requires `delivery_rename_to`.
- `reorder`: move targeted delivery method names to the configured order.

Variants using `execution_hint: delivery_customization` must include `delivery_method_names` or they remain `manual_required` in diagnostics.

## Flat Shipping Amount vs Configured Rate Rows

Use these settings differently:

- **Flat Shipping Amount**: single fallback amount. RipX uses this when no row-specific override applies.
- **Configured Rate Rows**: optional ordered overrides for multi-rate simulations (for example Economy, Standard, Express).
- **Checkout subline**: optional shopper-facing `description` returned to Shopify for each CarrierService rate.
- **Delivery promise**: optional `min_delivery_date` / `max_delivery_date` returned to Shopify for CarrierService rates.

When to use rows:

- You need more than one simulated rate in checkout.
- You want deterministic ordering for multiple services.
- You want to test additive previews vs replacement flows with multiple candidate rates.

When not to use rows:

- You only need one fallback rate for a simple A/B shipping amount test.

## Checkout Copy QA

CarrierService checkout display is controlled by the rate response:

- `service_name`: the title customers see, usually the configured rate row name.
- `description`: the optional subline under the title. Leave it blank if the merchant does not want subline copy.
- `min_delivery_date` / `max_delivery_date`: optional delivery promise dates. RipX presets compute dates at callback time.

Preset delivery promises currently skip weekends using callback-time UTC. Use custom dates for holiday calendars, fulfillment cutoffs, or merchant-local timezone promises.

Control variants use the store's native Shopify Shipping and delivery setup. If checkout shows copy such as "Ships next business day" on the control, that is coming from Shopify settings or another carrier/rate provider, not from RipX.

Live QA checklist:

1. Run Apply shipping.
2. Open checkout with an assigned cart for each variant.
3. Confirm the title, subline, delivery promise, and price match the RipX Shopper preview.
4. Run Check shipping setup and review Latest checkout rates returned by RipX.

Avoid duplicate visible rate names between native Shopify rates and RipX carrier rates. Shopify can render partial or confusing checkout rows when a native rate and app-calculated rate share the same customer-facing name.

## Cleanup Rules

- Applying a shipping test cleans up stale RipX-managed resources from non-selected variants.
- Stopping a shipping test attempts to tear down RipX-managed resources for that test.
- If another running shipping test already has managed resources, apply mode is blocked until that conflict is resolved.

## Known Rollout Limits

- Live provider credentials and real carrier account behavior still need store-specific validation.
- `carrier_quote` requires a configured quote provider before CarrierService auto-provisioning can return live rates.
- Multi-profile or combined-rate shops still require explicit merchant QA.
