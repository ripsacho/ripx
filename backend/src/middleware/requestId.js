/**
 * Request ID Middleware
 *
 * Attaches a unique request ID to each request for distributed tracing and log correlation.
 * ID is available as req.id and in X-Request-ID response header.
 */

const crypto = require('crypto');

/**
 * Generate a short unique request ID
 * @returns {string}
 */
function generateRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Middleware that attaches req.id for request correlation
 */
function requestIdMiddleware(req, res, next) {
  const id = req.get('X-Request-ID') || generateRequestId();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = { requestIdMiddleware, generateRequestId };
