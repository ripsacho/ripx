/**
 * Promo Link Routes
 *
 * API endpoints for promo link management
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const promoLinkService = require('../services/promoLinkService');

/**
 * POST /api/promo-links
 * Generate a new promo link
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    const linkData = {
      ...req.body,
      shop_domain: shopDomain,
    };

    const promoLink = await promoLinkService.generatePromoLink(linkData);

    res.status(201).json({
      success: true,
      promoLink,
    });
  })
);

/**
 * GET /api/promo-links/test/:testId
 * Get all promo links for a test
 */
router.get(
  '/test/:testId',
  asyncHandler(async (req, res) => {
    const { testId } = req.params;
    const shopDomain = req.shopDomain;

    const promoLinks = await promoLinkService.getPromoLinksByTest(testId, shopDomain);

    res.json({
      success: true,
      promoLinks,
    });
  })
);

/**
 * GET /api/promo-links/validate/:token
 * Validate and get promo link details
 */
router.get(
  '/validate/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const shopDomain = req.query.shop || req.shopDomain;

    const promoLink = await promoLinkService.validatePromoLink(token, shopDomain);

    if (!promoLink) {
      return res.status(404).json({
        success: false,
        error: 'Promo link not found or expired',
      });
    }

    res.json({
      success: true,
      promoLink,
    });
  })
);

module.exports = router;
