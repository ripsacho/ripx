/**
 * Unit tests for breadcrumb utils (getAppDomainFromPath, getBreadcrumb).
 */

import { getAppDomainFromPath, getBreadcrumb } from '../breadcrumb';
import { ROUTES } from '../../constants';

describe('getAppDomainFromPath', () => {
  it('returns null for non-app paths', () => {
    expect(getAppDomainFromPath('/')).toBeNull();
    expect(getAppDomainFromPath('/tests')).toBeNull();
    expect(getAppDomainFromPath('/connect')).toBeNull();
    expect(getAppDomainFromPath('')).toBeNull();
  });

  it('extracts domain from /app/:domain', () => {
    expect(getAppDomainFromPath('/app/my-store.com')).toBe('my-store.com');
    expect(getAppDomainFromPath('/app/my-store.com/')).toBe('my-store.com');
    expect(getAppDomainFromPath('/app/my-store.com/tests')).toBe('my-store.com');
    expect(getAppDomainFromPath('/app/foo.myshopify.com/settings')).toBe('foo.myshopify.com');
  });

  it('decodes encoded domain', () => {
    expect(getAppDomainFromPath('/app/foo%2Bbar.com')).toBe('foo+bar.com');
  });

  it('returns raw segment when domain decode fails', () => {
    expect(getAppDomainFromPath('/app/%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('extracts domain from embedded app paths', () => {
    expect(getAppDomainFromPath('/store/acme/apps/ripx/app/store.com/tests')).toBe('store.com');
  });
});

describe('getBreadcrumb', () => {
  it('returns public label for the marketing page', () => {
    expect(getBreadcrumb(ROUTES.MARKETING)).toEqual({ current: 'RipX' });
  });

  it('returns Home for user panel', () => {
    expect(getBreadcrumb(ROUTES.USER_PANEL)).toEqual({ current: 'Home' });
  });

  it('returns Home for app home; Dashboard for app-scoped dashboard', () => {
    expect(getBreadcrumb(ROUTES.DASHBOARD)).toEqual({ current: 'Home' }); // same as USER_PANEL
    expect(getBreadcrumb('/app/store.com')).toEqual({ current: 'Dashboard' });
    expect(getBreadcrumb('/app/store.com/')).toEqual({ current: 'Dashboard' });
  });

  it('returns Tests / All Tests or Personalization with clickable parentPath', () => {
    expect(getBreadcrumb(ROUTES.TESTS)).toEqual({
      parent: 'Tests',
      current: 'All Tests',
      parentPath: ROUTES.TESTS,
    });
    expect(getBreadcrumb(ROUTES.TESTS, '?view=personalization')).toEqual({
      parent: 'Tests',
      current: 'Personalization',
      parentPath: ROUTES.TESTS,
    });
    expect(getBreadcrumb('/app/s.com/tests')).toEqual({
      parent: 'Tests',
      current: 'All Tests',
      parentPath: '/app/s.com/tests',
    });
    expect(getBreadcrumb('/app/s.com/tests', '?view=personalization')).toEqual({
      parent: 'Tests',
      current: 'Personalization',
      parentPath: '/app/s.com/tests',
    });
  });

  it('returns Test Details with parentPath to tests list', () => {
    expect(getBreadcrumb('/tests/abc-123')).toEqual({
      parent: 'Tests',
      current: 'Test Details',
      parentPath: ROUTES.TESTS,
    });
    expect(getBreadcrumb('/app/dom.com/tests/xyz')).toEqual({
      parent: 'Tests',
      current: 'Test Details',
      parentPath: '/app/dom.com/tests',
    });
  });

  it('returns Test Details > Editor, Export, Promo links with parentPath to test detail', () => {
    expect(getBreadcrumb('/tests/id/editor')).toEqual({
      parent: 'Test Details',
      current: 'Editor',
      parentPath: '/tests/id',
    });
    expect(getBreadcrumb('/tests/id/export')).toEqual({
      parent: 'Test Details',
      current: 'Export',
      parentPath: '/tests/id',
    });
    expect(getBreadcrumb('/tests/id/promo-links')).toEqual({
      parent: 'Test Details',
      current: 'Promo links',
      parentPath: '/tests/id',
    });
    expect(getBreadcrumb('/app/d.com/tests/id/editor')).toEqual({
      parent: 'Test Details',
      current: 'Editor',
      parentPath: '/app/d.com/tests/id',
    });
  });

  it('returns Tests > Create Test with parentPath to tests list', () => {
    expect(getBreadcrumb(ROUTES.CREATE_TEST)).toEqual({
      parent: 'Tests',
      current: 'Create Test',
      parentPath: ROUTES.TESTS,
    });
  });

  it('returns Tests > Analytics with parentPath to test detail', () => {
    expect(getBreadcrumb('/tests/abc/analytics')).toEqual({
      parent: 'Tests',
      current: 'Analytics',
      parentPath: '/tests/abc',
    });
  });

  it('returns Home > current for universal pages (Settings, Profile, Notifications, Docs, Support)', () => {
    expect(getBreadcrumb(ROUTES.SETTINGS)).toEqual({
      parent: 'Home',
      current: 'Account settings',
      parentPath: ROUTES.USER_PANEL,
    });
    expect(getBreadcrumb(ROUTES.PROFILE)).toEqual({
      parent: 'Home',
      current: 'Profile',
      parentPath: ROUTES.USER_PANEL,
    });
    expect(getBreadcrumb(ROUTES.PROFILE, '?tab=account')).toEqual({
      parent: 'Profile',
      current: 'Account',
      parentPath: ROUTES.PROFILE,
    });
    expect(getBreadcrumb(ROUTES.PROFILE, '?tab=preferences')).toEqual({
      parent: 'Profile',
      current: 'Preferences',
      parentPath: ROUTES.PROFILE,
    });
    expect(getBreadcrumb(ROUTES.NOTIFICATIONS)).toEqual({
      parent: 'Home',
      current: 'Notifications',
      parentPath: ROUTES.USER_PANEL,
    });
    expect(getBreadcrumb(ROUTES.DOCS)).toEqual({
      parent: 'Home',
      current: 'Documentation',
      parentPath: ROUTES.USER_PANEL,
    });
    expect(getBreadcrumb(ROUTES.SUPPORT)).toEqual({
      parent: 'Home',
      current: 'Support',
      parentPath: ROUTES.USER_PANEL,
    });
  });

  it('returns Dashboard > App settings when in app settings', () => {
    expect(getBreadcrumb('/app/my-store.com/settings')).toEqual({
      parent: 'Dashboard',
      current: 'App settings',
      parentPath: '/app/my-store.com',
    });
  });

  it('returns single current for Analytics, Connect, Domains, etc.', () => {
    expect(getBreadcrumb(ROUTES.ANALYTICS)).toEqual({ current: 'Analytics' });
    expect(getBreadcrumb(ROUTES.CONNECT)).toEqual({ current: 'Connect' });
    expect(getBreadcrumb(ROUTES.CONNECT_OAUTH_SUCCESS)).toEqual({
      parent: 'Connect',
      current: 'Success',
      parentPath: ROUTES.CONNECT,
    });
    expect(getBreadcrumb(ROUTES.DOMAINS)).toEqual({ current: 'My domains' });
  });

  it('returns Admin and Admin sub-routes with parent/current/parentPath', () => {
    expect(getBreadcrumb(ROUTES.ADMIN)).toEqual({ current: 'Admin' });
    expect(getBreadcrumb(ROUTES.ADMIN_USERS)).toEqual({
      parent: 'Admin',
      current: 'Users',
      parentPath: ROUTES.ADMIN_OVERVIEW,
    });
    expect(getBreadcrumb(ROUTES.ADMIN_DOMAINS)).toEqual({
      parent: 'Admin',
      current: 'Domains',
      parentPath: ROUTES.ADMIN_OVERVIEW,
    });
    expect(getBreadcrumb(ROUTES.ADMIN_TESTS)).toEqual({
      parent: 'Admin',
      current: 'Tests',
      parentPath: ROUTES.ADMIN_OVERVIEW,
    });
    expect(getBreadcrumb(ROUTES.ADMIN_AUDIT)).toEqual({
      parent: 'Admin',
      current: 'Audit log',
      parentPath: ROUTES.ADMIN_OVERVIEW,
    });
  });

  it('returns Page not found for unknown path', () => {
    expect(getBreadcrumb('/unknown')).toEqual({ current: 'Page not found' });
  });

  it('returns safe default for invalid pathname', () => {
    expect(getBreadcrumb(undefined)).toEqual({ current: 'Page not found' });
    expect(getBreadcrumb(null)).toEqual({ current: 'Page not found' });
    expect(getBreadcrumb('')).toEqual({ current: 'Page not found' });
  });

  it('returns Dashboard > Page not found for unknown path under /app/:domain', () => {
    expect(getBreadcrumb('/app/my-store.com/unknown')).toEqual({
      parent: 'Dashboard',
      current: 'Page not found',
      parentPath: '/app/my-store.com',
    });
  });
});
