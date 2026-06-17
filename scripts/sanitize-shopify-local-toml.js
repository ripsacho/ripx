#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Reset stale ephemeral tunnel hosts in shopify.app.local.toml before dev or deploy.
 *
 * Usage:
 *   node scripts/sanitize-shopify-local-toml.js
 *   node scripts/sanitize-shopify-local-toml.js --dry-run
 */
const {
  resolveLocalConfigPath,
  sanitizeShopifyLocalToml,
} = require('./shopify-local-config-utils');

function hasFlag(name) {
  return process.argv.includes(name);
}

function main() {
  const configPath = resolveLocalConfigPath(
    process.argv.find(arg => arg.startsWith('--config='))?.split('=')[1] ||
      (process.argv.includes('--config') && process.argv[process.argv.indexOf('--config') + 1]) ||
      ''
  );
  const dryRun = hasFlag('--dry-run');
  const result = sanitizeShopifyLocalToml(configPath, { dryRun });

  result.warnings.forEach(line => console.warn(`⚠️  ${line}`));
  if (result.fixes.length === 0) {
    console.log(`✅ ${configPath} has no ephemeral tunnel URLs to reset`);
    return;
  }
  result.fixes.forEach(line => {
    console.log(`${dryRun ? 'would fix' : 'fixed'}: ${line}`);
  });
  if (dryRun) {
    console.log('(dry-run — no file written)');
  }
}

main();
