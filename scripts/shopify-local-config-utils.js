/**
 * Shared helpers for shopify.app.local.toml — keep ephemeral tunnel hosts out of committed config.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_LOCAL_APPLICATION_URL = 'https://127.0.0.1/';

const EPHEMERAL_HOST_PATTERNS = [
  /\.trycloudflare\.com$/i,
  /\.ngrok-free\.app$/i,
  /\.ngrok\.io$/i,
  /\.ngrok\.app$/i,
];

function isEphemeralTunnelUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return false;
  }
  try {
    const host = new URL(value).hostname;
    return EPHEMERAL_HOST_PATTERNS.some(pattern => pattern.test(host));
  } catch {
    return false;
  }
}

function parseTomlQuotedValue(raw, key) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm');
  const match = String(raw || '').match(re);
  return match ? match[1].trim() : '';
}

function setTomlQuotedValue(raw, key, nextValue) {
  const re = new RegExp(`^(\\s*${key}\\s*=\\s*")([^"]*)(")`, 'm');
  if (!re.test(raw)) {
    return raw;
  }
  return raw.replace(re, `$1${nextValue}$3`);
}

function findEphemeralTunnelHosts(raw) {
  const hosts = new Set();
  const matches = String(raw || '').match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z.]+/gi) || [];
  matches.forEach(url => {
    if (isEphemeralTunnelUrl(url)) {
      hosts.add(url.replace(/\/+$/, ''));
    }
  });
  return Array.from(hosts);
}

/**
 * Reset application_url (and other ephemeral absolute URLs) so deploy/dev do not ship stale tunnels.
 *
 * @param {string} configPath
 * @param {{ dryRun?: boolean, applicationUrl?: string }} [options]
 * @returns {{ changed: boolean, fixes: string[], warnings: string[] }}
 */
function sanitizeShopifyLocalToml(configPath, options = {}) {
  const dryRun = options.dryRun === true;
  const targetApplicationUrl = String(
    options.applicationUrl || DEFAULT_LOCAL_APPLICATION_URL
  ).trim();
  const fixes = [];
  const warnings = findEphemeralTunnelHosts(fs.readFileSync(configPath, 'utf8')).map(
    host => `Found ephemeral tunnel host in config: ${host}`
  );

  let raw = fs.readFileSync(configPath, 'utf8');
  const currentApplicationUrl = parseTomlQuotedValue(raw, 'application_url');
  if (currentApplicationUrl && isEphemeralTunnelUrl(currentApplicationUrl)) {
    raw = setTomlQuotedValue(raw, 'application_url', targetApplicationUrl);
    fixes.push(`application_url: ${currentApplicationUrl} → ${targetApplicationUrl}`);
  }

  const absoluteAppProxy = parseTomlQuotedValue(raw, 'url');
  if (absoluteAppProxy && isEphemeralTunnelUrl(absoluteAppProxy) && /app_proxy/.test(raw)) {
    raw = raw.replace(/(\[app_proxy\][\s\S]*?^url\s*=\s*")[^"]*(")/m, '$1/api/proxy/script.js$2');
    fixes.push(`app_proxy.url: reset to relative /api/proxy/script.js`);
  }

  const changed = fixes.length > 0;
  if (changed && !dryRun) {
    fs.writeFileSync(configPath, raw, 'utf8');
  }

  return { changed, fixes, warnings };
}

function getRepoRoot() {
  return path.join(__dirname, '..');
}

function resolveLocalConfigPath(configArg) {
  const configPath = configArg
    ? path.isAbsolute(configArg)
      ? configArg
      : path.join(getRepoRoot(), configArg)
    : path.join(getRepoRoot(), 'shopify.app.local.toml');
  return configPath;
}

function isLocalhostAppUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return true;
  }
  try {
    const host = new URL(value).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host.endsWith('.localhost');
  } catch {
    return true;
  }
}

function normalizePublicAppUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return '';
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function readDeployAppUrlFromEnv(envPath = path.join(getRepoRoot(), '.env')) {
  if (!fs.existsSync(envPath)) {
    return '';
  }
  const src = fs.readFileSync(envPath, 'utf8');
  const keys = ['APP_URL', 'SHOPIFY_APP_URL', 'RIPX_OAUTH_REDIRECT_BASE'];
  for (const key of keys) {
    const line = src
      .split('\n')
      .map(s => s.trim())
      .find(s => s.startsWith(`${key}=`));
    if (!line) {
      continue;
    }
    const url = normalizePublicAppUrl(line.slice(key.length + 1).trim());
    if (url && !isLocalhostAppUrl(url)) {
      return url;
    }
  }
  return '';
}

/**
 * Set application_url for deploy (Shopify rejects 127.0.0.1 webhook targets).
 *
 * @returns {{ previous: string, next: string }}
 */
function setLocalTomlApplicationUrl(configPath, nextUrl) {
  const normalized = normalizePublicAppUrl(nextUrl);
  if (!normalized || isLocalhostAppUrl(normalized)) {
    throw new Error(
      `Deploy requires a public HTTPS APP_URL, not localhost. Got: ${String(nextUrl || '(empty)')}`
    );
  }
  const deployBase = `${normalized}/`;
  let raw = fs.readFileSync(configPath, 'utf8');
  const previous = parseTomlQuotedValue(raw, 'application_url');
  raw = setTomlQuotedValue(raw, 'application_url', deployBase);
  fs.writeFileSync(configPath, raw, 'utf8');
  return { previous, next: deployBase };
}

function normalizeOAuthHost(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) {
    return '';
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function parseTomlRedirectUrl(rawToml) {
  const match = String(rawToml || '').match(/redirect_urls\s*=\s*\[\s*"([^"]+)"/m);
  return match ? match[1].trim() : '';
}

function evaluateOAuthUrlAlignment({ env = {}, tomlRaw = '', configLabel = 'config' }) {
  const applicationUrl = parseTomlQuotedValue(tomlRaw, 'application_url');
  const redirectUrl = parseTomlRedirectUrl(tomlRaw);
  const appHost = normalizeOAuthHost(applicationUrl);
  const redirectHost = normalizeOAuthHost(redirectUrl);
  const errors = [];
  const warnings = [];

  if (!applicationUrl) {
    errors.push(`${configLabel} is missing application_url.`);
  }
  if (!redirectUrl) {
    errors.push(`${configLabel} is missing auth redirect_urls.`);
  }
  if (appHost && redirectHost && appHost !== redirectHost) {
    errors.push(
      `${configLabel} application_url host (${appHost}) does not match redirect_urls host (${redirectHost}).`
    );
  }
  if (applicationUrl && isEphemeralTunnelUrl(applicationUrl)) {
    errors.push(`${configLabel} application_url uses an ephemeral tunnel host.`);
  }
  if (redirectUrl && isEphemeralTunnelUrl(redirectUrl)) {
    errors.push(`${configLabel} redirect_urls uses an ephemeral tunnel host.`);
  }

  const envKeys = ['APP_URL', 'SHOPIFY_APP_URL', 'RIPX_OAUTH_REDIRECT_BASE'];
  const envHosts = {};
  envKeys.forEach(key => {
    const raw = String(env[key] || '').trim();
    if (!raw) {
      return;
    }
    envHosts[key] = normalizeOAuthHost(raw);
    if (isEphemeralTunnelUrl(raw)) {
      warnings.push(`${key} uses an ephemeral tunnel host (${envHosts[key]}).`);
    }
    if (appHost && envHosts[key] && envHosts[key] !== appHost) {
      errors.push(
        `${key} host (${envHosts[key]}) does not match ${configLabel} application_url host (${appHost}).`
      );
    }
  });

  const uniqueEnvHosts = Array.from(new Set(Object.values(envHosts).filter(Boolean)));
  if (uniqueEnvHosts.length > 1) {
    errors.push(
      `Env URL hosts disagree (${uniqueEnvHosts.join(', ')}). Set APP_URL, SHOPIFY_APP_URL, and RIPX_OAUTH_REDIRECT_BASE to the same host.`
    );
  }

  return {
    applicationUrl,
    redirectUrl,
    appHost,
    redirectHost,
    envHosts,
    errors,
    warnings,
  };
}

module.exports = {
  DEFAULT_LOCAL_APPLICATION_URL,
  EPHEMERAL_HOST_PATTERNS,
  isEphemeralTunnelUrl,
  isLocalhostAppUrl,
  normalizePublicAppUrl,
  readDeployAppUrlFromEnv,
  setLocalTomlApplicationUrl,
  sanitizeShopifyLocalToml,
  findEphemeralTunnelHosts,
  parseTomlQuotedValue,
  setTomlQuotedValue,
  resolveLocalConfigPath,
  getRepoRoot,
  evaluateOAuthUrlAlignment,
};
