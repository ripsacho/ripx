/**
 * useAdminMe – check if current user has admin access
 * Calls GET /api/admin/me; if 403/401, user is not admin.
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../services';

export function useAdminMe(options = {}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: async () => {
      const res = await apiGet('/admin/me');
      return res.data?.data ?? res.data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  });

  const isAdmin = !isError && !!data?.role;
  return {
    data,
    isAdmin,
    isLoading,
    isError,
    error,
  };
}
