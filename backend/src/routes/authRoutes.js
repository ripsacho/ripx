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
const { upsertShopifyTenant } = require('../models/tenant');
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
const { query } = require('../utils/database');

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

function generateState(shop) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = nonce + STATE_SEP + shop;
  const sig = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET || process.env.JWT_SECRET || '')
    .update(payload)
    .digest('hex');
  const payloadB64 = Buffer.from(payload, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return payloadB64 + '.' + sig;
}

function verifyState(state, shop) {
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
  const idx = payload.indexOf(STATE_SEP);
  if (idx === -1) {
    return null;
  }
  const shopFromState = payload.slice(idx + 1);
  if (shopFromState !== shop) {
    return null;
  }
  return shopFromState;
}

function getAuthRedirectUrl(shop, state) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = process.env.SHOPIFY_SCOPES || '';
  const redirectUri = `${process.env.APP_URL}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
  });

  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
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

router.get(
  '/',
  asyncHandler((req, res) => {
    const { shop } = req.query;

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

    // Signed state (no cookies): works when callback is opened in top window and cookies from iframe aren't sent
    const state = generateState(shop);

    res.cookie('shopify_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
    });
    res.cookie('shopify_oauth_shop', shop, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
    });

    const oauthUrl = getAuthRedirectUrl(shop, state);
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

    // Prefer signed state (works when cookies from iframe aren't sent on redirect)
    const verifiedShop = verifyState(state, shop);
    const cookieOk = stateCookie && shopCookie && shop === shopCookie && state === stateCookie;
    if (!verifiedShop && !cookieOk) {
      return res.status(400).json({ success: false, error: 'Invalid OAuth state' });
    }

    if (!verifyOAuthHmac(req.query)) {
      return res.status(401).json({ success: false, error: 'Invalid OAuth signature' });
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
      return res.status(500).json({ success: false, error: 'Token exchange failed' });
    }

    const tokenData = await tokenResponse.json();

    await upsertShopSession({
      shopDomain: shop,
      accessToken: tokenData.access_token,
      scope: tokenData.scope,
    });

    await upsertShopifyTenant(shop);

    res.clearCookie('shopify_oauth_state');
    res.clearCookie('shopify_oauth_shop');

    const redirectTo = process.env.APP_URL || '/';
    res.redirect(`${redirectTo}/?shop=${shop}`);
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
    await emailVerificationService.sendVerificationEmail(email, link, 'confirm_registration');
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
    const frontendUrl = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '');
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
        await emailService.sendLoginCode(normalizedEmail, otpResult.code);
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
      await emailVerificationService.sendVerificationEmail(normalizedEmail, link, 'login');
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
