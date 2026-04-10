const rateLimit = require('express-rate-limit');
const { RATE_LIMIT } = require('../constants');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return (
    req.ip ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function normalizeEmailFromRequest(req) {
  const raw = req.body?.email ?? req.query?.email ?? '';
  if (raw === null || raw === undefined) {
    return '';
  }
  return String(raw).trim().toLowerCase();
}

function createAuthLimiter({ max, message, keyGenerator }) {
  return rateLimit({
    windowMs: RATE_LIMIT.WINDOW_MS,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
  });
}

const authIpLimiter = createAuthLimiter({
  max: parseInt(process.env.RATE_LIMIT_AUTH_SENSITIVE_IP_MAX, 10) || 40,
  message: 'Too many auth attempts from this IP. Please try again later.',
  keyGenerator: req => `ip:${getClientIp(req)}`,
});

const authEmailLimiter = createAuthLimiter({
  max: parseInt(process.env.RATE_LIMIT_AUTH_SENSITIVE_EMAIL_MAX, 10) || 12,
  message: 'Too many auth attempts for this email. Please try again later.',
  keyGenerator: req => {
    const email = normalizeEmailFromRequest(req);
    if (!email) {
      return `email:missing:${getClientIp(req)}`;
    }
    return `email:${email}`;
  },
});

module.exports = {
  authIpLimiter,
  authEmailLimiter,
};
