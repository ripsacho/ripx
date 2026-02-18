/**
 * Session Store Configuration
 *
 * Env-driven session storage: memory fallback, Redis when REDIS_URL is set.
 * In development, always uses memory to avoid Redis connection errors.
 */

const logger = require('../utils/logger');

let storeInstance = null;

/**
 * Create session store based on environment
 * @returns {Object|null} Express-session store or null for default MemoryStore
 */
function createSessionStore() {
  if (storeInstance) {
    return storeInstance;
  }

  const redisUrl = process.env.REDIS_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  // In development, use memory store (avoids Redis connection errors when Redis isn't running)
  if (!isProduction) {
    logger.info('Session store: using memory (development)');
    storeInstance = null;
    return storeInstance;
  }

  if (redisUrl) {
    try {
      const RedisStore = require('connect-redis').default || require('connect-redis');
      const { createClient } = require('redis');
      const redisClient = createClient({ url: redisUrl });
      redisClient.connect().catch(err => {
        logger.error('Redis connection failed, session store may not work', { error: err.message });
      });
      storeInstance = new RedisStore({ client: redisClient });
      logger.info('Session store: using Redis');
    } catch (err) {
      logger.warn('connect-redis not available, using memory store', { error: err.message });
      storeInstance = null;
    }
  } else {
    logger.info('Session store: using memory (set REDIS_URL for production persistence)');
    storeInstance = null;
  }

  return storeInstance;
}

module.exports = { createSessionStore };
