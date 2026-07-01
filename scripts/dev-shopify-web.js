#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  normalizeHostToUrl,
  readAppUrlFromEnv,
  updateEnvTunnelUrls,
  tunnelUrlsMatch,
  isEphemeralTunnelUrl,
} = require('./lib/devTunnelEnv');

function mergeAllowedOrigins(existing, hostUrl) {
  const defaults = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];
  const values = []
    .concat(defaults)
    .concat(String(existing || '').split(','))
    .concat(hostUrl ? [hostUrl] : [])
    .map(item => String(item || '').trim())
    .filter(Boolean);
  return Array.from(new Set(values)).join(',');
}

function runAlignTunnel(repoRoot, env) {
  console.log('[dev-shopify-web] Tunnel host changed; aligning extension config...');
  const result = spawnSync('npm', ['run', 'dev:align-tunnel'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env,
  });
  if (result.status !== 0) {
    console.warn(
      '[dev-shopify-web] dev:align-tunnel failed; dev will still start. Fix with: npm run dev:switch-tunnel -- <tunnel-url> [shop.myshopify.com]'
    );
  }
}

const repoRoot = path.join(__dirname, '..');
const envPath = path.join(repoRoot, '.env');
const hostUrl = normalizeHostToUrl(process.env.HOST);
let tunnelChanged = false;

if (hostUrl) {
  const previousAppUrl = readAppUrlFromEnv(envPath);
  tunnelChanged = Boolean(previousAppUrl) && !tunnelUrlsMatch(previousAppUrl, hostUrl);
  updateEnvTunnelUrls(envPath, hostUrl);
  console.log(`[dev-shopify-web] Synced .env tunnel URLs to ${hostUrl}`);

  if (tunnelChanged) {
    runAlignTunnel(repoRoot, process.env);
  } else if (isEphemeralTunnelUrl(hostUrl)) {
    console.log(
      `[dev-shopify-web] Ephemeral tunnel detected. If shipping checkout fails, re-apply shipping tests after tunnel changes.`
    );
  }
}

const env = {
  ...process.env,
  ...(hostUrl
    ? {
        APP_URL: hostUrl,
        SHOPIFY_APP_URL: hostUrl,
        RIPX_OAUTH_REDIRECT_BASE: hostUrl,
      }
    : {}),
  ALLOWED_ORIGINS: mergeAllowedOrigins(process.env.ALLOWED_ORIGINS, hostUrl),
};

if (hostUrl) {
  console.log(`[dev-shopify-web] Using Shopify tunnel host: ${hostUrl}`);
  if (!tunnelChanged) {
    console.log(
      `[dev-shopify-web] Manual full sync (frontend dist + verify): npm run dev:switch-tunnel -- ${hostUrl} [shop.myshopify.com]`
    );
  }
  if (isEphemeralTunnelUrl(hostUrl)) {
    console.log(
      `[dev-shopify-web] Partner Dashboard URLs:\n` +
        `  npm run shopify:print:partner-urls -- ${hostUrl}`
    );
  }
}

const child = spawn('npm', ['run', 'dev:shopify:web'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

child.on('exit', code => process.exit(code || 0));
child.on('error', err => {
  console.error('[dev-shopify-web] Failed to start:', err?.message || err);
  process.exit(1);
});
