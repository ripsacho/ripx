import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchStorefrontReadinessBatch } from '../services/storefrontReadiness';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../utils/shopifyAdmin';
import { isShopifyStoreOpenableState } from '../utils/shopifyConnectionHealth';

export function useStorefrontSetupReadiness(
  domains,
  installStateByShop = {},
  queryScope = 'shared'
) {
  const openableShops = useMemo(() => {
    const values = Array.isArray(domains) ? domains : [];
    return Array.from(
      new Set(
        values
          .map(entry => (typeof entry === 'object' ? entry?.domain : entry))
          .filter(raw => raw && isShopifyStoreDomain(raw))
          .map(raw => normalizeShopifyDomain(raw))
          .filter(shop => isShopifyStoreOpenableState(installStateByShop[shop]))
      )
    ).sort();
  }, [domains, installStateByShop]);

  const queryKey = useMemo(
    () => ['me', 'storefront-readiness', queryScope, openableShops.join('|')],
    [queryScope, openableShops]
  );

  const query = useQuery({
    queryKey,
    queryFn: () => fetchStorefrontReadinessBatch(openableShops),
    staleTime: 3 * 60 * 1000,
    enabled: openableShops.length > 0,
  });

  const getReadiness = shop =>
    query.data?.[normalizeShopifyDomain(shop || '')] ||
    query.data?.[
      String(shop || '')
        .trim()
        .toLowerCase()
    ] ||
    null;

  return {
    readinessByShop: query.data || {},
    getReadiness,
    openableShops,
    ...query,
  };
}
