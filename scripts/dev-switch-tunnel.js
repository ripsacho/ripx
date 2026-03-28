#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function normalizeUrl(raw) {
  const candidate = String(raw || '').trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:') return '';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function upsertEnvKey(lines, key, value) {
  const prefix = `${key}=`;
  let replaced = false;
  const next = lines.map(line => {
    if (line.startsWith(prefix)) {
      replaced = true;
      return `${prefix}${value}`;
    }
    return line;
  });
  if (!replaced) {
    next.push(`${prefix}${value}`);
  }
  return next;
}

function updateEnvUrls(envPath, appUrl) {
  const source = fs.readFileSync(envPath, 'utf8');
  const hasTrailingNewline = source.endsWith('\n');
  let lines = source.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines = lines.slice(0, -1);
  }

  lines = upsertEnvKey(lines, 'APP_URL', appUrl);
  lines = upsertEnvKey(lines, 'SHOPIFY_APP_URL', appUrl);
  lines = upsertEnvKey(lines, 'RIPX_OAUTH_REDIRECT_BASE', appUrl);

  const output = `${lines.join('\n')}${hasTrailingNewline ? '\n' : ''}`;
  fs.writeFileSync(envPath, output, 'utf8');
}

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
  const inputUrl = process.argv[2] || '';
  const inputShop = process.argv[3] || '';
  const nextUrl = normalizeUrl(inputUrl);

  if (!nextUrl) {
    console.error(
      'Usage: npm run dev:switch-tunnel -- <https://your-current-host> [shop.myshopify.com]'
    );
    process.exit(1);
  }

  updateEnvUrls(envPath, nextUrl);
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
