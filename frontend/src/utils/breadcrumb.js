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
  const normalizedPath = String(pathname || '').replace(/^\/store\/[^/]+\/apps\/[^/]+/i, '');
  const m = normalizedPath.match(/^\/app\/([^/]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

/**
 * Get breadcrumb for TopBar: { current } or { parent, current [, parentPath ] }.
 * When parentPath is set, the parent segment is clickable and navigates to parentPath.
 * @param {string} pathname - location.pathname
 * @param {string} [search=''] - location.search
 * @returns {{ current: string, parent?: string, parentPath?: string }}
 */
export function getBreadcrumb(pathname, search = '') {
  const path = typeof pathname === 'string' ? pathname : '';
  const view = new URLSearchParams(search || '').get('view');
  const appDomain = getAppDomainFromPath(path);
  const appPrefix = appDomain ? `/app/${encodeURIComponent(appDomain)}` : '';

  if (path === ROUTES.MARKETING) return { current: 'RipX' };
  if (path === ROUTES.USER_PANEL) return { current: 'Home' };
  if (path === ROUTES.DASHBOARD || (appPrefix && (path === appPrefix || path === appPrefix + '/')))
    return { current: 'Dashboard' };
  const testsListPath = appPrefix ? `${appPrefix}/tests` : ROUTES.TESTS;
  if (path === (appPrefix ? `${appPrefix}/tests` : ROUTES.TESTS)) {
    return view === 'personalization'
      ? { parent: 'Tests', current: 'Personalization', parentPath: testsListPath }
      : { parent: 'Tests', current: 'All Tests', parentPath: testsListPath };
  }
  if (
    (path.startsWith('/tests/') || path.startsWith(appPrefix + '/tests/')) &&
    path.includes('/analytics')
  ) {
    const testDetailPath = path.replace(/\/analytics$/, '');
    return { parent: 'Tests', current: 'Analytics', parentPath: testDetailPath };
  }
  if (
    (path.startsWith('/tests/') || path.startsWith(appPrefix + '/tests/')) &&
    path.endsWith('/editor')
  ) {
    const testDetailPath = path.replace(/\/editor$/, '');
    return { parent: 'Test Details', current: 'Editor', parentPath: testDetailPath };
  }
  if (
    (path.startsWith('/tests/') || path.startsWith(appPrefix + '/tests/')) &&
    path.endsWith('/export')
  ) {
    const testDetailPath = path.replace(/\/export$/, '');
    return { parent: 'Test Details', current: 'Export', parentPath: testDetailPath };
  }
  if (
    (path.startsWith('/tests/') || path.startsWith(appPrefix + '/tests/')) &&
    path.endsWith('/promo-links')
  ) {
    const testDetailPath = path.replace(/\/promo-links$/, '');
    return { parent: 'Test Details', current: 'Promo links', parentPath: testDetailPath };
  }
  if (
    (path.startsWith('/tests/') || path.startsWith(appPrefix + '/tests/')) &&
    !path.includes('/analytics') &&
    path !== '/tests/new' &&
    path !== `${appPrefix}/tests/new`
  ) {
    const segments = path.split('/');
    const idIdx = appDomain ? segments.indexOf('tests') + 1 : 2;
    const testId = segments[idIdx];
    return {
      parent: 'Tests',
      current: testId ? 'Test Details' : 'Tests',
      parentPath: testsListPath,
    };
  }
  if (path === (appPrefix ? `${appPrefix}/tests/new` : ROUTES.CREATE_TEST))
    return { parent: 'Tests', current: 'Create Test', parentPath: testsListPath };
  if (path === (appPrefix ? `${appPrefix}/analytics` : ROUTES.ANALYTICS))
    return { current: 'Analytics' };
  if (appPrefix && path === `${appPrefix}/goals-metrics`)
    return { parent: 'Dashboard', current: 'Goals & Metrics', parentPath: appPrefix };
  if (appPrefix && path === `${appPrefix}/settings`)
    return { parent: 'Dashboard', current: 'App settings', parentPath: appPrefix };
  if (path === ROUTES.SETTINGS)
    return { parent: 'Profile', current: 'Account', parentPath: ROUTES.PROFILE };
  if (appPrefix && path === `${appPrefix}/setup`) return { current: 'Setup Wizard' };
  if (path === ROUTES.PROFILE) {
    const tab = new URLSearchParams(search || '').get('tab');
    if (tab === 'account')
      return { parent: 'Profile', current: 'Account', parentPath: ROUTES.PROFILE };
    if (tab === 'appearance')
      return { parent: 'Profile', current: 'Appearance', parentPath: ROUTES.PROFILE };
    if (tab === 'preferences')
      return { parent: 'Profile', current: 'Workflow', parentPath: ROUTES.PROFILE };
    return { parent: 'Home', current: 'Profile', parentPath: ROUTES.USER_PANEL };
  }
  if (path === ROUTES.NOTIFICATIONS)
    return { parent: 'Home', current: 'Notifications', parentPath: ROUTES.USER_PANEL };
  if (path === ROUTES.DOCS)
    return { parent: 'Home', current: 'Documentation', parentPath: ROUTES.USER_PANEL };
  if (path === ROUTES.SUPPORT)
    return { parent: 'Home', current: 'Support', parentPath: ROUTES.USER_PANEL };
  if (path === ROUTES.CONNECT_OAUTH_SUCCESS)
    return { parent: 'Connect', current: 'Success', parentPath: ROUTES.CONNECT };
  if (path === ROUTES.SETUP) return { current: 'Setup Wizard' };
  if (path === ROUTES.CONNECT) return { current: 'Connect' };
  if (path === ROUTES.DOMAINS) return { current: 'My domains' };
  if (path.startsWith(ROUTES.ADMIN)) {
    const adminSectionLabels = {
      [ROUTES.ADMIN_OVERVIEW]: 'Overview',
      [ROUTES.ADMIN_USERS]: 'Users',
      [ROUTES.ADMIN_DOMAINS]: 'Domains',
      [ROUTES.ADMIN_TESTS]: 'Tests',
      [ROUTES.ADMIN_AUDIT]: 'Audit log',
      [ROUTES.ADMIN_KV]: 'Key-value store',
      [ROUTES.ADMIN_JOBS]: 'Jobs',
      [ROUTES.ADMIN_FEATURE_FLAGS]: 'Feature flags',
      [ROUTES.ADMIN_TEST_TYPE_CONTROLS]: 'Test types',
      [ROUTES.ADMIN_PROMO_LINKS]: 'Promo links',
      [ROUTES.ADMIN_BLOCK_LIST]: 'Block list',
      [ROUTES.ADMIN_WEBHOOK_EVENTS]: 'Webhook events',
      [ROUTES.ADMIN_TARGETING_PRESETS]: 'Targeting presets',
      [ROUTES.ADMIN_WEBHOOKS]: 'Webhooks',
      [ROUTES.ADMIN_SHOP_SESSIONS]: 'Shop sessions',
      [ROUTES.ADMIN_CONFLICTS]: 'Conflicts',
      [ROUTES.ADMIN_TEST_HEALTH]: 'Test health',
      [ROUTES.ADMIN_SYSTEM_HEALTH]: 'System health',
      [ROUTES.ADMIN_SHOP_SETTINGS_OVERRIDES]: 'Shop settings overrides',
      [ROUTES.ADMIN_RATE_LIMIT_OVERRIDES]: 'Rate limit overrides',
      [ROUTES.ADMIN_NOTIFICATIONS]: 'Notifications',
      [ROUTES.ADMIN_SUPPORT_TICKETS]: 'Support tickets',
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
    const section = adminSectionLabels[path] || 'Admin';
    if (path === ROUTES.ADMIN || path === ROUTES.ADMIN_OVERVIEW) {
      return { current: 'Admin' };
    }
    return { parent: 'Admin', current: section, parentPath: ROUTES.ADMIN_OVERVIEW };
  }
  const isKnown =
    path === ROUTES.MARKETING ||
    path === ROUTES.USER_PANEL ||
    path.startsWith('/app/') ||
    path.startsWith('/tests/') ||
    path.startsWith(ROUTES.ADMIN) ||
    [ROUTES.CONNECT, ROUTES.DOMAINS].includes(path);
  if (!isKnown) return { current: 'Page not found' };
  if (appPrefix && path.startsWith(appPrefix) && path.length > appPrefix.length) {
    return { parent: 'Dashboard', current: 'Page not found', parentPath: appPrefix };
  }
  const ROUTE_LABELS = {
    [ROUTES.DASHBOARD]: 'Dashboard',
    [ROUTES.TESTS]: 'Tests',
    [ROUTES.CREATE_TEST]: 'Create Test',
    [ROUTES.ANALYTICS]: 'Analytics',
    [ROUTES.SETTINGS]: 'Account',
    [ROUTES.SETUP]: 'Setup',
    [ROUTES.PROFILE]: 'Profile',
    [ROUTES.NOTIFICATIONS]: 'Notifications',
    [ROUTES.DOCS]: 'Documentation',
    '/tests/new': 'Create Test',
  };
  return { current: ROUTE_LABELS[path] || 'RipX' };
}
