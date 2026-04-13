#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Sync checkout extension config files from root .env
 *
 * Uses (in order):
 *   - RIPX_PRICE_RESOLVE_BATCH_URL — full URL to POST /api/track/price-resolve-batch
 *   - RIPX_SHIPPING_RESOLVE_BATCH_URL — full URL to POST /api/track/shipping-resolve-batch
 *   - else APP_URL + /api/track/{price|shipping}-resolve-batch
 *
 * Secret: RIPX_CHECKOUT_PRICE_SECRET (optional; must match RipX server .env)
 * Checkout UI helpers:
 *   - RIPX_CHECKOUT_ASSIGNMENT_URL (optional; defaults to APP_URL + /api/track/checkout-assignment)
 *   - RIPX_CHECKOUT_CONVERSION_URL (optional; defaults to APP_URL + /api/track/checkout-conversion)
 *   - RIPX_CHECKOUT_UI_TEST_ID (optional)
 *   - RIPX_CHECKOUT_UI_SHOP_DOMAIN (optional)
 *
 * Usage (from repo root):
 *   node scripts/write-ripx-checkout-config.js
 *   npm run shopify:checkout-discount:sync-config
 *   npm run shopify:checkout-ui:sync-config
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
let batchUrl = (process.env.RIPX_PRICE_RESOLVE_BATCH_URL || '').trim();
if (!batchUrl && appUrl) {
  batchUrl = `${appUrl}/api/track/price-resolve-batch`;
}
let shippingBatchUrl = (process.env.RIPX_SHIPPING_RESOLVE_BATCH_URL || '').trim();
if (!shippingBatchUrl && appUrl) {
  shippingBatchUrl = `${appUrl}/api/track/shipping-resolve-batch`;
}
const secret = (process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim();
let checkoutAssignmentUrl = (process.env.RIPX_CHECKOUT_ASSIGNMENT_URL || '').trim();
let checkoutConversionUrl = (process.env.RIPX_CHECKOUT_CONVERSION_URL || '').trim();
const checkoutUiTestId = (process.env.RIPX_CHECKOUT_UI_TEST_ID || '').trim();
const checkoutUiShopDomain = (process.env.RIPX_CHECKOUT_UI_SHOP_DOMAIN || '').trim();
const probeAlwaysDiscount =
  String(process.env.RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT || '')
    .trim()
    .toLowerCase() === 'true';
const probeAttributeMatrix =
  String(process.env.RIPX_CHECKOUT_PROBE_ATTRIBUTE_MATRIX || '')
    .trim()
    .toLowerCase() === 'true';

if (!batchUrl || !shippingBatchUrl) {
  console.error(
    '[write-ripx-checkout-config] Set APP_URL or RIPX_{PRICE,SHIPPING}_RESOLVE_BATCH_URL in .env (repo root), then re-run.'
  );
  process.exit(1);
}
if (!checkoutAssignmentUrl && appUrl) {
  checkoutAssignmentUrl = `${appUrl}/api/track/checkout-assignment`;
}
if (!checkoutConversionUrl && appUrl) {
  checkoutConversionUrl = `${appUrl}/api/track/checkout-conversion`;
}

const dest = path.join(__dirname, '../extensions/ripx-checkout-discount/src/ripxConfig.js');
const content = `/**
 * Synced from root .env via: npm run shopify:checkout-discount:sync-config
 * (or: node scripts/write-ripx-checkout-config.js)
 * Do not commit real secrets if this file is public; use CI env + sync before build.
 */
export const RIPX_PRICE_RESOLVE_BATCH_URL = ${JSON.stringify(batchUrl)};
export const RIPX_SHIPPING_RESOLVE_BATCH_URL = ${JSON.stringify(shippingBatchUrl)};

export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify(secret)};

export const RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT = ${JSON.stringify(probeAlwaysDiscount)};
export const RIPX_CHECKOUT_PROBE_ATTRIBUTE_MATRIX = ${JSON.stringify(probeAttributeMatrix)};
`;

fs.writeFileSync(dest, content, 'utf8');
console.log('[write-ripx-checkout-config] Wrote', dest);

const uiDest = path.join(__dirname, '../extensions/ripx-checkout-ui/src/ripxConfig.js');
const uiContent = `/**
 * Synced from root .env via: npm run shopify:checkout-ui:sync-config
 * (or: node scripts/write-ripx-checkout-config.js)
 */
export const RIPX_CHECKOUT_ASSIGNMENT_URL = ${JSON.stringify(checkoutAssignmentUrl)};
export const RIPX_CHECKOUT_CONVERSION_URL = ${JSON.stringify(checkoutConversionUrl)};
export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify(secret)};
export const RIPX_CHECKOUT_UI_TEST_ID = ${JSON.stringify(checkoutUiTestId)};
export const RIPX_CHECKOUT_UI_SHOP_DOMAIN = ${JSON.stringify(checkoutUiShopDomain)};
`;
fs.mkdirSync(path.dirname(uiDest), { recursive: true });
fs.writeFileSync(uiDest, uiContent, 'utf8');
console.log('[write-ripx-checkout-config] Wrote', uiDest);

console.log('[write-ripx-checkout-config] BATCH_URL =', batchUrl);
console.log('[write-ripx-checkout-config] SHIPPING  =', shippingBatchUrl);
console.log('[write-ripx-checkout-config] ASSIGNMENT =', checkoutAssignmentUrl || '(empty)');
console.log('[write-ripx-checkout-config] CONVERSION =', checkoutConversionUrl || '(empty)');
console.log('[write-ripx-checkout-config] SECRET    =', secret ? '(set)' : '(empty)');
console.log('[write-ripx-checkout-config] UI TEST   =', checkoutUiTestId || '(empty)');
console.log('[write-ripx-checkout-config] UI SHOP   =', checkoutUiShopDomain || '(empty)');
console.log(
  '[write-ripx-checkout-config] PROBE     =',
  probeAlwaysDiscount ? 'always_discount' : 'off'
);
console.log(
  '[write-ripx-checkout-config] ATTR_PROBE =',
  probeAttributeMatrix ? 'attribute_matrix' : 'off'
);
