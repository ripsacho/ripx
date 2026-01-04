/**
 * API Utility
 * 
 * Common axios patterns and helpers for API calls
 */

import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:3000/api');

// Create axios instance with default config
const apiClient = axios.create({
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
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
        message: error.message
      });
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
  return shop || import.meta.env.VITE_SHOP_DOMAIN || 'demo.myshopify.com';
}

/**
 * Make API request with shop domain automatically added
 * 
 * @param {string} method - HTTP method
 * @param {string} endpoint - API endpoint
 * @param {Object} data - Request body (for POST/PUT)
 * @param {Object} config - Additional axios config
 * @returns {Promise} Axios response
 */
export async function apiRequest(method, endpoint, data = null, config = {}) {
  const shopDomain = getShopDomain();
  const url = `${API_BASE_URL}${endpoint}`;
  
  // Extract params and headers from config to avoid conflicts
  const { params: configParams = {}, headers: configHeaders = {}, ...restConfig } = config;
  
  const requestConfig = {
    method,
    url,
    params: { shop: shopDomain, ...configParams },
    headers: {
      'Content-Type': 'application/json',
      ...configHeaders
    },
    ...restConfig
  };
  
  if (data) {
    requestConfig.data = data;
  }
  
  return apiClient(requestConfig);
}

/**
 * GET request helper
 */
export async function apiGet(endpoint, params = {}, config = {}) {
  return apiRequest('GET', endpoint, null, { params, ...config });
}

/**
 * POST request helper
 */
export async function apiPost(endpoint, data, config = {}) {
  return apiRequest('POST', endpoint, data, config);
}

/**
 * PUT request helper
 */
export async function apiPut(endpoint, data, config = {}) {
  return apiRequest('PUT', endpoint, data, config);
}

/**
 * DELETE request helper
 */
export async function apiDelete(endpoint, config = {}) {
  return apiRequest('DELETE', endpoint, null, config);
}

