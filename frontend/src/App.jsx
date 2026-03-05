/**
 * Main App Component
 *
 * Root component for the RipX AB Testing App.
 * Uses React.lazy for route-based code splitting and optimized initial load.
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AppProvider, Banner } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import {
  BrowserRouter,
  Routes,
  Route,
  useParams,
  Outlet,
  Navigate,
  useSearchParams,
  useNavigate,
} from 'react-router-dom';
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
setQueryClientForPermissionInvalidation(queryClient);

import { Sidebar, TopBar } from './components/Layout';
import AuthGuard from './components/Connect/AuthGuard';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import { RouteLoading } from './components/LoadingSkeleton/RouteLoading';
import { useLocation } from 'react-router-dom';
import {
  ROUTES,
  ROUTE_PATTERNS,
  MAIN_APP_PATHS,
  BREAKPOINTS,
  STORAGE_KEYS,
  INTERVALS,
} from './constants';
import {
  getShopDomain,
  getApiKey,
  getEmailToken,
  hasEmailSession,
  setQueryClientForPermissionInvalidation,
  apiPostPublic,
  getHealthUrl,
} from './services';
import { useSessionCheck } from './hooks';

/** When URL has connect_token (admin "Open app"), exchange it and redirect to dashboard. Runs before auth redirect so token is not lost. */
function ConnectTokenExchange({ connectToken }) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    if (!connectToken || doneRef.current) return;
    doneRef.current = true;
    (async () => {
      try {
        const res = await apiPostPublic(
          '/auth/connect-token',
          { connect_token: connectToken },
          { timeout: 15000 }
        );
        const raw = res.data && typeof res.data === 'object' ? res.data : {};
        const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
        const apiKey = data?.apiKey;
        const domain = data?.domain;
        if (!apiKey || !domain) {
          setErrorMessage(raw?.error || 'Invalid or expired link. Request a new one from Admin.');
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete('connect_token');
            return next;
          });
          setStatus('error');
          return;
        }
        try {
          window.sessionStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
          window.sessionStorage.setItem(STORAGE_KEYS.SHOP_DOMAIN, domain);
          window.sessionStorage.setItem(STORAGE_KEYS.CURRENT_STORE, domain);
        } catch (_) {
          /* ignore storage errors */
        }
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('connect_token');
          return next;
        });
        navigate(ROUTES.DASHBOARD, { replace: true });
      } catch (err) {
        setErrorMessage(
          err?.response?.data?.error ||
            err?.message ||
            'Invalid or expired link. Request a new one from Admin.'
        );
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('connect_token');
          return next;
        });
        setStatus('error');
      }
    })();
  }, [connectToken, navigate, setSearchParams]);

  if (status === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p style={{ marginBottom: 16, color: 'var(--p-color-text-critical)' }}>{errorMessage}</p>
        <button
          type="button"
          onClick={() => navigate(ROUTES.CONNECT)}
          style={{ padding: '8px 16px' }}
        >
          Go to sign in
        </button>
      </div>
    );
  }
  return <RouteLoading message="Opening app…" fullScreen />;
}

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
const AdminMailProcesses = lazy(() => import('./components/Admin/AdminMailProcesses'));
const AdminUsageExport = lazy(() => import('./components/Admin/AdminUsageExport'));
const DomainList = lazy(() => import('./components/Domains/DomainList'));
const AuthCallback = lazy(() => import('./components/Auth/AuthCallback'));
const AuthConfirmResult = lazy(() => import('./components/Auth/AuthConfirmResult'));

// Redirect email-only users from Dashboard to Domain list
function EmailSessionRedirect({ children }) {
  if (hasEmailSession() && !getApiKey() && !getShopDomain()) {
    return <Navigate to={ROUTES.DOMAINS} replace />;
  }
  return children;
}

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

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch(getHealthUrl(), { credentials: 'include' });
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

  const [searchParams] = useSearchParams();
  const connectToken = searchParams.get('connect_token');

  const hasCreds = getShopDomain() || getApiKey() || hasEmailSession();
  const isAdminRoute = location.pathname.startsWith(ROUTES.ADMIN);
  const isDocsRoute = location.pathname === ROUTES.DOCS;
  const isDomainsRoute = location.pathname === ROUTES.DOMAINS;
  const publicPaths = [ROUTES.CONNECT, ROUTES.AUTH_CALLBACK, ROUTES.AUTH_CONFIRM_RESULT];
  const isPublicPath = publicPaths.includes(location.pathname);
  /* Auth pages (Connect, callback, confirm) render full-page without sidebar/topbar */
  const showAppChrome =
    hasCreds && !isPublicPath && !isAdminRoute && !isDocsRoute && !isDomainsRoute;

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

  // Periodically validate session; on 401 the API interceptor redirects to login (must run unconditionally for consistent hook order)
  useSessionCheck(hasCreds && !isPublicPath && !connectToken);

  if (connectToken) {
    return <ConnectTokenExchange connectToken={connectToken} />;
  }

  if (!hasCreds && !isPublicPath) {
    return <Navigate to={ROUTES.CONNECT} replace />;
  }

  // Email-only users (session but no API key/shop) must use domain list first; redirect from any main-app route
  const emailOnlyNoKey =
    hasCreds &&
    hasEmailSession() &&
    !getApiKey() &&
    !getShopDomain() &&
    !isAdminRoute &&
    !isDomainsRoute;
  const isMainAppRoute =
    MAIN_APP_PATHS.includes(location.pathname) || /^\/tests\/[^/]+/.test(location.pathname);
  if (emailOnlyNoKey && isMainAppRoute) {
    return <Navigate to={ROUTES.DOMAINS} replace />;
  }

  // Shopify / shop-only: show login panel first if not on Connect; then after sign-in they can open the app from domain list
  const shopOnlyNoEmail =
    getShopDomain() && !getEmailToken() && !getApiKey() && !isAdminRoute && !isDomainsRoute;
  if (shopOnlyNoEmail && isMainAppRoute && !isPublicPath) {
    return <Navigate to={{ pathname: ROUTES.CONNECT, search: location.search }} replace />;
  }

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
          className={`main-content-wrapper${[ROUTES.DASHBOARD, ROUTES.SETTINGS, ROUTES.PROFILE, ROUTES.NOTIFICATIONS, ROUTES.SETUP, ROUTES.CREATE_TEST, ROUTES.TESTS, ROUTES.ANALYTICS].includes(location.pathname) || /^\/tests\/[^/]+\/analytics$/.test(location.pathname) ? ' main-content-wrapper--full-width' : ''}${[ROUTES.CONNECT, ROUTES.AUTH_CALLBACK, ROUTES.AUTH_CONFIRM_RESULT].includes(location.pathname) ? ' main-content-wrapper--auth' : ''}${isAdminRoute ? ' main-content-wrapper--admin' : ''}${isDocsRoute ? ' main-content-wrapper--docs' : ''}${isDomainsRoute ? ' main-content-wrapper--domains' : ''}`}
          tabIndex={-1}
        >
          <ErrorBoundary resetKeys={[location.pathname]}>
            <Routes>
              <Route
                path={ROUTES.CONNECT}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <Connect />
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.AUTH_CALLBACK}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthCallback />
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.AUTH_CONFIRM_RESULT}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthConfirmResult />
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.DOMAINS}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <DomainList />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.DASHBOARD}
                element={
                  <Suspense fallback={<RouteLoading message="Loading dashboard…" />}>
                    <AuthGuard>
                      <EmailSessionRedirect>
                        <Dashboard />
                      </EmailSessionRedirect>
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.TESTS}
                element={
                  <Suspense fallback={<RouteLoading message="Loading…" />}>
                    <AuthGuard>
                      <TestList />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.CREATE_TEST}
                element={
                  <Suspense fallback={<RouteLoading message="Loading…" />}>
                    <AuthGuard>
                      <TestCreator />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_DETAIL}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <TestDetail />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_EDITOR}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <TestEditor />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_ANALYTICS}
                element={
                  <Suspense fallback={<RouteLoading message="Loading analytics…" />}>
                    <AuthGuard>
                      <Analytics />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_EXPORT}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <ExportWrapper />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTE_PATTERNS.TEST_PROMO_LINKS}
                element={
                  <Suspense fallback={<RouteLoading message="Loading…" />}>
                    <AuthGuard>
                      <PromoLinksWrapper />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.ANALYTICS}
                element={
                  <Suspense fallback={<RouteLoading message="Loading analytics…" />}>
                    <AuthGuard>
                      <AnalyticsOverview />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.SETUP}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <SetupWizard />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.SETTINGS}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <Settings />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.DOCS}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <Documentation />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.PROFILE}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <Profile />
                    </AuthGuard>
                  </Suspense>
                }
              />
              <Route
                path={ROUTES.NOTIFICATIONS}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <Notifications />
                    </AuthGuard>
                  </Suspense>
                }
              />
              {/* Admin routes: AdminGuard enforces platform admin role; non-admins are redirected */}
              <Route
                path={ROUTES.ADMIN}
                element={
                  <Suspense fallback={<RouteLoading />}>
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
                <Route path="mail-processes" element={<AdminMailProcesses />} />
                <Route path="usage-export" element={<AdminUsageExport />} />
              </Route>
              <Route
                path="*"
                element={
                  <Suspense fallback={<RouteLoading />}>
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
