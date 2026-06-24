#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const { spawnSync } = require('child_process');
const { normalizeTunnelUrl, updateEnvTunnelUrls } = require('./lib/devTunnelEnv');

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
  const rawArgs = process.argv.slice(2);
  const buildFrontend = rawArgs.includes('--build-frontend');
  const skipFrontendBuild = rawArgs.includes('--skip-frontend-build');
  const positionalArgs = rawArgs.filter(
    arg => arg !== '--build-frontend' && arg !== '--skip-frontend-build'
  );
  const inputUrl = positionalArgs[0] || '';
  const inputShop = positionalArgs[1] || '';
  const nextUrl = normalizeTunnelUrl(inputUrl);

  if (!nextUrl) {
    console.error(
      'Usage: npm run dev:switch-tunnel -- <https://your-current-host> [shop.myshopify.com] [--build-frontend] [--skip-frontend-build]'
    );
    process.exit(1);
  }

  if (!skipFrontendBuild) {
    const ensureArgs = ['scripts/ensure-frontend-dist.js'];
    if (buildFrontend) ensureArgs.push('--force');
    console.log('[dev:switch-tunnel] Ensuring frontend/dist matches shipping wizard sources...');
    run('node', ensureArgs, { cwd: repoRoot });
  }

  updateEnvTunnelUrls(envPath, nextUrl);
  console.log(`[dev:switch-tunnel] Updated .env to ${nextUrl}`);

  const nextEnv = { ...process.env };
  if (inputShop.trim()) {
    nextEnv.RIPX_VERIFY_SHOP = inputShop.trim();
    console.log(`[dev:switch-tunnel] Using verify shop: ${nextEnv.RIPX_VERIFY_SHOP}`);
  } else if (nextEnv.RIPX_VERIFY_SHOP) {
    console.log(`[dev:switch-tunnel] Using verify shop from env: ${nextEnv.RIPX_VERIFY_SHOP}`);
  } else {
    console.log('[dev:switch-tunnel] No verify shop provided; alignment will skip verification.');
  }

  run('npm', ['run', 'dev:align-tunnel'], { cwd: repoRoot, env: nextEnv });
}

main();
