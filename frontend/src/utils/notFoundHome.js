/**
 * Pure helper for NotFound 404 home link.
 * Returns path and label for the "home" button based on domain and current pathname.
 * When pathname is under /app/:domain, domain is derived from the URL so the 404
 * "Back to dashboard" link works even if getShopDomain() is not set.
 *
 * @param {string|null|undefined} domain - Shop/tenant domain (e.g. from getShopDomain())
 * @param {string} pathname - Current location pathname (e.g. location.pathname)
 * @returns {{ homePath: string, homeLabel: string }}
 */
import { ROUTES } from '../constants';

function toAppRelativePath(pathname) {
  return String(pathname || '').replace(/^\/store\/[^/]+\/apps\/[^/]+/i, '');
}

function getDomainFromPathname(pathname) {
  const relativePath = toAppRelativePath(pathname);
  const m = relativePath.match(/^\/app\/([^/]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function getNotFoundHome(domain, pathname) {
  const relativePath = toAppRelativePath(pathname);
  const pathDomain = getDomainFromPathname(relativePath);
  const effectiveDomain = pathDomain || domain;
  const isAppDomain = /^\/app\/[^/]+/.test(relativePath);
  const useAppHome = effectiveDomain && isAppDomain;
  return {
    homePath: useAppHome ? ROUTES.appDashboard(effectiveDomain) : ROUTES.USER_PANEL,
    homeLabel: useAppHome ? 'Back to dashboard' : 'Go to home',
  };
}
