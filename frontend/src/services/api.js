/**
 * API Utility
 *
 * Common axios patterns and helpers for API calls
 */

import axios from 'axios';
import { STORAGE_KEYS, ROUTES } from '../constants';
import { hasCredentialsFromSources } from '../utils/credentials';
import { isShopifyStoreDomain } from '../utils/shopifyAdmin';

// Use VITE_API_URL when set; otherwise /api for same-origin (works with proxy in dev and when served from same host)
const API_BASE_URL = (() => {
  const b = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL;
  const url = (b && String(b).trim()) || '/api';
  return url.replace(/\/+$/, '') || '/api';
})();

/** Public: API root URL (no trailing slash). Use for fetch/links when not using apiClient. */
export function getApiBaseUrl() {
  return API_BASE_URL;
}

/** Public: full URL for health check (GET). */
export function getHealthUrl() {
  return API_BASE_URL + '/health';
}

/**
 * Public GET — no auth. Shopify checkout price pipeline QA (batch URL, HTTPS, secret mode).
 * @param {string} [shopDomain] — e.g. store.myshopify.com (must be registered if passed)
 * @returns {string}
 */
export function getPriceCheckoutDiagnosticsUrl(shopDomain) {
  const path = `${API_BASE_URL}/track/price-checkout-diagnostics`;
  const s = shopDomain && String(shopDomain).trim();
  return s ? `${path}?shop=${encodeURIComponent(s)}` : path;
}

/**
 * Fetch checkout price diagnostics via public track URL (no cookies).
 * From the RipX app, prefer `apiGet('/settings/checkout-price-diagnostics')` (same JSON, session auth, no CORS issues).
 * @param {string} [shopDomain]
 * @returns {Promise<object>}
 */
export async function fetchPriceCheckoutDiagnostics(shopDomain) {
  const url = getPriceCheckoutDiagnosticsUrl(shopDomain);
  const res = await fetch(url, { method: 'GET', credentials: 'omit' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText || 'Request failed';
    throw new Error(typeof msg === 'string' ? msg : 'Request failed');
  }
  return data;
}

/**
 * Call backend logout to clear email session cookie (so OAuth start doesn't use stale session).
 * Fire-and-forget; does not block. Call clearAuthStorage() and redirect after.
 */
export function logout() {
  fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
}

// Create axios instance with default config
const apiClient = axios.create({
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Optional ref for React Query client: when set, 403 with requiredPermission invalidates ['admin','me'] so UI refreshes permissions */
let queryClientRef = null;
export function setQueryClientForPermissionInvalidation(queryClient) {
  queryClientRef = queryClient;
}

/** Guard so we only redirect once when multiple 401s occur (e.g. session check + other requests) */
let isRedirectingToLogin = false;

/** Reset the redirect guard (e.g. when user is on Connect page so a future 401 after re-login can redirect again) */
export function resetRedirectingToLogin() {
  isRedirectingToLogin = false;
}

/**
 * When embedded in Shopify Admin (iframe), redirect only the iframe so the top window stays on Admin.
 * When not embedded, redirect the top window as before.
 * Use for any redirect to our app (Connect, dashboard, etc.) so we never "leave" the Admin panel.
 */
export function redirectToAppUrl(url) {
  if (typeof window === 'undefined') return;
  if (window.self !== window.top) {
    window.location.href = url;
  } else {
    window.top.location.href = url;
  }
}

/** True when the app is running inside an iframe (e.g. Shopify Admin embed). */
export function isEmbeddedInIframe() {
  return typeof window !== 'undefined' && window.self !== window.top;
}

/**
 * Open a centered popup window and return the window handle.
 * Returns null when the popup was blocked or inputs are invalid.
 */
export function openCenteredPopup(url, options = {}) {
  if (typeof window === 'undefined') return null;
  if (typeof url !== 'string' || !url.trim()) return null;
  const width = Number(options?.width) > 0 ? Number(options.width) : 980;
  const height = Number(options?.height) > 0 ? Number(options.height) : 820;
  const name =
    typeof options?.name === 'string' && options.name.trim()
      ? options.name.trim()
      : 'ripx-shopify-connect';
  const screenWidth = window.screen?.width || window.innerWidth || width;
  const screenHeight = window.screen?.height || window.innerHeight || height;
  const left = Math.max(0, Math.floor((screenWidth - width) / 2));
  const top = Math.max(0, Math.floor((screenHeight - height) / 2));
  const features = [
    'popup=yes',
    'resizable=yes',
    'scrollbars=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
  ].join(',');
  return window.open(url, name, features);
}

/** Base path when app is opened via Shopify Admin (e.g. /store/{shop}/apps/{handle}). */
export function getEmbeddedAppBasePath(pathname) {
  const sourcePath =
    typeof pathname === 'string'
      ? pathname
      : typeof window !== 'undefined'
        ? window.location.pathname
        : '';
  const match = String(sourcePath).match(/^\/store\/[^/]+\/apps\/[^/]+/i);
  return match ? match[0] : '';
}

/** Prefix app-internal absolute paths with Shopify embedded base path when needed. */
export function withEmbeddedAppBasePath(path) {
  if (!path || typeof path !== 'string') return path;
  if (!path.startsWith('/')) return path;
  const basePath = getEmbeddedAppBasePath();
  if (!basePath) return path;
  if (path === basePath || path.startsWith(`${basePath}/`)) return path;
  return `${basePath}${path}`;
}

/**
 * Strip `/store/:shop/apps/:handle` so route checks match React Router basename
 * (e.g. browser `/store/x/apps/y/admin` → `/admin`). Used by the 401 interceptor.
 */
export function getEmbeddedAppRelativePathname(pathname) {
  const p = String(pathname || '');
  const base = getEmbeddedAppBasePath(p);
  if (!base) return p;
  const rest = p.slice(base.length);
  if (!rest || rest === '/') return '/';
  return rest.startsWith('/') ? rest : `/${rest}`;
}

function normalizeResolvedShopCandidate(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  // Guard against stale invalid value persisted from embedded host parsing.
  if (trimmed.toLowerCase() === 'admin.shopify.com') return null;
  if (/\.myshopify\.com$/i.test(trimmed)) return trimmed.toLowerCase();
  return trimmed;
}

function parseShopFromEmbeddedHostParam(hostParam) {
  const raw = String(hostParam || '').trim();
  if (!raw) return null;
  try {
    const decoded = window.atob(raw).trim();
    // Older behavior or direct values where host already includes a myshopify domain.
    const directMatch = decoded.match(/([a-z0-9][a-z0-9-]*\.myshopify\.com)/i);
    if (directMatch?.[1]) {
      return directMatch[1].toLowerCase();
    }
    // Current Shopify Admin host payload shape: admin.shopify.com/store/{handle}
    const handleMatch = decoded.match(/\/store\/([a-z0-9][a-z0-9-]*)/i);
    if (handleMatch?.[1]) {
      return `${handleMatch[1].toLowerCase()}.myshopify.com`;
    }
  } catch {
    return null;
  }
  return null;
}

function pickEmbedSafeQueryParams(search) {
  const keepKeys = new Set(['host', 'shop']);
  const input = new URLSearchParams(search || '');
  const safe = new URLSearchParams();
  input.forEach((value, key) => {
    if (
      keepKeys.has(
        String(key || '')
          .trim()
          .toLowerCase()
      )
    ) {
      safe.set(key, value);
    }
  });
  return safe;
}

/**
 * Build Connect URL preserving current page's query params (host, shop, etc.).
 * When redirecting to Connect from within the Shopify Admin iframe, we must keep host and shop
 * so the embed context is not lost (otherwise Shopify may redirect the top frame).
 */
export function getConnectUrl(params = {}) {
  const base = withEmbeddedAppBasePath(ROUTES.CONNECT);
  const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
  const combined = pickEmbedSafeQueryParams(currentSearch);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') combined.set(k, String(v));
  });
  const q = combined.toString();
  return q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base;
}

/**
 * When in Shopify Admin iframe, append current query string (host, shop) to the path so the
 * embed context is preserved. Use for any in-app navigation (e.g. to dashboard) from within the embed.
 * @param {string} path - Path (e.g. /app/domain.com)
 * @param {{ shop?: string }} [options] - When opening a specific domain in embed, pass { shop: domain } so the URL query matches the path and the correct store loads
 */
export function getUrlWithEmbedParams(path, options = {}) {
  if (typeof window === 'undefined' || !path) return path;
  const resolvedPath = withEmbeddedAppBasePath(path);
  const safeParams = pickEmbedSafeQueryParams(window.location.search);
  if (options.shop) {
    safeParams.set('shop', options.shop);
  }
  const [basePath, existingQuery = ''] = resolvedPath.split('?');
  const merged = new URLSearchParams(existingQuery);
  safeParams.forEach((value, key) => {
    merged.set(key, value);
  });
  const search = merged.toString() ? `?${merged.toString()}` : '';
  return `${basePath}${search}`;
}

// Request interceptor: add correlation ID for distributed tracing
apiClient.interceptors.request.use(config => {
  if (!config.headers['X-Request-ID']) {
    config.headers['X-Request-ID'] =
      `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }
  return config;
});

// Response interceptor for error handling
const RETRY_DELAY_MS = 2000;

apiClient.interceptors.response.use(
  response => response,
  error => {
    // Prefer API error message (rate limit, validation, etc.) when present
    const apiMsg =
      error.response?.data?.error ??
      (typeof error.response?.data?.message === 'string' ? error.response.data.message : null);
    if (typeof apiMsg === 'string') {
      error.message = apiMsg;
    }

    // Override for specific network errors
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timeout. Please try again.';
    } else if (error.code === 'ERR_NETWORK') {
      error.message = 'Network error. Please check your connection.';
    }

    // Retry GET once on 5xx (transient server errors)
    const status = error.response?.status;
    const method = error.config?.method?.toLowerCase();
    if (
      status >= 500 &&
      status < 600 &&
      method === 'get' &&
      error.config &&
      !error.config._retried
    ) {
      error.config._retried = true;
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          apiClient
            .request(error.config)
            .then(resolve)
            .catch(retryErr => {
              retryErr.message = 'Request failed after retry. Please try again.';
              reject(retryErr);
            });
        }, RETRY_DELAY_MS);
      });
    }
    if (error.config?._retried) {
      error.message = 'Request failed after retry. Please try again.';
    }

    // Log errors in development
    if (import.meta.env.DEV) {
      console.error('API Error:', {
        url: error.config?.url,
        method: error.config?.method,
        status: error.response?.status,
        message: error.message,
      });
    }

    if (error.response?.status === 401) {
      if (isRedirectingToLogin) return Promise.reject(error);
      // Don't redirect when we're in the middle of OAuth start → Shopify; let DomainList handle (e.g. redirect to Connect?shop=...)
      try {
        if (
          typeof window !== 'undefined' &&
          window.sessionStorage?.getItem(STORAGE_KEYS.OAUTH_REDIRECTING)
        ) {
          window.sessionStorage.removeItem(STORAGE_KEYS.OAUTH_REDIRECTING);
          return Promise.reject(error);
        }
      } catch {
        // ignore sessionStorage errors
      }
      // On Domains page, never redirect on domain/OAuth-related 401 — let DomainList show "Sign in required" and open Connect in new tab
      const rawPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const path = getEmbeddedAppRelativePathname(rawPath);
      const requestUrl = String(error.config?.url || '');
      const isAdminIdentityProbe = requestUrl.includes('/admin/me');
      // /admin/me is an identity/role probe used in shell nav and AdminGuard.
      // A 401 here should not force-login redirect from the global interceptor.
      if (isAdminIdentityProbe) {
        return Promise.reject(error);
      }
      const isOnDomainsPage =
        path === ROUTES.DOMAINS || path === ROUTES.DOMAINS + '/' || path.includes('/domains');
      const isDomainsFlowRequest =
        requestUrl.includes('/me/domains') ||
        requestUrl.includes('/auth/start') ||
        requestUrl.includes('/account/stores');
      const isOnAdminPage = path === ROUTES.ADMIN || path.startsWith(`${ROUTES.ADMIN}/`);
      if (isOnDomainsPage && isDomainsFlowRequest) {
        return Promise.reject(error);
      }
      // On admin pages, never force login redirect from global interceptor.
      // AdminGuard and per-page UX decide how to handle missing/expired auth.
      if (isOnAdminPage) {
        return Promise.reject(error);
      }
      // Connection-status check: don't redirect so ShopifyConnectionBanner can show "Store not connected"
      if (requestUrl.includes('/shopify/connection-status')) {
        return Promise.reject(error);
      }
      const shopDomain = getShopDomain();
      const apiKey = getApiKey();
      const emailToken = getEmailToken();
      const onPublicAuthPage =
        path.startsWith(ROUTES.CONNECT) || path.startsWith(ROUTES.AUTH_CALLBACK);
      // 401 with a shop in the request = "shop not authenticated" (no OAuth token yet), not "session invalid" — don't clear email session
      const isShopifyRoute = requestUrl.includes('/shopify/');
      const requestShop =
        error.config?.params?.shop ||
        (requestUrl.includes('shop=') ? shopDomain : null) ||
        (isShopifyRoute && shopDomain ? shopDomain : null);
      const isShopNotAuthenticated =
        !!requestShop &&
        (requestUrl.includes('/account/stores') ||
          requestUrl.includes('/auth/start') ||
          requestUrl.includes('/tests') ||
          isShopifyRoute);
      const isOnAppDomainRoute = /^\/app\/[^/]+/.test(path);
      const isAccountStoresRequest = requestUrl.includes('/account/stores');
      // /account/stores is used as a background probe on shell pages (e.g. UserPanel).
      // A 401 there should not log out and bounce to Connect while navigating (including Admin).
      if (isAccountStoresRequest && !isOnAppDomainRoute) {
        return Promise.reject(error);
      }
      // Let AppDomainLayout handle /account/stores 401 while switching domains.
      // It can redirect to /api/auth?shop=... without forcing a full sign-in page.
      const shouldSkipAccountStoresRedirect =
        isOnAppDomainRoute && requestUrl.includes('/account/stores');
      if ((emailToken || apiKey) && !onPublicAuthPage && isShopNotAuthenticated) {
        if (shouldSkipAccountStoresRedirect) {
          return Promise.reject(error);
        }
        isRedirectingToLogin = true;
        const normalized = /\.myshopify\.com$/i.test(requestShop)
          ? String(requestShop).trim().toLowerCase()
          : requestShop;
        clearStoreSelection();
        const reason = ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect';
        redirectToAppUrl(getConnectUrl({ shop: normalized, reason }));
        return Promise.reject(error);
      }
      // On /app/:domain never clear auth — redirect to Connect with shop so user can connect store without losing session
      if (isOnAppDomainRoute && shopDomain && !onPublicAuthPage) {
        isRedirectingToLogin = true;
        const normalized = /\.myshopify\.com$/i.test(shopDomain)
          ? String(shopDomain).trim().toLowerCase()
          : shopDomain;
        clearStoreSelection();
        const reason = ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect';
        redirectToAppUrl(getConnectUrl({ shop: normalized, reason }));
        return Promise.reject(error);
      }
      // Email session or API key: clear and send to login (session invalid)
      if ((apiKey || emailToken) && !onPublicAuthPage) {
        isRedirectingToLogin = true;
        clearAuthStorage();
        redirectToAppUrl(getConnectUrl());
      } else if (shopDomain && !apiKey && !emailToken && !path.startsWith('/api/auth')) {
        // Shopify store not connected: send to Connect with ?shop= and reason so banner shows
        isRedirectingToLogin = true;
        const normalized = /\.myshopify\.com$/i.test(shopDomain)
          ? shopDomain.trim().toLowerCase()
          : shopDomain;
        const reason = ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect';
        redirectToAppUrl(getConnectUrl({ shop: normalized, reason }));
      }
    }

    // Store installed but not linked to an email user: sign in and connect
    if (error.response?.status === 403 && error.response?.data?.code === 'STORE_NOT_LINKED') {
      if (isRedirectingToLogin) return Promise.reject(error);
      const shop = error.response?.data?.shop;
      if (shop && typeof window !== 'undefined') {
        isRedirectingToLogin = true;
        clearAuthStorage();
        const reason = ROUTES.CONNECT_REASON?.SIGN_IN_TO_LINK || 'sign_in_to_link';
        redirectToAppUrl(getConnectUrl({ shop, reason }));
      }
    }

    if (error.response?.status === 403 && queryClientRef) {
      const url = String(error.config?.url || '');
      const isAdminRoute = url.includes('/admin/') && !url.includes('/admin/me');
      if (error.response?.data?.requiredPermission || isAdminRoute) {
        queryClientRef.invalidateQueries({ queryKey: ['admin', 'me'] });
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Get value for app credentials: sessionStorage first (tab-scoped, e.g. admin "Open app" window), then localStorage.
 * Keeps admin panel tab isolated from credentials set in another tab when opening a user's app.
 */
function getAppCred(key) {
  try {
    return window.sessionStorage?.getItem(key) || window.localStorage?.getItem(key) || null;
  } catch {
    return null;
  }
}

/**
 * Get shop domain from URL or environment.
 * When pathname is /app/:domain, the user explicitly navigated to that domain — prefer it over
 * query param (embed may have carried ?shop= from another store), so "Open" from My domains
 * opens the correct store.
 */
export function getShopDomain() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const pathMatch = pathname.match(/^\/app\/([^/]+)/);
  let domainFromPath = null;
  if (pathMatch) {
    try {
      domainFromPath = decodeURIComponent(pathMatch[1]);
    } catch {
      domainFromPath = pathMatch[1];
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const shop = normalizeResolvedShopCandidate(urlParams.get('shop'));
  const host = urlParams.get('host');
  const shopFromHost = parseShopFromEmbeddedHostParam(host);
  const shopFromAppBridge = normalizeResolvedShopCandidate(window.Shopify?.shop);
  let storedShop = null;

  try {
    storedShop = normalizeResolvedShopCandidate(getAppCred(STORAGE_KEYS.SHOP_DOMAIN));
  } catch (error) {
    storedShop = null;
  }

  let currentStore = null;
  try {
    currentStore = normalizeResolvedShopCandidate(getAppCred(STORAGE_KEYS.CURRENT_STORE));
  } catch {
    currentStore = null;
  }

  let resolvedShop =
    normalizeResolvedShopCandidate(domainFromPath) ||
    shop ||
    shopFromAppBridge ||
    shopFromHost ||
    storedShop ||
    currentStore ||
    normalizeResolvedShopCandidate(import.meta.env.VITE_SHOP_DOMAIN) ||
    null;

  if (resolvedShop) {
    resolvedShop = normalizeResolvedShopCandidate(resolvedShop);
    try {
      const fromSession = window.sessionStorage?.getItem(STORAGE_KEYS.SHOP_DOMAIN);
      const fromLocal = window.localStorage?.getItem(STORAGE_KEYS.SHOP_DOMAIN);
      if (resolvedShop !== fromLocal && !fromSession) {
        window.localStorage.setItem(STORAGE_KEYS.SHOP_DOMAIN, resolvedShop);
      }
    } catch (error) {
      // Ignore storage errors (private mode, blocked storage)
    }
  }

  return resolvedShop;
}

/**
 * Domain to use for preview URL (Visual Editor, etc.).
 * Shopify: shop domain. Standalone: currently selected domain (CURRENT_STORE) if set.
 */
export function getPreviewDomain() {
  const shop = getShopDomain();
  if (shop && String(shop).trim()) return shop.trim();
  try {
    const current = getAppCred(STORAGE_KEYS.CURRENT_STORE);
    if (current && String(current).trim()) return current.trim();
  } catch {
    // ignore
  }
  return null;
}

/**
 * Build `search` for React Router `navigate({ pathname, search })` so Shopify Admin embed
 * keeps `host` and `shop` query params. Plain `navigate('/admin/...')` drops them and can
 * break iframe context, session token refresh, or API auth that expects the shop in the URL.
 * @param {{ shop?: string }} [options]
 * @returns {string} e.g. `?shop=foo.myshopify.com&host=...` or `''`
 */
export function getEmbedSearchForNavigate(options = {}) {
  if (typeof window === 'undefined') return '';
  const safeParams = pickEmbedSafeQueryParams(window.location.search);
  if (options.shop) {
    safeParams.set('shop', String(options.shop).trim());
  }
  const shop = getShopDomain();
  if (shop && /\.myshopify\.com$/i.test(String(shop).trim()) && !safeParams.get('shop')) {
    safeParams.set('shop', String(shop).trim().toLowerCase());
  }
  const s = safeParams.toString();
  return s ? `?${s}` : '';
}

/**
 * React Router location object with merged embed + optional extra query params (e.g. `tab`).
 * @param {string} pathname
 * @param {Record<string, string>|null} [extraParams]
 * @returns {{ pathname: string, search?: string }}
 */
export function getNavigateToWithEmbed(pathname, extraParams = null) {
  const embed = new URLSearchParams(getEmbedSearchForNavigate().replace(/^\?/, ''));
  if (extraParams && typeof extraParams === 'object') {
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') embed.set(k, String(v));
    });
  }
  const s = embed.toString();
  return s ? { pathname, search: `?${s}` } : { pathname };
}

/**
 * True when the URL carries Shopify Admin embed session hints (?shop= and/or ?host=).
 * App.jsx uses this for `hasCreds` so the shell does not send users to Connect before
 * getShopDomain() can read the query string or sync shop into storage (race on first paint).
 */
export function hasShopifyEmbedSessionHint() {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search || '');
  const shop = (p.get('shop') || '').trim();
  if (shop) return true;
  const host = (p.get('host') || '').trim();
  return Boolean(host);
}

/**
 * Get API key for standalone mode (env, then sessionStorage, then localStorage).
 * sessionStorage is used when app is opened via admin "Open app" so the admin panel tab is unaffected.
 */
export function getApiKey() {
  try {
    return import.meta.env.VITE_RIPX_API_KEY || getAppCred(STORAGE_KEYS.API_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Email session (JWT from magic-link login). Used for /api/me/* and domain list.
 */
export function getEmailToken() {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.EMAIL_TOKEN) || null;
  } catch {
    return null;
  }
}

export function setEmailToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_KEYS.EMAIL_TOKEN, token);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.EMAIL_TOKEN);
    }
  } catch (_) {
    // ignore storage errors
  }
}

/**
 * Stored API keys per domain (when user adds domain via POST /api/me/domains).
 * Used by "Open" on domain list. Format: { [domain]: apiKey }.
 */
export function getDomainKeys() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.DOMAIN_KEYS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setDomainKey(domain, apiKey) {
  try {
    const keys = getDomainKeys();
    if (apiKey) {
      keys[domain] = apiKey;
    } else {
      delete keys[domain];
    }
    window.localStorage.setItem(STORAGE_KEYS.DOMAIN_KEYS, JSON.stringify(keys));
  } catch (_) {
    // ignore storage errors
  }
}

/** Account API key (returned when email user adds first domain); used for Open. */
export function getAccountApiKey() {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.ACCOUNT_API_KEY) || null;
  } catch {
    return null;
  }
}

export function setAccountApiKey(apiKey) {
  try {
    if (apiKey) {
      window.localStorage.setItem(STORAGE_KEYS.ACCOUNT_API_KEY, apiKey);
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.ACCOUNT_API_KEY);
    }
  } catch (_) {
    // ignore storage errors
  }
}

/**
 * Clear only store selection (SHOP_DOMAIN, CURRENT_STORE) from both storages.
 * Use after login when sending user to domain list so no store is pre-selected.
 */
export function clearStoreSelection() {
  try {
    for (const key of [STORAGE_KEYS.SHOP_DOMAIN, STORAGE_KEYS.CURRENT_STORE]) {
      window.sessionStorage?.removeItem(key);
      window.localStorage?.removeItem(key);
    }
  } catch (_) {
    // ignore
  }
}

/**
 * Set current store for this tab; updates both sessionStorage and localStorage
 * so store switcher works in "Open app" tabs (session-only) and normal tabs.
 */
export function setCurrentStore(domain) {
  const value = typeof domain === 'string' ? domain.trim() : '';
  if (!value) return;
  try {
    for (const storage of [window.sessionStorage, window.localStorage]) {
      if (storage) {
        storage.setItem(STORAGE_KEYS.CURRENT_STORE, value);
        storage.setItem(STORAGE_KEYS.SHOP_DOMAIN, value);
      }
    }
  } catch (_) {
    // ignore
  }
}

/**
 * Clear all auth-related storage (e.g. on 401 redirect to login).
 * Clears both sessionStorage and localStorage for app credentials so admin panel and user app stay isolated.
 */
export function clearAuthStorage() {
  try {
    setEmailToken(null);
    setAccountApiKey(null);
    for (const key of [
      STORAGE_KEYS.API_KEY,
      STORAGE_KEYS.SHOP_DOMAIN,
      STORAGE_KEYS.CURRENT_STORE,
    ]) {
      window.sessionStorage?.removeItem(key);
      window.localStorage?.removeItem(key);
    }
    window.localStorage?.removeItem(STORAGE_KEYS.DOMAIN_KEYS);
  } catch (_) {
    // ignore
  }
}

/**
 * Check if we're in standalone mode (API key auth).
 * When the current domain is a Shopify store (*.myshopify.com), we're in Shopify context
 * and should show Shopify setup/UI even if an API key is in storage.
 */
export function isStandaloneMode() {
  const shop = getShopDomain();
  if (shop && isShopifyStoreDomain(shop)) return false;
  return !!getApiKey();
}

/**
 * Check if we have email session (no shop/API key yet)
 */
export function hasEmailSession() {
  return !!getEmailToken();
}

/**
 * Has any auth: shop, API key, or email session
 */
export function hasCredentials() {
  return (
    hasCredentialsFromSources(getShopDomain(), getApiKey(), getEmailToken()) ||
    hasShopifyEmbedSessionHint()
  );
}

/**
 * Request with Bearer token (for /api/me/* when logged in via email)
 */
export function apiMeGet(endpoint, config = {}) {
  const token = getEmailToken();
  if (!token) {
    return Promise.reject(new Error('Email session required'));
  }
  const url = `${API_BASE_URL}${endpoint}`;
  return apiClient({
    method: 'GET',
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...config.headers,
    },
    ...config,
  });
}

export function apiMePost(endpoint, data, config = {}) {
  const token = getEmailToken();
  if (!token) {
    return Promise.reject(new Error('Email session required'));
  }
  const url = `${API_BASE_URL}${endpoint}`;
  return apiClient({
    method: 'POST',
    url,
    data: data || {},
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...config.headers,
    },
    ...config,
  });
}

export function apiMeDelete(endpoint, config = {}) {
  const token = getEmailToken();
  if (!token) {
    return Promise.reject(new Error('Email session required'));
  }
  const url = `${API_BASE_URL}${endpoint}`;
  return apiClient({
    method: 'DELETE',
    url,
    headers: {
      Authorization: `Bearer ${token}`,
      ...config.headers,
    },
    ...config,
  });
}

/**
 * Make API request with shop domain or API key
 *
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body (for POST/PUT)
 * @param {Object} config - Additional axios config
 * @returns {Promise} Axios response
 */
export function apiRequest(method, endpoint, data = null, config = {}) {
  const shopDomain = getShopDomain();
  const apiKey = getApiKey();
  const url = `${API_BASE_URL}${endpoint}`;

  const emailToken = getEmailToken();
  const allowedWithoutShopOrKey =
    emailToken &&
    (endpoint.startsWith('/admin/') ||
      endpoint.startsWith('/me/') ||
      endpoint.startsWith('/auth/start') ||
      endpoint.startsWith('/account/stores') ||
      endpoint.startsWith('/support/'));
  if (!shopDomain && !apiKey && !allowedWithoutShopOrKey) {
    throw new Error('Missing credentials. Open from Shopify Admin or set API key.');
  }

  // Extract params and headers from config to avoid conflicts
  const { params: configParams = {}, headers: configHeaders = {}, ...restConfig } = config;

  // Use email session for admin/me, auth/start, account/stores, and support (so Bearer token is sent when logged in)
  const useEmailSession =
    getEmailToken() &&
    (endpoint.startsWith('/admin/') ||
      endpoint.startsWith('/me/') ||
      endpoint.startsWith('/auth/start') ||
      endpoint.startsWith('/account/stores') ||
      endpoint.startsWith('/support/'));

  // When on /app/:domain, pass store so /account/stores returns correct currentStore.
  // Outside domain-scoped routes, avoid forcing a specific store context.
  const currentPath =
    typeof window !== 'undefined' ? getEmbeddedAppRelativePathname(window.location.pathname) : '';
  const isOnAppDomainRoute = /^\/app\/[^/]+/.test(currentPath);
  const storeParam =
    endpoint === '/account/stores' && shopDomain && isOnAppDomainRoute ? { store: shopDomain } : {};
  const requestConfig = {
    method,
    url,
    params: useEmailSession
      ? { ...storeParam, ...configParams }
      : shopDomain
        ? { shop: shopDomain, ...configParams }
        : configParams,
    headers: {
      'Content-Type': 'application/json',
      ...configHeaders,
    },
    ...restConfig,
  };

  if (useEmailSession) {
    requestConfig.headers['Authorization'] = `Bearer ${getEmailToken()}`;
  } else if (apiKey) {
    requestConfig.headers['X-RipX-API-Key'] = apiKey;
    const currentStore =
      shopDomain ||
      (typeof window !== 'undefined' &&
        (getAppCred(STORAGE_KEYS.CURRENT_STORE) || getAppCred(STORAGE_KEYS.SHOP_DOMAIN)));
    if (currentStore) {
      requestConfig.headers['X-RipX-Store'] = currentStore;
    }
  }

  if (!useEmailSession && shopDomain) {
    // Normalize .myshopify.com to lowercase so backend session lookup matches
    const normalized = /\.myshopify\.com$/i.test(shopDomain)
      ? shopDomain.trim().toLowerCase()
      : shopDomain;
    requestConfig.headers['X-Shopify-Shop-Domain'] = normalized;
  }

  if (data) {
    requestConfig.data = data;
  }

  return apiClient(requestConfig);
}

/**
 * Unwrap API response payload. Backend may return { data } or the payload directly.
 * Use for consistent handling: const payload = unwrapData(res);
 */
export function unwrapData(response) {
  if (!response?.data) return response;
  return response.data?.data !== undefined ? response.data.data : response.data;
}

/**
 * GET request helper
 */
export function apiGet(endpoint, params = {}, config = {}) {
  return apiRequest('GET', endpoint, null, { params, ...config });
}

/**
 * POST request helper
 */
export function apiPost(endpoint, data, config = {}) {
  return apiRequest('POST', endpoint, data, config);
}

/**
 * PUT request helper
 */
export function apiPut(endpoint, data, config = {}) {
  return apiRequest('PUT', endpoint, data, config);
}

/**
 * PATCH request helper
 */
export function apiPatch(endpoint, data, config = {}) {
  return apiRequest('PATCH', endpoint, data, config);
}

/**
 * DELETE request helper
 */
export function apiDelete(endpoint, config = {}) {
  return apiRequest('DELETE', endpoint, null, config);
}

/**
 * Public API request (no auth) - for tenant registration, etc.
 */
export function apiPostPublic(endpoint, data, config = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  return apiClient({
    method: 'POST',
    url,
    data: data || {},
    headers: { 'Content-Type': 'application/json', ...config.headers },
    ...config,
  });
}
