/**
 * Admin permission registry – single source of truth for platform admin abilities.
 *
 * Uses resource:action naming (e.g. admin:users:set_role). Roles are mapped to
 * permissions; superadmin inherits all admin permissions plus sensitive ones.
 * Backend enforces via requirePermission(); frontend uses the list returned
 * by GET /admin/me to show/hide UI (never trust frontend for security).
 *
 * PERMISSION_META: risk level and description for audit, rate-limiting, and docs.
 * SENSITIVE_PERMISSIONS: subset that may get stricter rate limits (see sensitiveAdminLimiter).
 */

const { PLATFORM_ROLES } = require('./constants');

// ─── Permission constants (use these in routes and frontend) ───
const PERMISSIONS = Object.freeze({
  // Base: access admin panel and read-only operations
  ADMIN_VIEW: 'admin:view',
  // User management – sensitive
  USERS_SET_ROLE: 'admin:users:set_role',
  USERS_LOCK: 'admin:users:lock',
  USERS_EXPORT: 'admin:users:export',
  // Email delivery – send test message to an arbitrary address (admin+ only)
  MAIL_TEST_SEND: 'admin:mail:test_send',
  // Impersonation – high privilege
  IMPERSONATE: 'admin:impersonate',
  // Optional future: admin:audit:export, admin:domains:suspend, etc.
});

/** Risk level for optional stricter rate limit and audit; 'high' = apply sensitiveAdminLimiter */
const PERMISSION_META = Object.freeze({
  [PERMISSIONS.ADMIN_VIEW]: { riskLevel: 'normal', description: 'Access admin panel' },
  [PERMISSIONS.USERS_LOCK]: { riskLevel: 'normal', description: 'Lock/unlock user accounts' },
  [PERMISSIONS.USERS_EXPORT]: { riskLevel: 'normal', description: 'Export user data (GDPR)' },
  [PERMISSIONS.MAIL_TEST_SEND]: {
    riskLevel: 'normal',
    description: 'Send SMTP test email from admin Email delivery',
  },
  [PERMISSIONS.USERS_SET_ROLE]: { riskLevel: 'high', description: 'Set platform role on a user' },
  [PERMISSIONS.IMPERSONATE]: { riskLevel: 'high', description: 'Issue impersonation JWT' },
});

/** Permissions that use stricter rate limit (see middleware/sensitiveAdminLimiter) */
const SENSITIVE_PERMISSIONS = Object.freeze(
  Object.entries(PERMISSION_META)
    .filter(([, meta]) => meta.riskLevel === 'high')
    .map(([perm]) => perm)
);

// Role → permissions: collaborator (view only), admin (user mgmt), superadmin (full)
const ROLE_PERMISSIONS = Object.freeze({
  [PLATFORM_ROLES.COLLABORATOR]: [PERMISSIONS.ADMIN_VIEW],
  [PLATFORM_ROLES.ADMIN]: [
    PERMISSIONS.ADMIN_VIEW,
    PERMISSIONS.USERS_SET_ROLE,
    PERMISSIONS.USERS_LOCK,
    PERMISSIONS.USERS_EXPORT,
    PERMISSIONS.MAIL_TEST_SEND,
  ],
  [PLATFORM_ROLES.SUPERADMIN]: [
    PERMISSIONS.ADMIN_VIEW,
    PERMISSIONS.USERS_SET_ROLE,
    PERMISSIONS.USERS_LOCK,
    PERMISSIONS.USERS_EXPORT,
    PERMISSIONS.MAIL_TEST_SEND,
    PERMISSIONS.IMPERSONATE,
  ],
});

/**
 * Get the set of permission strings for a role (normalized to lowercase).
 * Returns empty array for unknown or null role.
 */
function getPermissionsForRole(role) {
  if (!role || typeof role !== 'string') {
    return [];
  }
  const normalized = role.trim().toLowerCase();
  const list = ROLE_PERMISSIONS[normalized];
  return list ? [...list] : [];
}

/**
 * Check if a role has a given permission.
 */
function hasPermission(role, permission) {
  if (!permission) {
    return false;
  }
  const perms = getPermissionsForRole(role);
  return perms.includes(permission);
}

/** All permission string values (for validation) */
const PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS));

/**
 * Validate that a string is a known permission (catches typos in requirePermission calls).
 * @returns {boolean} true if permission is in PERMISSIONS
 */
function isValidPermission(permission) {
  return typeof permission === 'string' && PERMISSION_VALUES.includes(permission);
}

/**
 * Map of admin route patterns to required permission (for docs and tooling).
 * Enforced in adminRoutes.js via requirePermission().
 */
const ROUTE_PERMISSION_MAP = Object.freeze({
  'POST /api/admin/impersonate': PERMISSIONS.IMPERSONATE,
  'PUT /api/admin/users/:shopDomain/role': PERMISSIONS.USERS_SET_ROLE,
  'PUT /api/admin/users/:shopDomain/lock': PERMISSIONS.USERS_LOCK,
  'PUT /api/admin/users/:shopDomain/unlock': PERMISSIONS.USERS_LOCK,
  'GET /api/admin/users/export': PERMISSIONS.USERS_EXPORT,
  'GET /api/admin/users/:shopDomain/export': PERMISSIONS.USERS_EXPORT,
  'POST /api/admin/mail-test-send': PERMISSIONS.MAIL_TEST_SEND,
});

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROUTE_PERMISSION_MAP,
  PERMISSION_META,
  SENSITIVE_PERMISSIONS,
  PERMISSION_VALUES,
  getPermissionsForRole,
  hasPermission,
  isValidPermission,
};
