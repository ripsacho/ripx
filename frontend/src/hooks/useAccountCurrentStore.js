/**
 * useAccountCurrentStore – domain to use for /app/:domain/... links when on user panel.
 * When getShopDomain() is not set, TopBar needs a domain so Profile, Settings, Docs, Notifications work.
 * - Email session: /account/stores returns currentStore = email (invalid); use /me/domains and take first domain.
 * - API key / Shopify: use /account/stores currentStore only if it looks like a domain (no @).
 */

import { useQuery } from '@tanstack/react-query';
import { apiGet, apiMeGet, getEmailToken, unwrapData } from '../services';

function getDomainFromAccountStores(data) {
  const cur = data?.currentStore;
  if (cur && typeof cur === 'string' && !cur.includes('@')) return cur;
  return null;
}

export function useAccountCurrentStore(options = {}) {
  const isEmailSession = !!getEmailToken();

  const { data: accountData } = useQuery({
    queryKey: ['account', 'stores'],
    queryFn: async () => {
      const res = await apiGet('/account/stores');
      return res.data;
    },
    staleTime: 60 * 1000,
    retry: false,
    enabled: !isEmailSession,
    ...options,
  });

  const { data: meDomainsData } = useQuery({
    queryKey: ['me', 'domains'],
    queryFn: async () => {
      const res = await apiMeGet('/me/domains');
      return unwrapData(res) || {};
    },
    staleTime: 60 * 1000,
    retry: false,
    enabled: isEmailSession,
    ...options,
  });

  const currentStore = isEmailSession
    ? (meDomainsData?.domains?.[0]?.domain ?? null)
    : getDomainFromAccountStores(accountData);

  return { currentStore };
}
