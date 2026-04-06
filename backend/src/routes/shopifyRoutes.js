/**
 * Shopify Routes
 *
 * API endpoints for Shopify-specific operations
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const shopifyService = require('../services/shopifyService');
const logger = require('../utils/logger');

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
 * GET /api/shopify/connection-status
 * Lightweight check that the current shop has a valid session (used by frontend to show "store not connected" banner).
 * Returns 200 with { connected, shop }; 401 from auth middleware when store is not connected.
 */
router.get(
  '/connection-status',
  asyncHandler((req, res) => {
    res.json({
      connected: true,
      shop: req.shopDomain,
    });
  })
);

/**
 * GET /api/shopify/products/:id
 * Get product information
 */
router.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const accessToken = req.shopifyAccessToken;

    const product = await shopifyService.getProduct(shopDomain, accessToken, id);

    res.json({
      success: true,
      product,
    });
  })
);

/**
 * GET /api/shopify/store-resources
 * List store resources for targeting selector (products, collections, pages).
 * Query: type=product(s)|collection(s)|page(s), query=optional search
 */
router.get(
  '/store-resources',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    const accessToken = req.shopifyAccessToken;
    const rawType = (req.query.type || '').toLowerCase().trim();
    const searchQuery = (req.query.query || '').trim() || undefined;
    const first = Math.min(parseInt(req.query.first, 10) || 100, 100);
    const afterCursor = (req.query.after || '').trim() || null;

    const typeMap = {
      product: 'products',
      products: 'products',
      collection: 'collections',
      collections: 'collections',
      page: 'pages',
      pages: 'pages',
    };
    const type = typeMap[rawType];
    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Use product(s), collection(s), or page(s).',
      });
    }

    let list;
    let resourcePageInfo = null;
    let emptyReason = null; // Set when list is empty due to scope/API error so frontend can show it
    const handleListError = (err, resourceLabel) => {
      const msg = (err && err.message) || String(err);
      const statusCode = err.response?.status ?? err.networkStatusCode ?? null;
      const isUnauthorized =
        statusCode === 401 || /401|unauthorized|invalid.*token|token.*invalid/i.test(msg);
      if (isUnauthorized) {
        logger.warn(
          'Store resources list failed: Shopify returned 401 (expired or invalid token).',
          {
            shopDomain,
            resourceLabel,
            error: msg,
          }
        );
        emptyReason =
          'Your store session has expired or the app was reinstalled. Open this app again from Shopify Admin (Apps → your app), or reinstall the app to reconnect and refresh the list.';
        return [];
      }
      const isAccessDenied =
        /access denied|scope|permission|403/i.test(msg) ||
        (err.response && err.response.status === 403);
      if (isAccessDenied) {
        const configuredScopes = (process.env.SHOPIFY_SCOPES || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const hasProducts = configuredScopes.some(s => s === 'read_products');
        const hasCollections = configuredScopes.some(s => s === 'read_collections');
        logger.warn(`Store ${resourceLabel} list failed (missing scope or old token).`, {
          shopDomain,
          error: msg,
          serverHasReadProducts: hasProducts,
          serverHasReadCollections: hasCollections,
        });
        if (resourceLabel === 'pages') {
          emptyReason =
            'Missing "read online store pages" permission. Ensure server SHOPIFY_SCOPES includes read_online_store_pages, then reinstall the app from Shopify Admin.';
        } else if (resourceLabel === 'collections') {
          emptyReason =
            'Missing "read collections" permission. Ensure server SHOPIFY_SCOPES includes read_collections, then reinstall the app from Shopify Admin (Apps → your app → Uninstall → Install again).';
        } else {
          emptyReason =
            'Missing "read products" permission. Ensure server SHOPIFY_SCOPES includes read_products, then reinstall the app from Shopify Admin (Apps → your app → Uninstall → Install again).';
        }
        return [];
      }
      throw err;
    };

    try {
      if (type === 'products') {
        const result = await shopifyService.listProducts(
          shopDomain,
          accessToken,
          searchQuery,
          first,
          afterCursor
        );
        list = result.list;
        resourcePageInfo = result.pageInfo;
      } else if (type === 'collections') {
        const result = await shopifyService.listCollections(
          shopDomain,
          accessToken,
          searchQuery,
          first,
          afterCursor
        );
        list = result.list;
        resourcePageInfo = result.pageInfo;
      } else {
        try {
          const result = await shopifyService.listPages(
            shopDomain,
            accessToken,
            searchQuery,
            first,
            afterCursor
          );
          list = result.list;
          resourcePageInfo = result.pageInfo;
        } catch (err) {
          list = handleListError(err, 'pages');
          if (list.length === 0 && !emptyReason) {
            logger.warn('Add read_online_store_pages to SHOPIFY_SCOPES and reinstall the app.', {
              shopDomain,
            });
          }
        }
      }
    } catch (err) {
      if (type === 'products') {
        list = handleListError(err, 'products');
        resourcePageInfo = null;
      } else if (type === 'collections') {
        list = handleListError(err, 'collections');
        resourcePageInfo = null;
      } else {
        throw err;
      }
    }

    res.json({
      success: true,
      type: rawType,
      resources: Array.isArray(list) ? list : [],
      ...(emptyReason && { empty_reason: emptyReason }),
      ...(resourcePageInfo && { page_info: resourcePageInfo }),
    });
  })
);

/**
 * GET /api/shopify/product-variants
 * List products with variants for native variant mapping UX.
 * Query: query=optional search, first=optional product count, variantsFirst=optional variants per product
 */
router.get(
  '/product-variants',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    const accessToken = req.shopifyAccessToken;
    const searchQuery = (req.query.query || '').trim() || undefined;
    const productId = (req.query.productId || '').trim() || null;
    const first = Math.min(parseInt(req.query.first, 10) || 24, 50);
    const variantsFirst = Math.min(parseInt(req.query.variantsFirst, 10) || 25, 50);

    try {
      const products = productId
        ? await shopifyService
            .getProductWithVariants(shopDomain, accessToken, productId, variantsFirst)
            .then(product => (product ? [product] : []))
        : await shopifyService.listProductsWithVariants(
            shopDomain,
            accessToken,
            searchQuery,
            first,
            variantsFirst
          );
      res.json({
        success: true,
        products: Array.isArray(products) ? products : [],
      });
    } catch (err) {
      const msg = (err && err.message) || 'Could not load product variants from Shopify.';
      const statusCode = err.response?.status ?? err.networkStatusCode ?? null;
      if (statusCode === 401 || /401|unauthorized|invalid.*token|token.*invalid/i.test(msg)) {
        return res.json({
          success: true,
          products: [],
          empty_reason:
            'Your store session has expired or the app was reinstalled. Open this app again from Shopify Admin to reconnect and refresh variant mappings.',
        });
      }
      if (/access denied|scope|permission|403/i.test(msg)) {
        return res.json({
          success: true,
          products: [],
          empty_reason:
            'Missing Shopify product permissions. Ensure read_products is enabled and reinstall the app if needed.',
        });
      }
      throw err;
    }
  })
);

/**
 * GET /api/shopify/setup/status
 * Check App Proxy and App Embed status.
 */
router.get(
  '/setup/status',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;

    const appUrl = process.env.APP_URL || null;
    const proxyTargetUrl = appUrl ? `${appUrl}/api/proxy` : null;

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
  })
);

module.exports = router;
