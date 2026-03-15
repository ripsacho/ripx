/**
 * Session Store Configuration
 *
 * Env-driven session storage: memory fallback, Redis when REDIS_URL is set.
 * In development, always uses memory to avoid Redis connection errors.
 */

const logger = require('../utils/logger');

let storeInstance = null;
let storePromise = null;

/**
 * Create session store based on environment (sync).
 * When Redis is configured, the store is not ready until createSessionStoreAsync() has resolved.
 * @returns {Object|null} Express-session store or null for default MemoryStore
 */
function createSessionStore() {
  if (storeInstance !== null && storeInstance !== undefined) {
    return storeInstance;
  }

  const redisUrl = process.env.REDIS_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    logger.info('Session store: using memory (development)');
    storeInstance = null;
    return storeInstance;
  }

  if (!redisUrl) {
    logger.info('Session store: using memory (set REDIS_URL for production persistence)');
    storeInstance = null;
    return storeInstance;
  }

  // Redis path: sync call cannot return a ready store; use createSessionStoreAsync() for production Redis
  return null;
}

/**
 * Create session store asynchronously. Returns a promise that resolves when the store
 * is ready so session operations do not race with an unconnected client.
 * @returns {Promise<Object|null>} Resolves to Express-session store or null for MemoryStore
 */
function createSessionStoreAsync() {
  if (storePromise) {
    return storePromise;
  }

  const redisUrl = process.env.REDIS_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    logger.info('Session store: using memory (development)');
    storeInstance = null;
    storePromise = Promise.resolve(null);
    return storePromise;
  }

  if (!redisUrl) {
    logger.info('Session store: using memory (set REDIS_URL for production persistence)');
    storeInstance = null;
    storePromise = Promise.resolve(null);
    return storePromise;
  }

  storePromise = (async () => {
    try {
      const RedisStore = require('connect-redis').default || require('connect-redis');
      const { createClient } = require('redis');
      const redisClient = createClient({ url: redisUrl });
      await redisClient.connect();
      storeInstance = new RedisStore({ client: redisClient });
      logger.info('Session store: using Redis');
      return storeInstance;
    } catch (err) {
      logger.error('Redis session store failed, using memory fallback', { error: err.message });
      storeInstance = null;
      return null;
    }
  })();

  return storePromise;
}

module.exports = { createSessionStore, createSessionStoreAsync };
