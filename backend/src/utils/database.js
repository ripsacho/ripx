/**
 * Database Utility
 *
 * Database connection and query helpers
 * Supports both PostgreSQL and MongoDB
 */

const { Pool } = require('pg');

let pool = null;

/**
 * Initialize database connection
 */
function initDatabase() {
  if (process.env.DATABASE_URL) {
    // PostgreSQL
    const sslConfig = process.env.NODE_ENV === 'production' 
      ? {
          // In production, verify SSL certificates for security
          rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
          // Allow custom CA certificate if provided
          ...(process.env.DATABASE_SSL_CA && { ca: process.env.DATABASE_SSL_CA })
        }
      : false;

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      // Connection pool settings for production
      max: process.env.NODE_ENV === 'production' ? 20 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    pool.on('error', (err) => {
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
      example: 'DATABASE_URL=postgresql://username:password@localhost:5432/shopify_ab_testing'
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
    throw new Error('Database connection not initialized. Please set DATABASE_URL in your .env file.');
  }

  try {
    const startTime = Date.now();
    const result = await pool.query(sql, params);
    const duration = Date.now() - startTime;
    
    // Log slow queries in development
    if (process.env.NODE_ENV === 'development' && duration > 1000) {
      const logger = require('./logger');
      logger.warn('Slow query detected', {
        duration: `${duration}ms`,
        sql: sql.substring(0, 100)
      });
    }
    
    return result;
  } catch (error) {
    const logger = require('./logger');
    logger.error('Database query error', {
      error: error.message,
      code: error.code,
      sql: sql.substring(0, 100), // Log first 100 chars of SQL for debugging
      params: params.length > 0 ? `[${params.length} params]` : 'no params'
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
 * Get a database client for transactions
 *
 * @returns {Promise<Object>} Database client
 */
async function getClient() {
  if (!pool) {
    initDatabase();
  }
  return pool.connect();
}

// Initialize on module load
initDatabase();

module.exports = {
  query,
  getClient,
  initDatabase,
  closeDatabase
};

