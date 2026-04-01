# RipX theme cart integration

This theme extension keeps the existing `RipX App Embed` and adds the first native cart-rendering
pieces for Shopify themes.

## Goal

Use Shopify's own discount-rendered cart state whenever possible so cart UI can match the same
discount allocations that checkout uses.

## Files

- `blocks/ripx-app-embed.liquid`
  - Loads `apps/ripx/script.js` in the theme head.
- `blocks/ripx-cart-summary.liquid`
  - App block for cart/footer sections that support app blocks.
- `snippets/ripx-native-cart-line-price.liquid`
  - Native line-item price renderer using `line_item.final_line_price` and discount allocations.
- `snippets/ripx-native-cart-summary.liquid`
  - Native subtotal/discount summary using `cart.items_subtotal_price` and cart-level applications.
- `assets/ripx-cart-native.css`
  - Minimal styles for the block/snippets.

## Recommended install path

### 1. Keep the app embed enabled

The app embed is still required for assignment, storefront preview behavior, and `_ripx_*` cart
attribute injection.

### 2. Add the app block where the theme supports it

In the Shopify theme editor:

- Open the cart page/footer section
- Add the `RipX Cart Summary` block

This gives a Shopify-native subtotal/discount summary on themes that support app blocks in cart
sections.

### 3. For Dawn-style cart page and drawer, use the native snippets

Where the theme renders each cart line, replace ad-hoc line price markup with:

```liquid
{% render 'ripx-native-cart-line-price', item: item %}
```

Where the theme renders the cart subtotal/footer, use:

```liquid
{% render 'ripx-native-cart-summary' %}
```

## Dawn-first integration points

Typical Dawn integration points:

- `sections/main-cart-items.liquid`
- `sections/main-cart-footer.liquid`
- cart drawer/snippet files that render `.cart-item__price-wrapper` and subtotal rows

The exact file names vary by theme version, so treat these as guidance rather than a strict list.

## Diagnostics contract

These snippets/blocks emit markers such as:

- `data-ripx-native-cart="1"`
- `data-ripx-native-cart-line="1"`
- `data-ripx-native-cart-block="1"`

The storefront script can use these markers as evidence that native cart rendering is installed.

## Support model

- Best: Shopify Discount Function + native theme rendering via these snippets/blocks
- Good: Shopify Discount Function + cart refresh/orchestration from the storefront script
- Fallback: selector-based cart text replacement for unsupported themes

## Important note

This extension improves cart rendering, but the **real charged price** still comes from the Shopify
Discount Function and RipX batch resolver, not from Liquid or JavaScript text replacement alone.
