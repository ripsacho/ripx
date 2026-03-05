/**
 * AdminGuard
 *
 * Protects admin routes: only users with a platform admin role (admin, superadmin, collaborator)
 * may access. Regular users are redirected to My domains or Dashboard. Use replace so the
 * admin URL is not left in history. Backend enforces the same via requireAdmin on /api/admin/*.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminMe } from '../../hooks';
import { ROUTES } from '../../constants';
import { hasEmailSession, getApiKey, getShopDomain } from '../../services';
import { RouteLoading } from '../LoadingSkeleton/RouteLoading';

function AdminGuard({ children }) {
  const { isAdmin, isLoading, role } = useAdminMe();

  if (isLoading) {
    return <RouteLoading message="Checking access…" fullScreen />;
  }

  if (!isAdmin || !role) {
    const emailOnly = hasEmailSession() && !getApiKey() && !getShopDomain();
    return <Navigate to={emailOnly ? ROUTES.DOMAINS : ROUTES.DASHBOARD} replace />;
  }

  return children;
}

export default AdminGuard;
