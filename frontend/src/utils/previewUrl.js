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
  VISUAL_EDITOR: 'ab_visual_editor',
  VISUAL_PICKER: 'ab_visual_picker',
};

const PREVIEW_VALUE = '1';

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
 * @param {boolean} [options.visualEditor=false] - Add ab_visual_editor=1 for visual editor iframe
 * @param {boolean} [options.visualPicker=false] - Add ab_visual_picker=1 for picker mode
 * @returns {string|null} Full preview URL or null if baseUrl/testId invalid
 */
export function buildPreviewUrl({
  baseUrl,
  testId,
  variantId,
  variantName,
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
    if (visualEditor) url.searchParams.set(PREVIEW_PARAMS.VISUAL_EDITOR, PREVIEW_VALUE);
    if (visualPicker) url.searchParams.set(PREVIEW_PARAMS.VISUAL_PICKER, PREVIEW_VALUE);
    return url.toString();
  } catch {
    return null;
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
  if (override) {
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
  if (variant) {
    const n = normalizePreviewBaseUrl(variant);
    if (n) return n;
  }
  const override = typeof overrideUrl === 'string' ? overrideUrl.trim() : '';
  if (override) {
    const n = normalizePreviewBaseUrl(override);
    if (n) return n;
  }
  return getDefaultPreviewBaseUrl({ domain, path });
}
