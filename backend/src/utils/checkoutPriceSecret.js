/**
 * Timing-safe comparison for RIPX_CHECKOUT_PRICE_SECRET vs client-provided values.
 * Reduces risk of byte-at-a-time guessing when the secret is misconfigured or short.
 * (Still use a long random secret in production.)
 */

const crypto = require('crypto');

/**
 * @param {string} expected - configured secret (already trimmed by caller)
 * @param {string} provided - from query, body, or header (trimmed by caller)
 * @returns {boolean}
 */
function checkoutPriceSecretsMatch(expected, provided) {
  const e = String(expected ?? '');
  const p = String(provided ?? '');
  if (!e || !p) {
    return false;
  }
  try {
    const bufE = Buffer.from(e, 'utf8');
    const bufP = Buffer.from(p, 'utf8');
    if (bufE.length !== bufP.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufE, bufP);
  } catch {
    return false;
  }
}

module.exports = {
  checkoutPriceSecretsMatch,
};
