# RipX Payment Customization

Shopify `payment_customization` function for RipX checkout payment-method experiments.

## What it reads

- Cart line attributes:
  - `_ripx_price_test`
  - `_ripx_variant`
- Owner metafield:
  - namespace: `payment-customization`
  - key: `function-configuration`

RipX writes JSON config to the customization owner so the function can match the assigned variant and then hide, rename, or reorder payment methods without network access.

## Config contract

```json
{
  "phase": "payment_method",
  "test_id": "uuid",
  "test_name": "Checkout payment test",
  "assignment_keys": {
    "test": "_ripx_price_test",
    "variant": "_ripx_variant"
  },
  "variant_rules": [
    {
      "variant_id": "variant-a",
      "variant_name": "Variant A",
      "action": "hide",
      "method_names": ["Cash on Delivery"],
      "rename_to": ""
    }
  ]
}
```

## Prepare and deploy

```bash
npm run shopify:payment-customization:install
npm run shopify:payment-customization:typegen
npm run shopify:payment-customization:build
shopify app deploy
```

After deploy, use the RipX checkout customization apply flow to create/update the payment customization instance and save the config metafield on the shop.
