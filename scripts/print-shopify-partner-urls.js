#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Print Partner Dashboard URLs to copy when the Shopify dev tunnel host changes.
 *
 * Usage:
 *   node scripts/print-shopify-partner-urls.js
 *   node scripts/print-shopify-partner-urls.js https://your-tunnel.trycloudflare.com
 */
const fs = require('fs');
const path = require('path');

function normalizeAppUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return '';
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function readAppUrlFromEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    return '';
  }
  const src = fs.readFileSync(envPath, 'utf8');
  for (const key of ['APP_URL', 'SHOPIFY_APP_URL', 'RIPX_OAUTH_REDIRECT_BASE']) {
    const line = src
      .split('\n')
      .map(s => s.trim())
      .find(s => s.startsWith(`${key}=`));
    if (line) {
      const url = normalizeAppUrl(line.slice(key.length + 1).trim());
      if (url) {
        return url;
      }
    }
  }
  return '';
}

function main() {
  const fromArg = normalizeAppUrl(process.argv[2] || '');
  const fromEnv = readAppUrlFromEnv(path.join(__dirname, '..', '.env'));
  const fromHost = normalizeAppUrl(process.env.HOST || '');
  const appUrl = fromArg || fromHost || fromEnv;

  if (!appUrl) {
    console.error(
      'Usage: node scripts/print-shopify-partner-urls.js [https://your-tunnel-host]\n' +
        'Or set HOST / APP_URL before running.'
    );
    process.exit(1);
  }

  const callback = `${appUrl}/api/auth/callback`;
  console.log('\nPartner Dashboard → RipperX (local app, client_id in shopify.app.local.toml)\n');
  console.log('Configuration → URLs:\n');
  console.log(`  Application URL:              ${appUrl}`);
  console.log(`  Allowed redirection URL(s):   ${callback}`);
  console.log('\nRipX env sync:\n');
  console.log(`  npm run dev:switch-tunnel -- ${appUrl} ripx-plus.myshopify.com`);
  console.log('\nAfter saving Partner Dashboard URLs, restart dev:\n');
  console.log('  npm run shopify:dev:local:safe\n');
}

main();
