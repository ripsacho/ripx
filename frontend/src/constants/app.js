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
  PREFERENCES: 'ripx_preferences',
  PROFILE: 'ripx_profile',
  ACCOUNT: 'ripx_account',
  SHOP_DOMAIN: 'shopDomain',
  CURRENT_STORE: 'ripx_current_store', // Multi-store: selected domain when account has multiple
};

/** Intervals (ms) */
export const INTERVALS = {
  THEME_CHECK: 60_000, // 1 minute - check for auto/custom theme changes
};

/** App metadata */
export const APP_META = {
  VERSION: '1.0.0',
  NAME: 'RipX',
  DESCRIPTION: 'Professional A/B Testing Platform for Shopify and Standalone Sites',
  MIN_API_VERSION: '1.0.0',
};
