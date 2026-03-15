/**
 * Pure route map for a given domain. Used by useAppRoutes and unit-testable without React or services.
 *
 * @param {string|null|undefined} domain - Current shop/tenant domain, or null for user-panel/legacy.
 * @returns {Object} Route strings and helpers (testDetail, testEditor, etc.)
 */

import { ROUTES } from '../constants';

export function getRoutesForDomain(domain) {
  if (!domain) {
    return {
      dashboard: ROUTES.USER_PANEL,
      tests: ROUTES.TESTS,
      testsPersonalization: ROUTES.TESTS_PERSONALIZATION,
      createTest: ROUTES.CREATE_TEST,
      analytics: ROUTES.ANALYTICS,
      setup: ROUTES.SETUP,
      settings: ROUTES.SETTINGS,
      profile: ROUTES.PROFILE,
      notifications: ROUTES.NOTIFICATIONS,
      docs: ROUTES.DOCS,
      support: ROUTES.SUPPORT,
      testDetail: id => ROUTES.TEST_DETAIL(id),
      testEditor: id => ROUTES.TEST_EDITOR(id),
      testAnalytics: id => ROUTES.TEST_ANALYTICS(id),
      testExport: id => ROUTES.TEST_EXPORT(id),
      testPromoLinks: id => ROUTES.TEST_PROMO_LINKS(id),
    };
  }
  return {
    dashboard: ROUTES.appDashboard(domain),
    tests: ROUTES.appTests(domain),
    testsPersonalization: ROUTES.appTestsPersonalization(domain),
    createTest: ROUTES.appCreateTest(domain),
    analytics: ROUTES.appAnalytics(domain),
    setup: ROUTES.appSetup(domain),
    settings: ROUTES.appSettings(domain),
    profile: ROUTES.appProfile(domain),
    notifications: ROUTES.appNotifications(domain),
    docs: ROUTES.appDocs(domain),
    support: ROUTES.appSupport(domain),
    testDetail: id => ROUTES.appTestDetail(domain, id),
    testEditor: id => ROUTES.appTestEditor(domain, id),
    testAnalytics: id => ROUTES.appTestAnalytics(domain, id),
    testExport: id => ROUTES.appTestExport(domain, id),
    testPromoLinks: id => ROUTES.appTestPromoLinks(domain, id),
  };
}
