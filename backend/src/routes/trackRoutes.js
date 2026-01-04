/**
 * Track Routes
 *
 * Public endpoints for tracking conversion events
 * These are called from the storefront
 */

const express = require('express');
const router = express.Router();
const { trackEvent } = require('../models/analytics');
const abTestEngine = require('../services/abTestEngine');

/**
 * POST /api/track
 * Track a conversion event
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      test_id,
      user_id,
      shop_domain,
      event_type = 'conversion',
      event_value = 0,
      metadata = {}
    } = req.body;

    if (!test_id || !user_id || !shop_domain) {
      return res.status(400).json({
        error: 'Missing required fields: test_id, user_id, shop_domain'
      });
    }

    // Get user's variant assignment
    const variant = await abTestEngine.getVariant(test_id, user_id, shop_domain);

    if (!variant) {
      return res.status(404).json({
        error: 'Test not found or not running'
      });
    }

    // Track the event
    await trackEvent({
      test_id,
      variant_id: variant.variantId,
      user_id,
      shop_domain,
      event_type,
      event_value,
      metadata
    });

    res.json({
      success: true,
      message: 'Event tracked successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/track/variant
 * Get variant for a user (for storefront integration)
 */
router.get('/variant', async (req, res, next) => {
  try {
    const { test_id, user_id, shop_domain } = req.query;

    if (!test_id || !user_id || !shop_domain) {
      return res.status(400).json({
        error: 'Missing required query parameters'
      });
    }

    const variant = await abTestEngine.getVariant(test_id, user_id, shop_domain);

    if (!variant) {
      return res.status(404).json({
        error: 'Test not found'
      });
    }

    res.json({
      success: true,
      variant
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

