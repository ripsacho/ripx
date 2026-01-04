/**
 * Shopify Routes
 *
 * API endpoints for Shopify-specific operations
 */

const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopifyService');

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
      product
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

