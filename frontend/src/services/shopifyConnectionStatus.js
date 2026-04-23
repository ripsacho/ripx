import { apiGet, unwrapData } from './api';
import { normalizeShopifyDomain } from '../utils/shopifyAdmin';

export function mapShopifyConnectionErrorToInstallState(error) {
  const meta = getShopifyConnectionErrorMeta(error);
  if (meta.state === 'needs_install' || meta.state === 'needs_link') {
    return meta.state;
  }
  if (meta.state === 'restricted') {
    return 'restricted';
  }
  return meta.state || 'unknown';
}

export function getShopifyConnectionErrorMeta(error) {
  const status = error?.response?.status || null;
  const payload = unwrapData(error?.response) || error?.response?.data || {};
  const connectionPayload =
    payload?.connection && typeof payload.connection === 'object' ? payload.connection : null;
  const code = typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : '';
  if (connectionPayload) {
    const state =
      String(connectionPayload.state || '')
        .trim()
        .toLowerCase() || 'unknown';
    const action =
      String(connectionPayload.action || '')
        .trim()
        .toLowerCase() || 'retry';
    const message = String(connectionPayload.message || payload?.error || '').trim() || null;
    const shop = normalizeShopifyDomain(connectionPayload.shop || '') || null;
    return { state, status, code, action, message, shop };
  }

  if (status === 403 && code === 'STORE_NOT_LINKED') {
    return { state: 'needs_link', status, code, action: 'link', message: null, shop: null };
  }
  if (status === 403 && code === 'ACCOUNT_RESTRICTED') {
    return {
      state: 'restricted',
      status,
      code,
      action: 'contact_support',
      message: null,
      shop: null,
    };
  }
  if (status === 401) {
    return { state: 'needs_install', status, code, action: 'install', message: null, shop: null };
  }
  if (status === 403) {
    return { state: 'unknown', status, code, action: 'retry', message: null, shop: null };
  }
  if (status === 404) {
    return { state: 'unknown', status, code, action: 'retry', message: null, shop: null };
  }
  return { state: 'unknown', status, code, action: 'retry', message: null, shop: null };
}

export async function fetchShopifyConnectionStatus(shop) {
  const normalizedShop = normalizeShopifyDomain(shop || '');
  if (!normalizedShop) {
    throw new Error('Invalid Shopify shop domain');
  }
  const res = await apiGet('/shopify/connection-status', { shop: normalizedShop });
  const payload = unwrapData(res) || {};
  const connectionPayload =
    payload?.connection && typeof payload.connection === 'object' ? payload.connection : null;
  return {
    connected: Boolean(payload.connected),
    shop:
      normalizeShopifyDomain(payload.shop || connectionPayload?.shop || normalizedShop) ||
      normalizedShop,
    connection: connectionPayload
      ? {
          connected: connectionPayload.connected !== false,
          shop:
            normalizeShopifyDomain(connectionPayload.shop || payload.shop || normalizedShop) ||
            normalizedShop,
          state:
            String(connectionPayload.state || '')
              .trim()
              .toLowerCase() || 'connected',
          action:
            String(connectionPayload.action || '')
              .trim()
              .toLowerCase() || 'none',
          message: String(connectionPayload.message || '').trim() || null,
        }
      : {
          connected: Boolean(payload.connected),
          shop: normalizeShopifyDomain(payload.shop || normalizedShop) || normalizedShop,
          state: payload.connected ? 'connected' : 'unknown',
          action: payload.connected ? 'none' : 'retry',
          message: null,
        },
    raw: payload,
  };
}

export async function fetchShopifyInstallState(shop) {
  try {
    const status = await fetchShopifyConnectionStatus(shop);
    return status.connected ? 'connected' : 'needs_install';
  } catch (error) {
    return mapShopifyConnectionErrorToInstallState(error) || 'unknown';
  }
}

export async function fetchShopifyInstallStates(shops) {
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
  const pairs = await Promise.all(
    normalizedShops.map(async shop => [shop, await fetchShopifyInstallState(shop)])
  );
  return Object.fromEntries(pairs);
}
