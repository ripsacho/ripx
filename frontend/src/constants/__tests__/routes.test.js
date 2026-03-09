/**
 * Route helpers and constants – unit tests.
 * Ensures app-scoped paths and encodeURIComponent behavior stay correct.
 */

import { ROUTES, ROUTE_PATTERNS, MAIN_APP_PATHS, APP_DOMAIN_PATTERN } from '../routes.js';

describe('ROUTES', () => {
  it('exposes static paths', () => {
    expect(ROUTES.USER_PANEL).toBe('/');
    expect(ROUTES.CONNECT).toBe('/connect');
    expect(ROUTES.ADMIN).toBe('/admin');
    expect(ROUTES.DOMAINS).toBe('/domains');
  });

  it('appDashboard(domain) returns /app/:domain path', () => {
    expect(ROUTES.appDashboard('my-store')).toBe('/app/my-store');
    expect(ROUTES.appDashboard('sub.example.com')).toBe('/app/sub.example.com');
  });

  it('app-scoped helpers encode domain', () => {
    const domain = 'my-store.myshopify.com';
    expect(ROUTES.appTests(domain)).toBe('/app/my-store.myshopify.com/tests');
    expect(ROUTES.appCreateTest(domain)).toBe('/app/my-store.myshopify.com/tests/new');
    expect(ROUTES.appTestDetail(domain, 'abc-123')).toBe(
      '/app/my-store.myshopify.com/tests/abc-123'
    );
    expect(ROUTES.appTestEditor(domain, 'id-1')).toBe(
      '/app/my-store.myshopify.com/tests/id-1/editor'
    );
  });

  it('legacy TEST_DETAIL and TEST_EDITOR return root paths', () => {
    expect(ROUTES.TEST_DETAIL('id-1')).toBe('/tests/id-1');
    expect(ROUTES.TEST_EDITOR('id-2')).toBe('/tests/id-2/editor');
  });
});

describe('ROUTE_PATTERNS', () => {
  it('APP_DOMAIN pattern for React Router', () => {
    expect(ROUTE_PATTERNS.APP_DOMAIN).toBe('/app/:domain');
  });
});

describe('MAIN_APP_PATHS', () => {
  it('includes user panel and main app paths', () => {
    expect(MAIN_APP_PATHS).toContain(ROUTES.USER_PANEL);
    expect(MAIN_APP_PATHS).toContain(ROUTES.TESTS);
    expect(MAIN_APP_PATHS).toContain(ROUTES.SETTINGS);
  });
});

describe('APP_DOMAIN_PATTERN', () => {
  it('matches /app/:domain pathnames', () => {
    expect(APP_DOMAIN_PATTERN.test('/app/my-store')).toBe(true);
    expect(APP_DOMAIN_PATTERN.test('/app/my-store/tests')).toBe(true);
    expect(APP_DOMAIN_PATTERN.test('/app/foo')).toBe(true);
    expect(APP_DOMAIN_PATTERN.test('/')).toBe(false);
    expect(APP_DOMAIN_PATTERN.test('/admin')).toBe(false);
  });
});
