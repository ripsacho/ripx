/**
 * AdminGuard
 *
 * Protects admin routes: redirects to dashboard if user is not admin.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminMe } from '../../hooks';
import { ROUTES } from '../../constants';
import { Page } from '@shopify/polaris';

function AdminGuard({ children }) {
  const { isAdmin, isLoading } = useAdminMe();

  if (isLoading) {
    return (
      <Page>
        <div style={{ padding: 24, textAlign: 'center' }}>Checking admin access…</div>
      </Page>
    );
  }

  if (!isAdmin) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return children;
}

export default AdminGuard;
