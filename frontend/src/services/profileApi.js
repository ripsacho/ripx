/**
 * Profile API Service
 *
 * Handles API calls for user profile, account, and preferences
 * Falls back to localStorage if API is unavailable
 */

import axios from 'axios';

// Vite uses import.meta.env instead of process.env
// Environment variables must be prefixed with VITE_ to be exposed to the client
// In dev mode, use the Vite proxy (/api), in production use full URL
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:3000/api');
const SHOP_DOMAIN = import.meta.env.VITE_SHOP_DOMAIN || 'demo.myshopify.com';

/**
 * Get shop domain from URL or environment
 */
function getShopDomain() {
  // Try to get from URL params (for Shopify embedded app)
  const urlParams = new URLSearchParams(window.location.search);
  const shop = urlParams.get('shop');
  
  if (shop) {
    return shop;
  }
  
  // Fall back to environment variable or default
  return SHOP_DOMAIN;
}

/**
 * Make API request with error handling
 */
async function apiRequest(method, endpoint, data = null) {
  try {
    const shopDomain = getShopDomain();
    const url = `${API_BASE_URL}${endpoint}?shop=${shopDomain}`;
    
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    // Log the actual error for debugging
    if (import.meta.env.DEV) {
      console.error('API Request Error:', {
        code: error.code,
        message: error.message,
        status: error.response?.status,
        url: error.config?.url
      });
    }
    
    // If API is unavailable (network error or server error), use localStorage fallback
    if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
      // Only log in development
      if (import.meta.env.DEV) {
        console.warn('Network error: API unavailable, using localStorage fallback');
      }
      return { success: false, error: 'API unavailable' };
    }
    
    // For 500 errors, check if it's a database issue (table doesn't exist)
    // In that case, our routes should return 200 with defaults, but if they don't,
    // we'll fall back to localStorage
    if (error.response?.status >= 500) {
      // Only log in development
      if (import.meta.env.DEV) {
        console.warn('Server error: Using localStorage fallback. Run migrations to use database.');
      }
      return { success: false, error: 'API unavailable' };
    }
    
    // For other errors (400, 401, 404), throw to be handled by caller
    throw error;
  }
}

/**
 * Get user profile, account, and preferences
 */
export async function getProfile() {
  try {
    const result = await apiRequest('GET', '/profile');
    
    if (result.success && result.data) {
      // Response structure: { success: true, profile: {...}, account: {...}, preferences: {...} }
      // or { success: true, data: { profile: {...}, account: {...}, preferences: {...} } }
      const responseData = result.data.data || result.data;
      const { profile, account, preferences } = responseData;
      
      // Cache in localStorage as backup
      if (profile) localStorage.setItem('ripx_profile', JSON.stringify(profile));
      if (account) localStorage.setItem('ripx_account', JSON.stringify(account));
      if (preferences) localStorage.setItem('ripx_preferences', JSON.stringify(preferences));
      
      return responseData;
    }
  } catch (error) {
    // Only log actual errors, not expected fallbacks
    if (error.response?.status < 500) {
      console.error('Error fetching profile:', error);
    }
  }
  
  // Fallback to localStorage (silent - this is expected behavior)
  return {
    profile: JSON.parse(localStorage.getItem('ripx_profile') || '{}'),
    account: JSON.parse(localStorage.getItem('ripx_account') || '{}'),
    preferences: JSON.parse(localStorage.getItem('ripx_preferences') || '{}')
  };
}

/**
 * Update user profile
 */
export async function updateProfile(profileData) {
  try {
    const result = await apiRequest('PUT', '/profile/profile', profileData);
    
    if (result.success) {
      // Update localStorage cache
      localStorage.setItem('ripx_profile', JSON.stringify(profileData));
      return { success: true, data: result.data?.data || profileData };
    }
  } catch (error) {
    console.error('Error updating profile:', error);
  }
  
  // Fallback to localStorage
  localStorage.setItem('ripx_profile', JSON.stringify(profileData));
  return { success: true, data: profileData };
}

/**
 * Update account settings
 */
export async function updateAccount(accountData) {
  try {
    const result = await apiRequest('PUT', '/profile/account', accountData);
    
    if (result.success) {
      // Update localStorage cache
      localStorage.setItem('ripx_account', JSON.stringify(accountData));
      return { success: true, data: result.data?.data || accountData };
    }
  } catch (error) {
    console.error('Error updating account:', error);
  }
  
  // Fallback to localStorage
  localStorage.setItem('ripx_account', JSON.stringify(accountData));
  return { success: true, data: accountData };
}

/**
 * Update user preferences
 */
export async function updatePreferences(preferences) {
  try {
    const result = await apiRequest('PUT', '/profile/preferences', preferences);
    
    if (result.success) {
      // Update localStorage cache
      localStorage.setItem('ripx_preferences', JSON.stringify(preferences));
      return { success: true, data: result.data?.data || preferences };
    }
  } catch (error) {
    console.error('Error updating preferences:', error);
  }
  
  // Fallback to localStorage
  localStorage.setItem('ripx_preferences', JSON.stringify(preferences));
  return { success: true, data: preferences };
}

