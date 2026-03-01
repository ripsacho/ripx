/**
 * Stricter rate limit for high-risk admin actions (impersonate, set role).
 * Applied per-route in adminRoutes; keyed by IP. Configurable via env.
 */

const rateLimit = require('express-rate-limit');
const { RATE_LIMIT } = require('../constants');

const windowMs = RATE_LIMIT.WINDOW_MS;
const max = parseInt(process.env.RATE_LIMIT_SENSITIVE_ADMIN_MAX, 10) || 10;

const sensitiveAdminLimiter = rateLimit({
  windowMs,
  max,
  message: {
    success: false,
    error: 'Too many sensitive admin actions. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { sensitiveAdminLimiter };
