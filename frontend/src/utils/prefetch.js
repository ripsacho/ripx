/**
 * Route prefetch utilities
 *
 * Preloads lazy-loaded route chunks on sidebar link hover for faster navigation.
 * Supports legacy paths (/home, /tests), public paths (/), and domain-scoped paths
 * (/app/:domain, /app/:domain/tests).
 */
import { ROUTES } from '../constants';

const prefetchMap = {
  [ROUTES.MARKETING]: () => import('../components/MarketingLanding/MarketingLanding'),
  [ROUTES.USER_PANEL]: () => import('../components/UserPanel/UserPanel'),
  [ROUTES.TESTS]: () => import('../components/TestList/TestList'),
  [ROUTES.CREATE_TEST]: () => import('../components/TestCreator/TestCreator'),
  [ROUTES.ANALYTICS]: () => import('../components/Analytics/AnalyticsOverview'),
  [ROUTES.SETUP]: () => import('../components/SetupWizard/SetupWizard'),
  [ROUTES.SETTINGS]: () => import('../components/Profile/Profile'),
  [ROUTES.DOCS]: () => import('../components/Documentation/Documentation'),
  [ROUTES.PROFILE]: () => import('../components/Profile/Profile'),
  [ROUTES.CONNECT]: () => import('../components/Connect/Connect'),
};

/** Paths that match a base route (e.g. /tests/123 matches /tests) */
const basePathMap = {
  [ROUTES.TESTS]: () => import('../components/TestList/TestList'),
  [ROUTES.CREATE_TEST]: () => import('../components/TestCreator/TestCreator'),
  '/analytics': () => import('../components/Analytics/AnalyticsOverview'),
};

/** For /app/:domain/... paths: map segment to same component loaders (no domain in key to avoid duplicate prefetches) */
const appPathSegmentMap = {
  '': () => import('../components/Dashboard/Dashboard'),
  tests: () => import('../components/TestList/TestList'),
  'tests/new': () => import('../components/TestCreator/TestCreator'),
  analytics: () => import('../components/Analytics/AnalyticsOverview'),
  'goals-metrics': () => import('../components/GoalsMetrics/GoalsMetrics'),
  setup: () => import('../components/SetupWizard/SetupWizard'),
  settings: () => import('../components/Settings/Settings'),
  profile: () => import('../components/Profile/Profile'),
  notifications: () => import('../components/Notifications/Notifications'),
  docs: () => import('../components/Documentation/Documentation'),
};

const prefetched = new Set();

/** Normalize path for prefetch (strip query string, use pathname) */
function normalizePath(path) {
  if (typeof path !== 'string') return '';
  return path.split('?')[0].split('#')[0].replace(/\/$/, '') || path;
}

/** Get prefetch key for /app/:domain/... so we prefetch once per logical route, not per domain */
function getPrefetchKeyForAppPath(normalized) {
  const match = normalized.match(/^\/app\/[^/]+(?:\/(.*))?$/);
  if (!match) return null;
  const segment = (match[1] || '').replace(/\/$/, '');
  return segment ? `app:${segment}` : 'app:';
}

/**
 * Prefetch a route chunk by path.
 * Safe to call multiple times; only prefetches once per path.
 * Handles paths with query strings and /app/:domain/... paths.
 */
export function prefetchRoute(path) {
  const normalized = normalizePath(path);
  if (!normalized) return;

  const appKey = getPrefetchKeyForAppPath(normalized);
  const dedupeKey = appKey || normalized;
  if (prefetched.has(dedupeKey)) return;

  let loader = prefetchMap[path] || prefetchMap[normalized] || basePathMap[normalized];

  if (!loader && appKey) {
    const segment = appKey === 'app:' ? '' : appKey.replace(/^app:/, '');
    loader = appPathSegmentMap[segment];
    if (!loader && segment.startsWith('tests/')) {
      loader =
        segment === 'tests/new' ? appPathSegmentMap['tests/new'] : appPathSegmentMap['tests'];
    }
  }

  if (!loader) return;
  prefetched.add(dedupeKey);
  loader().catch(() => {
    prefetched.delete(dedupeKey);
  });
}

/**
 * Prefetch on hover for sidebar nav items.
 * Call with the nav item's path (handles query strings and /app/:domain/...).
 */
export function prefetchOnHover(path) {
  if (typeof path !== 'string') return;
  prefetchRoute(path);
  const normalized = normalizePath(path);
  if (
    normalized === ROUTES.TESTS ||
    normalized.startsWith(ROUTES.TESTS + '/') ||
    /^\/app\/[^/]+\/tests(\?|\/|$)/.test(normalized)
  ) {
    prefetchRoute(normalized.startsWith('/app/') ? normalized + '/new' : ROUTES.CREATE_TEST);
    import('../components/TestDetail/TestDetail').catch(() => {});
    import('../components/Analytics/Analytics').catch(() => {});
    import('../components/Export/Export').catch(() => {});
    import('../components/PromoLinks/PromoLinks').catch(() => {});
  }
}
