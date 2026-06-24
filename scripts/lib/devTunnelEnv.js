/* eslint-disable no-console */
const fs = require('fs');

const TRACK_URL_KEYS = {
  RIPX_SHIPPING_CARRIER_CALLBACK_URL: '/api/track/shipping-carrier-rates',
  RIPX_SHIPPING_RESOLVE_BATCH_URL: '/api/track/shipping-resolve-batch',
  RIPX_PRICE_RESOLVE_BATCH_URL: '/api/track/price-resolve-batch',
  RIPX_CHECKOUT_ASSIGNMENT_URL: '/api/track/checkout-assignment',
  RIPX_CHECKOUT_CONVERSION_URL: '/api/track/checkout-conversion',
};

function normalizeTunnelUrl(raw) {
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

function normalizeHostToUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) {
    return normalizeTunnelUrl(value) || value.replace(/\/+$/, '');
  }
  return normalizeTunnelUrl(`https://${value.replace(/\/+$/, '')}`);
}

function readEnvValue(envPath, key) {
  if (!envPath || !fs.existsSync(envPath)) return '';
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .map(item => item.trim())
    .find(item => item.startsWith(`${key}=`));
  if (!line) return '';
  return line.slice(`${key}=`.length).trim().replace(/^"|"$/g, '');
}

function readAppUrlFromEnv(envPath) {
  return readEnvValue(envPath, 'APP_URL');
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

function updateEnvTunnelUrls(envPath, appUrl) {
  if (!appUrl || !fs.existsSync(envPath)) {
    return false;
  }
  const source = fs.readFileSync(envPath, 'utf8');
  const hasTrailingNewline = source.endsWith('\n');
  let lines = source.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines = lines.slice(0, -1);
  }

  lines = upsertEnvKey(lines, 'APP_URL', appUrl);
  lines = upsertEnvKey(lines, 'SHOPIFY_APP_URL', appUrl);
  lines = upsertEnvKey(lines, 'RIPX_OAUTH_REDIRECT_BASE', appUrl);
  Object.entries(TRACK_URL_KEYS).forEach(([key, pathSuffix]) => {
    lines = upsertEnvKey(lines, key, `${appUrl}${pathSuffix}`);
  });

  const output = `${lines.join('\n')}${hasTrailingNewline ? '\n' : ''}`;
  fs.writeFileSync(envPath, output, 'utf8');
  return true;
}

function isEphemeralTunnelUrl(rawUrl) {
  try {
    const host = new URL(String(rawUrl || '').trim()).hostname;
    return (
      /\.trycloudflare\.com$/i.test(host) ||
      /\.ngrok-free\.app$/i.test(host) ||
      /\.ngrok\.io$/i.test(host)
    );
  } catch {
    return false;
  }
}

function tunnelUrlsMatch(left, right) {
  const a = normalizeTunnelUrl(left) || normalizeHostToUrl(left);
  const b = normalizeTunnelUrl(right) || normalizeHostToUrl(right);
  return Boolean(a && b && a === b);
}

module.exports = {
  TRACK_URL_KEYS,
  normalizeTunnelUrl,
  normalizeHostToUrl,
  readEnvValue,
  readAppUrlFromEnv,
  updateEnvTunnelUrls,
  isEphemeralTunnelUrl,
  tunnelUrlsMatch,
};
