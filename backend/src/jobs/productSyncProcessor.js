/**
 * Product Sync Job Processor
 *
 * Fetches full product details from Shopify Admin API after products/update webhook
 * and optionally reconciles price test variant configs with current product prices.
 * Runs async with retry (Bull); does not block webhook response.
 */

const { getShopSession } = require('../models/shopSession');
const { getTestsByShop } = require('../models/test');
const logger = require('../utils/logger');

const SHOPIFY_API_VERSION = '2024-01';

/**
 * Fetch product by ID from Shopify Admin REST API
 */
async function fetchProductFromShopify(shopDomain, accessToken, productId) {
  const shop = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products/${productId}.json`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  return data?.product ?? null;
}

/**
 * Process a single product-sync job: fetch product, log, optionally reconcile price tests
 */
async function processProductSyncJob(job) {
  const { shop, productId } = job.data;
  if (!shop || !productId) {
    logger.warn('Product sync job missing shop or productId', { data: job.data });
    return;
  }

  const session = await getShopSession(shop);
  if (!session?.access_token) {
    logger.warn('Product sync skipped: no shop session', { shop, productId });
    return;
  }

  const product = await fetchProductFromShopify(shop, session.access_token, productId);
  if (!product) {
    logger.warn('Product sync: product not found', { shop, productId });
    return;
  }

  const tests = await getTestsByShop(shop, 'running');
  const affected = tests.filter(
    t =>
      t.type === 'price' &&
      (t.target_type === 'product' || t.target_type === 'all-products') &&
      (t.target_id === String(productId) || !t.target_id)
  );

  logger.info('Product sync completed', {
    shop,
    productId,
    productTitle: product.title,
    variantCount: product.variants?.length ?? 0,
    affectedTestIds: affected.map(t => t.id),
  });

  // Optional: reconcile variant config prices from product.variants[].price
  // (e.g. update test variants so displayed price matches catalog after merchant edit)
  // Deferred: would require updateTest variant config merge; log only for now.
}

function startProductSyncProcessor() {
  const { productSyncQueue } = require('./queue');
  if (!productSyncQueue) {
    return;
  }
  productSyncQueue.process(async job => {
    await processProductSyncJob(job);
  });
  logger.info('Product sync processor started');
}

module.exports = {
  processProductSyncJob,
  startProductSyncProcessor,
  fetchProductFromShopify,
};
