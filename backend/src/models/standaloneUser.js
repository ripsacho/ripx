/**
 * Standalone User Model (email-only users table)
 *
 * Pending/accept/reject and account-ensure flows. After migration 038, all users are email-identified;
 * no auth_type. This module handles create (pending), accept, reject, getPending, listAll, ensureAccountForUser.
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

const USERS_TABLE = 'users';

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
      `SELECT id, email, status, email_verified_at, accepted_at, accepted_by, account_id, primary_domain_id, primary_domain, token_version, created_at, updated_at
       FROM ${USERS_TABLE} WHERE LOWER(TRIM(email)) = $1`,
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

async function getById(id) {
  if (!id) {
    return null;
  }
  try {
    const result = await query(
      `SELECT id, email, status, email_verified_at, accepted_at, accepted_by, account_id, primary_domain_id, primary_domain, token_version, created_at, updated_at
       FROM ${USERS_TABLE} WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return null;
    }
    throw err;
  }
}

async function setAccountId(userId, accountId) {
  if (!userId || !accountId) {
    return false;
  }
  const result = await query(
    `UPDATE ${USERS_TABLE} SET account_id = $2, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [userId, accountId]
  );
  return result.rowCount > 0;
}

/**
 * Ensure user has an account; create one and set account_id if missing. Returns { accountId, apiKey } (apiKey only on create).
 */
async function ensureAccountForUser(userId) {
  const user = await getById(userId);
  if (!user) {
    return null;
  }
  if (user.account_id) {
    return { accountId: user.account_id, apiKey: null };
  }
  const { createAccount } = require('./account');
  const { account, apiKey } = await createAccount(user.email || 'My Account');
  await setAccountId(userId, account.id);
  logger.info('Account created for standalone user', { userId, accountId: account.id });
  return { accountId: account.id, apiKey };
}

async function incrementTokenVersion(userId) {
  if (!userId) {
    return false;
  }
  const result = await query(
    `UPDATE ${USERS_TABLE} SET token_version = COALESCE(token_version, 0) + 1, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [userId]
  );
  return result.rowCount > 0;
}

async function create(email) {
  const e = normalizeEmail(email);
  if (!e) {
    return null;
  }
  try {
    const existing = await getByEmail(e);
    if (existing) {
      await query(`UPDATE ${USERS_TABLE} SET updated_at = NOW() WHERE id = $1`, [existing.id]);
      return existing;
    }
    const result = await query(
      `INSERT INTO ${USERS_TABLE} (email, status) VALUES ($1, 'pending')
       RETURNING id, email, status, email_verified_at, created_at`,
      [e]
    );
    return result.rows[0] || null;
  } catch (err) {
    if (err.code === '23505') {
      const existing = await getByEmail(e);
      if (existing) {
        await query(`UPDATE ${USERS_TABLE} SET updated_at = NOW() WHERE id = $1`, [existing.id]);
        return existing;
      }
    }
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
    `UPDATE ${USERS_TABLE} SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE LOWER(TRIM(email)) = $1 RETURNING id`,
    [e]
  );
  return result.rowCount > 0;
}

async function getPending() {
  try {
    const result = await query(
      `SELECT id, email, status, email_verified_at, created_at FROM ${USERS_TABLE} WHERE status = 'pending' ORDER BY created_at DESC`,
      []
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
    `UPDATE ${USERS_TABLE} SET status = 'accepted', accepted_at = NOW(), accepted_by = $2, updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id`,
    [id, acceptedBy || null]
  );
  return result.rows[0] || null;
}

async function reject(id, rejectedBy) {
  const result = await query(
    `UPDATE ${USERS_TABLE} SET status = 'rejected', accepted_at = NULL, accepted_by = $2, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [id, rejectedBy || null]
  );
  return result.rows[0] || null;
}

async function listAcceptedEmails() {
  try {
    const result = await query(
      `SELECT email FROM ${USERS_TABLE} WHERE status = 'accepted' AND email IS NOT NULL`,
      []
    );
    return result.rows.map(r => r.email);
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return [];
    }
    throw err;
  }
}

/**
 * List all standalone users with optional status filter, search, and pagination.
 * @param {Object} opts - { status?: 'pending'|'accepted'|'rejected', limit?: number, offset?: number, q?: string }
 * @returns {{ users: Array, total: number, limit: number, offset: number }}
 */
async function listAll(opts = {}) {
  const { status: statusFilter, limit = 50, offset = 0, q: search } = opts;
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

  const conditions = [];
  const params = [];
  let idx = 1;

  if (statusFilter && ['pending', 'accepted', 'rejected'].includes(statusFilter)) {
    conditions.push(`status = $${idx}`);
    params.push(statusFilter);
    idx++;
  }
  if (search && String(search).trim()) {
    const term = `%${String(search).trim().replace(/%/g, '\\%')}%`;
    conditions.push(`LOWER(TRIM(email)) LIKE LOWER($${idx})`);
    params.push(term);
    idx++;
  }

  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countSql = `SELECT COUNT(*)::int AS c FROM ${USERS_TABLE}${where}`;
    const countRes = await query(countSql, params);
    const total = countRes.rows[0]?.c ?? 0;

    const sql = `
      SELECT id, email, status, email_verified_at, accepted_at, accepted_by, account_id, primary_domain_id, primary_domain, created_at, updated_at
      FROM ${USERS_TABLE}
      ${where}
      ORDER BY created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limitNum, offsetNum);
    const result = await query(sql, params);
    const users = result.rows.map(r => ({
      id: r.id,
      email: r.email,
      status: r.status,
      emailVerifiedAt: r.email_verified_at,
      acceptedAt: r.accepted_at,
      acceptedBy: r.accepted_by,
      accountId: r.account_id,
      primaryDomainId: r.primary_domain_id,
      primaryDomain: r.primary_domain,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return { users, total, limit: limitNum, offset: offsetNum };
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return { users: [], total: 0, limit: limitNum, offset: offsetNum };
    }
    throw err;
  }
}

module.exports = {
  getByEmail,
  getById,
  create,
  setEmailVerified,
  setAccountId,
  ensureAccountForUser,
  incrementTokenVersion,
  getPending,
  accept,
  reject,
  listAcceptedEmails,
  listAll,
  normalizeEmail,
};
