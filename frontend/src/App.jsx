/**
 * Main App Component
 *
 * Root component for the RipX AB Testing App.
 * Uses React.lazy for route-based code splitting and optimized initial load.
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AppProvider, Banner } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import { BrowserRouter, Routes, Route, useParams, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { initializeTheme } from './utils/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: false,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
    },
    mutations: {
      retry: 0,
    },
  },
});

import { Sidebar, TopBar } from './components/Layout';
import AuthGuard from './components/Connect/AuthGuard';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { PageSkeleton } from './components/LoadingSkeleton/PageSkeleton';
import { useLocation } from 'react-router-dom';
import { ROUTES, ROUTE_PATTERNS, BREAKPOINTS, STORAGE_KEYS, INTERVALS } from './constants';
import { getShopDomain, getApiKey } from './services';

// Lazy-loaded route components for code splitting
const Connect = lazy(() => import('./components/Connect/Connect'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const TestList = lazy(() => import('./components/TestList/TestList'));
const TestCreator = lazy(() => import('./components/TestCreator/TestCreator'));
const TestDetail = lazy(() => import('./components/TestDetail/TestDetail'));
const TestEditor = lazy(() => import('./components/TestEditor/TestEditor'));
const Analytics = lazy(() => import('./components/Analytics/Analytics'));
const AnalyticsOverview = lazy(() => import('./components/Analytics/AnalyticsOverview'));
const Settings = lazy(() => import('./components/Settings/Settings'));
const SetupWizard = lazy(() => import('./components/SetupWizard/SetupWizard'));
const Profile = lazy(() => import('./components/Profile/Profile'));
const Documentation = lazy(() => import('./components/Documentation/Documentation'));
const Export = lazy(() => import('./components/Export/Export'));
const PromoLinks = lazy(() => import('./components/PromoLinks/PromoLinks'));
const Notifications = lazy(() => import('./components/Notifications/Notifications'));
const NotFound = lazy(() => import('./components/NotFound/NotFound'));
const AdminGuard = lazy(() => import('./components/Admin/AdminGuard'));
const AdminLayout = lazy(() => import('./components/Admin/AdminLayout'));
const AdminOverview = lazy(() => import('./components/Admin/AdminOverview'));
const AdminUsers = lazy(() => import('./components/Admin/AdminUsers'));
const AdminDomains = lazy(() => import('./components/Admin/AdminDomains'));
const AdminTests = lazy(() => import('./components/Admin/AdminTests'));
const AdminAudit = lazy(() => import('./components/Admin/AdminAudit'));
const AdminKv = lazy(() => import('./components/Admin/AdminKv'));
const AdminJobs = lazy(() => import('./components/Admin/AdminJobs'));
const AdminFeatureFlags = lazy(() => import('./components/Admin/AdminFeatureFlags'));
const AdminPromoLinks = lazy(() => import('./components/Admin/AdminPromoLinks'));
const AdminBlockList = lazy(() => import('./components/Admin/AdminBlockList'));
const AdminWebhookEvents = lazy(() => import('./components/Admin/AdminWebhookEvents'));
const AdminTargetingPresets = lazy(() => import('./components/Admin/AdminTargetingPresets'));
const AdminWebhooks = lazy(() => import('./components/Admin/AdminWebhooks'));
const AdminShopSessions = lazy(() => import('./components/Admin/AdminShopSessions'));
const AdminConflicts = lazy(() => import('./components/Admin/AdminConflicts'));
const AdminTestHealth = lazy(() => import('./components/Admin/AdminTestHealth'));
const AdminShopSettingsOverrides = lazy(
  () => import('./components/Admin/AdminShopSettingsOverrides')
);
const AdminRateLimitOverrides = lazy(() => import('./components/Admin/AdminRateLimitOverrides'));
const AdminNotifications = lazy(() => import('./components/Admin/AdminNotifications'));
const AdminSignificanceAlerts = lazy(() => import('./components/Admin/AdminSignificanceAlerts'));
const AdminEventCatalog = lazy(() => import('./components/Admin/AdminEventCatalog'));
const AdminClientErrors = lazy(() => import('./components/Admin/AdminClientErrors'));
const AdminConsentScript = lazy(() => import('./components/Admin/AdminConsentScript'));
const AdminAccounts = lazy(() => import('./components/Admin/AdminAccounts'));
const AdminAggregation = lazy(() => import('./components/Admin/AdminAggregation'));
const AdminLegal = lazy(() => import('./components/Admin/AdminLegal'));
const AdminMaintenance = lazy(() => import('./components/Admin/AdminMaintenance'));
const AdminAnnouncementBanner = lazy(() => import('./components/Admin/AdminAnnouncementBanner'));
const AdminUsageExport = lazy(() => import('./components/Admin/AdminUsageExport'));

// Wrapper component to get testId from route params
function ExportWrapper() {
  const { id } = useParams();
  return <Export testId={id} />;
}

function PromoLinksWrapper() {
  return <PromoLinks />;
}

function AppContent() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sidebarWidth = sidebarCollapsed ? 80 : 280;
  const effectiveSidebarWidth = isMobile ? 0 : sidebarWidth;

  // Initialize theme on app load
  useEffect(() => {
    initializeTheme();

    // Set up interval to check for auto/custom theme changes
    const interval = setInterval(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
        if (saved) {
          const preferences = JSON.parse(saved);
          if (preferences.theme === 'auto' || preferences.theme === 'custom') {
            initializeTheme();
          }
        }
      } catch (err) {
        console.error('Error checking theme:', err);
      }
    }, INTERVALS.THEME_CHECK);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateLayout = () => {
      const mobile = window.innerWidth <= BREAKPOINTS.MOBILE;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileSidebarOpen(false);
      }
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const isConnectWithoutAuth =
    location.pathname === ROUTES.CONNECT && !getShopDomain() && !getApiKey();
  const showAppChrome = !isConnectWithoutAuth;

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const base = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${base}/api/health`, { credentials: 'include' });
      if (!res.ok) return {};
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  const [dismissedAnnouncement, setDismissedAnnouncement] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.ANNOUNCEMENT_DISMISSED) || '';
    } catch {
      return '';
    }
  });
  const announcementBanner = health?.announcementBanner;
  const showAnnouncement =
    announcementBanner &&
    typeof announcementBanner === 'string' &&
    announcementBanner.trim() !== '' &&
    dismissedAnnouncement !== announcementBanner;
  const handleDismissAnnouncement = () => {
    if (announcementBanner) {
      try {
        localStorage.setItem(STORAGE_KEYS.ANNOUNCEMENT_DISMISSED, announcementBanner);
        setDismissedAnnouncement(announcementBanner);
      } catch (e) {
        setDismissedAnnouncement(announcementBanner);
      }
    }
  };

  return (
    <div
      className="app-layout"
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        position: 'relative',
        transition: 'background-color 0.3s ease',
      }}
    >
      <a href="#main-content" className="skip-to-main" aria-label="Skip to main content">
        Skip to main content
      </a>
      {showAppChrome && (
        <>
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            mobileOpen={mobileSidebarOpen}
            onMobileClose={() => setMobileSidebarOpen(false)}
          />
          {isMobile && mobileSidebarOpen && (
            <button
              type="button"
              className="sidebar-overlay"
              aria-label="Close navigation"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
        </>
      )}
      <div
        style={{
          marginLeft: showAppChrome ? effectiveSidebarWidth : 0,
          width: showAppChrome ? `calc(100% - ${effectiveSidebarWidth}px)` : '100%',
          transition:
            'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          minHeight: '100vh',
          position: 'relative',
        }}
      >
        {showAppChrome && (
          <TopBar
            sidebarWidth={effectiveSidebarWidth}
            sidebarCollapsed={sidebarCollapsed}
            showMobileToggle={isMobile}
            onMobileToggle={() => setMobileSidebarOpen(open => !open)}
          />
        )}
        {health?.maintenance && (
          <div style={{ padding: '0 var(--spacing-md)' }}>
            <Banner tone="warning" title="Maintenance mode">
              {health.maintenanceMessage
                ? `Scheduled maintenance is in progress (${health.maintenanceMessage}). Track and script may be unavailable.`
                : 'Scheduled maintenance is in progress. Track and script may be unavailable.'}
            </Banner>
          </div>
        )}
        {showAnnouncement && (
          <div style={{ padding: '0 var(--spacing-md)' }}>
            <Banner tone="info" title="Announcement" onDismiss={handleDismissAnnouncement}>
              {announcementBanner}
            </Banner>
          </div>
        )}
        <main
          id="main-content"
          className={`main-content-wrapper${[ROUTES.DASHBOARD, ROUTES.SETTINGS, ROUTES.PROFILE, ROUTES.NOTIFICATIONS, ROUTES.SETUP, ROUTES.CREATE_TEST, ROUTES.TESTS, ROUTES.ANALYTICS, ROUTES.DOCS].includes(location.pathname) || /^\/tests\/[^/]+\/analytics$/.test(location.pathname) ? ' main-content-wrapper--full-width' : ''}`}
          tabIndex={-1}
        >
          <ErrorBoundary resetKeys={[location.pathname]}>
            <Routes>
              <Route
                path={ROUTES.CONNECT}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <Connect />
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.DASHBOARD}
                element={
                  <Suspense fallback={<PageSkeleton variant="dashboard" />}>
                    <AuthGuard>
                      <Dashboard />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.TESTS}
                element={
                  <Suspense fallback={<PageSkeleton variant="testList" />}>
                    <AuthGuard>
                      <TestList />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.CREATE_TEST}
                element={
                  <Suspense fallback={<PageSkeleton variant="testList" />}>
                    <AuthGuard>
                      <TestCreator />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_DETAIL}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <TestDetail />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_EDITOR}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <TestEditor />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_ANALYTICS}
                element={
                  <Suspense fallback={<PageSkeleton variant="analytics" />}>
                    <AuthGuard>
                      <Analytics />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_EXPORT}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <ExportWrapper />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_PROMO_LINKS}
                element={
                  <Suspense fallback={<PageSkeleton variant="testList" />}>
                    <AuthGuard>
                      <PromoLinksWrapper />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.ANALYTICS}
                element={
                  <Suspense fallback={<PageSkeleton variant="analytics" />}>
                    <AuthGuard>
                      <AnalyticsOverview />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.SETUP}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <SetupWizard />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.SETTINGS}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <Settings />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.DOCS}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <Documentation />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.PROFILE}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <Profile />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.NOTIFICATIONS}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <Notifications />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.ADMIN}
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AdminGuard>
                      <AdminLayout>
                        <Outlet />
                      </AdminLayout>
                    </AdminGuard>
                  </Suspense>
                }
              >
                <Route index element={<AdminOverview />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="domains" element={<AdminDomains />} />
                <Route path="tests" element={<AdminTests />} />
                <Route path="audit" element={<AdminAudit />} />
                <Route path="kv" element={<AdminKv />} />
                <Route path="jobs" element={<AdminJobs />} />
                <Route path="feature-flags" element={<AdminFeatureFlags />} />
                <Route path="promo-links" element={<AdminPromoLinks />} />
                <Route path="block-list" element={<AdminBlockList />} />
                <Route path="webhook-events" element={<AdminWebhookEvents />} />
                <Route path="targeting-presets" element={<AdminTargetingPresets />} />
                <Route path="webhooks" element={<AdminWebhooks />} />
                <Route path="shop-sessions" element={<AdminShopSessions />} />
                <Route path="conflicts" element={<AdminConflicts />} />
                <Route path="test-health" element={<AdminTestHealth />} />
                <Route path="shop-settings-overrides" element={<AdminShopSettingsOverrides />} />
                <Route path="rate-limit-overrides" element={<AdminRateLimitOverrides />} />
                <Route path="notifications" element={<AdminNotifications />} />
                <Route path="significance-alerts" element={<AdminSignificanceAlerts />} />
                <Route path="event-catalog" element={<AdminEventCatalog />} />
                <Route path="client-errors" element={<AdminClientErrors />} />
                <Route path="consent-script" element={<AdminConsentScript />} />
                <Route path="accounts" element={<AdminAccounts />} />
                <Route path="aggregation" element={<AdminAggregation />} />
                <Route path="legal" element={<AdminLegal />} />
                <Route path="maintenance" element={<AdminMaintenance />} />
                <Route path="announcement-banner" element={<AdminAnnouncementBanner />} />
                <Route path="usage-export" element={<AdminUsageExport />} />
              </Route>
              <Route
                path="*"
                element={
                  <Suspense fallback={<PageSkeleton variant="default" />}>
                    <AuthGuard>
                      <NotFound />
                    </AuthGuard>
                  </Suspense>
                }
              />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

// Shopify Client ID for embedded app (required when running in Shopify Admin iframe)
const SHOPIFY_API_KEY =
  import.meta.env.VITE_SHOPIFY_API_KEY || import.meta.env.VITE_SHOPIFY_CLIENT_ID || null;
const isEmbeddedApp = typeof window !== 'undefined' && window.self !== window.top;
// Only enable embedded mode when we have apiKey; otherwise Polaris works in standalone mode
const useEmbedded = isEmbeddedApp && !!SHOPIFY_API_KEY;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider
        apiKey={SHOPIFY_API_KEY || undefined}
        embedded={useEmbedded}
        i18n={{
          Polaris: {
            Avatar: { label: 'Avatar', labelWithInitials: 'Avatar with initials {initials}' },
            ContextualSaveBar: { save: 'Save', discard: 'Discard' },
            TextField: { characterCount: '{count} characters' },
          },
        }}
      >
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AppContent />
        </BrowserRouter>
      </AppProvider>
    </QueryClientProvider>
  );
}

export default App;
