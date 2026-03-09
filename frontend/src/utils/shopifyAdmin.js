/**
 * Shopify Admin helpers – open app in Shopify Admin context (embedded) instead of standalone.
 */

const SHOPIFY_DOMAIN_SUFFIX = /.\.myshopify\.com$/i;

/**
 * Whether the given domain is a Shopify store (myshopify.com).
 * @param {string} domain
 * @returns {boolean}
 */
export function isShopifyStoreDomain(domain) {
  return typeof domain === 'string' && SHOPIFY_DOMAIN_SUFFIX.test(domain.trim());
}

/**
 * Normalize Shopify store domain to lowercase so it matches backend session lookup.
 * @param {string} domain
 * @returns {string} normalized domain, or original if not a Shopify domain
 */
export function normalizeShopifyDomain(domain) {
  if (!domain || typeof domain !== 'string') return domain || '';
  const t = domain.trim();
  return SHOPIFY_DOMAIN_SUFFIX.test(t) ? t.toLowerCase() : t;
}

/**
 * App handle for the Shopify Admin apps URL (from Partner dashboard / shopify.app.toml).
 * Set VITE_SHOPIFY_APP_HANDLE in .env (e.g. "ripx") so "Open app" for Shopify stores
 * opens in Shopify Admin instead of standalone.
 */
const APP_HANDLE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_SHOPIFY_APP_HANDLE
    ? String(import.meta.env.VITE_SHOPIFY_APP_HANDLE).trim()
    : '';

/**
 * URL to open this app in Shopify Admin for the given shop domain.
 * Returns null if not configured (VITE_SHOPIFY_APP_HANDLE) or domain is not a Shopify store.
 * Use this for "Open app" / "Open A/B tests" when platform is shopify so the store
 * opens inside Shopify Admin (embedded) instead of standalone.
 *
 * @param {string} shopDomain - e.g. my-store.myshopify.com
 * @returns {string | null} - e.g. https://admin.shopify.com/store/my-store/apps/ripx or null
 */
export function getShopifyAdminAppUrl(shopDomain) {
  if (!APP_HANDLE || !shopDomain || typeof shopDomain !== 'string') return null;
  const trimmed = shopDomain.trim();
  if (!SHOPIFY_DOMAIN_SUFFIX.test(trimmed)) return null;
  const storeHandle = trimmed.replace(SHOPIFY_DOMAIN_SUFFIX, '');
  if (!storeHandle) return null;
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/apps/${encodeURIComponent(APP_HANDLE)}`;
}
