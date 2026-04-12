/**
 * App Constants
 *
 * Application-wide configuration: breakpoints, storage keys, intervals.
 * Single source of truth for values used across multiple modules.
 */

/** Viewport breakpoints (px) - used for responsive layout */
export const BREAKPOINTS = {
  MOBILE: 900,
  TABLET: 1024,
  DESKTOP: 1280,
};

/** LocalStorage keys - single source of truth */
export const STORAGE_KEYS = {
  API_KEY: 'ripx_api_key',
  EMAIL_TOKEN: 'ripx_email_token', // JWT from magic-link login (standalone user)
  DOMAIN_KEYS: 'ripx_domain_keys', // JSON: { [domain]: apiKey } when added via POST /api/me/domains
  ACCOUNT_API_KEY: 'ripx_account_api_key', // API key for email user's account (set when first domain added)
  PREFERENCES: 'ripx_preferences',
  PROFILE: 'ripx_profile',
  ACCOUNT: 'ripx_account',
  SHOP_DOMAIN: 'shopDomain',
  CURRENT_STORE: 'ripx_current_store', // Multi-store: selected domain when account has multiple
  /** Set by StoreSwitcher before navigation; AppDomainLayout reads to show “switched store” toast */
  STORE_SWITCH_TOAST: 'ripx_store_switch_toast',
  ANNOUNCEMENT_DISMISSED: 'ripx_announcement_dismissed', // Dismissed announcement banner text
  /** Set before /auth/start so 401 interceptor does not overwrite Shopify OAuth redirect */
  OAUTH_REDIRECTING: 'ripx_oauth_redirecting',
  /** Persisted variant colors (array of hex) – used in wizard, code editor, review, etc. */
  VARIANT_COLORS: 'ripx_variant_colors',
  /** One-time marker for first successful test-start ultra celebration */
  CELEBRATION_ULTRA_SHOWN: 'ripx_celebration_ultra_shown_v1',
};

/** Intervals (ms) */
export const INTERVALS = {
  THEME_CHECK: 60_000, // 1 minute - check for auto/custom theme changes
  /** Session validation: interval between checks when user is logged in */
  SESSION_CHECK: 5 * 60 * 1000, // 5 minutes
  /** Session validation: delay before first check (avoids duplicate with initial /admin/me) */
  SESSION_CHECK_INITIAL_DELAY: 25 * 1000, // 25 seconds
  /** Min ms between visibility-triggered session checks (debounce tab focus) */
  SESSION_CHECK_VISIBILITY_DEBOUNCE: 2000,
  /** Initial auth check: max wait before showing app or failing (avoids infinite loader) */
  AUTH_CHECK_TIMEOUT_MS: 10_000,
};

/**
 * Cache-bust query for storefront script.js — keep in sync with
 * `backend/src/utils/storefrontScriptRuntime.js` SCRIPT_VERSION when the runtime embed contract changes.
 */
export const RIPX_STOREFRONT_SCRIPT_VERSION = '1.0.12';

/** CustomEvent: fired when the app navigates to a new store from the store switcher (TopBar can highlight). */
export const RIPX_STORE_SWITCHED_EVENT = 'ripx:store-switched';

/** App metadata */
export const APP_META = {
  VERSION: '1.0.0',
  NAME: 'RipX',
  DESCRIPTION: 'Professional A/B Testing Platform for Shopify and Standalone Sites',
  MIN_API_VERSION: '1.0.0',
};
