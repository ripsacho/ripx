/**
 * Synced from root .env via: npm run shopify:checkout-discount:sync-config
 * (or: node scripts/write-ripx-checkout-config.js)
 * Do not commit real secrets if this file is public; use CI env + sync before build.
 */
export const RIPX_PRICE_RESOLVE_BATCH_URL =
  'https://splitter.echologyx.com/api/track/price-resolve-batch';

export const RIPX_CHECKOUT_PRICE_SECRET =
  'ba01bc960f51d792d73f0fbf0dab5ed63e9e4d3027947d1f41c2a49f3214e12d';

export const RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT = false;
