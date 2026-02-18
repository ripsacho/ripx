/**
 * AuthGuard
 *
 * Redirects to Connect when no credentials (shop or API key).
 * Uses Navigate to enable lazy-loading of Connect component.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { getShopDomain, getApiKey } from '../../services/api';
import { ROUTES } from '../../constants';

function AuthGuard({ children }) {
  const hasCredentials = getShopDomain() || getApiKey();

  if (!hasCredentials) {
    return <Navigate to={ROUTES.CONNECT} replace />;
  }

  return children;
}

export default AuthGuard;
