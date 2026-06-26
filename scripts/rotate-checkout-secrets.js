#!/usr/bin/env node
/* eslint-disable no-console */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('Missing .env file.');
    process.exit(1);
  }

  const nextSecret = crypto.randomBytes(32).toString('hex');
  const source = fs.readFileSync(envPath, 'utf8');
  const hasTrailingNewline = source.endsWith('\n');
  let lines = source.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines = lines.slice(0, -1);
  }

  lines = upsertEnvKey(lines, 'RIPX_CHECKOUT_PRICE_SECRET', nextSecret);
  fs.writeFileSync(envPath, `${lines.join('\n')}${hasTrailingNewline ? '\n' : ''}`, 'utf8');

  console.log('✅ Rotated RIPX_CHECKOUT_PRICE_SECRET in .env');
  console.log('[rotate-checkout-secrets] Syncing checkout extension config...');

  const sync = spawnSync('npm', ['run', 'shopify:checkout-discount:sync-config'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (sync.status !== 0) {
    process.exit(sync.status || 1);
  }

  console.log(
    'Done. Redeploy checkout discount function if production uses a previously committed secret.'
  );
}

main();
