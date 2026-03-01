/**
 * Database Utility
 *
 * Database connection and query helpers
 * Supports both PostgreSQL and MongoDB
 */

const { Pool } = require('pg');

let pool = null;

function getPoolMax() {
  const env = process.env.DATABASE_POOL_MAX;
  if (env !== null && env !== undefined && env !== '') {
    const n = parseInt(env, 10);
    if (!Number.isNaN(n) && n >= 1) {
      return Math.min(n, 100);
    }
  }
  return process.env.NODE_ENV === 'production' ? 20 : 10;
}

/**
 * Initialize database connection
 */
function initDatabase() {
  if (process.env.DATABASE_URL) {
    // PostgreSQL
    const sslConfig =
      process.env.NODE_ENV === 'production'
        ? {
            // In production, verify SSL certificates for security
            rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
            // Allow custom CA certificate if provided
            ...(process.env.DATABASE_SSL_CA && { ca: process.env.DATABASE_SSL_CA }),
          }
        : false;

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: getPoolMax(),
      idleTimeoutMillis: parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT_MS, 10) || 30000,
      connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_CONNECT_TIMEOUT_MS, 10) || 2000,
    });

    pool.on('error', err => {
      const logger = require('./logger');
      logger.error('Unexpected error on idle database client', { error: err });
    });
  } else if (process.env.MONGODB_URI) {
    // MongoDB would be initialized here
    // const mongoose = require('mongoose');
    // mongoose.connect(process.env.MONGODB_URI);
  } else {
    // Provide helpful error message
    const logger = require('./logger');
    logger.error('DATABASE_URL environment variable is not set!', {
      message: 'Please set DATABASE_URL in your .env file.',
      example: 'DATABASE_URL=postgresql://username:password@localhost:5432/shopify_ab_testing',
    });
  }
}

/**
 * Execute a database query
 *
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(sql, params = []) {
  if (!pool) {
    initDatabase();
  }

  if (!pool) {
    throw new Error(
      'Database connection not initialized. Please set DATABASE_URL in your .env file.'
    );
  }

  try {
    const startTime = Date.now();
    const result = await pool.query(sql, params);
    const duration = Date.now() - startTime;

    const slowMs = parseInt(process.env.SLOW_QUERY_MS, 10) || 1000;
    const logSlowInProd = process.env.SLOW_QUERY_LOG_PROD === 'true';
    const shouldLog =
      duration > slowMs && (process.env.NODE_ENV === 'development' || logSlowInProd);
    if (shouldLog) {
      const logger = require('./logger');
      logger.warn('Slow query detected', {
        duration: `${duration}ms`,
        thresholdMs: slowMs,
        sql: sql.substring(0, 200),
      });
    }

    return result;
  } catch (error) {
    const logger = require('./logger');
    logger.error('Database query error', {
      error: error.message,
      code: error.code,
      sql: sql.substring(0, 100), // Log first 100 chars of SQL for debugging
      params: params.length > 0 ? `[${params.length} params]` : 'no params',
    });
    throw error;
  }
}

/**
 * Close database connections gracefully
 *
 * @returns {Promise<void>}
 */
async function closeDatabase() {
  if (pool) {
    try {
      await pool.end();
      pool = null;
      const logger = require('./logger');
      logger.info('Database connections closed');
    } catch (error) {
      const logger = require('./logger');
      logger.error('Error closing database connections', { error });
      throw error;
    }
  }
}

/**
 * Get a database client for transactions (caller must release with client.release())
 *
 * @returns {Promise<Object>} Database client
 */
async function getClient() {
  if (!pool) {
    initDatabase();
  }
  return pool.connect();
}

/**
 * Run a function inside a transaction (auto commit/rollback and release client).
 *
 * @param {Function} fn - async (client) => { ... } where client has client.query(), client.release()
 * @returns {Promise<*>} Result of fn
 */
async function withTransaction(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ping the database (for health checks). Resolves on success, rejects on failure.
 */
async function ping() {
  const result = await query('SELECT 1 AS ok');
  if (result.rows?.[0]?.ok !== 1) {
    throw new Error('Database ping failed');
  }
}

// Initialize on module load
initDatabase();

module.exports = {
  query,
  getClient,
  initDatabase,
  closeDatabase,
  withTransaction,
  ping,
};
