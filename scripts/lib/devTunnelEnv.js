/* eslint-disable no-console */
const fs = require('fs');

const EXAMPLE_TUNNEL_URL = 'https://ripx-test-tunnel.trycloudflare.com';

const TRACK_URL_KEYS = {
  RIPX_SHIPPING_CARRIER_CALLBACK_URL: '/api/track/shipping-carrier-rates',
  RIPX_SHIPPING_RESOLVE_BATCH_URL: '/api/track/shipping-resolve-batch',
  RIPX_PRICE_RESOLVE_BATCH_URL: '/api/track/price-resolve-batch',
  RIPX_CHECKOUT_ASSIGNMENT_URL: '/api/track/checkout-assignment',
  RIPX_CHECKOUT_CONVERSION_URL: '/api/track/checkout-conversion',
};

const DERIVED_APP_URL_KEYS = [
  'SHOPIFY_APP_URL',
  'RIPX_OAUTH_REDIRECT_BASE',
  ...Object.keys(TRACK_URL_KEYS),
];

function buildExampleTunnelUrl(subdomain = 'ripx-test-tunnel') {
  const slug = String(subdomain || 'ripx-test-tunnel')
    .trim()
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return `https://${slug || 'ripx-test-tunnel'}.trycloudflare.com`;
}

function buildTrackUrl(appUrl, pathSuffix) {
  const base = String(appUrl || '')
    .trim()
    .replace(/\/+$/, '');
  const path = String(pathSuffix || '').trim();
  if (!base || !path) {
    return '';
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function deriveEnvUrlsFromAppUrl(appUrl) {
  const base =
    normalizeTunnelUrl(appUrl) ||
    String(appUrl || '')
      .trim()
      .replace(/\/+$/, '');
  if (!base) {
    return {};
  }
  const derived = {
    APP_URL: base,
    SHOPIFY_APP_URL: base,
    RIPX_OAUTH_REDIRECT_BASE: base,
  };
  Object.entries(TRACK_URL_KEYS).forEach(([key, pathSuffix]) => {
    derived[key] = buildTrackUrl(base, pathSuffix);
  });
  return derived;
}

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

function removeEnvKeys(lines, keys) {
  const prefixes = new Set(
    (Array.isArray(keys) ? keys : []).map(key => `${String(key || '').trim()}=`)
  );
  return lines.filter(line => !Array.from(prefixes).some(prefix => line.startsWith(prefix)));
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

  lines = removeEnvKeys(lines, DERIVED_APP_URL_KEYS);
  lines = upsertEnvKey(lines, 'APP_URL', appUrl);

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
  EXAMPLE_TUNNEL_URL,
  TRACK_URL_KEYS,
  DERIVED_APP_URL_KEYS,
  buildExampleTunnelUrl,
  buildTrackUrl,
  deriveEnvUrlsFromAppUrl,
  normalizeTunnelUrl,
  normalizeHostToUrl,
  readEnvValue,
  readAppUrlFromEnv,
  updateEnvTunnelUrls,
  isEphemeralTunnelUrl,
  tunnelUrlsMatch,
};
