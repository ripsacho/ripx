/**
 * Invalidate React Query caches after Shopify OAuth / session changes.
 */

export function invalidateShopifyConnectionQueries(queryClient, shopDomain = null) {
  if (!queryClient) {
    return;
  }
  const normalized = String(shopDomain || '')
    .trim()
    .toLowerCase();

  queryClient.invalidateQueries({ queryKey: ['shopify', 'install-status'] });
  queryClient.invalidateQueries({ queryKey: ['shopify', 'connection-status'] });
  queryClient.invalidateQueries({ queryKey: ['shopify', 'connection-gate'] });

  if (normalized) {
    queryClient.invalidateQueries({
      queryKey: ['shopify', 'connection-status', normalized],
    });
    queryClient.invalidateQueries({
      queryKey: ['shopify', 'connection-gate', normalized],
    });
  }
}

export function invalidateShopifyDomainListQueries(queryClient) {
  if (!queryClient) {
    return;
  }
  queryClient.invalidateQueries({ queryKey: ['me', 'domains'] });
  queryClient.invalidateQueries({ queryKey: ['account', 'stores'] });
  invalidateShopifyConnectionQueries(queryClient);
}
