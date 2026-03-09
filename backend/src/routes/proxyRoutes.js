/**
 * App Proxy Routes
 *
 * Serves storefront assets via Shopify App Proxy.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getActiveTestsForStorefront } = require('../models/test');
const logger = require('../utils/logger');

const router = express.Router();

function isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

const SCRIPT_VERSION = '1';

function buildRuntimeConfig(shop, tests, req) {
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

  return {
    apiUrl: `${appUrl}/api`,
    shopDomain: shop,
    version: SCRIPT_VERSION,
    activeTests: (tests || []).map(test => {
      const ids =
        test.target_ids && Array.isArray(test.target_ids)
          ? test.target_ids.filter(Boolean)
          : test.target_id
            ? [test.target_id]
            : [];
      const segments = test.segments || {};
      const jsTargeting = segments.js_targeting;
      return {
        id: test.id,
        type: test.type,
        targetType: test.target_type,
        targetId: test.target_id || null,
        targetIds: ids.length > 0 ? ids : null,
        jsTargeting:
          jsTargeting?.enabled && jsTargeting?.code
            ? { enabled: true, code: jsTargeting.code }
            : null,
      };
    }),
  };
}

function getStorefrontScriptPath() {
  return path.join(__dirname, '../../..', 'shopify', 'storefront-script.js');
}

/**
 * Build the message used for Shopify App Proxy HMAC (per Shopify docs).
 * Sorted key=value pairs, no delimiter between pairs. Array values joined with comma.
 */
function buildSignatureMessage(params) {
  return Object.keys(params)
    .sort()
    .map(key => {
      const v = params[key];
      const val = Array.isArray(v) ? v.join(',') : v === undefined || v === null ? '' : String(v);
      return `${key}=${val}`;
    })
    .join('');
}

function verifyAppProxySignature(query) {
  const signature = query.signature;
  const rawSecret = process.env.SHOPIFY_API_SECRET;
  if (!signature || !rawSecret) {
    return false;
  }
  const secret = String(rawSecret).trim();

  const { signature: _signature, ...rest } = query;
  const message = buildSignatureMessage(rest);
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const digestBuffer = Buffer.from(digest, 'utf8');
  if (signatureBuffer.length !== digestBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
}

/**
 * Shared handler: serve storefront script (used for both /script.js and /script.js/script.js).
 * Shopify appends the path to the Proxy URL; if Partner Dashboard Proxy URL includes /script.js,
 * the request arrives as /api/proxy/script.js/script.js. We handle both so the script loads either way.
 */
async function serveScript(req, res) {
  const shop = req.query.shop || req.query.shop_domain;

  if (!shop) {
    return res.status(400).json({
      success: false,
      error: 'Invalid shop domain',
      hint: 'Load the script via your store URL so Shopify adds the shop parameter, e.g. https://<store>.myshopify.com/apps/ripx/script.js?v=1 — do not open this proxy URL directly.',
    });
  }
  if (!isValidShopDomain(shop)) {
    return res.status(400).json({ success: false, error: 'Invalid shop domain', shop });
  }

  const hasSignature = Boolean(req.query.signature);
  const isProduction = process.env.NODE_ENV === 'production';
  const skipVerify = !isProduction && process.env.RIPX_APP_PROXY_SKIP_VERIFY === 'true';

  if (skipVerify) {
    logger.warn('App proxy signature verification skipped (RIPX_APP_PROXY_SKIP_VERIFY=true)', {
      shop,
    });
  }

  if (!hasSignature) {
    if (isProduction) {
      return res.status(401).set('Content-Type', 'application/json').json({
        success: false,
        error: 'Unauthorized',
        hint: 'App proxy requests must include signature. Check Partner Dashboard App Proxy URL.',
      });
    }
    logger.warn('App proxy signature missing (dev only)', { shop });
  } else if (!skipVerify && !verifyAppProxySignature(req.query)) {
    logger.warn('App proxy signature verification failed', {
      shop,
      hint: 'Set SHOPIFY_API_SECRET on this server to the exact Client secret from Partner Dashboard → your app → Client credentials (same app that has the App Proxy).',
    });
    return res.status(401).set('Content-Type', 'application/json').json({
      success: false,
      error: 'Unauthorized',
      hint: 'Signature invalid. Set SHOPIFY_API_SECRET on this server to the exact Client secret from Partner Dashboard → your app → Client credentials (same app that has the App Proxy). No extra spaces.',
    });
  }

  const tests = await getActiveTestsForStorefront(shop);
  const runtimeConfig = buildRuntimeConfig(shop, tests, req);
  const scriptPath = getStorefrontScriptPath();

  let scriptContents;
  try {
    scriptContents = fs.readFileSync(scriptPath, 'utf8');
  } catch (err) {
    logger.error('Storefront script file missing or unreadable', {
      path: scriptPath,
      shop,
      error: err.message,
    });
    res.status(503).set('Content-Type', 'text/plain').send('Script temporarily unavailable.');
    return;
  }

  const version = req.query.v;
  const cacheSeconds = version ? 31536000 : 300;

  res.set('Content-Type', 'application/javascript');
  res.set('Cache-Control', `public, max-age=${cacheSeconds}`);
  res.send(`window.AB_TEST_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};\n${scriptContents}`);
}

router.get('/script.js', asyncHandler(serveScript));
// Double path when Partner Dashboard Proxy URL incorrectly includes /script.js
router.get('/script.js/script.js', asyncHandler(serveScript));

module.exports = router;
