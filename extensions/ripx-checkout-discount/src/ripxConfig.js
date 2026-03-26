/**
 * Synced from root .env via: npm run shopify:checkout-discount:sync-config
 * (or: node scripts/write-ripx-checkout-config.js)
 * Do not commit real secrets if this repo is public; use CI env + sync before build.
 *
 * Empty URL = function makes no outbound batch call (safe default for clones).
 * Use double-quoted strings so diagnostics can parse this file (same as sync-config output).
 */
export const RIPX_PRICE_RESOLVE_BATCH_URL = '';

export const RIPX_CHECKOUT_PRICE_SECRET = '';
