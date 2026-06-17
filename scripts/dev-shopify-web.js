#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function normalizeHostToUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '');
  return `https://${value.replace(/\/+$/, '')}`;
}

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

function syncEnvTunnelUrl(envPath, appUrl) {
  if (!appUrl || !fs.existsSync(envPath)) {
    return;
  }
  const source = fs.readFileSync(envPath, 'utf8');
  const hasTrailingNewline = source.endsWith('\n');
  const keys = [
    'APP_URL',
    'SHOPIFY_APP_URL',
    'RIPX_OAUTH_REDIRECT_BASE',
    'RIPX_PRICE_RESOLVE_BATCH_URL',
    'RIPX_SHIPPING_RESOLVE_BATCH_URL',
    'RIPX_CHECKOUT_ASSIGNMENT_URL',
    'RIPX_CHECKOUT_CONVERSION_URL',
  ];
  let lines = source.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines = lines.slice(0, -1);
  }
  const values = {
    APP_URL: appUrl,
    SHOPIFY_APP_URL: appUrl,
    RIPX_OAUTH_REDIRECT_BASE: appUrl,
    RIPX_PRICE_RESOLVE_BATCH_URL: `${appUrl}/api/track/price-resolve-batch`,
    RIPX_SHIPPING_RESOLVE_BATCH_URL: `${appUrl}/api/track/shipping-resolve-batch`,
    RIPX_CHECKOUT_ASSIGNMENT_URL: `${appUrl}/api/track/checkout-assignment`,
    RIPX_CHECKOUT_CONVERSION_URL: `${appUrl}/api/track/checkout-conversion`,
  };
  keys.forEach(key => {
    const prefix = `${key}=`;
    let replaced = false;
    lines = lines.map(line => {
      if (!line.startsWith(prefix)) {
        return line;
      }
      replaced = true;
      return `${prefix}${values[key]}`;
    });
    if (!replaced) {
      lines.push(`${prefix}${values[key]}`);
    }
  });
  fs.writeFileSync(envPath, `${lines.join('\n')}${hasTrailingNewline ? '\n' : ''}`, 'utf8');
}

const hostUrl = normalizeHostToUrl(process.env.HOST);
if (hostUrl) {
  const envPath = path.join(__dirname, '..', '.env');
  syncEnvTunnelUrl(envPath, hostUrl);
  console.log(`[dev-shopify-web] Synced .env tunnel URLs to ${hostUrl}`);
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
  console.log(
    `[dev-shopify-web] After dev is stable, sync .env with: npm run dev:switch-tunnel -- ${hostUrl}`
  );
  try {
    const host = new URL(hostUrl).hostname;
    if (/\.trycloudflare\.com$/i.test(host) || /\.ngrok-free\.app$/i.test(host)) {
      console.log(
        `[dev-shopify-web] If dev preview fails, copy Partner Dashboard URLs:\n` +
          `  npm run shopify:print:partner-urls -- ${hostUrl}`
      );
    }
  } catch {
    // ignore invalid HOST
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
