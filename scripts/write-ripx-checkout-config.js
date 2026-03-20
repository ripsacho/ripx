#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sync extensions/ripx-checkout-discount/src/ripxConfig.js from root .env
 *
 * Uses (in order):
 *   - RIPX_PRICE_RESOLVE_BATCH_URL — full URL to POST /api/track/price-resolve-batch
 *   - else APP_URL + /api/track/price-resolve-batch
 *
 * Secret: RIPX_CHECKOUT_PRICE_SECRET (optional; must match RipX server .env)
 *
 * Usage (from repo root):
 *   node scripts/write-ripx-checkout-config.js
 *   npm run shopify:checkout-discount:sync-config
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
let batchUrl = (process.env.RIPX_PRICE_RESOLVE_BATCH_URL || '').trim();
if (!batchUrl && appUrl) {
  batchUrl = `${appUrl}/api/track/price-resolve-batch`;
}
const secret = (process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim();

if (!batchUrl) {
  console.error(
    '[write-ripx-checkout-config] Set APP_URL or RIPX_PRICE_RESOLVE_BATCH_URL in .env (repo root), then re-run.'
  );
  process.exit(1);
}

const dest = path.join(__dirname, '../extensions/ripx-checkout-discount/src/ripxConfig.js');
const content = `/**
 * Synced from root .env via: npm run shopify:checkout-discount:sync-config
 * (or: node scripts/write-ripx-checkout-config.js)
 * Do not commit real secrets if this file is public; use CI env + sync before build.
 */
export const RIPX_PRICE_RESOLVE_BATCH_URL = ${JSON.stringify(batchUrl)};

export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify(secret)};
`;

fs.writeFileSync(dest, content, 'utf8');
console.log('[write-ripx-checkout-config] Wrote', dest);
console.log('[write-ripx-checkout-config] BATCH_URL =', batchUrl);
console.log('[write-ripx-checkout-config] SECRET    =', secret ? '(set)' : '(empty)');
