/**
 * Breadcrumb and path helpers for TopBar (and shared with Sidebar).
 * Pure functions for testability.
 */

import { ROUTES } from '../constants';

/**
 * Extract app domain from pathname (e.g. /app/my-store.com/tests -> "my-store.com").
 * @param {string} pathname
 * @returns {string|null}
 */
export function getAppDomainFromPath(pathname) {
  const m = (pathname || '').match(/^\/app\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Get breadcrumb for TopBar: { current } or { parent, current [, parentPath ] }.
 * When parentPath is set, the parent segment is clickable and navigates to parentPath.
 * @param {string} pathname - location.pathname
 * @param {string} [search=''] - location.search
 * @returns {{ current: string, parent?: string, parentPath?: string }}
 */
export function getBreadcrumb(pathname, search = '') {
  const view = new URLSearchParams(search || '').get('view');
  const appDomain = getAppDomainFromPath(pathname);
  const appPrefix = appDomain ? `/app/${encodeURIComponent(appDomain)}` : '';

  if (pathname === ROUTES.USER_PANEL) return { current: 'Home' };
  if (
    pathname === ROUTES.DASHBOARD ||
    (appPrefix && (pathname === appPrefix || pathname === appPrefix + '/'))
  )
    return { current: 'Dashboard' };
  const testsListPath = appPrefix ? `${appPrefix}/tests` : ROUTES.TESTS;
  if (pathname === (appPrefix ? `${appPrefix}/tests` : ROUTES.TESTS)) {
    return view === 'personalization'
      ? { parent: 'Tests', current: 'Personalization', parentPath: testsListPath }
      : { parent: 'Tests', current: 'All Tests', parentPath: testsListPath };
  }
  if (
    (pathname.startsWith('/tests/') || pathname.startsWith(appPrefix + '/tests/')) &&
    pathname.includes('/analytics')
  ) {
    const testDetailPath = pathname.replace(/\/analytics$/, '');
    return { parent: 'Tests', current: 'Analytics', parentPath: testDetailPath };
  }
  if (
    (pathname.startsWith('/tests/') || pathname.startsWith(appPrefix + '/tests/')) &&
    pathname.endsWith('/editor')
  ) {
    const testDetailPath = pathname.replace(/\/editor$/, '');
    return { parent: 'Test Details', current: 'Editor', parentPath: testDetailPath };
  }
  if (
    (pathname.startsWith('/tests/') || pathname.startsWith(appPrefix + '/tests/')) &&
    pathname.endsWith('/export')
  ) {
    const testDetailPath = pathname.replace(/\/export$/, '');
    return { parent: 'Test Details', current: 'Export', parentPath: testDetailPath };
  }
  if (
    (pathname.startsWith('/tests/') || pathname.startsWith(appPrefix + '/tests/')) &&
    pathname.endsWith('/promo-links')
  ) {
    const testDetailPath = pathname.replace(/\/promo-links$/, '');
    return { parent: 'Test Details', current: 'Promo links', parentPath: testDetailPath };
  }
  if (
    (pathname.startsWith('/tests/') || pathname.startsWith(appPrefix + '/tests/')) &&
    !pathname.includes('/analytics') &&
    pathname !== '/tests/new' &&
    pathname !== `${appPrefix}/tests/new`
  ) {
    const segments = pathname.split('/');
    const idIdx = appDomain ? segments.indexOf('tests') + 1 : 2;
    const testId = segments[idIdx];
    return {
      parent: 'Tests',
      current: testId ? 'Test Details' : 'Tests',
      parentPath: testsListPath,
    };
  }
  if (pathname === (appPrefix ? `${appPrefix}/tests/new` : ROUTES.CREATE_TEST))
    return { parent: 'Tests', current: 'Create Test', parentPath: testsListPath };
  if (pathname === (appPrefix ? `${appPrefix}/analytics` : ROUTES.ANALYTICS))
    return { current: 'Analytics' };
  if (appPrefix && pathname === `${appPrefix}/settings`)
    return { parent: 'Dashboard', current: 'App settings', parentPath: appPrefix };
  if (pathname === ROUTES.SETTINGS)
    return { parent: 'Home', current: 'Account settings', parentPath: ROUTES.USER_PANEL };
  if (appPrefix && pathname === `${appPrefix}/setup`) return { current: 'Setup Wizard' };
  if (pathname === ROUTES.PROFILE)
    return { parent: 'Home', current: 'Profile', parentPath: ROUTES.USER_PANEL };
  if (pathname === ROUTES.NOTIFICATIONS)
    return { parent: 'Home', current: 'Notifications', parentPath: ROUTES.USER_PANEL };
  if (pathname === ROUTES.DOCS)
    return { parent: 'Home', current: 'Documentation', parentPath: ROUTES.USER_PANEL };
  if (pathname === ROUTES.SETUP) return { current: 'Setup Wizard' };
  if (pathname === ROUTES.CONNECT) return { current: 'Connect' };
  if (pathname === ROUTES.DOMAINS) return { current: 'My domains' };
  if (pathname.startsWith(ROUTES.ADMIN)) {
    const adminSectionLabels = {
      [ROUTES.ADMIN_OVERVIEW]: 'Overview',
      [ROUTES.ADMIN_USERS]: 'Users',
      [ROUTES.ADMIN_DOMAINS]: 'Domains',
      [ROUTES.ADMIN_TESTS]: 'Tests',
      [ROUTES.ADMIN_AUDIT]: 'Audit log',
      [ROUTES.ADMIN_KV]: 'Key-value store',
      [ROUTES.ADMIN_JOBS]: 'Jobs',
      [ROUTES.ADMIN_FEATURE_FLAGS]: 'Feature flags',
      [ROUTES.ADMIN_PROMO_LINKS]: 'Promo links',
      [ROUTES.ADMIN_BLOCK_LIST]: 'Block list',
      [ROUTES.ADMIN_WEBHOOK_EVENTS]: 'Webhook events',
      [ROUTES.ADMIN_TARGETING_PRESETS]: 'Targeting presets',
      [ROUTES.ADMIN_WEBHOOKS]: 'Webhooks',
      [ROUTES.ADMIN_SHOP_SESSIONS]: 'Shop sessions',
      [ROUTES.ADMIN_CONFLICTS]: 'Conflicts',
      [ROUTES.ADMIN_TEST_HEALTH]: 'Test health',
      [ROUTES.ADMIN_SHOP_SETTINGS_OVERRIDES]: 'Shop settings overrides',
      [ROUTES.ADMIN_RATE_LIMIT_OVERRIDES]: 'Rate limit overrides',
      [ROUTES.ADMIN_NOTIFICATIONS]: 'Notifications',
      [ROUTES.ADMIN_SIGNIFICANCE_ALERTS]: 'Significance alerts',
      [ROUTES.ADMIN_EVENT_CATALOG]: 'Event catalog',
      [ROUTES.ADMIN_CLIENT_ERRORS]: 'Client errors',
      [ROUTES.ADMIN_CONSENT_SCRIPT]: 'Consent & script',
      [ROUTES.ADMIN_ACCOUNTS]: 'Accounts',
      [ROUTES.ADMIN_AGGREGATION]: 'Aggregation',
      [ROUTES.ADMIN_LEGAL]: 'Terms & Privacy',
      [ROUTES.ADMIN_MAINTENANCE]: 'Maintenance',
      [ROUTES.ADMIN_ANNOUNCEMENT_BANNER]: 'Announcement banner',
      [ROUTES.ADMIN_MAIL_PROCESSES]: 'Email delivery',
      [ROUTES.ADMIN_USAGE_EXPORT]: 'Usage export',
    };
    const section = adminSectionLabels[pathname] || 'Admin';
    if (pathname === ROUTES.ADMIN || pathname === ROUTES.ADMIN_OVERVIEW) {
      return { current: 'Admin' };
    }
    return { parent: 'Admin', current: section, parentPath: ROUTES.ADMIN_OVERVIEW };
  }
  const isKnown =
    pathname === ROUTES.USER_PANEL ||
    pathname.startsWith('/app/') ||
    pathname.startsWith('/tests/') ||
    pathname.startsWith(ROUTES.ADMIN) ||
    [ROUTES.CONNECT, ROUTES.DOMAINS].includes(pathname);
  if (!isKnown) return { current: 'Page not found' };
  if (appPrefix && pathname.startsWith(appPrefix) && pathname.length > appPrefix.length) {
    return { parent: 'Dashboard', current: 'Page not found', parentPath: appPrefix };
  }
  const ROUTE_LABELS = {
    [ROUTES.DASHBOARD]: 'Dashboard',
    [ROUTES.TESTS]: 'Tests',
    [ROUTES.CREATE_TEST]: 'Create Test',
    [ROUTES.ANALYTICS]: 'Analytics',
    [ROUTES.SETTINGS]: 'Account settings',
    [ROUTES.SETUP]: 'Setup',
    [ROUTES.PROFILE]: 'Profile',
    [ROUTES.NOTIFICATIONS]: 'Notifications',
    [ROUTES.DOCS]: 'Documentation',
    '/tests/new': 'Create Test',
  };
  return { current: ROUTE_LABELS[pathname] || 'RipX' };
}
