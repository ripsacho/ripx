/**
 * Auth Routes
 *
 * Shopify OAuth installation flow
 */

const express = require('express');
const crypto = require('crypto');
const { upsertShopSession } = require('../models/shopSession');
const { upsertShopifyTenant } = require('../models/tenant');
const logger = require('../utils/logger');

const router = express.Router();

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

router.get('/', (req, res) => {
  const { shop } = req.query;

  if (!shop || !isValidShopDomain(shop)) {
    return res.status(400).json({ error: 'Invalid shop domain' });
  }

  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_SCOPES || !process.env.APP_URL) {
    logger.error('Missing required Shopify OAuth environment variables', {
      hasApiKey: !!process.env.SHOPIFY_API_KEY,
      hasScopes: !!process.env.SHOPIFY_SCOPES,
      hasAppUrl: !!process.env.APP_URL,
    });
    return res.status(500).json({ error: 'OAuth configuration missing' });
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

  res.redirect(getAuthRedirectUrl(shop, state));
});

router.get('/callback', async (req, res) => {
  try {
    const { shop, code, state } = req.query;
    const stateCookie = req.cookies.shopify_oauth_state;
    const shopCookie = req.cookies.shopify_oauth_shop;

    if (!shop || !code || !state || !stateCookie || !shopCookie) {
      return res.status(400).json({ error: 'Missing OAuth parameters' });
    }

    if (!isValidShopDomain(shop) || shop !== shopCookie) {
      return res.status(400).json({ error: 'Invalid shop domain' });
    }

    if (state !== stateCookie) {
      return res.status(400).json({ error: 'Invalid OAuth state' });
    }

    if (!verifyOAuthHmac(req.query)) {
      return res.status(401).json({ error: 'Invalid OAuth signature' });
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
      return res.status(500).json({ error: 'Token exchange failed' });
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
  } catch (error) {
    logger.error('OAuth callback error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'OAuth callback failed' });
  }
});

module.exports = router;
