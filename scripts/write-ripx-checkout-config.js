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
 *   node scripts/write-ripx-checkout-config.js --target=discount
 *   node scripts/write-ripx-checkout-config.js --target=ui
 *   npm run shopify:checkout-discount:sync-config
 *   npm run shopify:checkout-ui:sync-config
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const targetArg = process.argv.find(arg => arg.startsWith('--target='));
const syncTarget = targetArg ? targetArg.split('=')[1] : 'all';
if (!['all', 'discount', 'ui'].includes(syncTarget)) {
  console.error('[write-ripx-checkout-config] Invalid --target. Use all, discount, or ui.');
  process.exit(1);
}
const shouldWriteDiscountConfig = syncTarget === 'all' || syncTarget === 'discount';
const shouldWriteUiConfig = syncTarget === 'all' || syncTarget === 'ui';

const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
let batchUrl = (process.env.RIPX_PRICE_RESOLVE_BATCH_URL || '').trim();
if (!batchUrl && appUrl) {
  batchUrl = `${appUrl}/api/track/price-resolve-batch`;
}
let shippingBatchUrl = (process.env.RIPX_SHIPPING_RESOLVE_BATCH_URL || '').trim();
if (!shippingBatchUrl && appUrl) {
  shippingBatchUrl = `${appUrl}/api/track/shipping-resolve-batch`;
}
// Stale dev tunnels in RIPX_*_BATCH_URL override APP_URL — prefer stable APP_URL when set.
if (appUrl && isEphemeralTunnelUrl(batchUrl) && !isEphemeralTunnelUrl(appUrl)) {
  console.warn(
    '[write-ripx-checkout-config] RIPX_PRICE_RESOLVE_BATCH_URL is an ephemeral tunnel; using APP_URL instead.'
  );
  batchUrl = `${appUrl}/api/track/price-resolve-batch`;
}
if (appUrl && isEphemeralTunnelUrl(shippingBatchUrl) && !isEphemeralTunnelUrl(appUrl)) {
  console.warn(
    '[write-ripx-checkout-config] RIPX_SHIPPING_RESOLVE_BATCH_URL is an ephemeral tunnel; using APP_URL instead.'
  );
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

function isEphemeralTunnelUrl(rawUrl) {
  if (!rawUrl) {
    return false;
  }
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return (
      host.endsWith('.trycloudflare.com') ||
      host.endsWith('.ngrok.io') ||
      host.endsWith('.ngrok-free.app') ||
      host.endsWith('.loca.lt') ||
      host.endsWith('.serveo.net')
    );
  } catch {
    return false;
  }
}

const allowEphemeralCheckoutConfig =
  String(process.env.RIPX_ALLOW_EPHEMERAL_CHECKOUT_CONFIG || '')
    .trim()
    .toLowerCase() === 'true';

if (shouldWriteDiscountConfig && (!batchUrl || !shippingBatchUrl)) {
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
if (shouldWriteUiConfig && !checkoutAssignmentUrl) {
  console.error(
    '[write-ripx-checkout-config] Set APP_URL or RIPX_CHECKOUT_ASSIGNMENT_URL in .env (repo root), then re-run.'
  );
  process.exit(1);
}

const urlsToCheck = [
  ...(shouldWriteDiscountConfig
    ? [
        ['RIPX_PRICE_RESOLVE_BATCH_URL', batchUrl],
        ['RIPX_SHIPPING_RESOLVE_BATCH_URL', shippingBatchUrl],
      ]
    : []),
  ...(shouldWriteUiConfig
    ? [
        ['RIPX_CHECKOUT_ASSIGNMENT_URL', checkoutAssignmentUrl],
        ['RIPX_CHECKOUT_CONVERSION_URL', checkoutConversionUrl],
      ]
    : []),
].filter(([, value]) => value);
const ephemeralUrls = urlsToCheck.filter(([, value]) => isEphemeralTunnelUrl(value));
if (ephemeralUrls.length > 0 && !allowEphemeralCheckoutConfig) {
  console.error(
    '[write-ripx-checkout-config] Refusing to write checkout config with ephemeral tunnel URLs.'
  );
  ephemeralUrls.forEach(([name, value]) => console.error(`  ${name} = ${value}`));
  console.error(
    'Set APP_URL/RIPX_* URLs to the deployed app host before Shopify Function deploy. For local dev only, set RIPX_ALLOW_EPHEMERAL_CHECKOUT_CONFIG=true.'
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
export const RIPX_SHIPPING_RESOLVE_BATCH_URL = ${JSON.stringify(shippingBatchUrl)};

export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify(secret)};

export const RIPX_CHECKOUT_PROBE_ALWAYS_DISCOUNT = ${JSON.stringify(probeAlwaysDiscount)};
export const RIPX_CHECKOUT_PROBE_ATTRIBUTE_MATRIX = ${JSON.stringify(probeAttributeMatrix)};
`;

if (shouldWriteDiscountConfig) {
  fs.writeFileSync(dest, content, 'utf8');
  console.log('[write-ripx-checkout-config] Wrote', dest);
}

const uiDest = path.join(__dirname, '../extensions/ripx-checkout-ui/src/ripxConfig.generated.js');
const uiContent = `/**
 * Synced from root .env via: npm run shopify:checkout-ui:sync-config
 * (or: node scripts/write-ripx-checkout-config.js)
 * Generated locally before build/deploy. Do not commit this file.
 */
export const RIPX_CHECKOUT_ASSIGNMENT_URL = ${JSON.stringify(checkoutAssignmentUrl)};
export const RIPX_CHECKOUT_CONVERSION_URL = ${JSON.stringify(checkoutConversionUrl)};
export const RIPX_CHECKOUT_PRICE_SECRET = ${JSON.stringify(secret)};
export const RIPX_CHECKOUT_UI_TEST_ID = ${JSON.stringify(checkoutUiTestId)};
export const RIPX_CHECKOUT_UI_SHOP_DOMAIN = ${JSON.stringify(checkoutUiShopDomain)};
`;
if (shouldWriteUiConfig) {
  fs.mkdirSync(path.dirname(uiDest), { recursive: true });
  fs.writeFileSync(uiDest, uiContent, 'utf8');
  console.log('[write-ripx-checkout-config] Wrote', uiDest);
}

console.log('[write-ripx-checkout-config] TARGET    =', syncTarget);
if (shouldWriteDiscountConfig) {
  console.log('[write-ripx-checkout-config] BATCH_URL =', batchUrl);
  console.log('[write-ripx-checkout-config] SHIPPING  =', shippingBatchUrl);
  console.log(
    '[write-ripx-checkout-config] PROBE     =',
    probeAlwaysDiscount ? 'always_discount' : 'off'
  );
  console.log(
    '[write-ripx-checkout-config] ATTR_PROBE =',
    probeAttributeMatrix ? 'attribute_matrix' : 'off'
  );
}
if (shouldWriteUiConfig) {
  console.log('[write-ripx-checkout-config] ASSIGNMENT =', checkoutAssignmentUrl || '(empty)');
  console.log('[write-ripx-checkout-config] CONVERSION =', checkoutConversionUrl || '(empty)');
  console.log('[write-ripx-checkout-config] UI TEST   =', checkoutUiTestId || '(empty)');
  console.log('[write-ripx-checkout-config] UI SHOP   =', checkoutUiShopDomain || '(empty)');
}
console.log('[write-ripx-checkout-config] SECRET    =', secret ? '(set)' : '(empty)');
