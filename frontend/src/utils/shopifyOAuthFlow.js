/**
 * Start Shopify OAuth for scope refresh on an already-connected store.
 * Uses server-side redirect (/shopify/reauthorize-redirect) so shop session + httpOnly
 * email cookies work without localStorage JWT (embedded Shopify Admin).
 */

import {
  apiGet,
  unwrapData,
  getEmailToken,
  isEmbeddedInIframe,
  getApiBaseUrl,
  openCenteredPopup,
} from '../services';
import { normalizeShopifyDomain } from './shopifyAdmin';

let cachedOAuthConfig = null;
let cachedOAuthConfigAt = 0;
const OAUTH_CONFIG_TTL_MS = 60 * 1000;

export function resetShopifyOAuthConfigCacheForTests() {
  cachedOAuthConfig = null;
  cachedOAuthConfigAt = 0;
}

/**
 * @returns {Promise<{ base?: string, redirectUri?: string, isDynamicTunnel?: boolean, mismatchWarning?: string|null, partnerDashboard?: object }>}
 */
export async function fetchShopifyOAuthConfig({ forceRefresh = false } = {}) {
  if (
    !forceRefresh &&
    cachedOAuthConfig &&
    Date.now() - cachedOAuthConfigAt < OAUTH_CONFIG_TTL_MS
  ) {
    return cachedOAuthConfig;
  }
  try {
    const res = await apiGet('/auth/oauth-redirect-uri');
    const config = unwrapData(res) || res?.data || {};
    cachedOAuthConfig = config;
    cachedOAuthConfigAt = Date.now();
    return config;
  } catch {
    return {};
  }
}

/**
 * Same-origin URL that authenticates via shop session (+ email cookie) and 302s to Shopify OAuth.
 */
export function buildShopifyPermissionUpdateLaunchUrl(shop) {
  const normalizedShop = normalizeShopifyDomain(shop || '');
  if (!normalizedShop || typeof window === 'undefined') {
    return '';
  }
  const apiBase = getApiBaseUrl();
  const params = new URLSearchParams({ shop: normalizedShop });
  return `${apiBase}/shopify/reauthorize-redirect?${params.toString()}`;
}

/**
 * Open the server redirect entrypoint (preserves user gesture for popups).
 * @returns {{ launched: boolean, url?: string, popupBlocked?: boolean }}
 */
export function launchShopifyPermissionUpdateNavigation(shop) {
  const url = buildShopifyPermissionUpdateLaunchUrl(shop);
  if (!url) {
    return { launched: false };
  }
  if (isEmbeddedInIframe()) {
    const popup = openCenteredPopup(url);
    if (!popup) {
      return { launched: false, url, popupBlocked: true };
    }
    return { launched: true, url };
  }
  window.top.location.href = url;
  return { launched: true, url };
}

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

  if (!getEmailToken()) {
    return { signInRequired: true, shop: normalizedShop };
  }

  const oauthConfig = await fetchShopifyOAuthConfig();
  const canonicalBase =
    oauthConfig?.base ||
    callbackBase ||
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    undefined;
  const oauthWarning =
    oauthConfig?.showOAuthAlignmentWarning && oauthConfig?.mismatchWarning
      ? oauthConfig.mismatchWarning
      : null;

  try {
    const startRes = await apiGet('/auth/start', {
      shop: normalizedShop,
      callback_base: canonicalBase,
    });
    const url = unwrapData(startRes)?.redirectUrl;
    if (url && typeof url === 'string') {
      return oauthWarning
        ? { url, oauthWarning, partnerDashboard: oauthConfig.partnerDashboard }
        : { url };
    }
  } catch (err) {
    if (err?.response?.status === 401) {
      return { signInRequired: true, shop: normalizedShop };
    }
  }

  try {
    const linkRes = await apiGet('/auth/install-link', {
      shop: normalizedShop,
      callback_base: canonicalBase,
    });
    const installUrl = unwrapData(linkRes)?.url;
    if (installUrl && typeof installUrl === 'string') {
      return oauthWarning
        ? { url: installUrl, oauthWarning, partnerDashboard: oauthConfig.partnerDashboard }
        : { url: installUrl };
    }
  } catch (err) {
    if (err?.response?.status === 401) {
      return { signInRequired: true, shop: normalizedShop };
    }
  }

  return { signInRequired: true, shop: normalizedShop };
}

/**
 * Open Shopify OAuth to grant updated app permissions (scope reauthorization).
 * @returns {Promise<{ launched: boolean, signInRequired?: boolean, shop?: string, error?: string, url?: string, popupBlocked?: boolean }>}
 */
export async function launchShopifyPermissionUpdate(shop) {
  const normalizedShop = normalizeShopifyDomain(shop || '');
  if (!normalizedShop) {
    return { launched: false, error: 'Invalid shop domain' };
  }

  const navigation = launchShopifyPermissionUpdateNavigation(normalizedShop);
  if (navigation.launched) {
    return { launched: true, url: navigation.url };
  }
  if (navigation.popupBlocked) {
    return {
      launched: false,
      url: navigation.url,
      popupBlocked: true,
      error: 'Popup blocked. Allow popups for this site, or use the link below.',
    };
  }
  return { launched: false, error: 'Could not start permission update' };
}

/**
 * After email login on Connect, continue a pending scope-update OAuth when URL params request it.
 * @returns {Promise<boolean>} true when permission update navigation was opened
 */
export async function continuePendingShopifyPermissionOAuth(searchParams) {
  if (!searchParams || typeof window === 'undefined') {
    return false;
  }
  const reason = String(searchParams.get('reason') || '').trim();
  const shop = normalizeShopifyDomain(searchParams.get('shop') || '');
  const pendingReasons = new Set(['scope_update', 'reauthorize', 'sign_in_to_connect']);
  if (!pendingReasons.has(reason) || !shop) {
    return false;
  }
  const result = await launchShopifyPermissionUpdate(shop);
  return Boolean(result.launched);
}
