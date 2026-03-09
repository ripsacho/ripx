/**
 * AuthGuard
 *
 * Redirects to Connect when no credentials (shop, API key, or email session).
 * Uses Navigate to enable lazy-loading of Connect component.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { hasCredentials } from '../../services/api';
import { ROUTES } from '../../constants';

function AuthGuard({ children }) {
  const location = useLocation();
  if (!hasCredentials()) {
    return <Navigate to={{ pathname: ROUTES.CONNECT, search: location.search }} replace />;
  }

  return children;
}

export default AuthGuard;
