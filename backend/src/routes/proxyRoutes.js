/**
 * App Proxy Routes
 *
 * Serves storefront assets via Shopify App Proxy.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const querystring = require('querystring');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getActiveTestsForStorefront } = require('../models/test');
const logger = require('../utils/logger');
const {
  SCRIPT_VERSION,
  buildStorefrontRuntimeConfig,
  getStorefrontScriptCacheControl,
} = require('../utils/storefrontScriptRuntime');
const {
  getMaintenanceMode,
  isMaintenanceActiveForDomain,
  getBlockListMessage,
} = require('../utils/maintenanceMode');
const { getTenantByDomain, normalizeDomain } = require('../models/tenant');
const { ERROR_MESSAGES } = require('../constants');

const router = express.Router();

function isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

function getStorefrontScriptPath() {
  return path.join(__dirname, '../../..', 'shopify', 'storefront-script.js');
}

function isTenantSuspendedOrBlocked(tenant) {
  const status = tenant?.status;
  return status === 'suspended' || status === 'blocked';
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

/**
 * Get query params from the request URL (raw query string) so we use exactly what
 * Shopify sent, including empty params. Express req.query can merge/alter in some setups.
 */
function getQueryFromRequest(req) {
  const url = req.originalUrl || req.url || '';
  const qIndex = url.indexOf('?');
  if (qIndex === -1) {
    return {};
  }
  const queryString = url.slice(qIndex + 1);
  return querystring.parse(queryString);
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
      hint: `Load the script via your store URL so Shopify adds the shop parameter, e.g. https://<store>.myshopify.com/apps/ripx/script.js?v=${SCRIPT_VERSION} — do not open this proxy URL directly.`,
    });
  }
  if (!isValidShopDomain(shop)) {
    return res.status(400).json({ success: false, error: 'Invalid shop domain', shop });
  }
  const normalizedShop = normalizeDomain(shop) || String(shop).trim().toLowerCase();

  const blockListMessage = await getBlockListMessage(normalizedShop);
  if (blockListMessage !== null) {
    return res.status(403).json({
      success: false,
      error: blockListMessage || 'Access blocked.',
    });
  }

  const maintenanceValue = await getMaintenanceMode();
  if (isMaintenanceActiveForDomain(normalizedShop, maintenanceValue)) {
    return res.status(503).json({
      success: false,
      error: ERROR_MESSAGES.MAINTENANCE,
      maintenance: true,
    });
  }

  const tenant = await getTenantByDomain(normalizedShop);
  if (tenant && isTenantSuspendedOrBlocked(tenant)) {
    return res.status(403).json({
      success: false,
      error: 'Access suspended. Contact support.',
    });
  }

  const hasSignature = Boolean(req.query.signature);
  const isProduction = process.env.NODE_ENV === 'production';
  const skipVerify = !isProduction && process.env.RIPX_APP_PROXY_SKIP_VERIFY === 'true';

  if (skipVerify) {
    logger.warn('App proxy signature verification skipped (RIPX_APP_PROXY_SKIP_VERIFY=true)', {
      shop: normalizedShop,
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
    logger.warn('App proxy signature missing (dev only)', { shop: normalizedShop });
  } else if (!skipVerify) {
    const queryFromRaw = getQueryFromRequest(req);
    let verified = verifyAppProxySignature(queryFromRaw);
    if (!verified && Object.keys(req.query).length > 0) {
      verified = verifyAppProxySignature(req.query);
    }
    if (!verified) {
      const paramKeys = Object.keys(queryFromRaw)
        .filter(k => k !== 'signature')
        .sort();
      logger.warn('App proxy signature verification failed', {
        shop: normalizedShop,
        paramKeys,
        hint: 'Use Client secret from the same app that has the App Proxy. See docs/APP_PROXY_SIGNATURE_RESEARCH.md.',
      });
      return res.status(401).set('Content-Type', 'application/json').json({
        success: false,
        error: 'Unauthorized',
        hint: 'Signature invalid. Set SHOPIFY_API_SECRET to the Client secret of the app that has the App Proxy (Partner Dashboard → app → Client credentials). SHOPIFY_API_KEY must match that app’s Client ID.',
      });
    }
  }

  const tests = await getActiveTestsForStorefront(normalizedShop);
  const runtimeConfig = buildStorefrontRuntimeConfig(normalizedShop, tests, req);
  const scriptPath = getStorefrontScriptPath();

  let scriptContents;
  try {
    scriptContents = fs.readFileSync(scriptPath, 'utf8');
  } catch (err) {
    logger.error('Storefront script file missing or unreadable', {
      path: scriptPath,
      shop: normalizedShop,
      error: err.message,
    });
    res.status(503).set('Content-Type', 'text/plain').send('Script temporarily unavailable.');
    return;
  }

  const versionLabel = req.query.v ? String(req.query.v) : SCRIPT_VERSION;

  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Script-Version', versionLabel);
  res.set('Cache-Control', getStorefrontScriptCacheControl());
  res.send(`window.AB_TEST_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};\n${scriptContents}`);
}

router.get('/script.js', asyncHandler(serveScript));
// Double path when Partner Dashboard Proxy URL incorrectly includes /script.js
router.get('/script.js/script.js', asyncHandler(serveScript));

async function servePreviewBootstrap(req, res) {
  const shop = req.query.shop || req.query.shop_domain;
  if (!shop) {
    return res.status(400).type('text/plain').send('Missing shop domain');
  }
  if (!isValidShopDomain(shop)) {
    return res.status(400).type('text/plain').send('Invalid shop domain');
  }
  const normalizedShop = normalizeDomain(shop) || String(shop).trim().toLowerCase();

  const blockListMessage = await getBlockListMessage(normalizedShop);
  if (blockListMessage !== null) {
    return res
      .status(403)
      .type('text/plain')
      .send(blockListMessage || 'Access blocked.');
  }

  const maintenanceValue = await getMaintenanceMode();
  if (isMaintenanceActiveForDomain(normalizedShop, maintenanceValue)) {
    return res.status(503).type('text/plain').send(ERROR_MESSAGES.MAINTENANCE);
  }

  const tenant = await getTenantByDomain(normalizedShop);
  if (tenant && isTenantSuspendedOrBlocked(tenant)) {
    return res.status(403).type('text/plain').send('Access suspended. Contact support.');
  }

  const hasSignature = Boolean(req.query.signature);
  const isProduction = process.env.NODE_ENV === 'production';
  const skipVerify = !isProduction && process.env.RIPX_APP_PROXY_SKIP_VERIFY === 'true';
  if (skipVerify) {
    logger.warn('App proxy signature verification skipped (RIPX_APP_PROXY_SKIP_VERIFY=true)', {
      shop: normalizedShop,
      route: 'preview-bootstrap',
    });
  }
  if (!hasSignature && isProduction) {
    return res.status(401).type('text/plain').send('Unauthorized');
  }
  if (hasSignature && !skipVerify) {
    const queryFromRaw = getQueryFromRequest(req);
    let verified = verifyAppProxySignature(queryFromRaw);
    if (!verified && Object.keys(req.query).length > 0) {
      verified = verifyAppProxySignature(req.query);
    }
    if (!verified) {
      logger.warn('App proxy signature verification failed (preview-bootstrap)', {
        shop: normalizedShop,
      });
      return res.status(401).type('text/plain').send('Unauthorized');
    }
  }

  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl) {
    return res.status(400).type('text/plain').send('Missing url parameter');
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(rawUrl);
  } catch (_e) {
    return res.status(400).type('text/plain').send('Invalid url parameter');
  }
  if (parsedTarget.protocol !== 'https:' && parsedTarget.protocol !== 'http:') {
    return res.status(400).type('text/plain').send('Invalid target protocol');
  }
  if (
    String(parsedTarget.hostname || '')
      .trim()
      .toLowerCase() !== normalizedShop
  ) {
    return res.status(400).type('text/plain').send('Target must match shop domain');
  }

  const targetUrl = parsedTarget.toString();
  const scriptUrl = `https://${normalizedShop}/apps/ripx/script.js?v=${SCRIPT_VERSION}`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RipX preview bootstrap</title>
    <meta http-equiv="refresh" content="3;url=${targetUrl}">
  </head>
  <body>
    <p>Preparing RipX preview...</p>
    <noscript>
      <p>JavaScript required. Continue manually:</p>
      <p><a href="${targetUrl}">Open preview</a></p>
    </noscript>
    <script>
      (function () {
        var target = ${JSON.stringify(targetUrl)};
        var done = false;
        function go() {
          if (done) return;
          done = true;
          try {
            window.location.replace(target);
          } catch (_e) {
            window.location.href = target;
          }
        }
        var s = document.createElement('script');
        s.src = ${JSON.stringify(scriptUrl)};
        s.defer = true;
        s.onload = function () { setTimeout(go, 30); };
        s.onerror = function () { setTimeout(go, 120); };
        (document.head || document.documentElement).appendChild(s);
        setTimeout(go, 1500);
      })();
    </script>
  </body>
</html>`;
  res.set('Cache-Control', 'no-store');
  res.set(
    'Content-Security-Policy',
    "default-src 'self' https:; script-src 'self' https: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; base-uri 'none'"
  );
  return res.type('html').send(html);
}

router.get('/preview-bootstrap', asyncHandler(servePreviewBootstrap));
router.get('/preview-bootstrap/preview-bootstrap', asyncHandler(servePreviewBootstrap));

module.exports = router;
