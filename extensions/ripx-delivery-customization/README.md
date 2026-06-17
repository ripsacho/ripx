# RipX Delivery Customization

Shopify `delivery_customization` function for RipX checkout delivery-method experiments.

## What it reads

- Delivery-group cart line attributes:
  - `_ripx_price_test`
  - `_ripx_variant`
  - `ripx_price_test` / `ripx_variant` as public fallbacks when Shopify does not expose private underscore properties
- Owner metafield:
  - namespace: `delivery-customization`
  - key: `function-configuration`

RipX writes JSON config to the customization owner so the function can match the assigned variant and then hide, rename, or reorder delivery options without network access.

## Config contract

```json
{
  "phase": "delivery_method",
  "test_id": "uuid",
  "test_name": "Checkout delivery test",
  "assignment_keys": {
    "test": "_ripx_price_test",
    "variant": "_ripx_variant"
  },
  "variant_rules": [
    {
      "variant_id": "variant-a",
      "variant_name": "Variant A",
      "action": "rename",
      "method_names": ["Standard Shipping"],
      "rename_to": "Tracked standard shipping"
    }
  ]
}
```

## Prepare and deploy

```bash
npm run shopify:delivery-customization:install
npm run shopify:delivery-customization:typegen
npm run shopify:delivery-customization:build
shopify app deploy
```

After deploy, use the RipX checkout customization apply flow to create/update the delivery customization instance and save the config metafield on the shop.
