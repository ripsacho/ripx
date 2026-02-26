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
const logger = require('../utils/logger');

const router = express.Router();

const EMAIL_SESSION_EXPIRY_DAYS = 30;

function isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
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

    const state = generateState();
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('shopify_oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 10 * 60 * 1000,
    });

    res.cookie('shopify_oauth_shop', shop, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 10 * 60 * 1000,
    });

    const oauthUrl = getAuthRedirectUrl(shop, state);
    // Embedded app: redirect in top window so OAuth (accounts.shopify.com) is not loaded in iframe (refused to connect)
    const scriptEnd = '</scr' + 'ipt>';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(
      `<!DOCTYPE html><html><head><title>Redirecting to Shopify…</title></head><body><p>Redirecting to Shopify…</p><script>var u=${JSON.stringify(oauthUrl)};if(window.self!==window.top){window.top.location.href=u}else{window.location.href=u}${scriptEnd}</body></html>`
    );
  })
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { shop, code, state } = req.query;
    const stateCookie = req.cookies.shopify_oauth_state;
    const shopCookie = req.cookies.shopify_oauth_shop;

    if (!shop || !code || !state || !stateCookie || !shopCookie) {
      return res.status(400).json({ success: false, error: 'Missing OAuth parameters' });
    }

    if (!isValidShopDomain(shop) || shop !== shopCookie) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }

    if (state !== stateCookie) {
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
 * POST /api/auth/send-login-link
 * Request a magic-link email for passwordless login (standalone / re-verify).
 * Body: { email }. Rate-limit in production (e.g. per email/IP).
 */
router.post(
  '/send-login-link',
  asyncHandler(async (req, res) => {
    const email = req.body?.email;
    if (!emailVerificationService.isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }

    const created = await emailVerificationService.createToken(email, 'login');
    if (!created) {
      return res.status(500).json({ success: false, error: 'Could not create verification link' });
    }

    const baseUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const link = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(created.token)}`;

    await emailVerificationService.sendVerificationEmail(email, link, 'login');

    res.json({
      success: true,
      message: 'If an account exists for this email, you will receive a login link shortly.',
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

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token is required' });
    }

    const payload = await emailVerificationService.consumeToken(token);
    if (!payload) {
      return res.status(400).json({ success: false, error: 'Invalid or expired link' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET missing for email session');
      return res.status(500).json({ success: false, error: 'Server configuration error' });
    }

    const expiresIn = `${EMAIL_SESSION_EXPIRY_DAYS}d`;
    const jwtPayload = {
      ripxtype: 'email_session',
      email: payload.email,
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

    res.json({
      success: true,
      token: sessionToken,
      expiresIn,
      email: payload.email,
    });
  })
);

module.exports = router;
