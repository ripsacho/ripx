/**
 * Email verification (magic-link) service
 *
 * Creates and validates one-time tokens for passwordless login and re-verification.
 * Token is stored as SHA-256 hash; plain token sent in link (5–15 min expiry).
 * See FUTURE_IMPLEMENTATION_PLAN.md § Email token login and re-verification.
 */

const crypto = require('crypto');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_MINUTES = 15;
const PURPOSES = ['login', 'reverify', 'api_key_reissue', 'confirm_registration'];

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function isValidEmail(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Create a verification token and store its hash.
 * @param {string} email
 * @param {string} purpose - 'login' | 'reverify' | 'api_key_reissue'
 * @param {number} [expiryMinutes]
 * @returns {{ token: string, expiresAt: Date } | null}
 */
async function createToken(email, purpose = 'login', expiryMinutes = DEFAULT_EXPIRY_MINUTES) {
  if (!isValidEmail(email) || !PURPOSES.includes(purpose)) {
    return null;
  }

  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  try {
    await query(
      `INSERT INTO email_verification_tokens (token_hash, email, purpose, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [tokenHash, email.trim().toLowerCase(), purpose, expiresAt]
    );
    return { token, expiresAt };
  } catch (err) {
    logger.error('Email verification token create failed', {
      email: email?.substring(0, 3),
      purpose,
      error: err.message,
    });
    return null;
  }
}

/**
 * Consume a token (single-use). Returns email and purpose if valid.
 * @param {string} plainToken
 * @returns {Promise<{ email: string, purpose: string } | null>}
 */
async function consumeToken(plainToken) {
  if (!plainToken || typeof plainToken !== 'string' || plainToken.length < 16) {
    return null;
  }

  const tokenHash = hashToken(plainToken.trim());

  try {
    const result = await query(
      `SELECT id, email, purpose, expires_at, used_at
       FROM email_verification_tokens
       WHERE token_hash = $1`,
      [tokenHash]
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

    await query('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1', [row.id]);

    return { email: row.email, purpose: row.purpose };
  } catch (err) {
    logger.error('Email verification token consume failed', { error: err.message });
    return null;
  }
}

/**
 * Send magic-link or confirmation email. When RIPX_EMAIL_VERIFICATION_STUB is true
 * or no provider is set, logs only and returns true. On send failure or throw, returns false.
 * @param {string} email - Recipient email
 * @param {string} link - One-time verification link
 * @param {string} purpose - 'confirm_registration' | 'login' (from PURPOSES)
 * @returns {Promise<boolean>} true if sent or skipped (stub/no SMTP), false on failure
 */
const emailService = require('./emailService');

async function sendVerificationEmail(email, link, purpose) {
  const stub = process.env.RIPX_EMAIL_VERIFICATION_STUB === 'true';
  if (stub) {
    logger.info('Email verification (stub)', {
      email: email?.substring(0, 5) + '…',
      purpose,
      link: link?.substring(0, 50) + '…',
    });
    return true;
  }
  if (emailService.isConfigured()) {
    try {
      if (purpose === 'confirm_registration') {
        return await emailService.sendConfirmationLink(email, link, 60);
      }
      return await emailService.sendLoginLink(email, link, 15);
    } catch (err) {
      logger.error('Send verification email failed', {
        email: email?.substring(0, 6) + '…',
        purpose,
        error: err.message,
      });
      return false;
    }
  }
  logger.info('Email verification (no SMTP)', { email: email?.substring(0, 5) + '…', purpose });
  return true;
}

module.exports = {
  createToken,
  consumeToken,
  sendVerificationEmail,
  isValidEmail,
  PURPOSES,
};
