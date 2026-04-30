# Permissions and Role Control

This document describes the **permission-based** access model used across RipX: a single source of truth for admin abilities, with roles mapping to permissions. The backend enforces; the frontend uses the same permission keys for UI only.

---

## Design: Permission-based (ability) layer

Instead of scattering `if (role === 'superadmin')` checks, we use **explicit permissions** (e.g. `admin:users:set_role`, `admin:impersonate`). Roles are mapped to permissions; adding a new restricted action = add one permission and one route check.

- **Single source of truth**: `backend/src/permissions.js` defines `PERMISSIONS` and `ROLE_PERMISSIONS`. GET `/api/admin/me` returns `permissions: string[]` so the frontend can gate UI without hardcoding role names.
- **Backend**: `requirePermission(permission)` middleware after `requireAdmin`; 403 includes `requiredPermission` for audit.
- **Frontend**: `useAdminMe().can(permission)` using the same permission strings; mirror constants in `frontend/src/constants/roles.js` as `ADMIN_PERMISSIONS`.

---

## Platform admin permissions

| Permission             | Description                                    | Roles             |
| ---------------------- | ---------------------------------------------- | ----------------- |
| `admin:view`           | Access admin panel, read-only operations       | admin, superadmin |
| `admin:users:lock`     | Lock/unlock user accounts                      | admin, superadmin |
| `admin:users:export`   | Export user data (GDPR)                        | admin, superadmin |
| `admin:users:set_role` | Set platform role (admin/superadmin) on a user | superadmin        |
| `admin:impersonate`    | Issue impersonation JWT for another shop       | superadmin        |

- **Backend**: `backend/src/permissions.js` – `PERMISSIONS`, `ROLE_PERMISSIONS`, `getPermissionsForRole(role)`, `hasPermission(role, permission)`.
- **Routes**: Use `requirePermission(PERMISSIONS.USERS_SET_ROLE)` etc. instead of `requireSuperadmin` for clarity and auditability.
- **GET /admin/me** returns `{ role, status, permissions }`. When `role` is set, `permissions` is the list for that role; when not admin, `permissions: []`.

---

## Platform admin roles

Roles are the **mapping layer** to permissions (stored in `users.role`):

| Role         | Permissions                                               |
| ------------ | --------------------------------------------------------- |
| `admin`      | admin:view, admin:users:lock, admin:users:export          |
| `superadmin` | All of admin plus admin:users:set_role, admin:impersonate |

- **Backend**: `requireAdmin` sets `req.adminRole`; `ADMIN_API_KEY` is treated as superadmin (all permissions). Env-based admins (`RIPX_ADMIN_SHOP_DOMAINS`, `RIPX_ADMIN_EMAIL`) get `admin` role (no set_role/impersonate unless you add them to the role map).
- **Frontend**: Prefer `can(ADMIN_PERMISSIONS.USERS_SET_ROLE)` over `isSuperadmin` so the UI stays aligned with the permission model.

---

## Middleware

- **requireAdmin**: IP allowlist (optional), then ADMIN_API_KEY or authenticate + (env admin list or DB role in admin/superadmin with status active). Sets `req.adminId`, `req.adminRole`.
- **requirePermission(permission)**: Use after `requireAdmin`. If the role lacks the permission: logs `permission_denied` to `audit_log` (actor, requiredPermission, path, method, role) for security audit, then returns 403 with `requiredPermission` in the JSON body.
- **requireSuperadmin**: Deprecated in favor of `requirePermission(PERMISSIONS.*)`; still available for compatibility.

## Route → Permission map

| Route                                   | Permission           |
| --------------------------------------- | -------------------- |
| POST /api/admin/impersonate             | admin:impersonate    |
| PUT /api/admin/users/:shopDomain/role   | admin:users:set_role |
| PUT /api/admin/users/:shopDomain/lock   | admin:users:lock     |
| PUT /api/admin/users/:shopDomain/unlock | admin:users:lock     |
| GET /api/admin/users/export             | admin:users:export   |
| GET /api/admin/users/:shopDomain/export | admin:users:export   |

All other admin routes require only `requireAdmin` (any admin/superadmin). The canonical map is `ROUTE_PERMISSION_MAP` in `backend/src/permissions.js`.

---

## Sensitive actions and rate limiting

Permissions with **risk level `high`** (see `PERMISSION_META` in `permissions.js`) use a stricter rate limit so abuse is contained:

- **admin:impersonate**, **admin:users:set_role** are high-risk; their routes use `sensitiveAdminLimiter` (default 10 requests per 15 min per IP, overridable via `RATE_LIMIT_SENSITIVE_ADMIN_MAX`).
- General admin routes use the standard admin limiter (e.g. 120/15 min).

---

## Audit: permission denials and high-risk actions

- Every **permission deny** (403 from `requirePermission`) is logged to `audit_log` with `action = 'permission_denied'` and `changes` containing `requiredPermission`, `path`, `method`, `role`.
- To list recent permission denials:

```sql
SELECT id, shop_domain, entity_type, action, actor_id, changes, created_at
FROM audit_log
WHERE shop_domain = '__admin__' AND action = 'permission_denied'
ORDER BY created_at DESC
LIMIT 100;
```

- High-risk actions (impersonate, set role) are also logged on success via existing `logAdminAction` and are subject to the stricter rate limit above.

---

## Domain-level roles

Per-tenant access (separate from platform admin):

| Role          | Write (create/edit/delete tests, settings) |
| ------------- | ------------------------------------------ |
| owner, member | Yes                                        |
| viewer        | No (read-only)                             |

- **Backend**: `backend/src/middleware/requireDomainRole.js` – `ensureDomainAccess({ userId, tenantId, accountId, minRole })`, `canWrite(userRole)`. Use in app routes when operating on a specific tenant.
- **Constants**: `DOMAIN_ROLES`, `DOMAIN_ROLE_WRITE`, `DOMAIN_ROLE_READ_ONLY` in `backend/src/constants/index.js`.

---

## User status

- **Allowed**: `accepted`, `active` – can use session and app.
- **Blocked**: `locked`, `suspended` – auth returns 403.

---

## Env and dev

- **RIPX_ADMIN_SHOP_DOMAINS**, **RIPX_ADMIN_EMAIL**: grant admin role (permissions from that role).
- **ADMIN_API_KEY**: full access, treated as superadmin.
- **ADMIN_IP_ALLOWLIST**: when set, admin routes only from these IPs.
- **ALLOW_DEV_ADMIN_BYPASS**: must be `true` in development to allow admin access without a DB role (otherwise 403 as in production).

---

## Adding a new admin permission

1. **Backend**: In `permissions.js`, add `NEW_ACTION: 'admin:resource:action'` to `PERMISSIONS` and add it to the correct role(s) in `ROLE_PERMISSIONS`.
2. **Route**: Use `requirePermission(PERMISSIONS.NEW_ACTION)` on the route.
3. **Frontend**: Add the same key to `ADMIN_PERMISSIONS` in `constants/roles.js`; use `can(ADMIN_PERMISSIONS.NEW_ACTION)` where you need to show/hide the action.

Frontend never enforces security; it only reflects permissions from the API for UX.

---

## Implementation details

- **Permission validation**: `requirePermission(permission)` checks the permission against `PERMISSIONS` via `isValidPermission()`; unknown permissions log a warning (typo guard).
- **Frontend refresh on 403**: If an admin request returns 403 with `requiredPermission` in the body, the frontend invalidates the `['admin', 'me']` query so the next use of `useAdminMe()` refetches and the UI reflects current permissions (e.g. after role downgrade). The app must call `setQueryClientForPermissionInvalidation(queryClient)` once at startup (see `App.jsx`).
