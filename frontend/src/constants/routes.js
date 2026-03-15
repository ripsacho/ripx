/**
 * Route Constants
 *
 * Centralized route definitions for the application:
 * - ROUTES: static paths and builder functions for navigation
 * - ROUTE_PATTERNS: path patterns for React Router <Route path="..." />
 */

export const ROUTES = {
  // User panel (post-login home for all users)
  USER_PANEL: '/',

  // Domain-scoped AB test app (path-based; domain in URL)
  APP_DOMAIN: '/app/:domain',
  appDashboard: domain => `/app/${encodeURIComponent(domain)}`,
  appTests: domain => `/app/${encodeURIComponent(domain)}/tests`,
  appTestsPersonalization: domain =>
    `/app/${encodeURIComponent(domain)}/tests?view=personalization`,
  appCreateTest: domain => `/app/${encodeURIComponent(domain)}/tests/new`,
  appAnalytics: domain => `/app/${encodeURIComponent(domain)}/analytics`,
  appSetup: domain => `/app/${encodeURIComponent(domain)}/setup`,
  appSettings: domain => `/app/${encodeURIComponent(domain)}/settings`,
  appProfile: domain => `/app/${encodeURIComponent(domain)}/profile`,
  appNotifications: domain => `/app/${encodeURIComponent(domain)}/notifications`,
  appDocs: domain => `/app/${encodeURIComponent(domain)}/docs`,
  appTestDetail: (domain, id) => `/app/${encodeURIComponent(domain)}/tests/${id}`,
  appTestEditor: (domain, id) => `/app/${encodeURIComponent(domain)}/tests/${id}/editor`,
  appTestAnalytics: (domain, id) => `/app/${encodeURIComponent(domain)}/tests/${id}/analytics`,
  appTestExport: (domain, id) => `/app/${encodeURIComponent(domain)}/tests/${id}/export`,
  appTestPromoLinks: (domain, id) => `/app/${encodeURIComponent(domain)}/tests/${id}/promo-links`,

  // Legacy root paths (redirect to user panel or /app/:domain when appropriate)
  DASHBOARD: '/',
  TESTS: '/tests',
  TESTS_PERSONALIZATION: '/tests?view=personalization',
  CREATE_TEST: '/tests/new',
  ANALYTICS: '/analytics',
  SETUP: '/setup',
  CONNECT: '/connect',
  CONNECT_ADD: '/connect?tab=add',
  /** After OAuth callback; shows "Close this tab" when opened from embed, else redirects to app */
  CONNECT_OAUTH_SUCCESS: '/connect/oauth-success',
  SETTINGS: '/settings',
  PROFILE: '/profile',
  NOTIFICATIONS: '/notifications',
  DOCS: '/docs',
  SUPPORT: '/support',
  appSupport: domain => `/app/${encodeURIComponent(domain)}/support`,

  // Email session (standalone user): domain list and auth callback
  DOMAINS: '/domains',
  AUTH_CALLBACK: '/auth/callback',
  AUTH_CONFIRM_RESULT: '/auth/confirm-result',

  /** Connect page ?reason= values (show contextual banner) */
  CONNECT_REASON: {
    SIGN_IN_TO_CONNECT: 'sign_in_to_connect',
    SIGN_IN_TO_LINK: 'sign_in_to_link',
    STORE_LINKED_TO_ANOTHER: 'store_linked_to_another',
    OAUTH_EXPIRED: 'oauth_expired',
    /** OAuth callback had different shop than started → back to Domains to retry */
    OAUTH_WRONG_STORE: 'oauth_wrong_store',
  },

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
  ADMIN_SUPPORT_TICKETS: '/admin/support-tickets',

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

/** Paths that are "main app" (dashboard, tests, etc.) – used for redirecting when user must choose a store first. Domain-scoped app lives under /app/:domain. */
export const MAIN_APP_PATHS = [
  ROUTES.USER_PANEL,
  ROUTES.DOMAINS,
  ROUTES.DASHBOARD,
  ROUTES.TESTS,
  ROUTES.CREATE_TEST,
  ROUTES.ANALYTICS,
  ROUTES.SETUP,
  ROUTES.SETTINGS,
  ROUTES.PROFILE,
  ROUTES.NOTIFICATIONS,
  ROUTES.DOCS,
  ROUTES.SUPPORT,
];

/** Universal app routes: Profile, Account settings, Notifications, Documentation. Shown with TopBar only (no sidebar). */
export const UNIVERSAL_APP_ROUTES = [
  ROUTES.PROFILE,
  ROUTES.SETTINGS,
  ROUTES.NOTIFICATIONS,
  ROUTES.DOCS,
  ROUTES.SUPPORT,
];

/** Path pattern for domain-scoped app; match pathname with this to detect "in app" routes */
export const APP_DOMAIN_PATTERN = /^\/app\/[^/]+/;

/** Path patterns for React Router Route components */
export const ROUTE_PATTERNS = {
  APP_DOMAIN: '/app/:domain',
  APP_TEST_DETAIL: '/app/:domain/tests/:id',
  APP_TEST_EDITOR: '/app/:domain/tests/:id/editor',
  APP_TEST_ANALYTICS: '/app/:domain/tests/:id/analytics',
  APP_TEST_EXPORT: '/app/:domain/tests/:id/export',
  APP_TEST_PROMO_LINKS: '/app/:domain/tests/:id/promo-links',
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
