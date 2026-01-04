/**
 * Error Handler Middleware
 *
 * Centralized error handling for Express application
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
function errorHandler(err, req, res, next) {
  // Log error for debugging
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    statusCode: err.status || err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR
  });

  // Default error status and message
  const status = err.status || err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  const message = err.message || ERROR_MESSAGES.INTERNAL_ERROR;

  // Send error response
  const response = {
    success: false,
    error: message
  };

  // Include more details in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
    response.details = {
      message: err.message,
      name: err.name,
      code: err.code,
      ...(err.detail && { detail: err.detail }),
      ...(err.hint && { hint: err.hint }),
      ...(err.where && { where: err.where })
    };
  }

  res.status(status).json(response);
}

module.exports = {
  errorHandler
};

