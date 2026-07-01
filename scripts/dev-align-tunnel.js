#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const { spawnSync } = require('child_process');
const { readAppUrlFromEnv } = require('./lib/devTunnelEnv');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }
  return result.stdout || '';
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const envPath = path.join(repoRoot, '.env');
  const appUrl = readAppUrlFromEnv(envPath);
  const shop = (process.env.RIPX_VERIFY_SHOP || '').trim();

  if (!appUrl) {
    console.error('APP_URL is missing in .env');
    process.exit(1);
  }

  console.log(`\n[dev:align-tunnel] APP_URL from .env: ${appUrl}`);
  console.log('[dev:align-tunnel] Syncing checkout extension config...');
  run('npm', ['run', 'shopify:checkout-discount:sync-config'], { cwd: repoRoot });

  console.log('[dev:align-tunnel] Building checkout function...');
  run('npm', ['run', 'shopify:checkout-discount:build'], { cwd: repoRoot });

  if (!shop) {
    console.log(
      '[dev:align-tunnel] Skipping verify:price-pipeline (set RIPX_VERIFY_SHOP to enable automatic verification).'
    );
    return;
  }

  console.log(`[dev:align-tunnel] Running pipeline verify for shop: ${shop}`);
  const stdout = runCapture('npm', ['run', 'verify:price-pipeline', '--', '--json'], {
    cwd: repoRoot,
    env: { ...process.env, RIPX_VERIFY_SHOP: shop },
  });

  let parsed = null;
  try {
    const start = stdout.indexOf('{');
    parsed = start >= 0 ? JSON.parse(stdout.slice(start)) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || !parsed.infrastructure) {
    console.log(stdout);
    console.error('[dev:align-tunnel] Could not parse verification JSON output.');
    process.exit(1);
  }

  const batch = parsed.infrastructure.batch_resolve_url || '';
  const extBatch = parsed.infrastructure.extension_batch_url || '';
  const ok = batch && extBatch && batch === extBatch;

  console.log('\n[dev:align-tunnel] Verification summary');
  console.log(`- overall_status: ${parsed?.summary?.overall_status || 'unknown'}`);
  console.log(`- overall_ok: ${parsed?.summary?.overall_ok === true ? 'true' : 'false'}`);
  console.log(`- batch_resolve_url: ${batch || '(missing)'}`);
  console.log(`- extension_batch_url: ${extBatch || '(missing)'}`);
  console.log(`- urls_match: ${ok ? 'true' : 'false'}`);

  const blockingStatus = String(parsed?.summary?.overall_status || '').toLowerCase();
  const hasBlockingErrors = blockingStatus === 'error';

  if (!ok) {
    console.error('[dev:align-tunnel] Alignment check failed: batch URLs do not match.');
    process.exit(1);
  }

  if (hasBlockingErrors) {
    const failed = (parsed.checklist || []).filter(item => !item.ok && item.severity === 'error');
    failed.forEach(item => {
      console.error(`- [error] ${item.id}: ${item.message || ''}`);
    });
    console.error('[dev:align-tunnel] Alignment check failed.');
    process.exit(1);
  }

  if (parsed?.summary?.overall_ok !== true) {
    const warnings = (parsed.checklist || []).filter(
      item => !item.ok && item.severity === 'warning'
    );
    warnings.forEach(item => {
      console.log(`- [warning] ${item.id}: ${item.message || ''}`);
    });
    console.log(
      '[dev:align-tunnel] Alignment check passed with warnings (expected for ephemeral Cloudflare tunnels in local dev).'
    );
    return;
  }

  console.log('[dev:align-tunnel] Alignment check passed.');
}

main();
