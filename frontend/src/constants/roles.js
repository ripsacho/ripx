/**
 * Role constants – align with backend PLATFORM_ROLES and domain roles.
 * Used for admin UI visibility and permission checks.
 */

/** Platform admin roles (users.role) – access to /api/admin */
export const PLATFORM_ADMIN_ROLES = ['admin', 'superadmin'];

export const PLATFORM_ROLES = {
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
};

export function isPlatformAdmin(role) {
  return role && typeof role === 'string' && PLATFORM_ADMIN_ROLES.includes(role.toLowerCase());
}

export function isSuperadmin(role) {
  return role && String(role).toLowerCase() === PLATFORM_ROLES.SUPERADMIN;
}

/** Domain-level roles (user_domain_access) – per-tenant */
export const DOMAIN_ROLES = ['owner', 'member', 'viewer'];

/**
 * Admin permission keys – must match backend permissions.js.
 * Use with useAdminMe().can(ADMIN_PERMISSIONS.USERS_SET_ROLE) etc.
 */
export const ADMIN_PERMISSIONS = Object.freeze({
  ADMIN_VIEW: 'admin:view',
  USERS_SET_ROLE: 'admin:users:set_role',
  USERS_LOCK: 'admin:users:lock',
  USERS_EXPORT: 'admin:users:export',
  IMPERSONATE: 'admin:impersonate',
});
