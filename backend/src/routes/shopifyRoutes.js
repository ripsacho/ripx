/**
 * Shopify Routes
 *
 * API endpoints for Shopify-specific operations
 */

const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopifyService');

async function checkAppProxyStatus(shopDomain) {
  const url = `https://${shopDomain}/apps/ripx/script.js?v=1`;
  const status = {
    url,
    ok: false,
    statusCode: null,
    contentType: null,
    error: null,
  };

  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    status.statusCode = response.status;
    status.ok = response.ok;
    status.contentType = response.headers.get('content-type');
  } catch (error) {
    status.error = error.message;
  }

  return status;
}

async function checkEmbedStatus(shopDomain) {
  const url = `https://${shopDomain}`;
  const status = {
    url,
    detected: false,
    statusCode: null,
    error: null,
  };

  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    status.statusCode = response.status;

    if (!response.ok) {
      return status;
    }

    const html = await response.text();
    status.detected = html.includes('/apps/ripx/script.js');
  } catch (error) {
    status.error = error.message;
  }

  return status;
}

/**
 * GET /api/shopify/products/:id
 * Get product information
 */
router.get('/products/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const accessToken = req.shopifyAccessToken;

    const product = await shopifyService.getProduct(shopDomain, accessToken, id);

    res.json({
      success: true,
      product,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/shopify/setup/status
 * Check App Proxy and App Embed status.
 */
router.get('/setup/status', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;

    const appUrl = process.env.APP_URL || null;
    const proxyTargetUrl = appUrl ? `${appUrl}/api/proxy/script.js` : null;

    const [proxyStatus, embedStatus] = await Promise.all([
      checkAppProxyStatus(shopDomain),
      checkEmbedStatus(shopDomain),
    ]);

    res.json({
      success: true,
      shopDomain,
      appUrl,
      proxyTargetUrl,
      proxyStatus,
      embedStatus,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
