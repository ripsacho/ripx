import { apiGet, apiMeGet, getEmailToken, unwrapData } from './api';
import { normalizeShopifyDomain } from '../utils/shopifyAdmin';

export async function fetchStorefrontReadinessBatch(shops = []) {
  const normalizedShops = Array.from(
    new Set(
      (Array.isArray(shops) ? shops : [])
        .map(shop => normalizeShopifyDomain(shop || ''))
        .filter(Boolean)
    )
  ).sort();

  if (!normalizedShops.length) {
    return {};
  }

  const params = { shops: normalizedShops.join(',') };
  const res = getEmailToken()
    ? await apiMeGet('/me/domains/storefront-readiness', { params })
    : await apiGet('/account/stores/storefront-readiness', { params });
  const payload = unwrapData(res) || {};
  return payload.shops && typeof payload.shops === 'object' ? payload.shops : {};
}
