/**
 * Lazy-loaded route components for code splitting.
 * Import these in App.jsx to keep the route tree in one place and reduce inline lazy() calls.
 */

import { lazy } from 'react';

export const Connect = lazy(() => import('../components/Connect/Connect'));
export const Dashboard = lazy(() => import('../components/Dashboard/Dashboard'));
export const TestList = lazy(() => import('../components/TestList/TestList'));
export const TestCreator = lazy(() => import('../components/TestCreator/TestCreator'));
export const TestDetail = lazy(() => import('../components/TestDetail/TestDetail'));
export const TestEditor = lazy(() => import('../components/TestEditor/TestEditor'));
export const Analytics = lazy(() => import('../components/Analytics/Analytics'));
export const AnalyticsOverview = lazy(() => import('../components/Analytics/AnalyticsOverview'));
export const Settings = lazy(() => import('../components/Settings/Settings'));
export const SetupWizard = lazy(() => import('../components/SetupWizard/SetupWizard'));
export const Profile = lazy(() => import('../components/Profile/Profile'));
export const Documentation = lazy(() => import('../components/Documentation/Documentation'));
export const Support = lazy(() => import('../components/Support/Support'));
export const Export = lazy(() => import('../components/Export/Export'));
export const PromoLinks = lazy(() => import('../components/PromoLinks/PromoLinks'));
export const Notifications = lazy(() => import('../components/Notifications/Notifications'));
export const NotFound = lazy(() => import('../components/NotFound/NotFound'));
export const AdminGuard = lazy(() => import('../components/Admin/AdminGuard'));
export const AdminLayout = lazy(() => import('../components/Admin/AdminLayout'));
export const AdminOverview = lazy(() => import('../components/Admin/AdminOverview'));
export const AdminUsers = lazy(() => import('../components/Admin/AdminUsers'));
export const AdminDomains = lazy(() => import('../components/Admin/AdminDomains'));
export const AdminTests = lazy(() => import('../components/Admin/AdminTests'));
export const AdminAudit = lazy(() => import('../components/Admin/AdminAudit'));
export const AdminKv = lazy(() => import('../components/Admin/AdminKv'));
export const AdminJobs = lazy(() => import('../components/Admin/AdminJobs'));
export const AdminFeatureFlags = lazy(() => import('../components/Admin/AdminFeatureFlags'));
export const AdminTestTypeControls = lazy(
  () => import('../components/Admin/AdminTestTypeControls')
);
export const AdminPromoLinks = lazy(() => import('../components/Admin/AdminPromoLinks'));
export const AdminBlockList = lazy(() => import('../components/Admin/AdminBlockList'));
export const AdminWebhookEvents = lazy(() => import('../components/Admin/AdminWebhookEvents'));
export const AdminTargetingPresets = lazy(
  () => import('../components/Admin/AdminTargetingPresets')
);
export const AdminWebhooks = lazy(() => import('../components/Admin/AdminWebhooks'));
export const AdminShopSessions = lazy(() => import('../components/Admin/AdminShopSessions'));
export const AdminConflicts = lazy(() => import('../components/Admin/AdminConflicts'));
export const AdminTestHealth = lazy(() => import('../components/Admin/AdminTestHealth'));
export const AdminSystemHealth = lazy(() => import('../components/Admin/AdminSystemHealth'));
export const AdminShopSettingsOverrides = lazy(
  () => import('../components/Admin/AdminShopSettingsOverrides')
);
export const AdminRateLimitOverrides = lazy(
  () => import('../components/Admin/AdminRateLimitOverrides')
);
export const AdminNotifications = lazy(() => import('../components/Admin/AdminNotifications'));
export const AdminSupportTickets = lazy(() => import('../components/Admin/AdminSupportTickets'));
export const AdminSignificanceAlerts = lazy(
  () => import('../components/Admin/AdminSignificanceAlerts')
);
export const AdminEventCatalog = lazy(() => import('../components/Admin/AdminEventCatalog'));
export const AdminClientErrors = lazy(() => import('../components/Admin/AdminClientErrors'));
export const AdminConsentScript = lazy(() => import('../components/Admin/AdminConsentScript'));
export const AdminAccounts = lazy(() => import('../components/Admin/AdminAccounts'));
export const AdminAggregation = lazy(() => import('../components/Admin/AdminAggregation'));
export const AdminLegal = lazy(() => import('../components/Admin/AdminLegal'));
export const AdminMaintenance = lazy(() => import('../components/Admin/AdminMaintenance'));
export const AdminAnnouncementBanner = lazy(
  () => import('../components/Admin/AdminAnnouncementBanner')
);
export const AdminMailProcesses = lazy(() => import('../components/Admin/AdminMailProcesses'));
export const AdminUsageExport = lazy(() => import('../components/Admin/AdminUsageExport'));
export const DomainList = lazy(() => import('../components/Domains/DomainList'));
export const UserPanel = lazy(() => import('../components/UserPanel/UserPanel'));
export const AppDomainLayout = lazy(() => import('../components/AppDomain/AppDomainLayout'));
export const AuthCallback = lazy(() => import('../components/Auth/AuthCallback'));
export const AuthConfirmResult = lazy(() => import('../components/Auth/AuthConfirmResult'));
export const OAuthSuccess = lazy(() => import('../components/Connect/OAuthSuccess'));
