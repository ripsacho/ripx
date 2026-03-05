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
  NOTIFICATIONS: '/notifications',
  DOCS: '/docs',

  // Email session (standalone user): domain list and auth callback
  DOMAINS: '/domains',
  AUTH_CALLBACK: '/auth/callback',
  AUTH_CONFIRM_RESULT: '/auth/confirm-result',

  // Admin panel
  ADMIN: '/admin',
  ADMIN_OVERVIEW: '/admin',
  ADMIN_USERS: '/admin/users',
  ADMIN_DOMAINS: '/admin/domains',
  ADMIN_TESTS: '/admin/tests',
  ADMIN_AUDIT: '/admin/audit',
  ADMIN_KV: '/admin/kv',
  ADMIN_JOBS: '/admin/jobs',
  ADMIN_FEATURE_FLAGS: '/admin/feature-flags',
  ADMIN_PROMO_LINKS: '/admin/promo-links',
  ADMIN_BLOCK_LIST: '/admin/block-list',
  ADMIN_WEBHOOK_EVENTS: '/admin/webhook-events',
  ADMIN_TARGETING_PRESETS: '/admin/targeting-presets',
  ADMIN_WEBHOOKS: '/admin/webhooks',
  ADMIN_SHOP_SESSIONS: '/admin/shop-sessions',
  ADMIN_CONFLICTS: '/admin/conflicts',
  ADMIN_TEST_HEALTH: '/admin/test-health',
  ADMIN_SHOP_SETTINGS_OVERRIDES: '/admin/shop-settings-overrides',
  ADMIN_RATE_LIMIT_OVERRIDES: '/admin/rate-limit-overrides',
  ADMIN_NOTIFICATIONS: '/admin/notifications',
  ADMIN_SIGNIFICANCE_ALERTS: '/admin/significance-alerts',
  ADMIN_EVENT_CATALOG: '/admin/event-catalog',
  ADMIN_CLIENT_ERRORS: '/admin/client-errors',
  ADMIN_CONSENT_SCRIPT: '/admin/consent-script',
  ADMIN_ACCOUNTS: '/admin/accounts',
  ADMIN_AGGREGATION: '/admin/aggregation',
  ADMIN_LEGAL: '/admin/legal',
  ADMIN_MAINTENANCE: '/admin/maintenance',
  ADMIN_ANNOUNCEMENT_BANNER: '/admin/announcement-banner',
  ADMIN_MAIL_PROCESSES: '/admin/mail-processes',
  ADMIN_USAGE_EXPORT: '/admin/usage-export',

  // Dynamic routes (for navigation)
  TEST_DETAIL: id => `/tests/${id}`,
  TEST_EDITOR: id => `/tests/${id}/editor`,
  TEST_ANALYTICS: id => `/tests/${id}/analytics`,
  TEST_EXPORT: id => `/tests/${id}/export`,
  TEST_PROMO_LINKS: id => `/tests/${id}/promo-links`,

  // Profile tabs
  PROFILE_ACCOUNT: '/profile?tab=account',
  PROFILE_PREFERENCES: '/profile?tab=preferences',
};

/** Paths that are "main app" (dashboard, tests, etc.) – used for redirecting to domain list when user must choose a store first */
export const MAIN_APP_PATHS = [
  ROUTES.DASHBOARD,
  ROUTES.TESTS,
  ROUTES.CREATE_TEST,
  ROUTES.ANALYTICS,
  ROUTES.SETUP,
  ROUTES.SETTINGS,
  ROUTES.PROFILE,
  ROUTES.NOTIFICATIONS,
  ROUTES.DOCS,
];

/** Path patterns for React Router Route components */
export const ROUTE_PATTERNS = {
  TEST_DETAIL: '/tests/:id',
  TEST_EDITOR: '/tests/:id/editor',
  TEST_ANALYTICS: '/tests/:id/analytics',
  TEST_EXPORT: '/tests/:id/export',
  TEST_PROMO_LINKS: '/tests/:id/promo-links',
  ADMIN: '/admin',
  ADMIN_USER: '/admin/users/:shopDomain',
  ADMIN_DOMAIN: '/admin/domains/:domain',
  ADMIN_ACCOUNT: '/admin/accounts/:id',
};
