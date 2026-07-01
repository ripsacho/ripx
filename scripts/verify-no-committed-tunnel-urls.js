#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fail when git-tracked build artifacts contain ephemeral tunnel URLs.
 *
 * Usage:
 *   node scripts/verify-no-committed-tunnel-urls.js
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findEphemeralTunnelHosts, getRepoRoot } = require('./shopify-local-config-utils');

const SCAN_GLOBS = [
  'extensions',
  'frontend/dist',
  'frontend/public/ripx-storefront.js',
  'shopify.app.production.toml',
];

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.json',
  '.toml',
  '.wasm',
  '.txt',
  '.html',
  '.css',
  '.map',
]);

function listTrackedFiles(repoRoot) {
  const result = spawnSync('git', ['ls-files', ...SCAN_GLOBS], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error('[verify-no-committed-tunnel-urls] git ls-files failed.');
    process.exit(1);
  }
  return String(result.stdout || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) {
    return true;
  }
  return filePath.endsWith('ripx-storefront.js');
}

function scanTrackedFiles(repoRoot) {
  const violations = [];
  for (const relativePath of listTrackedFiles(repoRoot)) {
    if (!shouldScanFile(relativePath)) {
      continue;
    }
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) {
      continue;
    }
    const content = fs.readFileSync(absolutePath, 'utf8');
    const hosts = findEphemeralTunnelHosts(content);
    if (hosts.length > 0) {
      violations.push({ file: relativePath, hosts });
    }
  }
  return violations;
}

function main() {
  const repoRoot = getRepoRoot();
  const violations = scanTrackedFiles(repoRoot);
  if (violations.length === 0) {
    console.log('✅ No ephemeral tunnel URLs in git-tracked build artifacts.');
    return;
  }

  console.error('❌ Ephemeral tunnel URLs found in committed files:');
  violations.forEach(entry => {
    console.error(`\n  ${entry.file}`);
    entry.hosts.forEach(host => console.error(`    - ${host}`));
  });
  console.error(
    '\nFix: run npm run shopify:checkout-discount:sync-config with a stable APP_URL, ' +
      'remove tunnel hosts from tracked dist/config, gitignore extensions/ripx-checkout-ui/dist/, ' +
      'and keep ripxConfig*.js gitignored. Shopify CLI bundles src/Checkout.jsx at deploy after sync-config.'
  );
  process.exit(1);
}

main();
