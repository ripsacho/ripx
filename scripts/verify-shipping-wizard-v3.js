#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

function readDistStep1Status() {
  const repoRoot = path.join(__dirname, '..');
  const distIndex = path.join(repoRoot, 'frontend/dist/index.html');
  const assetsDir = path.join(repoRoot, 'frontend/dist/assets');
  if (!fs.existsSync(distIndex) || !fs.existsSync(assetsDir)) {
    return { ok: false, detail: 'frontend/dist missing (run npm run build:frontend)' };
  }
  const markers = ['Free over threshold', 'Select a shipping test type'];
  const bundleContents = fs
    .readdirSync(assetsDir)
    .filter(fileName => fileName.endsWith('.js'))
    .map(fileName => fs.readFileSync(path.join(assetsDir, fileName), 'utf8'));
  const match = markers.every(marker => bundleContents.some(content => content.includes(marker)));
  if (!match) {
    return {
      ok: false,
      detail: 'dist bundle missing Step 1 incentive options (run npm run ensure:frontend-dist)',
    };
  }
  return { ok: true, detail: distIndex };
}

function resolveFlagState() {
  const raw = String(process.env.VITE_RIPX_SHIPPING_STUDIO_V2 || '')
    .trim()
    .toLowerCase();
  if (!raw) return { raw: '(unset)', enabled: true, reason: 'defaults to enabled when unset' };
  if (['0', 'false', 'off', 'legacy'].includes(raw)) {
    return { raw, enabled: false, reason: 'explicitly disabled' };
  }
  return { raw, enabled: true, reason: 'explicitly enabled' };
}

function isLocalOrPrivateUrl(url) {
  const candidate = String(url || '').trim();
  if (!candidate) return true;
  try {
    const host = new URL(candidate).hostname.toLowerCase();
    return (
      host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')
    );
  } catch {
    return true;
  }
}

function resolveUrl(explicitEnv, fallbackPath) {
  const explicit = String(process.env[explicitEnv] || '').trim();
  if (explicit) return explicit;
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  return appUrl ? `${appUrl}${fallbackPath}` : '';
}

function status(ok, passText, failText) {
  return ok ? `PASS - ${passText}` : `FAIL - ${failText}`;
}

const strict = process.argv.includes('--strict');
const flag = resolveFlagState();
const appUrl = String(process.env.APP_URL || '').trim();
const callbackUrl = resolveUrl(
  'RIPX_SHIPPING_CARRIER_CALLBACK_URL',
  '/api/track/shipping-carrier-rates'
);
const resolveBatchUrl = resolveUrl(
  'RIPX_SHIPPING_RESOLVE_BATCH_URL',
  '/api/track/shipping-resolve-batch'
);
const callbackPublic = Boolean(callbackUrl) && !isLocalOrPrivateUrl(callbackUrl);
const hostsMatch =
  Boolean(callbackUrl) &&
  Boolean(resolveBatchUrl) &&
  new URL(callbackUrl).host === new URL(resolveBatchUrl).host;

const distStep1 = readDistStep1Status();

const checks = [
  {
    name: 'Shipping studio flag',
    ok: flag.enabled,
    detail: `${flag.raw} (${flag.reason})`,
  },
  {
    name: 'Frontend dist Step 1 bundle',
    ok: distStep1.ok,
    detail: distStep1.detail,
  },
  {
    name: 'APP_URL configured',
    ok: Boolean(appUrl),
    detail: appUrl || '(missing)',
  },
  {
    name: 'Carrier callback URL',
    ok: callbackPublic,
    detail: callbackUrl || '(missing)',
  },
  {
    name: 'Callback/resolve host match',
    ok: hostsMatch,
    detail: `${callbackUrl || '(missing)'} :: ${resolveBatchUrl || '(missing)'}`,
  },
];

const failed = checks.filter(item => !item.ok);

console.log('Shipping Wizard V3 Readiness');
console.log('============================');
for (const item of checks) {
  console.log(`- ${item.name}: ${status(item.ok, 'ready', 'needs attention')}`);
  console.log(`  ${item.detail}`);
}

console.log('\nManual QA (fresh-cart critical)');
console.log('-------------------------------');
console.log(
  '1) Open shipping test with V3 enabled and verify 4 steps (Type/Hide/Configure/Review).'
);
console.log('2) For replace/hide flows, select methods in Step 2 and save setup.');
console.log('3) Run diagnostics + live debug from Step 4.');
console.log('4) Apply setup, then open checkout with a NEW cart session.');
console.log('5) Confirm hidden/replaced methods match Step 4 preview expectations.');

if (failed.length > 0) {
  console.log(`\nResult: ${failed.length} readiness check(s) need attention.`);
  if (strict) {
    process.exit(1);
  }
} else {
  console.log('\nResult: readiness checks passed.');
}
