/**
 * Webhook Routes
 *
 * Handles Shopify webhooks for real-time updates
 */

const express = require('express');
const router = express.Router();
const { trackEvent } = require('../models/analytics');
const { getTestsByShop } = require('../models/test');
const crypto = require('crypto');

/**
 * Verify Shopify webhook signature
 */
function verifyWebhook(data, hmacHeader) {
  const hmac = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET);
  const hash = hmac.update(data, 'utf8').digest('base64');
  return hash === hmacHeader;
}

/**
 * POST /api/webhooks/orders/create
 * Track conversions when orders are created
 */
router.post('/orders/create', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const shop = req.get('X-Shopify-Shop-Domain');

    // Verify webhook signature
    if (!verifyWebhook(req.body, hmac)) {
      return res.status(401).send('Unauthorized');
    }

    const order = JSON.parse(req.body);

    // Get all active tests for this shop
    const tests = await getTestsByShop(shop, 'running');

    // Track conversion for each active test
    for (const test of tests) {
      // Get customer's variant assignment
      const customerId = order.customer?.id?.toString() ||
                        order.email ||
                        `guest_${order.id}`;

      const { getTestAssignment } = require('../models/testAssignment');
      const assignment = await getTestAssignment(test.id, customerId, shop);

      if (assignment) {
        // Track conversion
        await trackEvent({
          test_id: test.id,
          variant_id: assignment.variant_id,
          user_id: customerId,
          shop_domain: shop,
          event_type: 'conversion',
          event_value: parseFloat(order.total_price || 0),
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            line_items: order.line_items?.map(item => ({
              product_id: item.product_id,
              variant_id: item.variant_id,
              quantity: item.quantity,
              price: item.price
            }))
          }
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    const logger = require('../utils/logger');
    logger.error('Webhook error', { 
      error: error.message, 
      stack: error.stack,
      shop,
      path: req.path
    });
    res.status(500).send('Error processing webhook');
  }
});

/**
 * POST /api/webhooks/products/update
 * Handle product updates (for price tests)
 */
router.post('/products/update', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256');

    if (!verifyWebhook(req.body, hmac)) {
      return res.status(401).send('Unauthorized');
    }

    const product = JSON.parse(req.body);

    // Update any active price tests for this product
    // This would sync product data with test configurations
    // TODO: Implement product update sync
    const logger = require('../utils/logger');
    logger.info('Product updated', { productId: product.id });

    res.status(200).send('OK');
  } catch (error) {
    const logger = require('../utils/logger');
    logger.error('Webhook error', { 
      error: error.message,
      stack: error.stack,
      path: req.path
    });
    res.status(500).send('Error processing webhook');
  }
});

/**
 * POST /api/webhooks/app/uninstalled
 * Handle app uninstallation
 */
router.post('/app/uninstalled', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const shopDomain = req.get('X-Shopify-Shop-Domain');

    if (!verifyWebhook(req.body, hmac)) {
      return res.status(401).send('Unauthorized');
    }

    // Clean up shop data
    // Stop all active tests
    // Archive data (optional)
    // TODO: Implement cleanup logic
    const logger = require('../utils/logger');
    logger.info('App uninstalled', { shopDomain });

    res.status(200).send('OK');
  } catch (error) {
    const logger = require('../utils/logger');
    logger.error('Webhook error', { 
      error: error.message,
      stack: error.stack,
      shopDomain,
      path: req.path
    });
    res.status(500).send('Error processing webhook');
  }
});

module.exports = router;

