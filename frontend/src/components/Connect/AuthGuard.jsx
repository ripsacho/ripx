/**
 * AuthGuard
 *
 * Redirects to Connect when no credentials (shop, API key, or email session).
 * Uses Navigate to enable lazy-loading of Connect component.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { hasCredentials } from '../../services/api';
import { ROUTES } from '../../constants';

function AuthGuard({ children }) {
  if (!hasCredentials()) {
    return <Navigate to={ROUTES.CONNECT} replace />;
  }

  return children;
}

export default AuthGuard;
