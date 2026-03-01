/**
 * AdminGuard
 *
 * Protects admin routes: only users with role 'admin' or 'superadmin' may access.
 * Regular users (member, viewer, owner, etc.) are redirected to My domains or Dashboard.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminMe } from '../../hooks';
import { ROUTES } from '../../constants';
import { Page } from '@shopify/polaris';
import { hasEmailSession, getApiKey, getShopDomain } from '../../services';

function AdminGuard({ children }) {
  const { isAdmin, isLoading } = useAdminMe();

  if (isLoading) {
    return (
      <Page>
        <div style={{ padding: 24, textAlign: 'center' }}>Checking access…</div>
      </Page>
    );
  }

  if (!isAdmin) {
    const emailOnly = hasEmailSession() && !getApiKey() && !getShopDomain();
    return <Navigate to={emailOnly ? ROUTES.DOMAINS : ROUTES.DASHBOARD} replace />;
  }

  return children;
}

export default AdminGuard;
