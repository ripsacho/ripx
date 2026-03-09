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

function getDomainFromPathname(pathname) {
  const m = (pathname || '').match(/^\/app\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function getNotFoundHome(domain, pathname) {
  const pathDomain = getDomainFromPathname(pathname);
  const effectiveDomain = pathDomain || domain;
  const isAppDomain = /^\/app\/[^/]+/.test(pathname || '');
  const useAppHome = effectiveDomain && isAppDomain;
  return {
    homePath: useAppHome ? ROUTES.appDashboard(effectiveDomain) : ROUTES.USER_PANEL,
    homeLabel: useAppHome ? 'Back to dashboard' : 'Go to home',
  };
}
