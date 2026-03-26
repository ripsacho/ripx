#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Print checkout price pipeline diagnostics from the same logic as GET /api/track/price-checkout-diagnostics
 * (no HTTP server required). Loads repo root .env for APP_URL / secrets.
 *
 * Usage (repo root):
 *   node scripts/verify-price-pipeline.js
 *   node scripts/verify-price-pipeline.js --json
 *   RIPX_VERIFY_SHOP=your-real-store.myshopify.com node scripts/verify-price-pipeline.js
 *
 * With npm, pass flags after `--`:
 *   npm run verify:price-pipeline -- --json
 *
 * Optional: RIPX_VERIFY_SHOP + DATABASE_URL → tenant check + running price test count.
 * Reads extensions/ripx-checkout-discount/src/ripxConfig.js when present (drift vs .env). RIPX_DIAGNOSTICS_SKIP_EXTENSION_CONFIG=true skips.
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const CHECKOUT_FN_WASM = path.join(
  __dirname,
  '../extensions/ripx-checkout-discount/dist/function.wasm'
);

const jsonMode = process.argv.includes('--json');

/** Word-wrap long strings for narrow terminals (one checklist/recommendation per logical block). */
function printPrefixedLines(prefix, text) {
  const cols = Math.max(56, (process.stdout.columns || 96) - 1);
  const maxContent = Math.max(24, cols - prefix.length);
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxContent) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > maxContent ? w.slice(0, maxContent - 3) + '...' : w;
    }
  }
  if (cur) lines.push(cur);
  const indent = ' '.repeat(prefix.length);
  lines.forEach((ln, i) => {
    console.log((i === 0 ? prefix : indent) + ln);
  });
}

async function main() {
  const {
    buildCheckoutPriceDiagnostics,
    readRipxCheckoutExtensionConfigFile,
    extensionConfigInputFromReadResult,
  } = require('../backend/src/services/priceCheckoutDiagnostics');

  let shopOpts = {};
  let shopLookupError = null;
  const shop = (process.env.RIPX_VERIFY_SHOP || '').trim();
  if (shop) {
    try {
      const { tenantExists, normalizeDomain } = require('../backend/src/models/tenant');
      const { query } = require('../backend/src/utils/database');
      const domain = normalizeDomain(shop);
      if (domain && (await tenantExists(domain))) {
        const countRes = await query(
          `SELECT COUNT(*)::int AS c FROM tests
           WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
             AND LOWER(TRIM(status)) = 'running'
             AND LOWER(TRIM(type)) IN ('price', 'pricing')`,
          [domain]
        );
        shopOpts = {
          shopDomain: domain,
          tenantRegistered: true,
          runningPriceTests: countRes.rows[0]?.c ?? 0,
        };
      } else {
        shopOpts = { shopDomain: shop, tenantRegistered: false, runningPriceTests: null };
      }
    } catch (e) {
      shopLookupError = e.message;
      shopOpts = { shopDomain: shop, tenantRegistered: null, runningPriceTests: null };
    }
  }

  const skipExtDiag =
    (process.env.RIPX_DIAGNOSTICS_SKIP_EXTENSION_CONFIG || '').toLowerCase() === 'true';
  const extensionConfig = skipExtDiag
    ? { source: 'omit' }
    : extensionConfigInputFromReadResult(readRipxCheckoutExtensionConfigFile());

  const body = buildCheckoutPriceDiagnostics({ ...shopOpts, extensionConfig });

  if (shop) {
    body.verify_meta = {
      rip_verify_shop: shop,
      shop_lookup_ok: shopLookupError == null,
      shop_lookup_error: shopLookupError || null,
      tenant_registered: body.shop?.tenant_registered ?? null,
      hint:
        body.shop?.tenant_registered === false
          ? 'This domain is not in RipX tenants — install the app / add My domains, or fix spelling vs DB shop_domain.'
          : body.shop?.tenant_registered === true
            ? 'Tenant registered; running_price_tests counts running price/pricing tests for that shop.'
            : shopLookupError
              ? 'Fix DATABASE_URL / DB connectivity to resolve tenant counts.'
              : null,
    };
  }

  if (jsonMode) {
    console.log(JSON.stringify(body, null, 2));
    process.exit(body.summary?.overall_status === 'error' ? 1 : 0);
  }

  console.log('\n=== RipX price pipeline (config diagnostics) ===\n');
  const wasmOk = fs.existsSync(CHECKOUT_FN_WASM);
  console.log(
    'Checkout discount WASM:',
    wasmOk
      ? 'dist/function.wasm present'
      : 'missing — run npm run shopify:checkout-discount:build (needs Shopify CLI)'
  );
  console.log(
    'Overall:',
    body.summary?.overall_status,
    '| checks:',
    body.summary?.checks_passed,
    '/',
    body.summary?.checks_total
  );
  console.log('Batch URL:', body.infrastructure?.batch_resolve_url || '(none)');
  console.log(
    'HTTPS:',
    body.infrastructure?.uses_https,
    '| secret required:',
    body.infrastructure?.checkout_price_secret_required
  );
  if (body.shop) {
    console.log(
      'Shop:',
      body.shop.domain,
      '| tenant:',
      body.shop.tenant_registered,
      '| running price tests:',
      body.shop.running_price_tests
    );
    if (body.shop.tenant_registered === false) {
      console.warn(
        '\n[!] tenant: false → this shop is not registered in RipX (tenants table). Use your real *.myshopify.com from the app.\n'
      );
    }
  }
  if (shopLookupError) {
    console.warn('Shop DB lookup error (set DATABASE_URL):', shopLookupError);
  }
  console.log('\n--- Checklist ---');
  for (const c of body.checklist || []) {
    const mark = c.ok ? '✓' : c.severity === 'error' ? '✗' : '!';
    printPrefixedLines(`  [${mark}] ${c.id}: `, c.message || '');
  }
  if (body.recommendations?.length) {
    console.log(
      '\n--- Recommendations (see also backend/docs/PRICE_TEST_PIPELINE_RESEARCH.md) ---'
    );
    body.recommendations.forEach((r, i) => {
      printPrefixedLines(`  ${i + 1}. `, r);
    });
  }
  console.log(
    '\nTip: RIPX_VERIFY_SHOP=your-real-store.myshopify.com npm run verify:price-pipeline\n' +
      '     JSON: npm run verify:price-pipeline -- --json\n'
  );

  process.exit(body.summary?.overall_status === 'error' ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
