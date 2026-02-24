/**
 * Profile API Service
 *
 * Handles API calls for user profile, account, and preferences.
 * Uses shared api service for auth (Shopify + API key / standalone).
 * Falls back to localStorage if API is unavailable.
 */

import { apiGet, apiPut, getShopDomain, getApiKey } from './api';

/**
 * Get user profile, account, and preferences
 */
export async function getProfile() {
  if (!getShopDomain() && !getApiKey()) {
    return {
      profile: JSON.parse(localStorage.getItem('ripx_profile') || '{}'),
      account: JSON.parse(localStorage.getItem('ripx_account') || '{}'),
      preferences: JSON.parse(localStorage.getItem('ripx_preferences') || '{}'),
    };
  }

  try {
    const res = await apiGet('/profile');
    const responseData = res.data?.data || res.data;
    const { profile, account, preferences } = responseData || {};

    if (profile) localStorage.setItem('ripx_profile', JSON.stringify(profile));
    if (account) localStorage.setItem('ripx_account', JSON.stringify(account));
    if (preferences) localStorage.setItem('ripx_preferences', JSON.stringify(preferences));

    return (
      responseData || {
        profile: {},
        account: {},
        preferences: {},
      }
    );
  } catch (error) {
    if (import.meta.env.DEV && error?.response?.status < 500) {
      console.error('Error fetching profile:', error);
    }
  }

  return {
    profile: JSON.parse(localStorage.getItem('ripx_profile') || '{}'),
    account: JSON.parse(localStorage.getItem('ripx_account') || '{}'),
    preferences: JSON.parse(localStorage.getItem('ripx_preferences') || '{}'),
  };
}

/**
 * Update user profile
 */
export async function updateProfile(profileData) {
  if (!getShopDomain() && !getApiKey()) {
    localStorage.setItem('ripx_profile', JSON.stringify(profileData));
    return { success: true, data: profileData };
  }

  try {
    const res = await apiPut('/profile/profile', profileData);
    const data = res.data?.data || res.data || profileData;
    localStorage.setItem('ripx_profile', JSON.stringify(profileData));
    return { success: true, data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error updating profile:', error);
    }
    localStorage.setItem('ripx_profile', JSON.stringify(profileData));
    return { success: true, data: profileData };
  }
}

/**
 * Update account settings
 */
export async function updateAccount(accountData) {
  if (!getShopDomain() && !getApiKey()) {
    localStorage.setItem('ripx_account', JSON.stringify(accountData));
    return { success: true, data: accountData };
  }

  try {
    const res = await apiPut('/profile/account', accountData);
    const data = res.data?.data || res.data || accountData;
    localStorage.setItem('ripx_account', JSON.stringify(accountData));
    return { success: true, data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error updating account:', error);
    }
    localStorage.setItem('ripx_account', JSON.stringify(accountData));
    return { success: true, data: accountData };
  }
}

/**
 * Update user preferences
 */
export async function updatePreferences(preferences) {
  if (!getShopDomain() && !getApiKey()) {
    localStorage.setItem('ripx_preferences', JSON.stringify(preferences));
    return { success: true, data: preferences };
  }

  try {
    const res = await apiPut('/profile/preferences', preferences);
    const data = res.data?.data || res.data || preferences;
    localStorage.setItem('ripx_preferences', JSON.stringify(preferences));
    return { success: true, data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Error updating preferences:', error);
    }
    localStorage.setItem('ripx_preferences', JSON.stringify(preferences));
    return { success: true, data: preferences };
  }
}
