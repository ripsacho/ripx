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

function buildSignatureMessage(params, useAmpersand) {
  const pairs = Object.keys(params)
    .sort()
    .map(key => `${key}=${Array.isArray(params[key]) ? params[key].join(',') : params[key]}`);
  return useAmpersand ? pairs.join('&') : pairs.join('');
}

function verifyAppProxySignature(query) {
  const signature = query.signature;
  if (!signature || !process.env.SHOPIFY_API_SECRET) {
    return false;
  }

  const { signature: _signature, ...rest } = query;
  const secret = process.env.SHOPIFY_API_SECRET;

  const hexDigest = message => crypto.createHmac('sha256', secret).update(message).digest('hex');

  const digestNoAmp = hexDigest(buildSignatureMessage(rest, false));
  const digestAmp = hexDigest(buildSignatureMessage(rest, true));

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const digestNoAmpBuffer = Buffer.from(digestNoAmp, 'utf8');
  const digestAmpBuffer = Buffer.from(digestAmp, 'utf8');

  const matchNoAmp =
    signatureBuffer.length === digestNoAmpBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, digestNoAmpBuffer);
  const matchAmp =
    signatureBuffer.length === digestAmpBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, digestAmpBuffer);

  return matchNoAmp || matchAmp;
}

/**
 * GET /api/proxy/script.js
 * Serve storefront script via app proxy.
 */
router.get(
  '/script.js',
  asyncHandler(async (req, res) => {
    const shop = req.query.shop || req.query.shop_domain;

    if (!shop || !isValidShopDomain(shop)) {
      return res.status(400).json({ success: false, error: 'Invalid shop domain' });
    }

    const hasSignature = Boolean(req.query.signature);
    const isProduction = process.env.NODE_ENV === 'production';

    if (!hasSignature) {
      if (isProduction) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
      logger.warn('App proxy signature missing (dev only)', { shop });
    } else if (!verifyAppProxySignature(req.query)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
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
  })
);

module.exports = router;
