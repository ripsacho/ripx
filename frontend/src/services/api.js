/**
 * API Utility
 *
 * Common axios patterns and helpers for API calls
 */

import axios from 'axios';
import { STORAGE_KEYS, ROUTES } from '../constants';

// Use VITE_API_URL when set; otherwise /api for same-origin (works with proxy in dev and when served from same host)
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance with default config
const apiClient = axios.create({
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: add correlation ID for distributed tracing
apiClient.interceptors.request.use((config) => {
  if (!config.headers['X-Request-ID']) {
    config.headers['X-Request-ID'] = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
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
      const shopDomain = getShopDomain();
      const apiKey = getApiKey();
      const path = window.location.pathname;
      if (shopDomain && !apiKey && !path.startsWith('/api/auth')) {
        window.location.href = `/api/auth?shop=${encodeURIComponent(shopDomain)}`;
      } else if (apiKey && !path.startsWith('/connect')) {
        window.location.href = ROUTES.CONNECT;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Get shop domain from URL or environment
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
    storedShop = window.localStorage.getItem(STORAGE_KEYS.SHOP_DOMAIN);
  } catch (error) {
    storedShop = null;
  }

  let currentStore = null;
  try {
    currentStore = window.localStorage.getItem(STORAGE_KEYS.CURRENT_STORE);
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
      if (resolvedShop !== storedShop) {
        window.localStorage.setItem(STORAGE_KEYS.SHOP_DOMAIN, resolvedShop);
      }
    } catch (error) {
      // Ignore storage errors (private mode, blocked storage)
    }
  }

  return resolvedShop;
}

/**
 * Get API key for standalone mode (from env or localStorage)
 */
export function getApiKey() {
  try {
    return (
      import.meta.env.VITE_RIPX_API_KEY ||
      window.localStorage.getItem(STORAGE_KEYS.API_KEY) ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Check if we're in standalone mode (API key auth)
 */
export function isStandaloneMode() {
  return !!getApiKey();
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

  if (!shopDomain && !apiKey) {
    throw new Error('Missing credentials. Open from Shopify Admin or set API key.');
  }

  // Extract params and headers from config to avoid conflicts
  const { params: configParams = {}, headers: configHeaders = {}, ...restConfig } = config;

  const requestConfig = {
    method,
    url,
    params: shopDomain ? { shop: shopDomain, ...configParams } : configParams,
    headers: {
      'Content-Type': 'application/json',
      ...configHeaders,
    },
    ...restConfig,
  };

  if (apiKey) {
    requestConfig.headers['X-RipX-API-Key'] = apiKey;
    const currentStore =
      shopDomain ||
      (typeof window !== 'undefined' &&
        (window.localStorage?.getItem(STORAGE_KEYS.CURRENT_STORE) ||
          window.localStorage?.getItem(STORAGE_KEYS.SHOP_DOMAIN)));
    if (currentStore) {
      requestConfig.headers['X-RipX-Store'] = currentStore;
    }
  }

  if (shopDomain) {
    requestConfig.headers['X-Shopify-Shop-Domain'] = shopDomain;
  }

  if (data) {
    requestConfig.data = data;
  }

  return apiClient(requestConfig);
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
