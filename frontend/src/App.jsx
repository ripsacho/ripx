/**
 * Main App Component
 *
 * Root component for the RipX AB Testing App.
 * Uses React.lazy for route-based code splitting and optimized initial load.
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AppProvider } from '@shopify/polaris';
import '@shopify/polaris/build/esm/styles.css';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

// Lazy-loaded route components for code splitting
const Connect = lazy(() => import('./components/Connect/Connect'));
const Dashboard = lazy(() => import('./components/Dashboard/Dashboard'));
const TestList = lazy(() => import('./components/TestList/TestList'));
const TestCreator = lazy(() => import('./components/TestCreator/TestCreator'));
const TestDetail = lazy(() => import('./components/TestDetail/TestDetail'));
const Analytics = lazy(() => import('./components/Analytics/Analytics'));
const AnalyticsOverview = lazy(() => import('./components/Analytics/AnalyticsOverview'));
const Settings = lazy(() => import('./components/Settings/Settings'));
const SetupWizard = lazy(() => import('./components/SetupWizard/SetupWizard'));
const Profile = lazy(() => import('./components/Profile/Profile'));
const Documentation = lazy(() => import('./components/Documentation/Documentation'));
const Export = lazy(() => import('./components/Export/Export'));
const PromoLinks = lazy(() => import('./components/PromoLinks/PromoLinks'));
const NotFound = lazy(() => import('./components/NotFound/NotFound'));

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
          <a
            href="#main-content"
            className="skip-to-main"
            aria-label="Skip to main content"
          >
            Skip to main content
          </a>
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
          <div
            style={{
              marginLeft: effectiveSidebarWidth,
              width: `calc(100% - ${effectiveSidebarWidth}px)`,
              transition:
                'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              minHeight: '100vh',
              position: 'relative',
            }}
          >
            <TopBar
              sidebarWidth={effectiveSidebarWidth}
              sidebarCollapsed={sidebarCollapsed}
              showMobileToggle={isMobile}
              onMobileToggle={() => setMobileSidebarOpen(open => !open)}
            />
            <main
              id="main-content"
              className={`main-content-wrapper${[ROUTES.DASHBOARD, ROUTES.SETTINGS, ROUTES.PROFILE, ROUTES.SETUP, ROUTES.CREATE_TEST, ROUTES.TESTS, ROUTES.ANALYTICS, ROUTES.DOCS].includes(location.pathname) || /^\/tests\/[^/]+\/analytics$/.test(location.pathname) ? ' main-content-wrapper--full-width' : ''}`}
              tabIndex={-1}
            >
              <ErrorBoundary resetKeys={[location.pathname]}>
                <Routes>
                  <Route path={ROUTES.CONNECT} element={
                    <Suspense fallback={<PageSkeleton variant="default" />}>
                      <Connect />
                    </Suspense>
                  } />
                  <Route path={ROUTES.DASHBOARD} element={
                    <Suspense fallback={<PageSkeleton variant="dashboard" />}>
                      <AuthGuard><Dashboard /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTES.TESTS} element={
                    <Suspense fallback={<PageSkeleton variant="testList" />}>
                      <AuthGuard><TestList /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTES.CREATE_TEST} element={
                    <Suspense fallback={<PageSkeleton variant="testList" />}>
                      <AuthGuard><TestCreator /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTE_PATTERNS.TEST_DETAIL} element={
                    <Suspense fallback={<PageSkeleton variant="default" />}>
                      <AuthGuard><TestDetail /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTE_PATTERNS.TEST_ANALYTICS} element={
                    <Suspense fallback={<PageSkeleton variant="analytics" />}>
                      <AuthGuard><Analytics /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTE_PATTERNS.TEST_EXPORT} element={
                    <Suspense fallback={<PageSkeleton variant="default" />}>
                      <AuthGuard><ExportWrapper /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTE_PATTERNS.TEST_PROMO_LINKS} element={
                    <Suspense fallback={<PageSkeleton variant="testList" />}>
                      <AuthGuard><PromoLinksWrapper /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTES.ANALYTICS} element={
                    <Suspense fallback={<PageSkeleton variant="analytics" />}>
                      <AuthGuard><AnalyticsOverview /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTES.SETUP} element={
                    <Suspense fallback={<PageSkeleton variant="default" />}>
                      <AuthGuard><SetupWizard /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTES.SETTINGS} element={
                    <Suspense fallback={<PageSkeleton variant="default" />}>
                      <AuthGuard><Settings /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTES.DOCS} element={
                    <Suspense fallback={<PageSkeleton variant="default" />}>
                      <AuthGuard><Documentation /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path={ROUTES.PROFILE} element={
                    <Suspense fallback={<PageSkeleton variant="default" />}>
                      <AuthGuard><Profile /></AuthGuard>
                    </Suspense>
                  } />
                  <Route path="*" element={
                    <Suspense fallback={<PageSkeleton variant="default" />}>
                      <AuthGuard><NotFound /></AuthGuard>
                    </Suspense>
                  } />
                </Routes>
              </ErrorBoundary>
            </main>
          </div>
        </div>
  );
}

// Shopify Client ID for embedded app (required when running in Shopify Admin iframe)
const SHOPIFY_API_KEY = import.meta.env.VITE_SHOPIFY_API_KEY || import.meta.env.VITE_SHOPIFY_CLIENT_ID || null;
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
