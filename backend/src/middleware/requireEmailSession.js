/**
 * Require email session (passwordless login) for /api/me/* routes.
 * Must be used after authenticate so that tryEmailSessionToken has run.
 */

const { sendUnauthorized } = require('../utils/response');

function requireEmailSession(req, res, next) {
  if (req.authType === 'email' && req.email) {
    return next();
  }
  return sendUnauthorized(res, 'Email session required. Sign in with your email link first.');
}

module.exports = { requireEmailSession };
