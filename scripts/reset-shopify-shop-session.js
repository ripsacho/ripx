#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Remove a stale Shopify OAuth row so the store can reinstall cleanly.
 *
 * Use when diagnose shows TOKEN_INVALID (401) or repeated install loops with an old token.
 *
 * Usage:
 *   node scripts/reset-shopify-shop-session.js --shop=your-store.myshopify.com
 *   node scripts/reset-shopify-shop-session.js --shop=your-store.myshopify.com --dry-run
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const shop = String((args.find(a => a.startsWith('--shop=')) || '').split('=')[1] || '')
  .trim()
  .toLowerCase();

async function main() {
  if (!shop || !shop.includes('.myshopify.com')) {
    console.error(
      'Usage: node scripts/reset-shopify-shop-session.js --shop=your-store.myshopify.com'
    );
    process.exit(1);
  }

  const { getShopSession, deleteShopSession } = require('../backend/src/models/shopSession');
  const { clearConnectionHealthCache } = require('../backend/src/services/shopifyConnectionHealth');
  const { closeDatabase } = require('../backend/src/utils/database');

  const session = await getShopSession(shop);
  if (!session) {
    console.log(
      `No shop_sessions row for ${shop}. Proceed with Shopify reinstall (Domains → install link).`
    );
    await closeDatabase();
    process.exit(0);
  }

  console.log(`Found session for ${shop}`);
  console.log(`  updated_at: ${session.updated_at}`);
  console.log(`  scope: ${session.scope || '(empty)'}`);
  console.log(
    `  token: ${session.access_token ? `${session.access_token.slice(0, 8)}...` : '(missing)'}`
  );

  if (dryRun) {
    console.log('\nDry run — no changes made.');
    await closeDatabase();
    return;
  }

  await deleteShopSession(shop);
  clearConnectionHealthCache(shop);
  console.log(`\nDeleted shop_sessions row for ${shop} and cleared connection cache.`);
  console.log('\nNext steps (required):');
  console.log('  1. Shopify Admin → Apps → uninstall RipX/RipperX from this store.');
  console.log('  2. Log into RipX at your app URL → Domains → install link for this shop.');
  console.log('  3. Complete OAuth; Shopify must show an updated permissions screen.');
  console.log('  4. Verify: npm run diagnose:shop -- --shop=' + shop);
  console.log('     Expect: Admin API OK, Token status valid, Missing scopes: (none)');

  await closeDatabase();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
