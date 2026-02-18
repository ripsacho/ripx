/**
 * Route prefetch utilities
 *
 * Preloads lazy-loaded route chunks on sidebar link hover for faster navigation.
 */
import { ROUTES } from '../constants';

const prefetchMap = {
  [ROUTES.DASHBOARD]: () => import('../components/Dashboard/Dashboard'),
  [ROUTES.TESTS]: () => import('../components/TestList/TestList'),
  [ROUTES.CREATE_TEST]: () => import('../components/TestCreator/TestCreator'),
  [ROUTES.ANALYTICS]: () => import('../components/Analytics/AnalyticsOverview'),
  [ROUTES.SETUP]: () => import('../components/SetupWizard/SetupWizard'),
  [ROUTES.SETTINGS]: () => import('../components/Settings/Settings'),
  [ROUTES.DOCS]: () => import('../components/Documentation/Documentation'),
  [ROUTES.PROFILE]: () => import('../components/Profile/Profile'),
  [ROUTES.CONNECT]: () => import('../components/Connect/Connect'),
};

/** Paths that match a base route (e.g. /tests/123 matches /tests) */
const basePathMap = {
  '/tests': () => import('../components/TestList/TestList'),
  '/tests/new': () => import('../components/TestCreator/TestCreator'),
  '/analytics': () => import('../components/Analytics/AnalyticsOverview'),
};

const prefetched = new Set();

/** Normalize path for prefetch (strip query string, use pathname) */
function normalizePath(path) {
  if (typeof path !== 'string') return '';
  return path.split('?')[0].split('#')[0] || path;
}

/**
 * Prefetch a route chunk by path.
 * Safe to call multiple times; only prefetches once per path.
 * Handles paths with query strings (e.g. /tests?view=personalization).
 */
export function prefetchRoute(path) {
  const normalized = normalizePath(path);
  if (!normalized || prefetched.has(normalized)) return;
  const loader = prefetchMap[path] || prefetchMap[normalized] || basePathMap[normalized];
  if (!loader) return;
  prefetched.add(normalized);
  loader().catch(() => {
    prefetched.delete(normalized);
  });
}

/**
 * Prefetch on hover for sidebar nav items.
 * Call with the nav item's path (handles query strings).
 */
export function prefetchOnHover(path) {
  if (typeof path !== 'string') return;
  prefetchRoute(path);
  const basePath = normalizePath(path);
  // Also prefetch common dynamic routes when hovering /tests
  if (basePath === ROUTES.TESTS || path.startsWith('/tests')) {
    prefetchRoute('/tests/new');
    import('../components/TestDetail/TestDetail').catch(() => {});
    import('../components/Analytics/Analytics').catch(() => {});
    import('../components/Export/Export').catch(() => {});
    import('../components/PromoLinks/PromoLinks').catch(() => {});
  }
}
