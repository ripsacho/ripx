/**
 * Webhook Routes
 *
 * Handles Shopify webhooks for real-time updates
 */

const express = require('express');
const router = express.Router();
const { trackEvent } = require('../models/analytics');
const { getTestsByShop, updateTestStatus } = require('../models/test');
const { deleteShopSession } = require('../models/shopSession');
const { query } = require('../utils/database');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Verify Shopify webhook signature
 */
function verifyWebhook(data, hmacHeader) {
  if (!hmacHeader || !process.env.SHOPIFY_API_SECRET) {
    return false;
  }
  const hmac = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET);
  const hash = hmac.update(data).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
}

async function recordWebhookEvent({ shopDomain, webhookId, topic, payloadHash }) {
  if (!webhookId) {
    return true;
  }
  const sql = `
    INSERT INTO webhook_events (shop_domain, webhook_id, topic, payload_hash, received_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (shop_domain, webhook_id) DO NOTHING
    RETURNING id
  `;
  const result = await query(sql, [shopDomain, webhookId, topic, payloadHash]);
  return result.rowCount > 0;
}

/**
 * POST /api/webhooks/orders/create
 * Track conversions when orders are created
 */
router.post('/orders/create', express.raw({ type: 'application/json' }), async (req, res) => {
  let shop = null;
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    shop = req.get('X-Shopify-Shop-Domain');
    const webhookId = req.get('X-Shopify-Webhook-Id');
    const topic = req.get('X-Shopify-Topic') || 'orders/create';

    // HMAC verification required; reject if missing or invalid
    if (!hmac) {
      logger.warn('Webhook rejected: missing HMAC', { path: req.path });
      return res.status(401).send('Unauthorized');
    }
    if (!verifyWebhook(req.body, hmac)) {
      logger.warn('Webhook rejected: invalid HMAC', { shop, path: req.path });
      return res.status(401).send('Unauthorized');
    }

    const payloadHash = crypto.createHash('sha256').update(req.body).digest('hex');
    const isNew = await recordWebhookEvent({
      shopDomain: shop,
      webhookId,
      topic,
      payloadHash,
    });

    if (!isNew) {
      return res.status(200).send('OK');
    }

    const order = JSON.parse(req.body.toString());

    // Get all active tests for this shop
    const tests = await getTestsByShop(shop, 'running');

    // Track conversion for each active test
    for (const test of tests) {
      // Get customer's variant assignment
      const customerId = order.customer?.id?.toString() || order.email || `guest_${order.id}`;

      const { getTestAssignment } = require('../models/testAssignment');
      const assignment = await getTestAssignment(test.id, customerId, shop);

      if (assignment) {
        const countryCode =
          order.billing_address?.country_code ||
          order.default_address?.country_code ||
          order.shipping_address?.country_code;

        const orderMeta = {
          order_id: order.id,
          order_number: order.order_number,
          country: countryCode || null,
          conversion_url: order.landing_site || order.source_name || 'shopify_order',
          line_items: order.line_items?.map(item => ({
            product_id: item.product_id,
            variant_id: item.variant_id,
            quantity: item.quantity,
            price: item.price,
          })),
        };
        await trackEvent({
          test_id: test.id,
          variant_id: assignment.variant_id,
          user_id: customerId,
          shop_domain: shop,
          event_type: 'conversion',
          event_value: parseFloat(order.total_price || 0),
          metadata: orderMeta,
        });
        if (process.env.LOG_TRACK_EVENTS === 'true') {
          logger.info('AB test conversion', {
            test_id: test.id,
            variant_id: assignment.variant_id,
            shop_domain: shop,
            order_id: order.id,
            event_value: parseFloat(order.total_price || 0),
          });
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook error', {
      error: error.message,
      stack: error.stack,
      shop,
      path: req.path,
    });
    // Log for retry/monitoring - webhook will be retried by Shopify
    logger.error('Webhook processing failed (will retry)', {
      topic: 'orders/create',
      shop,
      error: error.message,
    });
    res.status(500).send('Error processing webhook');
  }
});

/**
 * POST /api/webhooks/products/update
 * Handle product updates (for price tests)
 */
router.post('/products/update', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const shop = req.get('X-Shopify-Shop-Domain');
    const webhookId = req.get('X-Shopify-Webhook-Id');
    const topic = req.get('X-Shopify-Topic') || 'products/update';

    if (!hmac) {
      logger.warn('Webhook rejected: missing HMAC', { path: req.path });
      return res.status(401).send('Unauthorized');
    }
    if (!verifyWebhook(req.body, hmac)) {
      logger.warn('Webhook rejected: invalid HMAC', { shop, path: req.path });
      return res.status(401).send('Unauthorized');
    }

    const payloadHash = crypto.createHash('sha256').update(req.body).digest('hex');
    const isNew = await recordWebhookEvent({
      shopDomain: shop,
      webhookId,
      topic,
      payloadHash,
    });

    if (!isNew) {
      return res.status(200).send('OK');
    }

    const product = JSON.parse(req.body.toString());

    // Update any active price tests for this product
    // TODO: Implement product sync job - fetch full product details from Admin API
    // and reconcile with test variant configs (e.g. prices). Run async to avoid
    // blocking webhook response; use retry with exponential backoff on failure.
    const tests = await getTestsByShop(shop, 'running');
    const affectedTests = tests.filter(
      test =>
        test.type === 'price' &&
        test.target_type === 'product' &&
        test.target_id === String(product.id)
    );
    logger.info('Product updated', {
      productId: product.id,
      shop,
      affectedTests: affectedTests.map(test => test.id),
    });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook processing failed (will retry)', {
      topic: 'products/update',
      shop: req.get('X-Shopify-Shop-Domain'),
      error: error.message,
    });
    res.status(500).send('Error processing webhook');
  }
});

/**
 * POST /api/webhooks/app/uninstalled
 * Handle app uninstallation
 */
router.post('/app/uninstalled', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    const webhookId = req.get('X-Shopify-Webhook-Id');
    const topic = req.get('X-Shopify-Topic') || 'app/uninstalled';

    if (!hmac) {
      logger.warn('Webhook rejected: missing HMAC', { path: req.path });
      return res.status(401).send('Unauthorized');
    }
    if (!verifyWebhook(req.body, hmac)) {
      logger.warn('Webhook rejected: invalid HMAC', { shopDomain, path: req.path });
      return res.status(401).send('Unauthorized');
    }

    // Clean up shop data
    const payloadHash = crypto.createHash('sha256').update(req.body).digest('hex');
    const isNew = await recordWebhookEvent({
      shopDomain,
      webhookId,
      topic,
      payloadHash,
    });

    if (!isNew) {
      return res.status(200).send('OK');
    }

    const tests = await getTestsByShop(shopDomain, 'running');
    for (const test of tests) {
      await updateTestStatus(test.id, shopDomain, 'stopped');
    }

    await deleteShopSession(shopDomain);

    // TODO: Implement cleanup job - purge orphaned webhook_events, test_assignments,
    // and analytics for this shop. Run async; ensure idempotency for retries.
    logger.info('App uninstalled', {
      shopDomain,
      stoppedTests: tests.map(test => test.id),
    });

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook processing failed (app uninstalled)', {
      topic: 'app/uninstalled',
      shopDomain: req.get('X-Shopify-Shop-Domain'),
      error: error.message,
    });
    res.status(500).send('Error processing webhook');
  }
});

module.exports = router;
