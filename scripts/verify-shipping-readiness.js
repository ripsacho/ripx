#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

function hasScope(scope) {
  return String(process.env.SHOPIFY_SCOPES || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .includes(scope);
}

function resolveUrl(explicitEnv, fallbackPath) {
  const explicit = String(process.env[explicitEnv] || '').trim();
  if (explicit) {
    return explicit;
  }
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  return appUrl ? `${appUrl}${fallbackPath}` : '';
}

const rows = [
  {
    name: 'APP_URL',
    ok: Boolean(String(process.env.APP_URL || '').trim()),
    detail: process.env.APP_URL || '(missing)',
  },
  {
    name: 'read_shipping',
    ok: hasScope('read_shipping'),
    detail: hasScope('read_shipping') ? 'present' : 'missing from SHOPIFY_SCOPES',
  },
  {
    name: 'write_shipping',
    ok: hasScope('write_shipping'),
    detail: hasScope('write_shipping') ? 'present' : 'missing from SHOPIFY_SCOPES',
  },
  {
    name: 'read_discounts',
    ok: hasScope('read_discounts'),
    detail: hasScope('read_discounts') ? 'present' : 'missing from SHOPIFY_SCOPES',
  },
  {
    name: 'write_discounts',
    ok: hasScope('write_discounts'),
    detail: hasScope('write_discounts') ? 'present' : 'missing from SHOPIFY_SCOPES',
  },
  {
    name: 'shipping resolve batch URL',
    ok: Boolean(resolveUrl('RIPX_SHIPPING_RESOLVE_BATCH_URL', '/api/track/shipping-resolve-batch')),
    detail:
      resolveUrl('RIPX_SHIPPING_RESOLVE_BATCH_URL', '/api/track/shipping-resolve-batch') ||
      '(missing)',
  },
  {
    name: 'carrier callback URL',
    ok: Boolean(
      resolveUrl('RIPX_SHIPPING_CARRIER_CALLBACK_URL', '/api/track/shipping-carrier-rates')
    ),
    detail:
      resolveUrl('RIPX_SHIPPING_CARRIER_CALLBACK_URL', '/api/track/shipping-carrier-rates') ||
      '(missing)',
  },
  {
    name: 'checkout assignment secret',
    ok: Boolean(String(process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim()),
    detail: String(process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim() ? '(set)' : '(missing)',
  },
];

console.log('RipX shipping readiness');
console.log('======================');
rows.forEach(row => {
  console.log(`${row.ok ? 'OK ' : 'WARN'}  ${row.name}: ${row.detail}`);
});

const failed = rows.some(row => !row.ok);
if (failed) {
  console.log(
    '\nNext steps: fix the WARN items, then run shipping diagnostics from Test Detail or Test Wizard.'
  );
  console.log('See docs/SHOPIFY_SHIPPING_TEST_RUNBOOK.md for the full rollout checklist.');
  process.exitCode = 1;
} else {
  console.log(
    '\nEnvironment looks ready. Run shipping diagnostics in-app and perform a dry run before apply.'
  );
  console.log('See docs/SHOPIFY_SHIPPING_TEST_RUNBOOK.md before applying on a live shop.');
}
