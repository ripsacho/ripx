/**
 * useAppRoutes – route helpers for the current context (user panel vs domain-scoped app).
 * When getShopDomain() is set (e.g. we're under /app/:domain), returns app-scoped paths.
 * Otherwise returns user panel or legacy paths.
 *
 * Route resolution lives in utils/getRoutesForDomain.js so it can be unit-tested without React or services.
 */

import { useMemo } from 'react';
import { getRoutesForDomain } from '../utils/getRoutesForDomain';
import { getShopDomain } from '../services';

export function useAppRoutes() {
  const domain = getShopDomain();
  return useMemo(() => getRoutesForDomain(domain), [domain]);
}
