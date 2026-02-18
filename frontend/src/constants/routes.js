/**
 * Route Constants
 *
 * Centralized route definitions for the application:
 * - ROUTES: static paths and builder functions for navigation
 * - ROUTE_PATTERNS: path patterns for React Router <Route path="..." />
 */

export const ROUTES = {
  // Main routes
  DASHBOARD: '/',
  TESTS: '/tests',
  TESTS_PERSONALIZATION: '/tests?view=personalization',
  CREATE_TEST: '/tests/new',
  ANALYTICS: '/analytics',
  SETUP: '/setup',
  CONNECT: '/connect',
  CONNECT_ADD: '/connect?tab=add',
  SETTINGS: '/settings',
  PROFILE: '/profile',
  DOCS: '/docs',

  // Dynamic routes (for navigation)
  TEST_DETAIL: id => `/tests/${id}`,
  TEST_ANALYTICS: id => `/tests/${id}/analytics`,
  TEST_EXPORT: id => `/tests/${id}/export`,
  TEST_PROMO_LINKS: id => `/tests/${id}/promo-links`,

  // Profile tabs
  PROFILE_ACCOUNT: '/profile?tab=account',
  PROFILE_PREFERENCES: '/profile?tab=preferences',
};

/** Path patterns for React Router Route components */
export const ROUTE_PATTERNS = {
  TEST_DETAIL: '/tests/:id',
  TEST_ANALYTICS: '/tests/:id/analytics',
  TEST_EXPORT: '/tests/:id/export',
  TEST_PROMO_LINKS: '/tests/:id/promo-links',
};
