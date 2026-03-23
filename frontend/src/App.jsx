/**
 * Main App Component
 *
 * Root component for the RipX AB Testing App.
 * Uses React.lazy for route-based code splitting and optimized initial load.
 */

import React, { useState, useEffect, useRef, Suspense } from 'react';
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
  useLocation,
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
import {
  ROUTES,
  ROUTE_PATTERNS,
  MAIN_APP_PATHS,
  UNIVERSAL_APP_ROUTES,
  BREAKPOINTS,
  STORAGE_KEYS,
  INTERVALS,
} from './constants';
import { getAppDomainFromPath } from './utils/breadcrumb';
import { isShopifyStoreDomain } from './utils/shopifyAdmin';
import {
  getShopDomain,
  getApiKey,
  getEmailToken,
  hasEmailSession,
  setQueryClientForPermissionInvalidation,
  apiPostPublic,
  getHealthUrl,
  apiGet,
  resetRedirectingToLogin,
} from './services';
import { useSessionCheck } from './hooks';

/** Redirect to Connect preserving query (host, shop) for embed. */
function NavigateToConnect() {
  const location = useLocation();
  return <Navigate to={{ pathname: ROUTES.CONNECT, search: location.search }} replace />;
}

/** When URL has connect_token (admin "Open app"), exchange it and redirect to dashboard. Runs before auth redirect so token is not lost. */
function ConnectTokenExchange({ connectToken }) {
  const navigate = useNavigate();
  const location = useLocation();
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
        navigate(`${ROUTES.appDashboard(domain)}${location.search || ''}`, { replace: true });
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
  }, [connectToken, navigate, setSearchParams, location.search]);

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
          onClick={() => navigate({ pathname: ROUTES.CONNECT, search: location.search })}
          style={{ padding: '8px 16px' }}
        >
          Go to sign in
        </button>
      </div>
    );
  }
  return <RouteLoading message="Opening app…" fullScreen />;
}

import {
  Connect,
  Dashboard,
  TestList,
  TestCreator,
  TestDetail,
  TestEditor,
  Analytics,
  AnalyticsOverview,
  Settings,
  SetupWizard,
  Profile,
  Documentation,
  Support,
  Export,
  PromoLinks,
  Notifications,
  NotFound,
  AdminGuard,
  AdminLayout,
  AdminOverview,
  AdminUsers,
  AdminDomains,
  AdminTests,
  AdminAudit,
  AdminKv,
  AdminJobs,
  AdminFeatureFlags,
  AdminPromoLinks,
  AdminBlockList,
  AdminWebhookEvents,
  AdminTargetingPresets,
  AdminWebhooks,
  AdminShopSessions,
  AdminConflicts,
  AdminTestHealth,
  AdminSystemHealth,
  AdminShopSettingsOverrides,
  AdminRateLimitOverrides,
  AdminNotifications,
  AdminSupportTickets,
  AdminSignificanceAlerts,
  AdminEventCatalog,
  AdminClientErrors,
  AdminConsentScript,
  AdminAccounts,
  AdminAggregation,
  AdminLegal,
  AdminMaintenance,
  AdminAnnouncementBanner,
  AdminMailProcesses,
  AdminUsageExport,
  DomainList,
  UserPanel,
  AppDomainLayout,
  AuthCallback,
  AuthConfirmResult,
  OAuthSuccess,
} from './config/lazyRoutes';

// Wrapper component to get testId from route params
function ExportWrapper() {
  const { id } = useParams();
  return <Export testId={id} />;
}

function PromoLinksWrapper() {
  return <PromoLinks />;
}

/** Auth check status: we validate session once before showing protected app content to avoid flash of app then redirect. */
const AUTH_CHECK = { IDLE: 'idle', LOADING: 'loading', DONE: 'done' };

function AppContent() {
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [authCheckStatus, setAuthCheckStatus] = useState(AUTH_CHECK.IDLE);
  const authCheckStartedRef = useRef(false);
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
  const pathname = location.pathname;
  const isOnConnectOrAuthPath =
    pathname === ROUTES.CONNECT ||
    pathname === '/connect/' ||
    pathname.startsWith('/auth/') ||
    pathname.includes('/connect') ||
    pathname.includes('/auth/');
  const publicPaths = [
    ROUTES.CONNECT,
    ROUTES.AUTH_CALLBACK,
    ROUTES.AUTH_CONFIRM_RESULT,
    ROUTES.CONNECT_OAUTH_SUCCESS,
  ];
  const isPublicPath = publicPaths.includes(pathname);
  const isProtectedRouteWithCreds = hasCreds && !isPublicPath && !isOnConnectOrAuthPath;

  const isAdminRoute = location.pathname.startsWith(ROUTES.ADMIN);
  const isDocsRoute = location.pathname === ROUTES.DOCS;
  const isDomainsRoute = location.pathname === ROUTES.DOMAINS;
  const isUserPanelRoute = location.pathname === ROUTES.USER_PANEL;
  const isAppDomainRoute = !!getAppDomainFromPath(location.pathname);
  const isUniversalAppRoute = UNIVERSAL_APP_ROUTES.includes(location.pathname);
  /* TopBar on every app page including admin and universal Profile/Settings/Docs/Notifications */
  const showTopBar =
    !isOnConnectOrAuthPath &&
    hasCreds &&
    !isPublicPath &&
    (isAppDomainRoute ||
      isDocsRoute ||
      isUserPanelRoute ||
      isDomainsRoute ||
      isAdminRoute ||
      isUniversalAppRoute);
  /* Sidebar (AB test nav) only when inside /app/:domain; Profile, Settings, Docs, Notifications are outside the panel (TopBar only) */
  const showSidebar =
    !isOnConnectOrAuthPath && hasCreds && !isPublicPath && !isAdminRoute && isAppDomainRoute;

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

  // On Domains page skip session check so a 401 from /me/domains never triggers redirect; DomainList handles sign-in via "Sign in required" + open Connect in new tab.
  // On /app/:domain use /account/stores so email users (non-admin) don't get 401 from /admin/me and redirect to login.
  const sessionCheckEndpoint = isDomainsRoute
    ? null
    : isAppDomainRoute
      ? '/account/stores'
      : '/admin/me';
  useSessionCheck(hasCreds && !isPublicPath && !connectToken, () => sessionCheckEndpoint);

  // Initial auth check: before showing any protected app content, validate session once to avoid flash of app then redirect to login.
  // On Domains with only shop (no token), skip; on Domains with email session use /me/domains.
  // On /app/:domain use /account/stores so email users (non-admin) don't get 401 from /admin/me and redirect to login.
  useEffect(() => {
    if (!isProtectedRouteWithCreds || authCheckStartedRef.current) return;
    authCheckStartedRef.current = true;
    setAuthCheckStatus(AUTH_CHECK.LOADING);
    const timeoutMs = INTERVALS.AUTH_CHECK_TIMEOUT_MS ?? 10_000;
    const timeoutId = window.setTimeout(() => {
      setAuthCheckStatus(AUTH_CHECK.DONE);
    }, timeoutMs);
    const endpoint =
      isDomainsRoute && getEmailToken()
        ? '/me/domains'
        : isDomainsRoute && !getEmailToken()
          ? null
          : isAppDomainRoute
            ? '/account/stores'
            : '/admin/me';
    if (!endpoint) {
      window.clearTimeout(timeoutId);
      setAuthCheckStatus(AUTH_CHECK.DONE);
      return;
    }
    apiGet(endpoint)
      .catch(() => {})
      .finally(() => {
        window.clearTimeout(timeoutId);
        setAuthCheckStatus(AUTH_CHECK.DONE);
      });
  }, [isProtectedRouteWithCreds, isDomainsRoute, isAppDomainRoute]);

  // Reset auth check when navigating to/from connect or when creds change so we re-validate on next protected visit
  useEffect(() => {
    if (!isProtectedRouteWithCreds) {
      authCheckStartedRef.current = false;
      setAuthCheckStatus(AUTH_CHECK.IDLE);
    }
  }, [isProtectedRouteWithCreds, pathname]);

  // Reset 401 redirect guard when on Connect so that after re-login a future 401 can redirect again
  useEffect(() => {
    if (isOnConnectOrAuthPath) {
      resetRedirectingToLogin();
    }
  }, [isOnConnectOrAuthPath]);

  if (connectToken) {
    return <ConnectTokenExchange connectToken={connectToken} />;
  }

  /* Render connect/auth pages in a minimal layout (no TopBar, no Sidebar) — check pathname first so we never show app chrome on login */
  if (isOnConnectOrAuthPath) {
    return (
      <div
        className="app-layout"
        data-auth-layout
        style={{
          display: 'flex',
          minHeight: '100vh',
          backgroundColor: 'var(--bg-primary)',
          position: 'relative',
        }}
      >
        <a href="#main-content" className="skip-to-main" aria-label="Skip to main content">
          Skip to main content
        </a>
        <main
          id="main-content"
          className="main-content-wrapper main-content-wrapper--auth"
          tabIndex={-1}
          style={{ width: '100%', marginLeft: 0 }}
        >
          <ErrorBoundary resetKeys={[pathname]}>
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
                path={ROUTES.CONNECT_OAUTH_SUCCESS}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <OAuthSuccess />
                  </Suspense>
                }
              />
              <Route path="*" element={<NavigateToConnect />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  if (!hasCreds && !isPublicPath) {
    return <Navigate to={{ pathname: ROUTES.CONNECT, search: location.search }} replace />;
  }

  // Email-only users (session but no API key/shop): allow /, /domains, and universal routes (Profile, Settings, Docs, Notifications). Redirect other main app paths to /domains so they connect a store; /app/:domain is handled by AppDomainLayout.
  const emailOnlyNoKey =
    hasCreds &&
    hasEmailSession() &&
    !getApiKey() &&
    !getShopDomain() &&
    !isAdminRoute &&
    !isDomainsRoute;
  const isLegacyMainAppPath =
    (MAIN_APP_PATHS.includes(location.pathname) && location.pathname !== ROUTES.USER_PANEL) ||
    /^\/tests\/[^/]+/.test(location.pathname);
  if (emailOnlyNoKey && isLegacyMainAppPath && !isUniversalAppRoute) {
    return <Navigate to={ROUTES.DOMAINS} replace />;
  }

  // Standalone (non-Shopify) with shop domain but no API key: send to Connect to add key.
  // Shopify stores: keep on app route — backend auth uses X-Shopify-Shop-Domain + DB session.
  const isMainAppRoute = !isPublicPath && !isAdminRoute && !isDomainsRoute;
  const shopDomain = getShopDomain();
  const shopOnlyNoEmail =
    shopDomain && !getEmailToken() && !getApiKey() && !isAdminRoute && !isDomainsRoute;
  const isShopifyShop = shopDomain && isShopifyStoreDomain(shopDomain);
  if (shopOnlyNoEmail && isMainAppRoute && !isShopifyShop) {
    return <Navigate to={{ pathname: ROUTES.CONNECT, search: location.search }} replace />;
  }

  // Show loader until initial session validation completes; avoids flash of user panel then redirect to login
  if (isProtectedRouteWithCreds && authCheckStatus !== AUTH_CHECK.DONE) {
    return <RouteLoading message="Loading…" fullScreen />;
  }

  const isSupportPage = location.pathname === ROUTES.SUPPORT;

  return (
    <div
      className="app-layout"
      data-support-page={isSupportPage ? true : undefined}
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
      {showSidebar && (
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
        className={
          location.pathname === ROUTES.SUPPORT
            ? 'layout-content layout-content--support'
            : 'layout-content'
        }
        style={{
          marginLeft: showSidebar ? effectiveSidebarWidth : 0,
          width: showSidebar ? `calc(100% - ${effectiveSidebarWidth}px)` : '100%',
          transition:
            'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          minHeight: location.pathname === ROUTES.SUPPORT ? undefined : '100vh',
          position: 'relative',
          ...(isSupportPage && { overflow: 'visible', overflowX: 'hidden' }),
        }}
      >
        {showTopBar && !isAdminRoute && (
          <TopBar
            sidebarWidth={showSidebar ? effectiveSidebarWidth : 0}
            sidebarCollapsed={sidebarCollapsed}
            showMobileToggle={isMobile && showSidebar}
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
          className={`main-content-wrapper${isAppDomainRoute || UNIVERSAL_APP_ROUTES.includes(location.pathname) || [ROUTES.SETUP, ROUTES.CREATE_TEST, ROUTES.TESTS, ROUTES.ANALYTICS].includes(location.pathname) || /^\/app\/[^/]+\/tests\/[^/]+/.test(location.pathname) || isUserPanelRoute || isDomainsRoute ? ' main-content-wrapper--full-width' : ''}${[ROUTES.CONNECT, ROUTES.AUTH_CALLBACK, ROUTES.AUTH_CONFIRM_RESULT, ROUTES.CONNECT_OAUTH_SUCCESS].includes(location.pathname) ? ' main-content-wrapper--auth' : ''}${isAdminRoute ? ' main-content-wrapper--admin' : ''}${isDocsRoute ? ' main-content-wrapper--docs' : ''}${isDomainsRoute ? ' main-content-wrapper--domains' : ''}${isUserPanelRoute ? ' main-content-wrapper--user-panel' : ''}${isUniversalAppRoute ? ' main-content-wrapper--universal' : ''}`}
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
                path={ROUTES.CONNECT_OAUTH_SUCCESS}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <OAuthSuccess />
                  </Suspense>
                }
              />
              {/* SPA-only: avoid dev server showing raw JSON from API /health when users open frontend-origin /health */}
              <Route
                path="/health"
                element={<Navigate to={ROUTES.ADMIN_SYSTEM_HEALTH} replace />}
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
                path={ROUTES.USER_PANEL}
                element={
                  <Suspense fallback={<RouteLoading message="Loading…" />}>
                    <AuthGuard>
                      <UserPanel />
                    </AuthGuard>
                  </Suspense>
                }
              />
              {/* Universal app routes: Profile, Settings, Docs, Notifications (not tied to /app/:domain) */}
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
                path={ROUTES.NOTIFICATIONS}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <Notifications />
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
                path={ROUTES.SUPPORT}
                element={
                  <Suspense fallback={<RouteLoading />}>
                    <AuthGuard>
                      <Support />
                    </AuthGuard>
                  </Suspense>
                }
              />
              {/* Redirect panel URLs to universal pages (Profile/Docs/Notifications only; Settings stays in panel for app config) */}
              <Route
                path="/app/:domain/profile"
                element={<Navigate to={ROUTES.PROFILE} replace />}
              />
              <Route
                path="/app/:domain/notifications"
                element={<Navigate to={ROUTES.NOTIFICATIONS} replace />}
              />
              <Route path="/app/:domain/docs" element={<Navigate to={ROUTES.DOCS} replace />} />
              <Route
                path="/app/:domain/support"
                element={<Navigate to={ROUTES.SUPPORT} replace />}
              />
              {/* Domain-scoped AB test app: /app/:domain/* */}
              <Route
                path={ROUTE_PATTERNS.APP_DOMAIN}
                element={
                  <Suspense fallback={<RouteLoading message="Loading…" />}>
                    <AuthGuard>
                      <AppDomainLayout />
                    </AuthGuard>
                  </Suspense>
                }
              >
                <Route
                  index
                  element={
                    <Suspense fallback={<RouteLoading message="Loading dashboard…" />}>
                      <Dashboard />
                    </Suspense>
                  }
                />
                <Route
                  path="tests"
                  element={
                    <Suspense fallback={<RouteLoading message="Loading…" />}>
                      <TestList />
                    </Suspense>
                  }
                />
                <Route
                  path="tests/new"
                  element={
                    <Suspense fallback={<RouteLoading message="Loading…" />}>
                      <TestCreator />
                    </Suspense>
                  }
                />
                <Route
                  path="tests/:id"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <TestDetail />
                    </Suspense>
                  }
                />
                <Route
                  path="tests/:id/editor"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <TestEditor />
                    </Suspense>
                  }
                />
                <Route
                  path="tests/:id/analytics"
                  element={
                    <Suspense fallback={<RouteLoading message="Loading analytics…" />}>
                      <Analytics />
                    </Suspense>
                  }
                />
                <Route
                  path="tests/:id/export"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <ExportWrapper />
                    </Suspense>
                  }
                />
                <Route
                  path="tests/:id/promo-links"
                  element={
                    <Suspense fallback={<RouteLoading message="Loading…" />}>
                      <PromoLinksWrapper />
                    </Suspense>
                  }
                />
                <Route
                  path="analytics"
                  element={
                    <Suspense fallback={<RouteLoading message="Loading analytics…" />}>
                      <AnalyticsOverview />
                    </Suspense>
                  }
                />
                <Route
                  path="setup"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <SetupWizard />
                    </Suspense>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <Suspense fallback={<RouteLoading />}>
                      <Settings />
                    </Suspense>
                  }
                />
              </Route>
              {/* Legacy root paths: redirect to user panel */}
              <Route path={ROUTES.TESTS} element={<Navigate to={ROUTES.USER_PANEL} replace />} />
              <Route
                path={ROUTES.CREATE_TEST}
                element={<Navigate to={ROUTES.USER_PANEL} replace />}
              />
              <Route
                path={ROUTES.ANALYTICS}
                element={<Navigate to={ROUTES.USER_PANEL} replace />}
              />
              <Route path={ROUTES.SETUP} element={<Navigate to={ROUTES.USER_PANEL} replace />} />
              <Route
                path={ROUTE_PATTERNS.TEST_DETAIL}
                element={<Navigate to={ROUTES.USER_PANEL} replace />}
              />
              <Route
                path={ROUTE_PATTERNS.TEST_EDITOR}
                element={<Navigate to={ROUTES.USER_PANEL} replace />}
              />
              <Route
                path={ROUTE_PATTERNS.TEST_ANALYTICS}
                element={<Navigate to={ROUTES.USER_PANEL} replace />}
              />
              <Route
                path={ROUTE_PATTERNS.TEST_EXPORT}
                element={<Navigate to={ROUTES.USER_PANEL} replace />}
              />
              <Route
                path={ROUTE_PATTERNS.TEST_PROMO_LINKS}
                element={<Navigate to={ROUTES.USER_PANEL} replace />}
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
                <Route path="system-health" element={<AdminSystemHealth />} />
                <Route path="shop-settings-overrides" element={<AdminShopSettingsOverrides />} />
                <Route path="rate-limit-overrides" element={<AdminRateLimitOverrides />} />
                <Route path="notifications" element={<AdminNotifications />} />
                <Route path="support-tickets" element={<AdminSupportTickets />} />
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
const _isEmbeddedApp = typeof window !== 'undefined' && window.self !== window.top;
// App Bridge (embedded=true) uses postMessage to the parent. With tunnels or certain hosts the parent can throw
// "target origin (app URL) does not match recipient (admin.shopify.com)" and the embed shows a blank page.
// Keep embedded OFF so we never load App Bridge; Polaris UI still works and we use our own redirectToAppUrl/getConnectUrl.
const useEmbedded = false;

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider
        apiKey={useEmbedded ? SHOPIFY_API_KEY || undefined : undefined}
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
