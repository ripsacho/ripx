/**
 * User Domain Access Model
 *
 * Many-to-many: which standalone users can access which tenants (domains).
 * Used for domain list and "permitted users" per domain.
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

const ROLES = ['owner', 'member', 'viewer'];

/**
 * Add access: user can access tenant with given role
 */
async function addAccess(userId, tenantId, role = 'member') {
  if (!userId || !tenantId) {
    return null;
  }
  const r = ROLES.includes(role) ? role : 'member';
  try {
    const result = await query(
      `INSERT INTO user_domain_access (user_id, tenant_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = $3, updated_at = NOW()
       RETURNING id, user_id, tenant_id, role, created_at`,
      [userId, tenantId, r]
    );
    return result.rows[0] || null;
  } catch (err) {
    logger.error('user_domain_access add failed', { userId, tenantId, error: err.message });
    return null;
  }
}

/**
 * Remove access
 */
async function removeAccess(userId, tenantId) {
  if (!userId || !tenantId) {
    return false;
  }
  const result = await query(
    'DELETE FROM user_domain_access WHERE user_id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );
  return result.rowCount > 0;
}

/**
 * List tenant IDs the user can access (via account or explicit access)
 */
async function getTenantIdsForUser(userId, accountId) {
  if (!userId && !accountId) {
    return [];
  }
  const tenantIds = new Set();

  if (accountId) {
    const acc = await query('SELECT id FROM tenants WHERE account_id = $1', [accountId]);
    acc.rows.forEach(r => tenantIds.add(r.id));
  }

  if (userId) {
    const ua = await query('SELECT tenant_id FROM user_domain_access WHERE user_id = $1', [userId]);
    ua.rows.forEach(r => tenantIds.add(r.tenant_id));
  }

  return Array.from(tenantIds);
}

/**
 * List users with access to a tenant (permitted users). Email-only identity.
 */
async function getUsersForTenant(tenantId) {
  if (!tenantId) {
    return [];
  }
  try {
    const result = await query(
      `SELECT uda.role, u.email
       FROM user_domain_access uda
       JOIN users u ON u.id = uda.user_id
       WHERE uda.tenant_id = $1
       ORDER BY uda.role = 'owner' DESC, u.email ASC`,
      [tenantId]
    );
    return result.rows.map(r => ({
      email: r.email || null,
      role: r.role,
    }));
  } catch (err) {
    if (err.message && err.message.includes('does not exist')) {
      return [];
    }
    logger.error('getUsersForTenant failed', { tenantId, error: err.message });
    return [];
  }
}

/**
 * Check if user has access to tenant (by user_id and tenant_id, or via account)
 */
async function hasAccess(userId, tenantId, accountId) {
  if (!tenantId) {
    return false;
  }
  if (accountId) {
    const t = await query('SELECT id FROM tenants WHERE id = $1 AND account_id = $2', [
      tenantId,
      accountId,
    ]);
    if (t.rows.length > 0) {
      return true;
    }
  }
  if (!userId) {
    return false;
  }
  const ua = await query('SELECT 1 FROM user_domain_access WHERE user_id = $1 AND tenant_id = $2', [
    userId,
    tenantId,
  ]);
  return ua.rows.length > 0;
}

/**
 * Get role for user on tenant (owner/member/viewer or null)
 */
async function getRole(userId, tenantId) {
  if (!userId || !tenantId) {
    return null;
  }
  const result = await query(
    'SELECT role FROM user_domain_access WHERE user_id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );
  return result.rows[0]?.role || null;
}

module.exports = {
  addAccess,
  removeAccess,
  getTenantIdsForUser,
  getUsersForTenant,
  hasAccess,
  getRole,
  ROLES,
};
