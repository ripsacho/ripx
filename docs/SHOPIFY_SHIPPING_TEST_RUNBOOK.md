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

## Cleanup Rules

- Applying a shipping test cleans up stale RipX-managed resources from non-selected variants.
- Stopping a shipping test attempts to tear down RipX-managed resources for that test.
- If another running shipping test already has managed resources, apply mode is blocked until that conflict is resolved.

## Known Rollout Limits

- Live provider credentials and real carrier account behavior still need store-specific validation.
- `carrier_quote` requires a configured quote provider before CarrierService auto-provisioning can return live rates.
- Multi-profile or combined-rate shops still require explicit merchant QA.
