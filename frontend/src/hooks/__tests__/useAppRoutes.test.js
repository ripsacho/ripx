/**
 * getRoutesForDomain – unit tests.
 * Tests the pure route resolution (used by useAppRoutes) without loading React or services.
 */

import { getRoutesForDomain } from '../../utils/getRoutesForDomain';
import { ROUTES } from '../../constants';

describe('getRoutesForDomain', () => {
  it('returns legacy paths when domain is null', () => {
    const routes = getRoutesForDomain(null);
    expect(routes.dashboard).toBe(ROUTES.USER_PANEL);
    expect(routes.tests).toBe(ROUTES.TESTS);
    expect(routes.createTest).toBe(ROUTES.CREATE_TEST);
    expect(routes.settings).toBe(ROUTES.SETTINGS);
    expect(routes.testDetail('id-1')).toBe(ROUTES.TEST_DETAIL('id-1'));
    expect(routes.testEditor('id-2')).toBe(ROUTES.TEST_EDITOR('id-2'));
  });

  it('returns legacy paths when domain is undefined', () => {
    const routes = getRoutesForDomain(undefined);
    expect(routes.dashboard).toBe(ROUTES.USER_PANEL);
    expect(routes.tests).toBe(ROUTES.TESTS);
  });

  it('returns app-scoped paths when domain is set', () => {
    const domain = 'my-store.myshopify.com';
    const routes = getRoutesForDomain(domain);
    expect(routes.dashboard).toBe(ROUTES.appDashboard(domain));
    expect(routes.tests).toBe(ROUTES.appTests(domain));
    expect(routes.createTest).toBe(ROUTES.appCreateTest(domain));
    expect(routes.settings).toBe(ROUTES.appSettings(domain));
    expect(routes.testDetail('abc')).toBe(ROUTES.appTestDetail(domain, 'abc'));
    expect(routes.testEditor('xyz')).toBe(ROUTES.appTestEditor(domain, 'xyz'));
  });

  it('encodes domain in app-scoped paths', () => {
    const domain = 'sub.example.com';
    const routes = getRoutesForDomain(domain);
    expect(routes.dashboard).toBe('/app/sub.example.com');
    expect(routes.testDetail('id')).toBe('/app/sub.example.com/tests/id');
  });
});
