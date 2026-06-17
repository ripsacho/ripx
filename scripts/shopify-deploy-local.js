#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Deploy the local RipperX Shopify app (build extensions, create version, release).
 *
 * Shopify deploy rejects webhook URIs built from application_url = https://127.0.0.1/.
 * This script temporarily sets application_url from .env APP_URL (public HTTPS host).
 *
 * Usage:
 *   node scripts/shopify-deploy-local.js
 *   node scripts/shopify-deploy-local.js --no-release
 *   node scripts/shopify-deploy-local.js --app-url https://your-public-host.example.com
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const {
  DEFAULT_LOCAL_APPLICATION_URL,
  resolveLocalConfigPath,
  sanitizeShopifyLocalToml,
  readDeployAppUrlFromEnv,
  setLocalTomlApplicationUrl,
  isEphemeralTunnelUrl,
  getRepoRoot,
} = require('./shopify-local-config-utils');

function hasFlag(name) {
  return process.argv.includes(name);
}

function getArg(flagName) {
  const eqArg = process.argv.find(arg => arg.startsWith(`${flagName}=`));
  if (eqArg) {
    return eqArg.slice(flagName.length + 1).trim();
  }
  const idx = process.argv.indexOf(flagName);
  if (idx >= 0 && process.argv[idx + 1]) {
    return String(process.argv[idx + 1]).trim();
  }
  return '';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || getRepoRoot(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function restoreApplicationUrl(configPath, previousUrl) {
  const target = String(previousUrl || DEFAULT_LOCAL_APPLICATION_URL).trim();
  let raw = fs.readFileSync(configPath, 'utf8');
  raw = raw.replace(/^(application_url\s*=\s*")([^"]*)(")/m, `$1${target}$3`);
  fs.writeFileSync(configPath, raw, 'utf8');
}

function resolveDeployAppUrl() {
  const fromFlag = getArg('--app-url');
  if (fromFlag) {
    return fromFlag;
  }
  return readDeployAppUrlFromEnv();
}

function failMissingDeployUrl() {
  console.error('❌ Deploy needs a public HTTPS APP_URL in .env (not 127.0.0.1).');
  console.error('');
  console.error('Option 1 — start dev once, then deploy (syncs .env to the tunnel):');
  console.error('  npm run shopify:dev:local:safe');
  console.error('  # after dev is running, in another terminal:');
  console.error('  npm run shopify:deploy:local:safe');
  console.error('');
  console.error('Option 2 — set APP_URL manually, then deploy:');
  console.error('  npm run dev:switch-tunnel -- https://YOUR-PUBLIC-HOST ripx-plus.myshopify.com');
  console.error('  npm run shopify:deploy:local:safe');
  console.error('');
  console.error('Option 3 — pass URL directly:');
  console.error('  node scripts/shopify-deploy-local.js --app-url https://YOUR-PUBLIC-HOST');
  process.exit(1);
}

function main() {
  const repoRoot = getRepoRoot();
  const configPath = resolveLocalConfigPath('shopify.app.local.toml');
  const noRelease = hasFlag('--no-release');
  const deployAppUrl = resolveDeployAppUrl();
  if (!deployAppUrl) {
    failMissingDeployUrl();
  }

  console.log('[shopify-deploy-local] Resetting stale tunnel URLs in shopify.app.local.toml…');
  const sanitized = sanitizeShopifyLocalToml(configPath);
  sanitized.fixes.forEach(line => console.log(`  fixed: ${line}`));

  console.log('[shopify-deploy-local] Verifying config…');
  run('node', ['scripts/verify-shopify-config-match.js', '--config', 'shopify.app.local.toml'], {
    cwd: repoRoot,
  });
  run('node', ['scripts/verify-shopify-local-dev-ready.js', '--config', 'shopify.app.local.toml'], {
    cwd: repoRoot,
  });

  console.log('[shopify-deploy-local] Preparing extensions…');
  console.log(
    '[shopify-deploy-local] If release fails on ripx-checkout-ui network access, approve it once in Partner Dashboard → App → API access → Allow network access in checkout UI extensions. See docs/SHOPIFY_CHECKOUT_UI_NETWORK_ACCESS.md'
  );
  run('npm', ['run', 'shopify:extensions:prepare'], { cwd: repoRoot });

  let previousApplicationUrl = DEFAULT_LOCAL_APPLICATION_URL;
  try {
    const applied = setLocalTomlApplicationUrl(configPath, deployAppUrl);
    previousApplicationUrl = applied.previous || DEFAULT_LOCAL_APPLICATION_URL;
    console.log(`[shopify-deploy-local] Using application_url for deploy: ${applied.next}`);
    if (isEphemeralTunnelUrl(deployAppUrl)) {
      console.warn(
        '⚠️  APP_URL is an ephemeral tunnel (*.trycloudflare.com). Deploy will work now, but webhooks break when the tunnel restarts. Prefer a stable host for production-like deploys.'
      );
    }

    const deployArgs = ['app', 'deploy', '--config', 'shopify.app.local.toml', '--allow-updates'];
    if (noRelease) {
      deployArgs.push('--no-release');
    }

    console.log(
      `[shopify-deploy-local] Running: shopify ${deployArgs.join(' ')}\n` +
        (noRelease
          ? '  (creates a version only — release manually in Partner Dashboard)'
          : '  (creates a version and releases it)')
    );
    run('shopify', deployArgs, { cwd: repoRoot });
  } finally {
    restoreApplicationUrl(configPath, previousApplicationUrl);
    console.log(`[shopify-deploy-local] Restored application_url to ${previousApplicationUrl}`);
  }

  console.log('\n[shopify-deploy-local] Done. Verify active version:\n');
  console.log('  shopify app versions list --config shopify.app.local.toml\n');
}

main();
