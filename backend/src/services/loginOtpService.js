/**
 * Login OTP service – 6-digit code for accepted users, 1 min expiry, 3 sends per 15 min per email.
 */

const crypto = require('crypto');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

const OTP_EXPIRY_MINUTES = 1;
const RATE_LIMIT_WINDOW_MINUTES = 15;
const MAX_SENDS_PER_WINDOW = 3;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code).trim(), 'utf8').digest('hex');
}

/**
 * Count how many OTP codes were created for this email in the last 15 minutes.
 */
async function countSendsInWindow(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) {
    return 0;
  }
  try {
    const result = await query(
      `SELECT COUNT(*) AS cnt FROM login_otp_codes
       WHERE email = $1 AND created_at > NOW() - INTERVAL '${RATE_LIMIT_WINDOW_MINUTES} minutes'`,
      [normalized]
    );
    return parseInt(result.rows[0]?.cnt || 0, 10);
  } catch (err) {
    logger.error('Login OTP count failed', { error: err.message });
    return MAX_SENDS_PER_WINDOW;
  }
}

/**
 * Create a 6-digit OTP and store its hash. Returns { code, expiresAt } or null if rate limited.
 */
async function createCode(email) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  const count = await countSendsInWindow(normalized);
  if (count >= MAX_SENDS_PER_WINDOW) {
    return { rateLimited: true, retryAfterMinutes: RATE_LIMIT_WINDOW_MINUTES };
  }
  const code = String(crypto.randomInt(100000, 999999));
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  try {
    await query('INSERT INTO login_otp_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)', [
      normalized,
      codeHash,
      expiresAt,
    ]);
    return { code, expiresAt };
  } catch (err) {
    logger.error('Login OTP create failed', {
      email: normalized?.substring(0, 3),
      error: err.message,
    });
    return null;
  }
}

/**
 * Consume a 6-digit code. Returns { email } if valid, null otherwise.
 */
async function consumeCode(email, code) {
  const normalized = (email || '').trim().toLowerCase();
  const trimmedCode = String(code || '')
    .trim()
    .replace(/\D/g, '');
  if (!normalized || trimmedCode.length !== 6) {
    return null;
  }
  const codeHash = hashCode(trimmedCode);
  try {
    const result = await query(
      `SELECT id, email, expires_at, used_at FROM login_otp_codes
       WHERE email = $1 AND code_hash = $2`,
      [normalized, codeHash]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    if (row.used_at) {
      return null;
    }
    if (new Date(row.expires_at) < new Date()) {
      return null;
    }
    await query('UPDATE login_otp_codes SET used_at = NOW() WHERE id = $1', [row.id]);
    return { email: row.email };
  } catch (err) {
    logger.error('Login OTP consume failed', { error: err.message });
    return null;
  }
}

module.exports = {
  createCode,
  consumeCode,
  countSendsInWindow,
  OTP_EXPIRY_MINUTES,
  RATE_LIMIT_WINDOW_MINUTES,
  MAX_SENDS_PER_WINDOW,
};
