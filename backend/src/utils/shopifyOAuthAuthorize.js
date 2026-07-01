/**
 * Build Shopify OAuth authorize URLs and signed state (shared by auth + shop routes).
 */

const crypto = require('crypto');
const logger = require('./logger');

const STATE_SEP = '|';

const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 10 * 60 * 1000,
  path: '/',
};

function getAllowedRedirectHosts() {
  const hosts = new Set();
  for (const envUrl of [
    process.env.RIPX_OAUTH_REDIRECT_BASE,
    process.env.FRONTEND_URL,
    process.env.APP_URL,
  ]) {
    if (envUrl) {
      try {
        const u = new URL(envUrl.startsWith('http') ? envUrl : `https://${envUrl}`);
        hosts.add(u.hostname.toLowerCase());
      } catch {
        // ignore invalid URL
      }
    }
  }
  const extra = process.env.RIPX_OAUTH_ALLOWED_HOSTS || '';
  extra.split(',').forEach(s => {
    const h = s.trim().toLowerCase();
    if (h) {
      hosts.add(h);
    }
  });
  hosts.add('localhost');
  hosts.add('127.0.0.1');
  return hosts;
}

const ALLOWED_HOST_SUFFIXES = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.ngrok.app'];

function isHostAllowed(host) {
  if (!host || typeof host !== 'string') {
    return false;
  }
  const h = host.trim().toLowerCase();
  if (getAllowedRedirectHosts().has(h)) {
    return true;
  }
  return ALLOWED_HOST_SUFFIXES.some(suffix => h.endsWith(suffix));
}

function validateCallbackBase(candidate) {
  if (!candidate || typeof candidate !== 'string') {
    return null;
  }
  const s = candidate.trim().replace(/\/+$/, '');
  if (!s) {
    return null;
  }
  let url;
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!isHostAllowed(host)) {
    return null;
  }
  return `${url.protocol}//${url.host}`.replace(/\/+$/, '');
}

function getOAuthRedirectBaseFromRequest(req) {
  if (!req) {
    return null;
  }
  const tryHost = raw => {
    if (!raw) {
      return null;
    }
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      if (!isHostAllowed(u.hostname)) {
        return null;
      }
      return `${u.protocol}//${u.host}`.replace(/\/+$/, '');
    } catch {
      return null;
    }
  };
  const forwardedHost = req.get('X-Forwarded-Host');
  if (forwardedHost) {
    const firstHost = forwardedHost.split(',')[0].trim();
    const fromForwarded = tryHost(firstHost.includes('://') ? firstHost : `https://${firstHost}`);
    if (fromForwarded) {
      return fromForwarded;
    }
  }
  const host = req.get('Host');
  if (host && isHostAllowed(host.split(':')[0])) {
    const protocol =
      req.get('X-Forwarded-Proto') ||
      (host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${protocol}://${host}`.replace(/\/+$/, '');
  }
  const origin = req.get('Origin') || req.get('Referer') || '';
  return tryHost(origin);
}

function getOAuthRedirectBase(req = null) {
  const strictBase = process.env.RIPX_OAUTH_REDIRECT_BASE;
  if (strictBase && typeof strictBase === 'string') {
    const validated = validateCallbackBase(strictBase.trim().replace(/\/+$/, ''));
    if (validated) {
      return validated;
    }
  }
  const fromRequest = req ? getOAuthRedirectBaseFromRequest(req) : null;
  return (
    fromRequest ||
    (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '') ||
    'http://localhost:3000'
  );
}

function generateOAuthState(shop, email = '') {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error('SHOPIFY_API_SECRET is required for Shopify OAuth state signing');
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const emailPart = (email && typeof email === 'string' ? email.trim().toLowerCase() : '') || '';
  const payload = nonce + STATE_SEP + shop + STATE_SEP + emailPart;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const payloadB64 = Buffer.from(payload, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return payloadB64 + '.' + sig;
}

function buildOAuthAuthorizeUrl(shop, state, callbackBaseOverride = null, req = null) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES || '';
  const strictBase =
    process.env.RIPX_OAUTH_REDIRECT_BASE && typeof process.env.RIPX_OAUTH_REDIRECT_BASE === 'string'
      ? validateCallbackBase(process.env.RIPX_OAUTH_REDIRECT_BASE.trim().replace(/\/+$/, ''))
      : null;
  const validatedBase = callbackBaseOverride ? validateCallbackBase(callbackBaseOverride) : null;
  const base = strictBase || validatedBase || getOAuthRedirectBase(req);
  const redirectUri = `${base}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });
  if (process.env.LOG_LEVEL === 'debug') {
    logger.debug('Shopify OAuth authorize URL built', { shop, redirectUri });
  }
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

function setShopifyOAuthStartCookies(res, { shop, state }) {
  res.cookie('shopify_oauth_state', state, OAUTH_COOKIE_OPTIONS);
  res.cookie('shopify_oauth_shop', shop, OAUTH_COOKIE_OPTIONS);
}

module.exports = {
  OAUTH_COOKIE_OPTIONS,
  generateOAuthState,
  buildOAuthAuthorizeUrl,
  setShopifyOAuthStartCookies,
  getOAuthRedirectBase,
  validateCallbackBase,
};
