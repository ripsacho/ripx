/**
 * Bull Queue for background jobs
 *
 * Queues are only created when REDIS_URL is set. Without Redis, queues are null
 * and scheduled/archive jobs are skipped (dev-friendly).
 */

const Queue = require('bull');
const logger = require('../utils/logger');

const redisUrl = process.env.REDIS_URL;

function createQueue(name, opts = {}) {
  if (!redisUrl) {
    return null;
  }

  try {
    const queue = new Queue(name, redisUrl, {
      defaultJobOptions: {
        removeOnComplete: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
      ...opts,
    });
    queue.on('error', err => {
      const msg = err?.message || err?.toString?.() || String(err);
      logger.error(`Queue ${name} error`, { error: msg || 'Redis connection failed' });
    });
    return queue;
  } catch (err) {
    logger.warn(`Bull queue ${name} unavailable`, { error: err?.message || err?.toString?.() });
    return null;
  }
}

const scheduledTestsQueue = createQueue('scheduled-tests');
const archiveQueue = createQueue('archive-old-tests');
const productSyncQueue = createQueue('product-sync');

module.exports = {
  scheduledTestsQueue,
  archiveQueue,
  productSyncQueue,
};
