/**
 * Domain-level role check (optional middleware)
 *
 * Use when a route is scoped to a tenant and you need to enforce
 * user_domain_access.role (owner | member | viewer). Call ensureDomainAccess
 * from route handlers when you have userId, tenantId, and optional accountId
 * (account owners have implicit access to their tenants).
 *
 * DOMAIN_ROLE_WRITE = ['owner', 'member'] – can create/edit/delete tests, settings.
 * DOMAIN_ROLE_READ_ONLY = ['viewer'] – read-only access.
 */

const userDomainAccess = require('../models/userDomainAccess');
const { DOMAIN_ROLES, DOMAIN_ROLE_WRITE } = require('../constants');

const ROLE_ORDER = { owner: 3, member: 2, viewer: 1 };

function roleLevel(role) {
  return role && ROLE_ORDER[role] ? ROLE_ORDER[role] : 0;
}

/**
 * Minimum role required to pass (e.g. 'member' allows owner and member).
 * @param {string} minRole - 'owner' | 'member' | 'viewer'
 * @returns {boolean} true if userRole meets or exceeds minRole
 */
function hasMinimumRole(userRole, minRole) {
  if (!minRole || !DOMAIN_ROLES.includes(minRole)) {
    return false;
  }
  return roleLevel(userRole) >= roleLevel(minRole);
}

/**
 * Check if user can write (create/update/delete) on the tenant.
 * @param {string} userRole - from user_domain_access or implicit (account owner)
 */
function canWrite(userRole) {
  return userRole && DOMAIN_ROLE_WRITE.includes(userRole);
}

/**
 * Ensure the user has at least the given role on the tenant.
 * Resolves user role from user_domain_access; if user owns the account (tenant.account_id === user.account_id), treat as 'owner'.
 *
 * @param {Object} params
 * @param {string} params.userId - users.id
 * @param {string} params.tenantId - tenants.id
 * @param {string} [params.accountId] - user's account_id (if tenant belongs to this account, user is owner)
 * @param {string} params.minRole - 'owner' | 'member' | 'viewer'
 * @returns {Promise<{ allowed: boolean, role?: string }>}
 */
async function ensureDomainAccess({ userId, tenantId, accountId, minRole }) {
  let role = null;
  if (userId && tenantId) {
    role = await userDomainAccess.getRole(userId, tenantId);
  }
  if (!role && accountId && tenantId) {
    const { query } = require('../utils/database');
    const t = await query('SELECT account_id FROM tenants WHERE id = $1', [tenantId]);
    if (t.rows[0] && t.rows[0].account_id === accountId) {
      role = 'owner'; // account owner has full access to their tenants
    }
  }
  const allowed = hasMinimumRole(role, minRole);
  return { allowed, role: role || undefined };
}

module.exports = {
  hasMinimumRole,
  canWrite,
  ensureDomainAccess,
  ROLE_ORDER,
};
