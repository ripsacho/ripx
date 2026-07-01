#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const { spawnSync } = require('child_process');
const {
  PRODUCTION_APP_BASE,
  applyLocalTunnelProfile,
  applyProductionProfile,
  snapshotUrlKeys,
} = require('./lib/envProfile');

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

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const envPath = path.join(repoRoot, '.env');
  const tunnelSnapshotPath = path.join(repoRoot, '.env.tunnel.snapshot.json');
  const profile = String(process.argv[2] || '')
    .trim()
    .toLowerCase();
  const syncExtensions = !process.argv.includes('--skip-extensions');

  if (!profile || profile === '--help' || profile === '-h') {
    console.log(
      [
        'Usage:',
        '  npm run env:profile -- save-tunnel',
        '  npm run env:profile -- tunnel [--skip-extensions]',
        '  npm run env:profile -- production [--skip-extensions]',
        '',
        'Profiles:',
        '  save-tunnel  Snapshot current .env URL keys to .env.tunnel.snapshot.json',
        '  tunnel       Restore URL keys from the tunnel snapshot',
        `  production   Point URL keys at ${PRODUCTION_APP_BASE}`,
      ].join('\n')
    );
    process.exit(profile ? 0 : 1);
  }

  if (profile === 'save-tunnel') {
    const snapshot = snapshotUrlKeys(envPath, tunnelSnapshotPath);
    console.log(`✅ Saved tunnel URL snapshot to ${path.basename(tunnelSnapshotPath)}`);
    console.log(`   APP_URL=${snapshot.APP_URL || '(missing)'}`);
    return;
  }

  if (profile === 'tunnel') {
    const appUrl = applyLocalTunnelProfile(envPath, tunnelSnapshotPath);
    console.log(`✅ Restored tunnel profile (${appUrl})`);
  } else if (profile === 'production') {
    applyProductionProfile(envPath);
    console.log(`✅ Applied production profile (${PRODUCTION_APP_BASE})`);
    console.log(
      '   Update Shopify Partner Dashboard URLs to match, then verify with npm run verify:oauth-alignment -- --env-file .env'
    );
  } else {
    console.error(`Unknown profile: ${profile}`);
    process.exit(1);
  }

  if (syncExtensions) {
    console.log('[env:profile] Syncing checkout extension config...');
    run('npm', ['run', 'shopify:checkout-discount:sync-config'], { cwd: repoRoot });
    run('npm', ['run', 'shopify:checkout-ui:sync-config'], { cwd: repoRoot });
  }
}

main();
