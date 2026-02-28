/**
 * Standalone User Model
 *
 * Email-based users; must be accepted by admin before login (except RIPX_ADMIN_EMAIL).
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  return email.trim().toLowerCase();
}

async function getByEmail(email) {
  const e = normalizeEmail(email);
  if (!e) {
    return null;
  }
  try {
    const result = await query(
      'SELECT id, email, status, email_verified_at, accepted_at, accepted_by, created_at, updated_at FROM standalone_users WHERE email = $1',
      [e]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return null;
    }
    throw err;
  }
}

async function create(email) {
  const e = normalizeEmail(email);
  if (!e) {
    return null;
  }
  try {
    const result = await query(
      `INSERT INTO standalone_users (email, status) VALUES ($1, 'pending')
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW() RETURNING id, email, status, email_verified_at, created_at`,
      [e]
    );
    return result.rows[0] || null;
  } catch (err) {
    logger.error('Standalone user create failed', {
      email: e?.substring(0, 5),
      error: err.message,
    });
    return null;
  }
}

async function setEmailVerified(email) {
  const e = normalizeEmail(email);
  if (!e) {
    return false;
  }
  const result = await query(
    'UPDATE standalone_users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE email = $1 RETURNING id',
    [e]
  );
  return result.rowCount > 0;
}

async function getPending() {
  try {
    const result = await query(
      "SELECT id, email, status, email_verified_at, created_at FROM standalone_users WHERE status = 'pending' ORDER BY created_at DESC"
    );
    return result.rows;
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

async function accept(id, acceptedBy) {
  const result = await query(
    "UPDATE standalone_users SET status = 'accepted', accepted_at = NOW(), accepted_by = $2, updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id",
    [id, acceptedBy || null]
  );
  return result.rows[0] || null;
}

async function reject(id, rejectedBy) {
  const result = await query(
    "UPDATE standalone_users SET status = 'rejected', accepted_at = NULL, accepted_by = $2, updated_at = NOW() WHERE id = $1 RETURNING id",
    [id, rejectedBy || null]
  );
  return result.rows[0] || null;
}

async function listAcceptedEmails() {
  try {
    const result = await query(
      "SELECT email FROM standalone_users WHERE status = 'accepted' AND email IS NOT NULL"
    );
    return result.rows.map(r => r.email);
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

module.exports = {
  getByEmail,
  create,
  setEmailVerified,
  getPending,
  accept,
  reject,
  listAcceptedEmails,
  normalizeEmail,
};
