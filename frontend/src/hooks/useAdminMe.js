/**
 * useAdminMe – platform admin identity and permissions (single source of truth from API).
 *
 * GET /admin/me returns role and permissions[]. Use can(permission) to gate UI;
 * backend always enforces. Prefer can(ADMIN_PERMISSIONS.X) over isSuperadmin for clarity.
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet, getShopDomain } from '../services';
import { isPlatformAdmin, isSuperadmin } from '../constants/roles';

export function useAdminMe(options = {}) {
  const scopedShop = getShopDomain() || '_';
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'me', scopedShop],
    queryFn: async () => {
      const res = await apiGet('/admin/me');
      return res.data?.data ?? res.data;
    },
    retry: false,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    ...options,
  });

  const role = data?.role;
  const permissions = Array.isArray(data?.permissions) ? data.permissions : [];
  const isAdmin = !isError && isPlatformAdmin(role);
  const superadmin = !isError && isSuperadmin(role);

  /** Check if current user has a given permission (from API). Use for UI only; backend enforces. */
  function can(permission) {
    return permission && permissions.includes(permission);
  }

  return {
    data,
    role: role || null,
    permissions,
    can,
    isAdmin,
    isSuperadmin: superadmin,
    isLoading,
    isError,
    error,
  };
}
