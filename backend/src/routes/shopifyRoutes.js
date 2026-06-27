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
const validators = require('../utils/validators');
const { getShopSession } = require('../models/shopSession');
const { evaluateShopifyConnectionHealth } = require('../services/shopifyConnectionHealth');
const { runStorefrontSetupProbe } = require('../services/storefrontSetupService');
const {
  buildShopifyScopeReauthorizeUrl,
  buildScopeReauthorizeFailureRedirect,
} = require('../services/shopifyReauthorizeService');

/**
 * GET /api/shopify/connection-status
 * Validates OAuth session against Shopify (not just DB row presence).
 * Returns 200 with { connected, shop, connection }; 401 from auth middleware when no session row exists.
 */
router.get(
  '/connection-status',
  asyncHandler(async (req, res) => {
    const session = await getShopSession(req.shopDomain);
    const quick =
      req.query.quick === '1' || req.query.quick === 'true' || req.query.quick === 'yes';
    const payload = await evaluateShopifyConnectionHealth({
      shopDomain: req.shopDomain,
      accessToken: req.shopifyAccessToken,
      sessionScope: session?.scope || null,
      quick,
    });
    res.json(payload);
  })
);

/**
 * GET /api/shopify/reauthorize?shop=...
 * Start Shopify OAuth for an already-connected store (scope refresh).
 * Authenticates via shop session (or email session + store access). Does not require email JWT in localStorage.
 */
router.get(
  '/reauthorize',
  asyncHandler(async (req, res) => {
    try {
      const redirectUrl = await buildShopifyScopeReauthorizeUrl(req, res);
      return res.json({ success: true, redirectUrl });
    } catch (error) {
      const status = error.status || 500;
      return res.status(status).json({
        success: false,
        error: error.message || 'Could not start permission update',
        code: error.code || 'REAUTHORIZE_FAILED',
      });
    }
  })
);

/**
 * GET /api/shopify/reauthorize-redirect?shop=...
 * Browser navigation entrypoint for scope refresh (sets OAuth cookies, then 302 to Shopify).
 * Works with shop session auth and httpOnly email session cookie (no localStorage JWT required).
 */
router.get(
  '/reauthorize-redirect',
  asyncHandler(async (req, res) => {
    const shop = String(req.shopDomain || req.query?.shop || '')
      .trim()
      .toLowerCase();
    try {
      const redirectUrl = await buildShopifyScopeReauthorizeUrl(req, res);
      return res.redirect(redirectUrl);
    } catch (error) {
      logger.warn('Shopify scope reauthorize redirect failed', {
        shop,
        code: error.code,
        message: error.message,
      });
      const reason =
        error.code === 'SIGN_IN_REQUIRED' || error.code === 'SHOP_NOT_AUTHENTICATED'
          ? 'sign_in_to_connect'
          : 'scope_update';
      return res.redirect(buildScopeReauthorizeFailureRedirect(req, shop, reason));
    }
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
        logger.warn(`Store ${resourceLabel} list failed (missing scope or old token).`, {
          shopDomain,
          error: msg,
          serverHasReadProducts: hasProducts,
        });
        if (resourceLabel === 'pages') {
          emptyReason =
            'Missing "read online store pages" permission. Ensure server SHOPIFY_SCOPES includes read_online_store_pages, then reinstall the app from Shopify Admin.';
        } else if (resourceLabel === 'collections') {
          emptyReason =
            'Missing "read products" permission (collections use the same Admin scope). Ensure server SHOPIFY_SCOPES includes read_products, then reinstall the app from Shopify Admin (Apps → your app → Uninstall → Install again).';
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
    const requestedDomain = String(req.query.domain || '')
      .trim()
      .toLowerCase();
    const shopDomain = validators.isValidShopDomain(requestedDomain)
      ? requestedDomain
      : req.shopDomain;

    const appUrl = process.env.APP_URL || null;
    const proxyTargetUrl = appUrl ? `${appUrl}/api/proxy` : null;

    const probe = await runStorefrontSetupProbe(shopDomain);

    res.json({
      success: true,
      shopDomain,
      appUrl,
      proxyTargetUrl,
      proxyStatus: probe.proxyStatus,
      embedStatus: probe.embedStatus,
      storefrontRuntimeReady: probe.storefrontRuntimeReady,
    });
  })
);

module.exports = router;
