# Price Test Integration (Intelligems-Style: Price Everywhere)

This guide explains how RipX price tests work and how to get test prices to show **everywhere** (product page, collection, homepage, cart) and to **charge correctly at checkout**, in a similar way to [Intelligems](https://www.intelligems.io/) price testing.

## How It Works

### 1. Frontend: DOM updates (RipX script)

RipX updates prices on the storefront by:

- **Product page (PDP)**: Painting the test price on the main product (selectors for `.product__price`, `#ProductPrice`, `[data-product-id]`, etc.).
- **Collection & homepage**: Finding product cards with `[data-product-id]` (or `.product-card`, `.grid-product__content`) that match the test’s target products and painting the test price on each card.
- **Cart (drawer & cart page)**: Finding line items by **`data-product-id`** (on the row or a child) or by **`data-variant-id`** (when the line matches the test variant). For best results, expose `data-product-id` on cart rows; if only `data-variant-id` is present, the script still paints using the first target product’s config (single-product tests).

The script runs on load and **re-runs at 1.2s, 3.5s, 6s, and 10s**, and when the cart icon is clicked, cart-related custom events (`cart:open`, `shopify:cart:change`, etc.), or a section loads (`shopify:section:load`). Themes can call **`window.RipX.reapplyPriceTests()`** after dynamic HTML updates.

**Listing pages:** Product-targeted price tests also run on **home, `/collections/*`, `/search*`, and `/pages/*`** (path-based), so collection grids and search results get variant prices even when there is no “current product” in page meta. Split-URL redirects and custom variant code only run when the page matches the test target (e.g. correct PDP).

### 2. Tagging prices (recommended, like Intelligems)

For reliable targeting across themes:

- Add **`data-product-id`** to the element that wraps each product (or to the price element). Use the Shopify product ID or GID, e.g. `data-product-id="{{ product.id }}"` or `data-product-id="{{ product.id | prepend: 'gid://shopify/Product/' }}"`.
- Optionally add **`data-variant-id`** for variant-specific prices.

Example (Liquid):

```liquid
<span data-product-id="{{ product.id }}" class="price">{{ product.price | money }}</span>
```

RipX prefers elements with `data-product-id` when updating collection/home and cart, so tagging improves consistency across pages.

### 3. Checkout: Charging the test price

Shopify checkout runs on **checkout.shopify.com**. The RipX script does **not** run there, so the amount charged is whatever is in the cart (catalog price) unless you change it with Shopify’s own mechanisms.

Two common approaches (both used by tools like Intelligems):

#### Option A: RipX Functions path (recommended)

- For **Price tests**, deploy and attach **`ripx-cart-transform`** so Direct Price Override sets checkout line unit prices.
- For **Offer tests**, deploy and attach **`ripx-checkout-discount`** for promo-style discount logic.
- RipX line item properties (for resolver/diagnostics compatibility):
  - **`_ripx_price_test`** (test ID)
  - **`_ripx_variant`** (variant ID)
  - **`_ripx_shop`** (shop domain)

RipX injects **`properties[_ripx_price_test]`**, **`properties[_ripx_variant]`**, and **`properties[_ripx_shop]`** on classic **`/cart/add`** forms so they become **line item properties** (visible to Discount Functions as cart line attributes). AJAX-only themes must merge the same keys into their add-to-cart API calls.

**RipX backend (implemented):**

- `POST /api/track/price-resolve-batch` — one request for the whole cart (for Discount Function **network fetch**).
- `GET /api/track/price-resolve` — single-line helper / debugging.

**RipX Shopify extension (implemented):** `extensions/ripx-checkout-discount` (configure `src/ripxConfig.js`, then `shopify app function build`). Requires **Plus / Enterprise** network access for discount functions.

See **[SHOPIFY_CHECKOUT_PRICE_RESOLVER.md](./SHOPIFY_CHECKOUT_PRICE_RESOLVER.md)** for API details and optional `RIPX_CHECKOUT_PRICE_SECRET`.

#### Option B: Duplicate products

- For each non-control price, use a duplicate product/variant whose Shopify price is the test price. When the user adds to cart, add the duplicate instead of the original. No discount needed at checkout. This is more complex to manage (inventory, product data).

## Summary: “Price everywhere” checklist

1. **Theme**: Add the RipX storefront script (app proxy or `GET /api/track/script.js?shop=...`).
2. **Tagging (recommended)**: Add `data-product-id` (and optionally `data-variant-id`) to product/price elements so collection, home, and cart updates are reliable.
3. **Display**: RipX will update PDP, collection, homepage, and cart automatically; re-runs handle dynamic content.
4. **Checkout**: Use the **RipX Cart Transform** for Price tests (Direct Price Override) and the **RipX discount function** for Offer tests (promo discounts). Verify readiness in app Settings and Shopify Admin attachments.

## References

- Intelligems: [Price testing](https://docs.intelligems.io/price-testing/price-testing-getting-started), [Cart Transform](https://docs.intelligems.io/price-testing/price-testing-integration-guides/integration-guide-using-shopify-functions), [Tag product prices](https://docs.intelligems.io/price-testing/price-testing-integration-guides/integration-guide-using-shopify-functions/step-2-tag-product-prices).
- Shopify: [Cart Transform Function API](https://shopify.dev/docs/api/functions/reference/cart-transform), [Discount Function](https://shopify.dev/docs/api/functions/reference/discount).
