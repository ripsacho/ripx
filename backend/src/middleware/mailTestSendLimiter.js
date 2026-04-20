/**
 * Rate limit for POST /api/admin/mail-test-send (arbitrary recipient — abuse protection).
 */

const rateLimit = require('express-rate-limit');
const { RATE_LIMIT } = require('../constants');

const mailTestSendLimiter = rateLimit({
  windowMs: RATE_LIMIT.WINDOW_MS,
  max: parseInt(process.env.RATE_LIMIT_MAIL_TEST_MAX, 10) || 8,
  message: {
    success: false,
    error: 'Too many test emails from this connection. Try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { mailTestSendLimiter };
