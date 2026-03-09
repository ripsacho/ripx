#!/usr/bin/env node
/**
 * Remove Unlinked Tenants – delete all domains (tenants) that have no email user linked.
 *
 * A tenant is considered "no email user" when account_id IS NULL (never linked via
 * Connect with Shopify / email flow). This also removes the corresponding Shopify
 * shop_sessions for those domains so they can re-install and link properly.
 *
 * Usage:
 *   node backend/scripts/removeUnlinkedTenants.js
 *   node backend/scripts/removeUnlinkedTenants.js --dry-run   # list only, no deletes
 *
 * Requires DATABASE_URL in .env.
 */
/* eslint-disable no-console */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { query, withTransaction, closeDatabase } = require('../src/utils/database');

const DRY_RUN = process.argv.includes('--dry-run');

async function getUnlinkedTenants(client) {
  const q = client
    ? (sql, params) => client.query(sql, params)
    : (sql, params) => query(sql, params);
  const result = await q(
    `SELECT id, domain, platform, created_at
     FROM tenants
     WHERE account_id IS NULL
     ORDER BY domain`
  );
  return result.rows;
}

async function run() {
  const list = await getUnlinkedTenants();
  if (list.length === 0) {
    console.log('No unlinked tenants (all domains have an email user).');
    return;
  }

  console.log(`Found ${list.length} tenant(s) with no email user (account_id IS NULL):`);
  list.forEach(t => console.log(`  - ${t.domain} (${t.platform}, id: ${t.id})`));

  if (DRY_RUN) {
    console.log('\nDry run: no changes made. Run without --dry-run to delete.');
    return;
  }

  const domains = list.map(t => t.domain);
  const tenantIds = list.map(t => t.id);

  await withTransaction(async client => {
    // Remove Shopify sessions for those domains so they can re-install
    const shopSessionResult = await client.query(
      'DELETE FROM shop_sessions WHERE shop_domain = ANY($1::varchar[]) RETURNING shop_domain',
      [domains]
    );
    if (shopSessionResult.rowCount > 0) {
      console.log(`\nDeleted ${shopSessionResult.rowCount} shop_session(s):`);
      shopSessionResult.rows.forEach(r => console.log(`  - ${r.shop_domain}`));
    }

    // Delete tenants (CASCADE removes user_domain_access, tests; other FKs set tenant_id to NULL)
    const tenantResult = await client.query(
      'DELETE FROM tenants WHERE id = ANY($1::uuid[]) RETURNING domain',
      [tenantIds]
    );
    console.log(`\nDeleted ${tenantResult.rowCount} tenant(s):`);
    tenantResult.rows.forEach(r => console.log(`  - ${r.domain}`));
  });

  console.log('\nDone. Unlinked domains and their Shopify sessions have been removed.');
}

async function main() {
  try {
    await run();
  } catch (err) {
    console.error('removeUnlinkedTenants failed:', err.message);
    process.exitCode = 1;
  } finally {
    await closeDatabase().catch(() => {});
    process.exit(process.exitCode ?? 0);
  }
}

main();
