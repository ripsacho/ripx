const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const CONFIRMATION_TTL_SECONDS = 10 * 60;

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashArgs(args) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(args || {}))
    .digest('hex');
}

function getSecret() {
  const secret = process.env.SUPPORT_AGENT_CONFIRMATION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('Support agent confirmation secret is not configured');
  }
  return secret;
}

function createConfirmationToken({ action, args, req, risk = 'low_write' }) {
  const payload = {
    ripxtype: 'support_agent_action',
    action,
    risk,
    args: args || {},
    args_hash: hashArgs(args || {}),
    user_id: req.userId || null,
    email: req.email || null,
    shop_domain: req.shopDomain || null,
  };
  return jwt.sign(payload, getSecret(), { expiresIn: CONFIRMATION_TTL_SECONDS });
}

function verifyConfirmationToken(token, req) {
  const payload = jwt.verify(String(token || ''), getSecret());
  if (payload?.ripxtype !== 'support_agent_action') {
    throw new Error('Invalid support agent confirmation token');
  }
  if ((payload.user_id || null) !== (req.userId || null)) {
    throw new Error('Confirmation token user mismatch');
  }
  if ((payload.shop_domain || null) !== (req.shopDomain || null)) {
    throw new Error('Confirmation token store mismatch');
  }
  if (payload.args_hash !== hashArgs(payload.args || {})) {
    throw new Error('Confirmation token payload mismatch');
  }
  return payload;
}

module.exports = {
  CONFIRMATION_TTL_SECONDS,
  createConfirmationToken,
  verifyConfirmationToken,
  hashArgs,
};
