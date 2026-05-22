/**
 * Safe placeholder checkout discount config.
 *
 * The real file is generated locally/CI via:
 *   npm run shopify:checkout-discount:sync-config
 *
 * Do not commit production URLs or secrets here.
 */
export const RIPX_PRICE_RESOLVE_BATCH_URL =
  'https://your-api.example.com/api/track/price-resolve-batch';
export const RIPX_SHIPPING_RESOLVE_BATCH_URL =
  'https://your-api.example.com/api/track/shipping-resolve-batch';

export const RIPX_CHECKOUT_PRICE_SECRET = '';

export const RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT = false;
export const RIPX_CHECKOUT_PROBE_ATTRIBUTE_MATRIX = false;
