/**
 * Error Handler Middleware
 *
 * Centralized error handling for Express application.
 * Enriched with request context for debugging and optional external reporting.
 */

const logger = require('../utils/logger');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');

/**
 * Error handler middleware
 * Must be used as the last middleware in the Express app
 *
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(err, req, res, _next) {
  const statusCode = err.status || err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // Enriched structured log for debugging and monitoring
  logger.error('Request error', {
    requestId: req.id,
    error: err.message,
    name: err.name,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode,
    shopDomain: req.shopDomain || req.get?.('X-Shopify-Shop-Domain'),
    // Optional: Sentry.captureException(err) when SENTRY_DSN is set
    ...(process.env.SENTRY_DSN && { sentryHint: 'configure SENTRY_DSN for external reporting' }),
  });

  // Default error status and message
  const status = statusCode;
  const message = err.message || ERROR_MESSAGES.INTERNAL_ERROR;

  // Send error response
  const response = {
    success: false,
    error: message,
    ...(req.id && { requestId: req.id }),
  };

  // Never expose stack or internal details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (isDevelopment) {
    response.stack = err.stack;
    response.details = {
      message: err.message,
      name: err.name,
      code: err.code,
      ...(err.detail && { detail: err.detail }),
      ...(err.hint && { hint: err.hint }),
      ...(err.where && { where: err.where }),
    };
  }

  res.status(status).json(response);
}

module.exports = {
  errorHandler,
};
