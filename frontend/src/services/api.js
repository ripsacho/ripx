/**
 * API Utility
 *
 * Common axios patterns and helpers for API calls
 */

import axios from 'axios';
import { STORAGE_KEYS, ROUTES } from '../constants';

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

// Request interceptor: add correlation ID for distributed tracing
apiClient.interceptors.request.use(config => {
  if (!config.headers['X-Request-ID']) {
    config.headers['X-Request-ID'] =
      `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  response => response,
  error => {
    // Handle network errors
    if (error.code === 'ECONNABORTED') {
      error.message = 'Request timeout. Please try again.';
    } else if (error.code === 'ERR_NETWORK') {
      error.message = 'Network error. Please check your connection.';
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
      const shopDomain = getShopDomain();
      const apiKey = getApiKey();
      const path = window.location.pathname;
      const emailToken = getEmailToken();
      const onPublicAuthPage =
        path.startsWith(ROUTES.CONNECT) || path.startsWith(ROUTES.AUTH_CALLBACK);
      // Email session or API key: clear and send to login (single entry is email)
      if ((apiKey || emailToken) && !onPublicAuthPage) {
        isRedirectingToLogin = true;
        clearAuthStorage();
        window.location.href = ROUTES.CONNECT;
      } else if (shopDomain && !apiKey && !emailToken && !path.startsWith('/api/auth')) {
        // Shop in URL but no session: redirect to Shopify OAuth only when not using email login
        isRedirectingToLogin = true;
        window.location.href = `/api/auth?shop=${encodeURIComponent(shopDomain)}`;
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
 * Reads sessionStorage first so "Open app" window credentials don't leak to admin panel tab.
 */
export function getShopDomain() {
  const urlParams = new URLSearchParams(window.location.search);
  const shop = urlParams.get('shop');
  const host = urlParams.get('host');
  let shopFromHost = null;

  if (host) {
    try {
      const decodedHost = window.atob(host);
      shopFromHost = decodedHost.split('/')[0] || null;
    } catch (error) {
      shopFromHost = null;
    }
  }
  const shopFromAppBridge = window.Shopify?.shop;
  let storedShop = null;

  try {
    storedShop = getAppCred(STORAGE_KEYS.SHOP_DOMAIN);
  } catch (error) {
    storedShop = null;
  }

  let currentStore = null;
  try {
    currentStore = getAppCred(STORAGE_KEYS.CURRENT_STORE);
  } catch {
    currentStore = null;
  }

  const resolvedShop =
    shop ||
    shopFromAppBridge ||
    shopFromHost ||
    storedShop ||
    currentStore ||
    import.meta.env.VITE_SHOP_DOMAIN ||
    null;

  if (resolvedShop) {
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
 * Check if we're in standalone mode (API key auth)
 */
export function isStandaloneMode() {
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
  return !!getShopDomain() || !!getApiKey() || !!getEmailToken();
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
    emailToken && (endpoint.startsWith('/admin/') || endpoint.startsWith('/me/'));
  if (!shopDomain && !apiKey && !allowedWithoutShopOrKey) {
    throw new Error('Missing credentials. Open from Shopify Admin or set API key.');
  }

  // Extract params and headers from config to avoid conflicts
  const { params: configParams = {}, headers: configHeaders = {}, ...restConfig } = config;

  const useEmailSession =
    getEmailToken() && (endpoint.startsWith('/admin/') || endpoint.startsWith('/me/'));

  const requestConfig = {
    method,
    url,
    params: useEmailSession
      ? configParams
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
    requestConfig.headers['X-Shopify-Shop-Domain'] = shopDomain;
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
