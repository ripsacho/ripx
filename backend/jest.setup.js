/**
 * Jest setup - runs before tests
 * Sets env so modules and validateEnvironment() (in app.js) don't fail.
 * Shopify API lib requires apiKey, apiSecretKey, scopes when shopifyService loads.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://localhost:5432/ripx_test_placeholder';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-at-least-32-characters-long';
process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || 'test_shopify_api_key';
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || 'test_shopify_api_secret';
process.env.SHOPIFY_SCOPES =
  process.env.SHOPIFY_SCOPES ||
  'read_online_store_pages,read_orders,read_products,read_collections,write_products,read_shipping,write_shipping,read_payment_customizations,write_payment_customizations,read_delivery_customizations,write_delivery_customizations,read_discounts,write_discounts,read_cart_transforms,write_cart_transforms,read_content,write_content,read_metaobjects,write_metaobjects,read_themes,write_themes,write_orders';
