const CHECKOUT_DIAG_CACHE_PREFIX = 'ripx_checkout_diag_cache_v1:';
const CHECKOUT_DIAG_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const CHECKOUT_DIAG_STALE_AFTER_MS = 15 * 60 * 1000;

function getCheckoutDiagCacheKey(domain) {
  const normalized = String(domain || '')
    .trim()
    .toLowerCase();
  return normalized ? `${CHECKOUT_DIAG_CACHE_PREFIX}${normalized}` : null;
}

export function readCheckoutDiagCache(domain) {
  if (typeof window === 'undefined') return null;
  const key = getCheckoutDiagCacheKey(domain);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const checkedAt = String(parsed.checkedAt || '').trim();
    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
    if (!checkedAt || !data) return null;
    const checkedMs = new Date(checkedAt).getTime();
    if (!Number.isFinite(checkedMs)) return null;
    const ageMs = Date.now() - checkedMs;
    if (ageMs > CHECKOUT_DIAG_CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { checkedAt, data, ageMs };
  } catch {
    return null;
  }
}

export function writeCheckoutDiagCache(domain, checkedAt, data) {
  if (typeof window === 'undefined') return;
  const key = getCheckoutDiagCacheKey(domain);
  if (!key || !checkedAt || !data) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        checkedAt,
        data,
      })
    );
  } catch {
    // Ignore localStorage failures.
  }
}
