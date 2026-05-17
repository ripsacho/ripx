/**
 * Start Shopify OAuth for a store (email session required).
 * Prefers /auth/start; falls back to signed /auth/install-link (works in popups without cookies).
 */

import { apiGet, unwrapData, getEmailToken } from '../services';
import { normalizeShopifyDomain } from './shopifyAdmin';

/**
 * @param {string} shop
 * @param {{ callbackBase?: string }} [options]
 * @returns {Promise<{ url: string } | { signInRequired: true, shop: string } | { error: string }>}
 */
export async function resolveShopifyOAuthUrl(shop, { callbackBase } = {}) {
  const normalizedShop = normalizeShopifyDomain(shop || '');
  if (!normalizedShop) {
    return { error: 'Invalid shop domain' };
  }
  const origin =
    callbackBase || (typeof window !== 'undefined' ? window.location.origin : '') || undefined;

  if (!getEmailToken()) {
    return { signInRequired: true, shop: normalizedShop };
  }

  try {
    const startRes = await apiGet('/auth/start', {
      shop: normalizedShop,
      callback_base: origin,
    });
    const url = unwrapData(startRes)?.redirectUrl;
    if (url && typeof url === 'string') {
      return { url };
    }
  } catch (err) {
    if (err?.response?.status === 401) {
      return { signInRequired: true, shop: normalizedShop };
    }
  }

  try {
    const linkRes = await apiGet('/auth/install-link', {
      shop: normalizedShop,
      callback_base: origin,
    });
    const installUrl = unwrapData(linkRes)?.url;
    if (installUrl && typeof installUrl === 'string') {
      return { url: installUrl };
    }
  } catch (err) {
    if (err?.response?.status === 401) {
      return { signInRequired: true, shop: normalizedShop };
    }
  }

  return { signInRequired: true, shop: normalizedShop };
}
