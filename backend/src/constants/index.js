/**
 * Application Constants
 *
 * Centralized constants for the RipX application
 */

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// Test Status Values
const TEST_STATUS = {
  DRAFT: 'draft',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
};

// Test Types
// API/backend canonical for price tests is "price"; UI may label as "Pricing Test". Validators accept both "price" and "pricing".
const TEST_TYPES = {
  PRICE: 'price',
  CONTENT: 'content',
  SHIPPING: 'shipping',
  OFFER: 'offer',
  ONSITE_EDIT: 'onsite-edit',
  SPLIT_URL: 'split-url',
  TEMPLATE: 'template',
  THEME: 'theme',
  CHECKOUT: 'checkout',
  COMBINATION: 'combination',
};

// Target Types
const TARGET_TYPES = {
  PRODUCT: 'product',
  COLLECTION: 'collection',
  HOMEPAGE: 'homepage',
  CART: 'cart',
  CHECKOUT: 'checkout',
  ALL_PRODUCTS: 'all-products',
  PAGE: 'page',
  ALL: 'all',
};

// Statistical Significance Threshold
const STATISTICAL_THRESHOLD = {
  P_VALUE: 0.05,
  CONFIDENCE_LEVEL: 95,
};

// Default Values
const DEFAULTS = {
  TEST_STATUS: TEST_STATUS.DRAFT,
  TRAFFIC_ALLOCATION: 50,
  MIN_VARIANTS: 2,
  MAX_VARIANTS: 10,
};

// Error Messages
const ERROR_MESSAGES = {
  TEST_NOT_FOUND: 'Test not found',
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  INTERNAL_ERROR: 'Internal server error',
  INVALID_INPUT: 'Invalid input',
  DATABASE_ERROR: 'Database error',
  SHOPIFY_ERROR: 'Shopify API error',
};

// Success Messages
const SUCCESS_MESSAGES = {
  TEST_CREATED: 'Test created successfully',
  TEST_UPDATED: 'Test updated successfully',
  TEST_DELETED: 'Test deleted successfully',
  TEST_STARTED: 'Test started successfully',
  TEST_STOPPED: 'Test stopped successfully',
  TEST_CLONED: 'Test cloned successfully',
  PROFILE_UPDATED: 'Profile updated successfully',
  ACCOUNT_UPDATED: 'Account settings updated successfully',
  PREFERENCES_UPDATED: 'Preferences updated successfully',
};

// Rate Limiting (env overrides for production tuning)
// Default 400/15min so app load does not hit 429
const RATE_LIMIT = {
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 min default
  MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 400,
};

// Pagination
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

module.exports = {
  HTTP_STATUS,
  TEST_STATUS,
  TEST_TYPES,
  TARGET_TYPES,
  STATISTICAL_THRESHOLD,
  DEFAULTS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  RATE_LIMIT,
  PAGINATION,
};
