/**
 * Route Constants
 * 
 * Centralized route definitions for the application
 */

export const ROUTES = {
  // Main routes
  DASHBOARD: '/',
  TESTS: '/tests',
  CREATE_TEST: '/tests/new',
  ANALYTICS: '/analytics',
  SETTINGS: '/settings',
  PROFILE: '/profile',
  
  // Dynamic routes
  TEST_DETAIL: (id) => `/tests/${id}`,
  TEST_ANALYTICS: (id) => `/tests/${id}/analytics`,
  TEST_EXPORT: (id) => `/tests/${id}/export`,
  
  // Profile tabs
  PROFILE_ACCOUNT: '/profile?tab=account',
  PROFILE_PREFERENCES: '/profile?tab=preferences',
};

