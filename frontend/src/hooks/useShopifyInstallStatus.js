import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchShopifyInstallStates } from '../services';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../utils/shopifyAdmin';

export function useShopifyInstallStatus(domains, queryScope = 'shared') {
  const shopifyDomains = useMemo(() => {
    const values = Array.isArray(domains) ? domains : [];
    const normalized = values
      .map(entry => (typeof entry === 'object' ? entry?.domain : entry))
      .filter(raw => raw && isShopifyStoreDomain(raw))
      .map(raw => normalizeShopifyDomain(raw))
      .filter(Boolean);
    return Array.from(new Set(normalized)).sort();
  }, [domains]);

  const queryKey = useMemo(
    () => ['shopify', 'install-status', queryScope, shopifyDomains.join('|')],
    [queryScope, shopifyDomains]
  );

  const { data, ...query } = useQuery({
    queryKey,
    queryFn: () => fetchShopifyInstallStates(shopifyDomains),
    staleTime: 2 * 60 * 1000,
    enabled: shopifyDomains.length > 0,
  });

  const statusByShop = data || {};

  const getState = domainValue => {
    if (!isShopifyStoreDomain(domainValue)) return null;
    const normalized = normalizeShopifyDomain(domainValue);
    return statusByShop?.[normalized] || 'unknown';
  };

  return {
    shopifyDomains,
    statusByShop,
    getState,
    ...query,
  };
}
