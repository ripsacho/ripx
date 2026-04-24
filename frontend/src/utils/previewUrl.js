/**
 * Preview URL utilities
 *
 * Single source of truth for A/B test preview link creation.
 * Params must match storefront script (ab_preview*, ab_visual_editor) and backend /api/track/preview.
 */

/** Query param names used by storefront and backend */
export const PREVIEW_PARAMS = {
  PREVIEW: 'ab_preview',
  TEST_ID: 'ab_preview_test',
  VARIANT_ID: 'ab_preview_variant',
  VARIANT_NAME: 'ab_preview_variant_name',
  TENANT_DOMAIN: 'ab_preview_domain',
  VISUAL_EDITOR: 'ab_visual_editor',
  VISUAL_PICKER: 'ab_visual_picker',
};

const PREVIEW_VALUE = '1';
const TEMP_PREVIEW_HOST_SUFFIXES = ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.io'];
const LEGACY_PREVIEW_BOOTSTRAP_PATHS = new Set(['/ripx-preview-test.html']);

function normalizePreviewHostname(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';
  try {
    const url =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? new URL(raw)
        : new URL(`https://${raw}`);
    return String(url.hostname || '')
      .trim()
      .toLowerCase();
  } catch {
    return '';
  }
}

function isShopifyPreviewDomain(domain) {
  const hostname = normalizePreviewHostname(domain);
  return /\.myshopify\.com$/i.test(hostname);
}

function isAllowedOverrideForDomain(candidate, domain) {
  if (!candidate) return false;
  if (!isShopifyPreviewDomain(domain)) return true;
  const candidateHost = normalizePreviewHostname(candidate);
  const domainHost = normalizePreviewHostname(domain);
  if (!candidateHost || !domainHost) return false;
  return candidateHost === domainHost;
}

function isTemporaryPreviewHost(hostname) {
  const host = typeof hostname === 'string' ? hostname.trim().toLowerCase() : '';
  return !!host && TEMP_PREVIEW_HOST_SUFFIXES.some(suffix => host.endsWith(suffix));
}

function getCurrentTemporaryPreviewOrigin() {
  if (typeof window === 'undefined' || !window.location?.origin || !window.location?.hostname) {
    return null;
  }
  if (!isTemporaryPreviewHost(window.location.hostname)) return null;
  try {
    return new URL(window.location.origin);
  } catch {
    return null;
  }
}

function hasLegacyPreviewBootstrapPath(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return false;
  try {
    const url =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? new URL(raw)
        : new URL(`https://${raw}`);
    const pathname = (url.pathname || '').trim().toLowerCase();
    return LEGACY_PREVIEW_BOOTSTRAP_PATHS.has(pathname);
  } catch {
    return false;
  }
}

/**
 * Normalize a base URL or domain for preview.
 * - If input looks like a full URL (has protocol), return as-is (with trailing slash stripped).
 * - If input is a domain (no protocol), return https://domain/
 * @param {string} input - Full URL or domain (e.g. 'https://store.com' or 'store.com')
 * @returns {string|null} Normalized URL or null if invalid/empty
 */
export function normalizePreviewBaseUrl(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return null;
  const withoutProtocol = raw
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .split('/')[0];
  if (!withoutProtocol) return null;
  try {
    const url =
      raw.startsWith('http://') || raw.startsWith('https://')
        ? new URL(raw)
        : new URL(`https://${withoutProtocol}`);
    const currentTemporaryOrigin = getCurrentTemporaryPreviewOrigin();
    if (
      currentTemporaryOrigin &&
      isTemporaryPreviewHost(url.hostname) &&
      url.hostname.toLowerCase() !== currentTemporaryOrigin.hostname.toLowerCase()
    ) {
      url.protocol = currentTemporaryOrigin.protocol;
      url.host = currentTemporaryOrigin.host;
    }
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '') || `${url.origin}/`;
  } catch {
    return null;
  }
}

/**
 * Build a preview URL with standard query params.
 * Uses URL and URLSearchParams for correct encoding of variant names/ids.
 *
 * @param {Object} options
 * @param {string} options.baseUrl - Full page URL (e.g. https://store.com/page)
 * @param {string} options.testId - Test UUID
 * @param {string} [options.variantId] - Variant id or fallback identifier
 * @param {string} [options.variantName] - Human-readable variant name
 * @param {string} [options.tenantDomain] - Saved test domain used for preview API lookups
 * @param {boolean} [options.visualEditor=false] - Add ab_visual_editor=1 for visual editor iframe
 * @param {boolean} [options.visualPicker=false] - Add ab_visual_picker=1 for picker mode
 * @returns {string|null} Full preview URL or null if baseUrl/testId invalid
 */
export function buildPreviewUrl({
  baseUrl,
  testId,
  variantId,
  variantName,
  tenantDomain,
  visualEditor = false,
  visualPicker = false,
}) {
  const normalized = normalizePreviewBaseUrl(baseUrl);
  if (!normalized) return null;
  const tid = testId !== null && testId !== undefined && testId !== '' ? String(testId).trim() : '';
  if (!tid) return null;

  try {
    const url = new URL(normalized);
    url.searchParams.set(PREVIEW_PARAMS.PREVIEW, PREVIEW_VALUE);
    url.searchParams.set(PREVIEW_PARAMS.TEST_ID, tid);
    if (variantId !== null && variantId !== undefined && String(variantId).trim())
      url.searchParams.set(PREVIEW_PARAMS.VARIANT_ID, String(variantId).trim());
    if (variantName !== null && variantName !== undefined && String(variantName).trim())
      url.searchParams.set(PREVIEW_PARAMS.VARIANT_NAME, String(variantName).trim());
    if (tenantDomain !== null && tenantDomain !== undefined && String(tenantDomain).trim()) {
      url.searchParams.set(PREVIEW_PARAMS.TENANT_DOMAIN, String(tenantDomain).trim());
    }
    if (visualEditor) url.searchParams.set(PREVIEW_PARAMS.VISUAL_EDITOR, PREVIEW_VALUE);
    if (visualPicker) url.searchParams.set(PREVIEW_PARAMS.VISUAL_PICKER, PREVIEW_VALUE);
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Build a preview-document URL that proxies the target page while preserving preview params.
 * Useful for Shopify previews where the raw storefront page may not load the RipX runtime reliably.
 *
 * @param {Object} options
 * @param {string} options.apiBaseUrl - API base URL (e.g. /api or https://host/api)
 * @param {string} options.previewUrl - Full preview page URL built by buildPreviewUrl()
 * @param {boolean} [options.visualEditor=false] - Add ab_visual_editor=1 to preview-document
 * @returns {string|null}
 */
export function buildPreviewDocumentUrl({ apiBaseUrl, previewUrl, visualEditor = false }) {
  const directPreviewUrl = typeof previewUrl === 'string' ? previewUrl.trim() : '';
  if (!directPreviewUrl) return null;

  const apiBase =
    (typeof apiBaseUrl === 'string' ? apiBaseUrl.trim() : '').replace(/\/+$/, '') || '/api';
  const previewDocPath = `${apiBase}/track/preview-document`;
  const isRelative = typeof window !== 'undefined' && apiBase && !/^https?:\/\//i.test(apiBase);

  try {
    const previewDoc = isRelative
      ? new URL(
          previewDocPath,
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://preview.invalid'
        )
      : /^https?:\/\//i.test(previewDocPath)
        ? new URL(previewDocPath)
        : new URL(previewDocPath, 'https://preview.invalid');
    previewDoc.searchParams.set('url', directPreviewUrl);
    if (visualEditor) {
      previewDoc.searchParams.set(PREVIEW_PARAMS.VISUAL_EDITOR, PREVIEW_VALUE);
    }

    const directUrl = new URL(directPreviewUrl);
    [
      PREVIEW_PARAMS.PREVIEW,
      PREVIEW_PARAMS.TEST_ID,
      PREVIEW_PARAMS.VARIANT_ID,
      PREVIEW_PARAMS.VARIANT_NAME,
      PREVIEW_PARAMS.TENANT_DOMAIN,
    ].forEach(key => {
      const value = directUrl.searchParams.get(key);
      if (value !== undefined && value !== null && value !== '') {
        previewDoc.searchParams.set(key, value);
      }
    });
    return previewDoc.toString();
  } catch {
    return null;
  }
}

/**
 * Build a client-side preview launch URL that stores preview context in window.name
 * before redirecting to the actual storefront URL. This helps Shopify password pages
 * that drop deep-link query params before the storefront runtime initializes.
 *
 * @param {Object} options
 * @param {string} options.apiBaseUrl - API base URL (e.g. /api or https://host/api)
 * @param {string} options.previewUrl - Full preview page URL built by buildPreviewUrl()
 * @returns {string|null}
 */
export function buildPreviewLaunchUrl({ apiBaseUrl, previewUrl }) {
  const directPreviewUrl = typeof previewUrl === 'string' ? previewUrl.trim() : '';
  if (!directPreviewUrl) return null;

  const apiBase =
    (typeof apiBaseUrl === 'string' ? apiBaseUrl.trim() : '').replace(/\/+$/, '') || '/api';
  const launchPath = `${apiBase}/track/preview-launch`;
  const isRelative = typeof window !== 'undefined' && apiBase && !/^https?:\/\//i.test(apiBase);

  try {
    const launchUrl = isRelative
      ? new URL(
          launchPath,
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://preview.invalid'
        )
      : /^https?:\/\//i.test(launchPath)
        ? new URL(launchPath)
        : new URL(launchPath, 'https://preview.invalid');
    launchUrl.searchParams.set('url', directPreviewUrl);

    const directUrl = new URL(directPreviewUrl);
    [
      PREVIEW_PARAMS.PREVIEW,
      PREVIEW_PARAMS.TEST_ID,
      PREVIEW_PARAMS.VARIANT_ID,
      PREVIEW_PARAMS.VARIANT_NAME,
      PREVIEW_PARAMS.TENANT_DOMAIN,
    ].forEach(key => {
      const value = directUrl.searchParams.get(key);
      if (value !== undefined && value !== null && value !== '') {
        launchUrl.searchParams.set(key, value);
      }
    });
    return launchUrl.toString();
  } catch {
    return null;
  }
}

/**
 * Build a Shopify App Proxy bootstrap URL so the storefront script is guaranteed
 * to load before redirecting to the final preview page.
 *
 * @param {Object} options
 * @param {string} options.previewUrl - Full preview page URL built by buildPreviewUrl()
 * @returns {string|null}
 */
export function buildShopifyPreviewBootstrapUrl({ previewUrl }) {
  const directPreviewUrl = typeof previewUrl === 'string' ? previewUrl.trim() : '';
  if (!directPreviewUrl) return null;
  try {
    const directUrl = new URL(directPreviewUrl);
    const host = String(directUrl.hostname || '').trim();
    if (!host || !/\.myshopify\.com$/i.test(host)) return null;
    return `https://${host}/apps/ripx/preview-bootstrap?url=${encodeURIComponent(directPreviewUrl)}`;
  } catch {
    return null;
  }
}

/**
 * Whether a preview URL points to a Shopify store host.
 *
 * @param {string} previewUrl
 * @returns {boolean}
 */
export function isShopifyPreviewUrl(previewUrl) {
  const directPreviewUrl = typeof previewUrl === 'string' ? previewUrl.trim() : '';
  if (!directPreviewUrl) return false;
  try {
    const host = String(new URL(directPreviewUrl).hostname || '').trim();
    return /\.myshopify\.com$/i.test(host);
  } catch {
    return false;
  }
}

/**
 * Resolve default base URL for preview from domain(s) and optional override.
 * Order: override URL (if valid) > domain as https://domain/
 *
 * @param {Object} options
 * @param {string} [options.overrideUrl] - User-entered or saved preview URL
 * @param {string} [options.domain] - Domain (e.g. shop_domain or current store)
 * @param {string} [options.path] - Path to append (e.g. '/' or '/products/')
 * @returns {string|null}
 */
export function getDefaultPreviewBaseUrl({ overrideUrl, domain, path = '/' }) {
  const override = typeof overrideUrl === 'string' ? overrideUrl.trim() : '';
  if (
    override &&
    !hasLegacyPreviewBootstrapPath(override) &&
    isAllowedOverrideForDomain(override, domain)
  ) {
    const normalized = normalizePreviewBaseUrl(override);
    if (normalized) return normalized;
  }
  const d =
    typeof domain === 'string'
      ? domain
          .trim()
          .replace(/^https?:\/\//i, '')
          .replace(/\/+$/, '')
      : '';
  if (!d) return null;
  const p = path && path.startsWith('/') ? path : `/${path || ''}`;
  return `https://${d}${p}`;
}

/**
 * Resolve the best base URL for preview from multiple candidates.
 * Order: variantUrl (if valid) > overrideUrl (if valid) > domain + path.
 * Use this so wizard and editor share the same resolution logic.
 *
 * @param {Object} options
 * @param {string} [options.variantUrl] - Per-variant URL (e.g. variant.config.url)
 * @param {string} [options.overrideUrl] - User-entered or saved URL (e.g. visual_editor_preview_url)
 * @param {string} [options.domain] - Domain only (e.g. shop_domain, getPreviewDomain(), getShopDomain())
 * @param {string} [options.path] - Path when using domain (e.g. '/' or '/products/')
 * @returns {string|null}
 */
export function resolvePreviewBaseUrl({ variantUrl, overrideUrl, domain, path = '/' }) {
  const variant = typeof variantUrl === 'string' ? variantUrl.trim() : '';
  if (
    variant &&
    !hasLegacyPreviewBootstrapPath(variant) &&
    isAllowedOverrideForDomain(variant, domain)
  ) {
    const n = normalizePreviewBaseUrl(variant);
    if (n) return n;
  }
  const override = typeof overrideUrl === 'string' ? overrideUrl.trim() : '';
  if (
    override &&
    !hasLegacyPreviewBootstrapPath(override) &&
    isAllowedOverrideForDomain(override, domain)
  ) {
    const n = normalizePreviewBaseUrl(override);
    if (n) return n;
  }
  return getDefaultPreviewBaseUrl({ domain, path });
}
