/**
 * Auth Routes
 *
 * Shopify OAuth installation flow + email token (magic-link) login.
 * See FUTURE_IMPLEMENTATION_PLAN.md § Email token login and re-verification.
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { upsertShopSession } = require('../models/shopSession');
const { upsertShopifyTenant, getTenantByDomain } = require('../models/tenant');
const { asyncHandler } = require('../middleware/asyncHandler');
const emailVerificationService = require('../services/emailVerificationService');
const loginOtpService = require('../services/loginOtpService');
const userModel = require('../models/user');
const standaloneUser = require('../models/standaloneUser');
const emailService = require('../services/emailService');
const auditLogService = require('../services/auditLogService');
const { isUserStatusBlocked, isUserStatusAllowedForSession } = require('../constants');
const logger = require('../utils/logger');

const router = express.Router();
const { query, withTransaction } = require('../utils/database');

const EMAIL_SESSION_EXPIRY_DAYS = 30;
const EMAIL_SESSION_EXPIRY_HOURS = 24;

function getAdminEmails() {
  const raw = process.env.RIPX_ADMIN_EMAIL;
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  return raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}
function isAdminEmail(email) {
  if (!email) {
    return false;
  }
  return getAdminEmails().includes(email.trim().toLowerCase());
}

function isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

const STATE_SEP = '|';
const EMAIL_SESSION_COOKIE = 'ripx_email_session';

/** Connect page ?reason= values (must match frontend ROUTES.CONNECT_REASON) */
const CONNECT_REASON = {
  SIGN_IN_TO_CONNECT: 'sign_in_to_connect',
  SIGN_IN_TO_LINK: 'sign_in_to_link',
  STORE_LINKED_TO_ANOTHER: 'store_linked_to_another',
  OAUTH_EXPIRED: 'oauth_expired',
  /** Callback shop differed from OAuth-started shop → redirect to Domains to retry */
  OAUTH_WRONG_STORE: 'oauth_wrong_store',
};

const OAUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 10 * 60 * 1000,
  path: '/',
};

/**
 * Decode state payload and return email segment (no signature check).
 * Used when state is accepted via cookie match. Email is everything after the second separator
 * so emails containing STATE_SEP (|) parse correctly.
 */
function getEmailFromStatePayload(state) {
  if (!state || state.indexOf('.') === -1) {
    return '';
  }
  try {
    const b64 = state.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const payload = Buffer.from(b64, 'base64').toString('utf8');
    const segs = payload.split(STATE_SEP);
    if (segs.length < 3) {
      return '';
    }
    const emailPart = segs.slice(2).join(STATE_SEP);
    return (emailPart || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function generateState(shop, email = '') {
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

/**
 * Verify signed OAuth state and parse payload. Returns { shop, email } or null if invalid.
 * email is '' when not present (legacy state format).
 */
function verifyAndParseState(state, shop) {
  if (!state || !shop || !process.env.SHOPIFY_API_SECRET) {
    return null;
  }
  const parts = state.split('.');
  if (parts.length !== 2) {
    return null;
  }
  let payload;
  try {
    const b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    payload = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
  const expectedSig = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(payload)
    .digest('hex');
  if (
    parts[1].length !== expectedSig.length ||
    !crypto.timingSafeEqual(Buffer.from(parts[1], 'utf8'), Buffer.from(expectedSig, 'utf8'))
  ) {
    return null;
  }
  const segs = payload.split(STATE_SEP);
  if (segs.length < 2) {
    return null;
  }
  const shopFromState = segs[1];
  if (shopFromState.trim().toLowerCase() !== shop.trim().toLowerCase()) {
    return null;
  }
  // Email may contain STATE_SEP (|); take everything after second separator
  const email = segs.length >= 3 ? segs.slice(2).join(STATE_SEP).trim().toLowerCase() : '';
  return { shop: shopFromState, email };
}

/**
 * Allowed host patterns for request-derived redirect base (so redirect_uri always matches the host the user is on).
 * Shopify requires redirect_uri and application url to have matching hosts.
 */
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
  // Optional: allow extra hosts that match Partner Dashboard (e.g. custom domain)
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

/** Allowed host suffixes for tunnels (Cloudflare, ngrok). Host must end with one of these. */
const ALLOWED_HOST_SUFFIXES = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io', '.ngrok.app'];

function isHostAllowed(host) {
  if (!host || typeof host !== 'string') {
    return false;
  }
  const h = host.toLowerCase().trim();
  if (getAllowedRedirectHosts().has(h)) {
    return true;
  }
  return ALLOWED_HOST_SUFFIXES.some(suffix => h.endsWith(suffix));
}

/**
 * Get redirect base from the request (Host or X-Forwarded-Host) so redirect_uri matches the host the user is on.
 * Shopify requires redirect_uri and application url to have matching hosts — using request host ensures that.
 * Returns null if request host is not allowed.
 * When behind a tunnel (e.g. cloudflared), Host is often localhost — then try Origin/Referer (browser sends page origin).
 */
function getOAuthRedirectBaseFromRequest(req) {
  if (!req || !req.get) {
    return null;
  }

  const tryHost = raw => {
    if (!raw || typeof raw !== 'string') {
      return null;
    }
    const s = raw.split(',')[0].trim();
    let h;
    let protocol = 'https';
    let port = '';
    try {
      const u = new URL(s.startsWith('http') ? s : `https://${s}`);
      h = u.hostname.toLowerCase();
      protocol = u.protocol === 'http:' ? 'http' : 'https';
      const portNum = u.port || '';
      if (portNum && portNum !== '80' && portNum !== '443') {
        port = `:${portNum}`;
      }
    } catch {
      h = s.split(':')[0].toLowerCase();
      protocol =
        req.get('X-Forwarded-Proto') === 'https' || req.get('X-Forwarded-SSL') === 'on'
          ? 'https'
          : (req.protocol || 'https').replace(/:$/, '');
    }
    if (!h) {
      return null;
    }
    const isLocal = h === 'localhost' || h === '127.0.0.1';
    if (isLocal) {
      return null;
    }
    if (!isHostAllowed(h)) {
      return null;
    }
    return `${protocol}://${h}${port}`.replace(/\/+$/, '');
  };

  // Prefer Host / X-Forwarded-Host (actual request host)
  const host = req.get('X-Forwarded-Host') || req.get('Host') || '';
  const h = host.split(',')[0].trim().split(':')[0];
  if (h && h !== 'localhost' && h !== '127.0.0.1' && isHostAllowed(h)) {
    const protocol =
      req.get('X-Forwarded-Proto') === 'https' || req.get('X-Forwarded-SSL') === 'on'
        ? 'https'
        : req.protocol || 'https';
    const port =
      req.get('X-Forwarded-Port') ||
      (req.socket && req.socket.address && req.socket.address().port);
    const portSuffix = port && String(port) !== '80' && String(port) !== '443' ? `:${port}` : '';
    return `${protocol}://${h}${portSuffix}`.replace(/\/+$/, '');
  }

  // When Host is localhost (tunnel/proxy), use Origin or Referer so redirect_uri matches the page the user is on
  const origin = req.get('Origin') || req.get('Referer') || '';
  const fromOrigin = tryHost(origin);
  if (fromOrigin) {
    return fromOrigin;
  }

  return null;
}

/**
 * Base URL for OAuth redirect_uri and in-app redirects.
 * Priority: RIPX_OAUTH_REDIRECT_BASE (must match Partner Dashboard) > request host / Origin > callback_base > APP_URL.
 * Shopify requires redirect_uri and Application URL to have the same host — set RIPX_OAUTH_REDIRECT_BASE to your
 * Partner Dashboard Application URL (e.g. https://your-app.example.com) when it differs from where users open the app.
 */
function getOAuthRedirectBase(req = null) {
  const strictBase = process.env.RIPX_OAUTH_REDIRECT_BASE;
  if (strictBase && typeof strictBase === 'string') {
    const validated = validateCallbackBase(strictBase.trim().replace(/\/+$/, ''));
    if (validated) {
      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug('OAuth redirect base from RIPX_OAUTH_REDIRECT_BASE', { base: validated });
      }
      return validated;
    }
  }

  const fromRequest = req ? getOAuthRedirectBaseFromRequest(req) : null;
  const base =
    fromRequest ||
    (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '') ||
    'http://localhost:3000';
  if (req && !fromRequest && (process.env.FRONTEND_URL || process.env.APP_URL)) {
    const host = req.get('X-Forwarded-Host') || req.get('Host') || '';
    if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
      logger.info('OAuth redirect base from APP_URL/FRONTEND_URL (request host was localhost)', {
        base: base.replace(/\/$/, '').substring(0, 60) + (base.length > 60 ? '…' : ''),
      });
    }
  }
  if (process.env.LOG_LEVEL === 'debug' && req) {
    const host = req.get('X-Forwarded-Host') || req.get('Host') || '';
    logger.debug('OAuth redirect base', { fromRequest: !!fromRequest, requestHost: host, base });
  }
  return base;
}

/**
 * Validate that a candidate callback base URL is allowed (same host as app or localhost in dev).
 * Uses same allowlist as isHostAllowed so tunnel URLs (e.g. .trycloudflare.com) and RIPX_OAUTH_ALLOWED_HOSTS are accepted.
 * Returns the normalized base (no trailing slash) or null if invalid.
 */
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
  const base = `${url.protocol}//${url.host}`.replace(/\/+$/, '');
  return base;
}

function getAuthRedirectUrl(shop, state, callbackBaseOverride = null, req = null) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES || '';
  // Use RIPX_OAUTH_REDIRECT_BASE when set so redirect_uri always matches Partner Dashboard
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

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

const INSTALL_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Create a signed one-time install token so the user can open a link in incognito;
 * that link hits /auth/install which validates the token and redirects to Shopify for the intended shop only.
 */
function createInstallToken(shop, email) {
  if (!shop || !email || !process.env.SHOPIFY_API_SECRET) {
    return null;
  }
  const exp = Date.now() + INSTALL_TOKEN_EXPIRY_MS;
  const payload = JSON.stringify({
    shop: shop.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    exp,
  });
  const payloadB64 = Buffer.from(payload, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const sig = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(payload)
    .digest('hex');
  return payloadB64 + '.' + sig;
}

/**
 * Verify install token and return { shop, email } or null. Ensures shop in token matches query param.
 */
function verifyInstallToken(token, shopFromQuery) {
  if (!token || !shopFromQuery || !process.env.SHOPIFY_API_SECRET) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [payloadB64, sig] = parts;
  const payload = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
    'utf8'
  );
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    return null;
  }
  const expectedSig = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(payload)
    .digest('hex');
  if (sig !== expectedSig || !data.shop || !data.email || typeof data.exp !== 'number') {
    return null;
  }
  if (data.exp < Date.now()) {
    return null;
  }
  const shopNorm = shopFromQuery.trim().toLowerCase();
  if (data.shop !== shopNorm) {
    return null;
  }
  return { shop: data.shop, email: data.email };
}

function verifyOAuthHmac(query) {
  const { hmac, signature: _sig, ...rest } = query;
  if (!hmac || !process.env.SHOPIFY_API_SECRET) {
    return false;
  }

  const message = Object.keys(rest)
    .sort()
    .map(key => `${key}=${Array.isArray(rest[key]) ? rest[key].join(',') : rest[key]}`)
    .join('&');

  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

/**
 * Get email from email session (cookie or Authorization). Returns null if missing/invalid.
 */
function getEmailFromSession(req) {
  const token =
    req.cookies?.[EMAIL_SESSION_COOKIE] ||
    req.headers?.authorization?.replace(/^Bearer\s+/i, '').trim();
  if (!token || !process.env.JWT_SECRET) {
    return null;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.ripxtype === 'email_session' && decoded.email) {
      return (decoded.email || '').trim().toLowerCase();
    }
  } catch (_) {
    /* invalid or expired */
  }
  return null;
}

/**
 * GET /api/auth/oauth-redirect-uri
 * Returns the redirect_uri and base URL used for OAuth. Use this to verify they match
 * Shopify Partner Dashboard → App setup → Application URL and Allowed redirection URL(s).
 * If they don't match, set RIPX_OAUTH_REDIRECT_BASE to your Application URL (same host as Partner Dashboard).
 */
router.get('/oauth-redirect-uri', (req, res) => {
  const strictBase =
    process.env.RIPX_OAUTH_REDIRECT_BASE && typeof process.env.RIPX_OAUTH_REDIRECT_BASE === 'string'
      ? validateCallbackBase(process.env.RIPX_OAUTH_REDIRECT_BASE.trim().replace(/\/+$/, ''))
      : null;
  const base = strictBase || getOAuthRedirectBase(req);
  const redirectUri = `${base}/api/auth/callback`;
  const isDynamicTunnel =
    /\.trycloudflare\.com$/i.test(base) ||
    /\.ngrok-free\.app$/i.test(base) ||
    /\.ngrok\.(io|app)$/i.test(base);
  res.json({
    redirectUri,
    base,
    source: strictBase ? 'RIPX_OAUTH_REDIRECT_BASE' : 'request_or_app_url',
    isDynamicTunnel,
    mismatchWarning: isDynamicTunnel
      ? 'This base is a dynamic tunnel URL that changes when the tunnel restarts. Shopify requires redirect_uri and Application URL to have the same host. Set RIPX_OAUTH_REDIRECT_BASE to a STABLE domain (e.g. from shopify.app.toml application_url) and use that same URL in Partner Dashboard. See docs/OAUTH_FIX.md.'
      : null,
    partnerDashboard: {
      applicationUrl: base,
      allowedRedirectionUrl: redirectUri,
      note: 'In Partner Dashboard → Your app → App setup → URLs, set Application URL and add the allowed redirection URL exactly as above (same host).',
    },
    clientIdNote:
      process.env.SHOPIFY_API_KEY &&
      'Partner Dashboard Client ID must match SHOPIFY_API_KEY. If the grant URL shows a different client_id, the link was generated for another app or env.',
    hint: 'Set Application URL and Allowed redirection URL(s) in Shopify Partner Dashboard to this base and redirect_uri. Use a stable domain in RIPX_OAUTH_REDIRECT_BASE (match shopify.app.toml application_url).',
  });
});

/**
 * GET /api/auth/start?shop=...
 * Start Shopify OAuth when caller sends Authorization: Bearer <email_session_jwt>.
 * Returns { redirectUrl } so frontend can navigate (cookie may not be set yet).
 * Uses only req.query.shop (ignores X-Shopify-Shop-Domain and any other source).
 */
router.get(
  '/start',
  asyncHandler((req, res) => {
    const rawShop = req.query.shop;
    const shop = typeof rawShop === 'string' ? rawShop.trim().toLowerCase() : '';
    const callbackBase =
      typeof req.query.callback_base === 'string' ? req.query.callback_base.trim() : undefined;
    if (!shop || !isValidShopDomain(shop)) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }
    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_SCOPES || !process.env.APP_URL) {
      return res.status(500).json({ success: false, error: 'OAuth configuration missing' });
    }
    const email = getEmailFromSession(req);
    if (!email) {
      return res.status(401).json({
        success: false,
        error: 'Sign in to connect a store',
        code: 'SIGN_IN_REQUIRED',
      });
    }
    const state = generateState(shop, email);
    const oauthUrl = getAuthRedirectUrl(shop, state, callbackBase, req);
    res.cookie('shopify_oauth_state', state, OAUTH_COOKIE_OPTIONS);
    res.cookie('shopify_oauth_shop', shop, OAUTH_COOKIE_OPTIONS);
    return res.json({ success: true, redirectUrl: oauthUrl });
  })
);

/**
 * GET /api/auth/install-link?shop=...&callback_base=...
 * Returns a signed URL that when opened (e.g. in incognito) redirects to Shopify OAuth for that shop only.
 * The returned URL uses the same base as redirect_uri (RIPX_OAUTH_REDIRECT_BASE when set) so cookies set on /auth/install
 * are on the same domain as the callback and the flow completes correctly.
 */
router.get(
  '/install-link',
  asyncHandler((req, res) => {
    const rawShop = req.query.shop;
    const shop = typeof rawShop === 'string' ? rawShop.trim().toLowerCase() : '';
    if (!shop || !isValidShopDomain(shop)) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }
    const email = getEmailFromSession(req);
    if (!email) {
      return res
        .status(401)
        .json({ success: false, error: 'Sign in to connect a store', code: 'SIGN_IN_REQUIRED' });
    }
    const token = createInstallToken(shop, email);
    if (!token) {
      return res.status(500).json({ success: false, error: 'Could not create install link' });
    }
    // Use same base as redirect_uri so install and callback share domain (cookies then work)
    const strictBase =
      process.env.RIPX_OAUTH_REDIRECT_BASE &&
      typeof process.env.RIPX_OAUTH_REDIRECT_BASE === 'string'
        ? validateCallbackBase(process.env.RIPX_OAUTH_REDIRECT_BASE.trim().replace(/\/+$/, ''))
        : null;
    const callbackBaseRaw =
      typeof req.query.callback_base === 'string' ? req.query.callback_base.trim() : '';
    const validatedBase = callbackBaseRaw ? validateCallbackBase(callbackBaseRaw) : null;
    const baseUrl = strictBase || validatedBase || getOAuthRedirectBase(req);
    let installUrl = `${baseUrl}/api/auth/install?shop=${encodeURIComponent(shop)}&t=${encodeURIComponent(token)}&confirm=1`;
    if (validatedBase && validatedBase !== baseUrl) {
      installUrl += `&callback_base=${encodeURIComponent(validatedBase)}`;
    }
    return res.json({
      success: true,
      url: installUrl,
      expires_in_seconds: Math.floor(INSTALL_TOKEN_EXPIRY_MS / 1000),
    });
  })
);

/**
 * GET /api/auth/install?shop=...&t=...&callback_base=...&confirm=1
 * No auth. Validates signed token t. If confirm=1, shows a short instruction page so the user
 * opens in incognito and logs into the correct store (avoids "wrong store" callback). Otherwise
 * sets cookies and redirects to Shopify OAuth for that shop.
 */
router.get(
  '/install',
  asyncHandler((req, res) => {
    const rawShop = req.query.shop;
    const shop = typeof rawShop === 'string' ? rawShop.trim().toLowerCase() : '';
    const token = typeof req.query.t === 'string' ? req.query.t.trim() : '';
    const showConfirm = req.query.confirm === '1';
    const callbackBaseRaw =
      typeof req.query.callback_base === 'string' ? req.query.callback_base.trim() : '';
    const callbackBase = callbackBaseRaw ? validateCallbackBase(callbackBaseRaw) : null;
    if (!shop || !isValidShopDomain(shop) || !token) {
      const baseUrl = getOAuthRedirectBase(req);
      return res.redirect(
        `${baseUrl}/domains?reason=${encodeURIComponent(CONNECT_REASON.OAUTH_EXPIRED)}`
      );
    }
    const parsed = verifyInstallToken(token, shop);
    if (!parsed) {
      const baseUrl = getOAuthRedirectBase(req);
      return res.redirect(
        `${baseUrl}/domains?reason=${encodeURIComponent(CONNECT_REASON.OAUTH_EXPIRED)}`
      );
    }
    if (showConfirm) {
      const continuePath = `/api/auth/install?shop=${encodeURIComponent(parsed.shop)}&t=${encodeURIComponent(token)}`;
      const continueQuery = callbackBase
        ? `&callback_base=${encodeURIComponent(callbackBase)}`
        : '';
      const continueUrlRaw = continuePath + continueQuery;
      const continueUrlEsc = continueUrlRaw
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const shopEsc = parsed.shop
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const storeEsc = shopEsc;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const storeAdminUrl = `https://${parsed.shop}/admin`;
      const storeAdminEsc = storeAdminUrl
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connect ${shopEsc} to RipX</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:24px;line-height:1.55;color:#1f2937}
    h1{font-size:1.25rem;margin:0 0 12px}
    p{margin:0 0 12px}
    .store-name{background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;padding:10px 14px;margin:12px 0;font-weight:600;font-size:1rem;color:#1e40af}
    .recommended{background:#ecfdf5;border:1px solid #10b981;border-radius:8px;padding:14px 16px;margin:16px 0;font-size:0.95rem;color:#065f46}
    .recommended strong{display:block;margin-bottom:8px;color:#047857}
    .recommended ol{margin:8px 0 0;padding-left:1.4em}
    .recommended li{margin:6px 0}
    .recommended a.store-admin{font-weight:600;color:#047857;word-break:break-all}
    .tip{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 16px;margin:20px 0;font-size:0.9rem;color:#166534}
    .tip strong{display:block;margin-bottom:6px}
    .tip ul,.tip ol{margin:8px 0 0;padding-left:1.2em}
    .tip li{margin:4px 0}
    a.btn{display:inline-block;margin-top:8px;padding:12px 24px;background:#008060;color:#fff!important;text-decoration:none;border-radius:6px;font-weight:600;cursor:pointer}
    a.btn:hover{background:#006e52}
    .muted{font-size:0.85rem;color:#6b7280;margin-top:20px}
  </style>
</head>
<body role="main">
  <h1>Connect this store to RipX</h1>
  <p>Store you are adding:</p>
  <p class="store-name" aria-label="Store to add">${shopEsc}</p>
  <div class="recommended" role="alert">
    <strong>Recommended if you have multiple Shopify stores</strong>
    <p style="margin:0 0 8px">Shopify may otherwise approve the wrong store. Do this in the same incognito window:</p>
    <ol>
      <li>Open <a href="${storeAdminEsc}" class="store-admin" target="_blank" rel="noopener">${storeEsc} admin</a> in a new tab and log in. Wait until you see the admin for <strong>${shopEsc}</strong>.</li>
      <li>Return to this tab and click <strong>Continue to Shopify</strong> below. The approval will then be for ${shopEsc}.</li>
    </ol>
  </div>
  <p>Or click below to go to Shopify now (if you have only one store or already logged into ${shopEsc} in this window):</p>
  <div class="tip" role="alert">
    <strong>If you go straight to Shopify</strong>
    <ul>
      <li>When Shopify shows a <strong>list of stores</strong>, choose <strong>${shopEsc}</strong>. Before clicking Allow, check the address bar — it must show ${shopEsc}.</li>
    </ul>
  </div>
  <a href="${continueUrlEsc}" class="btn">Continue to Shopify</a>
  <p class="muted">This link expires in 10 minutes.</p>
</body>
</html>`;
      res.send(html);
      return;
    }
    const state = generateState(parsed.shop, parsed.email);
    res.cookie('shopify_oauth_state', state, OAUTH_COOKIE_OPTIONS);
    res.cookie('shopify_oauth_shop', parsed.shop, OAUTH_COOKIE_OPTIONS);
    const oauthUrl = getAuthRedirectUrl(parsed.shop, state, callbackBase, req);
    return res.redirect(oauthUrl);
  })
);

router.get(
  '/',
  asyncHandler((req, res) => {
    const { shop, callback_base: callbackBase } = req.query;

    if (!shop || !isValidShopDomain(shop)) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }

    if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_SCOPES || !process.env.APP_URL) {
      logger.error('Missing required Shopify OAuth environment variables', {
        hasApiKey: !!process.env.SHOPIFY_API_KEY,
        hasScopes: !!process.env.SHOPIFY_SCOPES,
        hasAppUrl: !!process.env.APP_URL,
      });
      return res.status(500).json({ success: false, error: 'OAuth configuration missing' });
    }

    // Require email session: domain must be linked to a registered user
    const email = getEmailFromSession(req);
    if (!email) {
      const baseUrl = getOAuthRedirectBase(req);
      const redirectUrl = `${baseUrl}/connect?shop=${encodeURIComponent(shop.trim().toLowerCase())}&reason=${encodeURIComponent(CONNECT_REASON.SIGN_IN_TO_CONNECT)}`;
      return res.redirect(redirectUrl);
    }

    // Signed state including email so callback can link tenant to user
    const state = generateState(shop, email);

    res.cookie('shopify_oauth_state', state, OAUTH_COOKIE_OPTIONS);
    res.cookie('shopify_oauth_shop', shop, OAUTH_COOKIE_OPTIONS);

    const oauthUrl = getAuthRedirectUrl(shop, state, callbackBase, req);
    // User must click: browsers block iframe from setting window.top.location without a user gesture
    const hrefSafe = oauthUrl
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const frameAncestors = `https://${shop} https://admin.shopify.com`;
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        `connect-src 'self' ${appUrl} https://*.myshopify.com https://*.shopify.com`,
        "base-uri 'self'",
        "form-action 'self'",
        `frame-ancestors ${frameAncestors}`,
        "object-src 'none'",
      ].join('; ')
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(
      `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to Shopify</title><style>body{font-family:system-ui,sans-serif;max-width:360px;margin:48px auto;padding:24px;text-align:center}h1{font-size:1.25rem;margin:0 0 8px}a{display:inline-block;margin-top:16px;padding:12px 24px;background:#008060;color:#fff;text-decoration:none;border-radius:6px;font-weight:600}a:hover{background:#006e52}p{color:#6d7175;margin:0}</style></head><body><h1>Install RipX</h1><p>Click the button below to connect this store to RipX. You’ll be taken to Shopify to approve access.</p><a href="${hrefSafe}" target="_top">Connect to Shopify</a></body></html>`
    );
  })
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { shop, code, state } = req.query;
    const stateCookie = req.cookies.shopify_oauth_state;
    const shopCookie = req.cookies.shopify_oauth_shop;

    if (!shop || !code || !state) {
      return res.status(400).json({ success: false, error: 'Missing OAuth parameters' });
    }

    if (!isValidShopDomain(shop)) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }

    const normalizedShop = shop.trim().toLowerCase();
    let parsed = verifyAndParseState(state, shop);
    if (!parsed && typeof state === 'string' && state.includes(' ')) {
      const stateFixed = state.replace(/ /g, '+');
      parsed = verifyAndParseState(stateFixed, shop);
    }
    const shopCookieNorm = (shopCookie || '').trim().toLowerCase();
    const cookieOk =
      stateCookie &&
      shopCookie &&
      normalizedShop === shopCookieNorm &&
      (state === stateCookie ||
        (typeof state === 'string' && state.replace(/ /g, '+') === stateCookie));
    if (!verifyOAuthHmac(req.query)) {
      return res.status(401).json({ success: false, error: 'Invalid OAuth signature' });
    }

    // When state/cookie are missing or callback shop differs from cookie: always accept the callback
    // for the shop Shopify returned (HMAC is already verified). Add that store so we never block the user.
    // If they had requested a different store (cookie), capture it so we can pass requested_shop in the redirect.
    let requestedShopFromCookie = null;
    if (!parsed && !cookieOk) {
      if (shopCookie && shopCookieNorm && normalizedShop !== shopCookieNorm) {
        requestedShopFromCookie = shopCookieNorm;
        logger.info(
          'OAuth callback: connecting shop from callback (differs from requested); will pass requested_shop for UI',
          {
            callbackShop: normalizedShop,
            requestedShop: shopCookieNorm,
          }
        );
        auditLogService.logAuthAction(req, {
          action: 'shopify_connect_callback_differed',
          actorId: getEmailFromStatePayload(state) || 'anonymous',
          entityId: null,
          changes: { connectedShop: normalizedShop, requestedShop: shopCookieNorm },
        });
      } else {
        logger.info(
          'OAuth callback: no state/cookie match (e.g. grant flow); accepting callback for shop',
          {
            shop: normalizedShop,
          }
        );
      }
    }

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('OAuth access token exchange failed', {
        status: tokenResponse.status,
        error: errorText,
      });
      const baseUrl = getOAuthRedirectBase(req);
      if (tokenResponse.status === 400) {
        return res.redirect(
          `${baseUrl}/connect?shop=${encodeURIComponent(normalizedShop)}&reason=${encodeURIComponent(CONNECT_REASON.OAUTH_EXPIRED)}`
        );
      }
      return res.status(500).json({ success: false, error: 'Token exchange failed' });
    }

    const tokenData = await tokenResponse.json();

    await upsertShopSession({
      shopDomain: normalizedShop,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
    });

    await upsertShopifyTenant(normalizedShop);

    const tenant = await getTenantByDomain(normalizedShop);
    const stateEmail =
      (parsed && parsed.email) || (cookieOk ? getEmailFromStatePayload(state) : '');
    let linked = false;
    let storeLinkedToAnother = false;

    if (stateEmail && tenant && emailVerificationService.isValidEmail(stateEmail)) {
      const user = await userModel.getByEmail(stateEmail);
      if (user && isUserStatusAllowedForSession(user.status)) {
        const { ensureAccountForUser } = require('../models/standaloneUser');
        const { accountId } = (await ensureAccountForUser(user.id)) || {};
        if (accountId) {
          // Only allow: (a) linking when account_id is null, or (b) re-auth when tenant.account_id equals current user's account
          if (tenant.account_id !== null && tenant.account_id !== accountId) {
            storeLinkedToAnother = true;
          } else {
            const didLink = await withTransaction(async client => {
              const row = await client.query(
                'SELECT id, account_id FROM tenants WHERE domain = $1 FOR UPDATE',
                [normalizedShop]
              );
              const t = row.rows[0];
              if (!t) {
                return false;
              }
              if (t.account_id !== null && t.account_id !== accountId) {
                return false;
              }
              if (t.account_id) {
                const role = t.account_id === accountId ? 'owner' : 'member';
                await client.query(
                  `INSERT INTO user_domain_access (user_id, tenant_id, role) VALUES ($1, $2, $3)
                   ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = $3, updated_at = NOW()`,
                  [user.id, t.id, role]
                );
              } else {
                await client.query(
                  'UPDATE tenants SET account_id = $1, updated_at = NOW() WHERE id = $2',
                  [accountId, t.id]
                );
                await client.query(
                  `INSERT INTO user_domain_access (user_id, tenant_id, role) VALUES ($1, $2, 'owner')
                   ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = 'owner', updated_at = NOW()`,
                  [user.id, t.id]
                );
              }
              return true;
            });
            if (didLink) {
              linked = true;
              const updatedTenant = await getTenantByDomain(normalizedShop);
              auditLogService.logAuthAction(req, {
                action: 'shopify_connect_linked',
                actorId: stateEmail,
                entityId: updatedTenant?.id,
                changes: { domain: normalizedShop, accountId },
              });
            }
          }
        }
      }
    }

    const { maxAge: _m, ...clearOpts } = OAUTH_COOKIE_OPTIONS;
    res.clearCookie('shopify_oauth_state', clearOpts);
    res.clearCookie('shopify_oauth_shop', clearOpts);

    const baseUrl = getOAuthRedirectBase(req);
    const appendRequested = url =>
      requestedShopFromCookie
        ? `${url}${url.includes('?') ? '&' : '?'}requested_shop=${encodeURIComponent(requestedShopFromCookie)}`
        : url;
    if (storeLinkedToAnother) {
      auditLogService.logAuthAction(req, {
        action: 'shopify_connect_rejected_linked_to_another',
        actorId: stateEmail || 'unknown',
        entityId: tenant?.id,
        changes: { domain: normalizedShop },
      });
      res.redirect(
        appendRequested(
          `${baseUrl}/connect?shop=${encodeURIComponent(normalizedShop)}&reason=${encodeURIComponent(CONNECT_REASON.STORE_LINKED_TO_ANOTHER)}`
        )
      );
    } else if (linked) {
      res.redirect(
        appendRequested(
          `${baseUrl}/connect/oauth-success?shop=${encodeURIComponent(normalizedShop)}`
        )
      );
    } else if (requestedShopFromCookie) {
      // Wrong store was approved: send user to My domains so they can use "Copy link for incognito" for the store they wanted (no login page).
      res.redirect(
        `${baseUrl}/domains?reason=${encodeURIComponent(CONNECT_REASON.OAUTH_WRONG_STORE)}&shop=${encodeURIComponent(requestedShopFromCookie)}&connected_shop=${encodeURIComponent(normalizedShop)}`
      );
    } else {
      res.redirect(
        `${baseUrl}/connect?shop=${encodeURIComponent(normalizedShop)}&reason=${encodeURIComponent(CONNECT_REASON.SIGN_IN_TO_LINK)}`
      );
    }
  })
);

/**
 * POST /api/auth/register
 * Register with email. Sends confirmation link; after confirm, admin must accept before login.
 */
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const email = req.body?.email;
    if (!emailVerificationService.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    const existing = await userModel.getByEmail(email);
    if (existing && existing.status === 'accepted') {
      return res.status(400).json({ success: false, error: 'Account already exists. Use login.' });
    }
    if (existing && existing.status === 'rejected') {
      return res
        .status(400)
        .json({ success: false, error: 'Registration was rejected. Contact support.' });
    }
    await standaloneUser.create(email);
    const created = await emailVerificationService.createToken(email, 'confirm_registration', 60);
    if (!created) {
      return res.status(500).json({ success: false, error: 'Could not create confirmation link' });
    }
    const baseUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const link = baseUrl + '/api/auth/confirm-email?token=' + encodeURIComponent(created.token);
    const emailSent = await emailVerificationService.sendVerificationEmail(
      email,
      link,
      'confirm_registration'
    );
    if (!emailSent) {
      return res.status(503).json({
        success: false,
        error:
          "We couldn't send the confirmation email. Please try again later or contact support.",
      });
    }
    auditLogService.logAuthAction(req, {
      action: 'register',
      actorId: `${(email || '').substring(0, 3)}***`,
    });
    res.json({
      success: true,
      message:
        'Check your email to confirm your address. After that, an administrator must approve your account before you can sign in.',
    });
  })
);

/**
 * GET /api/auth/confirm-email?token=...
 * Confirm email from registration. Sets email_verified_at; user still needs admin acceptance.
 * Redirects to frontend /auth/confirm-result with status=success|error for a proper UI.
 */
router.get(
  '/confirm-email',
  asyncHandler(async (req, res) => {
    const token = req.query?.token;
    const frontendUrl = getOAuthRedirectBase(req);
    const confirmResultPath = '/auth/confirm-result';

    const redirectToResult = (status, message) => {
      if (frontendUrl) {
        const params = new URLSearchParams({ status });
        if (message) {
          params.set('message', message);
        }
        return res.redirect(302, `${frontendUrl}${confirmResultPath}?${params.toString()}`);
      }
      return res.status(status === 'success' ? 200 : 400).json({
        success: status === 'success',
        message:
          message || (status === 'success' ? 'Email confirmed.' : 'Invalid or expired link.'),
      });
    };

    if (!token) {
      return redirectToResult('error', 'Token is required');
    }
    const payload = await emailVerificationService.consumeToken(token);
    if (!payload || payload.purpose !== 'confirm_registration') {
      return redirectToResult('error', 'Invalid or expired confirmation link');
    }
    await standaloneUser.setEmailVerified(payload.email);
    auditLogService.logAuthAction(req, {
      action: 'confirm_email',
      actorId: `${(payload.email || '').substring(0, 3)}***`,
    });
    return redirectToResult('success', 'Email confirmed. Your account is pending approval.');
  })
);

/**
 * POST /api/auth/send-login-link
 * Accepted users (including bootstrap super admin): 6-digit OTP (codes only).
 * Other admins in RIPX_ADMIN_EMAIL (not yet in DB as accepted): magic link.
 */
router.post(
  '/send-login-link',
  asyncHandler(async (req, res) => {
    const email = req.body?.email;
    const rememberMe = req.body?.remember_me === true || req.body?.remember_me === 'true';
    if (!emailVerificationService.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    const normalizedEmail = (email || '').trim().toLowerCase();
    const user = await userModel.getByEmail(normalizedEmail);

    if (user?.status === 'accepted') {
      // Accepted user (including bootstrap super admin): always use 6-digit OTP (codes only)
      const otpResult = await loginOtpService.createCode(normalizedEmail);
      if (otpResult?.rateLimited) {
        return res.status(429).json({
          success: false,
          error: `Too many code requests. Try again in ${otpResult.retryAfterMinutes} minutes.`,
          retryAfterMinutes: otpResult.retryAfterMinutes,
        });
      }
      if (!otpResult?.code) {
        return res.status(500).json({ success: false, error: 'Could not create login code' });
      }
      const stub = process.env.RIPX_EMAIL_VERIFICATION_STUB === 'true';
      if (!stub && emailService.isConfigured()) {
        const sent = await emailService.sendLoginCode(normalizedEmail, otpResult.code);
        if (!sent) {
          return res.status(503).json({
            success: false,
            error:
              "We couldn't send the login code email. Please try again later or contact support if the problem continues.",
          });
        }
      } else {
        logger.info('Login OTP (stub)', {
          email: normalizedEmail?.substring(0, 5) + '…',
          code: otpResult.code,
        });
      }
      auditLogService.logAuthAction(req, { action: 'login_otp_sent' });
      return res.json({
        success: true,
        method: 'otp',
        message: 'Check your email for a 6-digit code. It expires in 1 minute.',
        expiresInSeconds: 60,
      });
    }

    if (user?.status === 'rejected') {
      return res
        .status(403)
        .json({ success: false, error: 'Your registration was rejected. Contact support.' });
    }
    if (user?.status === 'pending') {
      return res.status(403).json({
        success: false,
        error:
          'Your account is pending approval. You will receive an email when an administrator accepts your registration.',
      });
    }
    if (!user && isAdminEmail(normalizedEmail)) {
      // In RIPX_ADMIN_EMAIL but no DB row yet: magic link
      const created = await emailVerificationService.createToken(normalizedEmail, 'login');
      if (!created) {
        return res
          .status(500)
          .json({ success: false, error: 'Could not create verification link' });
      }
      const frontendUrl = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(
        /\/$/,
        ''
      );
      let link = frontendUrl + '/auth/callback?token=' + encodeURIComponent(created.token);
      if (rememberMe) {
        link += '&remember_me=1';
      }
      const linkSent = await emailVerificationService.sendVerificationEmail(
        normalizedEmail,
        link,
        'login'
      );
      if (linkSent === false) {
        return res.status(503).json({
          success: false,
          error:
            "We couldn't send the login link email. Please try again later or contact support.",
        });
      }
      auditLogService.logAuthAction(req, { action: 'login_link_sent' });
      return res.json({
        success: true,
        message: 'If an account exists for this email, you will receive a login link shortly.',
      });
    }

    if (!user) {
      return res.status(400).json({ success: false, error: 'No account found. Register first.' });
    }

    return res
      .status(403)
      .json({ success: false, error: 'Your account is not approved. Contact support.' });
  })
);

/**
 * POST /api/auth/verify-login-code
 * Body: { email, code }. Verify 6-digit OTP and issue session JWT for accepted users.
 */
router.post(
  '/verify-login-code',
  asyncHandler(async (req, res) => {
    const email = req.body?.email;
    const code = req.body?.code;
    if (!emailVerificationService.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }
    const normalizedEmail = (email || '').trim().toLowerCase();
    const payload = await loginOtpService.consumeCode(normalizedEmail, code);
    if (!payload) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid or expired code. Request a new code.' });
    }
    const isAdmin = isAdminEmail(normalizedEmail);
    if (!isAdmin) {
      const user = await userModel.getByEmail(normalizedEmail);
      if (!user) {
        auditLogService.logAuthAction(req, {
          action: 'login_rejected',
          actorId: normalizedEmail,
          changes: { reason: 'account_not_found' },
        });
        return res
          .status(403)
          .json({ success: false, error: 'Account not found. Contact support.' });
      }
      if (isUserStatusBlocked(user.status)) {
        auditLogService.logAuthAction(req, {
          action: 'login_rejected',
          actorId: normalizedEmail,
          changes: { reason: 'account_locked_or_suspended', status: user.status },
        });
        return res.status(403).json({
          success: false,
          error: 'Account is locked or suspended. Contact support.',
        });
      }
      if (!isUserStatusAllowedForSession(user.status)) {
        auditLogService.logAuthAction(req, {
          action: 'login_rejected',
          actorId: normalizedEmail,
          changes: { reason: 'account_not_approved', status: user.status },
        });
        return res.status(403).json({
          success: false,
          error: 'Your account is not yet approved. Contact an administrator.',
        });
      }
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET missing for email session');
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }
    const rememberMe = req.body?.remember_me === true || req.body?.remember_me === 'true';
    const expiresIn = rememberMe
      ? EMAIL_SESSION_EXPIRY_DAYS + 'd'
      : EMAIL_SESSION_EXPIRY_HOURS + 'h';
    const jwtPayload = {
      ripxtype: 'email_session',
      email: payload.email,
      purpose: 'login',
    };
    const sessionToken = jwt.sign(jwtPayload, secret, {
      algorithm: 'HS256',
      expiresIn,
    });
    auditLogService.logAuthAction(req, { action: 'login_success', actorId: payload.email });
    const maxAgeMs = rememberMe
      ? EMAIL_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      : EMAIL_SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
    res.cookie(EMAIL_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: maxAgeMs,
      path: '/',
    });
    res.json({
      success: true,
      token: sessionToken,
      expiresIn,
      email: payload.email,
    });
  })
);

/**
 * GET /api/auth/verify-email?token=...
 * Consume one-time token and issue 30-day session JWT.
 * Response: JSON with token (use as Bearer for API) or redirect when redirect_uri provided.
 */
router.get(
  '/verify-email',
  asyncHandler(async (req, res) => {
    const token = req.query?.token;
    const redirectUri = req.query?.redirect_uri;
    const rememberMe = req.query?.remember_me === '1' || req.query?.remember_me === 'true';

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const payload = await emailVerificationService.consumeToken(token);
    if (!payload) {
      return res.status(400).json({ success: false, error: 'Invalid or expired link' });
    }

    const normalizedEmail = (payload.email || '').trim().toLowerCase();
    const isAdmin = isAdminEmail(normalizedEmail);
    if (!isAdmin) {
      const user = await userModel.getByEmail(normalizedEmail);
      if (!user) {
        auditLogService.logAuthAction(req, {
          action: 'login_rejected',
          actorId: normalizedEmail,
          changes: { reason: 'account_not_found' },
        });
        return res
          .status(403)
          .json({ success: false, error: 'Account not found. Contact support.' });
      }
      if (isUserStatusBlocked(user.status)) {
        auditLogService.logAuthAction(req, {
          action: 'login_rejected',
          actorId: normalizedEmail,
          changes: { reason: 'account_locked_or_suspended', status: user.status },
        });
        return res.status(403).json({
          success: false,
          error: 'Account is locked or suspended. Contact support.',
        });
      }
      if (!isUserStatusAllowedForSession(user.status)) {
        auditLogService.logAuthAction(req, {
          action: 'login_rejected',
          actorId: normalizedEmail,
          changes: { reason: 'account_not_approved', status: user.status },
        });
        return res.status(403).json({
          success: false,
          error: 'Your account is not yet approved. Contact an administrator.',
        });
      }
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET missing for email session');
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const expiresIn = rememberMe
      ? EMAIL_SESSION_EXPIRY_DAYS + 'd'
      : EMAIL_SESSION_EXPIRY_HOURS + 'h';
    const jwtPayload = {
      ripxtype: 'email_session',
      email: normalizedEmail,
      purpose: payload.purpose,
    };

    const sessionToken = jwt.sign(jwtPayload, secret, {
      algorithm: 'HS256',
      expiresIn,
    });

    const maxAgeMs = rememberMe
      ? EMAIL_SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      : EMAIL_SESSION_EXPIRY_HOURS * 60 * 60 * 1000;
    res.cookie(EMAIL_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: maxAgeMs,
      path: '/',
    });

    if (redirectUri) {
      const url = new URL(redirectUri);
      url.searchParams.set('token', sessionToken);
      return res.redirect(url.toString());
    }

    auditLogService.logAuthAction(req, { action: 'login_success', actorId: normalizedEmail });
    res.json({
      success: true,
      token: sessionToken,
      expiresIn,
      email: normalizedEmail,
    });
  })
);

const LOGOUT_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
};

function clearEmailSessionCookie(res) {
  res.clearCookie(EMAIL_SESSION_COOKIE, LOGOUT_COOKIE_OPTIONS);
}

/**
 * POST /api/auth/logout
 * Clear email session cookie so OAuth start and other cookie-based flows don't use a stale session.
 */
router.post(
  '/logout',
  asyncHandler((req, res) => {
    clearEmailSessionCookie(res);
    res.status(200).json({ success: true });
  })
);

/**
 * GET /api/auth/logout
 * Clear cookie and redirect to Connect (e.g. from "Log out" link in email).
 */
router.get(
  '/logout',
  asyncHandler((req, res) => {
    clearEmailSessionCookie(res);
    const baseUrl = getOAuthRedirectBase(req);
    res.redirect(`${baseUrl}/connect`);
  })
);

/**
 * POST /api/auth/connect-token
 * Exchange a one-time connect token (from admin connect-link) for apiKey and domain.
 * Public; token is single-use and short-lived.
 */
router.post(
  '/connect-token',
  asyncHandler(async (req, res) => {
    const token = (req.body?.connect_token || req.query?.connect_token || '').trim();
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing connect token' });
    }
    const kvKey = `connect_${token}`;
    const result = await query('SELECT value FROM key_value_store WHERE key = $1', [kvKey]);
    const row = result.rows[0];
    if (!row || !row.value) {
      return res.status(400).json({ success: false, error: 'Token not found or already used' });
    }
    let payload;
    try {
      payload = JSON.parse(row.value);
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid token data' });
    }
    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      await query('DELETE FROM key_value_store WHERE key = $1', [kvKey]);
      return res.status(400).json({ success: false, error: 'Token expired' });
    }
    await query('DELETE FROM key_value_store WHERE key = $1', [kvKey]);
    res.json({
      success: true,
      apiKey: payload.apiKey,
      domain: payload.domain,
    });
  })
);

module.exports = router;
