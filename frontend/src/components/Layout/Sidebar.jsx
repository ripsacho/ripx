/**
 * Sidebar Navigation Component
 *
 * Premium collapsible sidebar with enhanced UI
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BlockStack, Text, Icon } from '@shopify/polaris';
import {
  ChartVerticalIcon,
  ClipboardChecklistIcon,
  PlusIcon,
  ChartLineIcon,
  ConnectIcon,
  MagicIcon,
  HomeIcon,
  SettingsIcon,
  TargetIcon,
  BookIcon,
  ChatIcon,
} from '@shopify/polaris-icons';
import { ROUTES } from '../../constants';
import { buildDocsPath } from '../../utils/docsLinks';
import { useTests } from '../../hooks';
import { apiGet, getNavigateToWithEmbed } from '../../services';
import { prefetchOnHover } from '../../utils/prefetch';
import { getAppDomainFromPath } from '../../utils/breadcrumb';
import { isShopifyStoreDomain } from '../../utils/shopifyAdmin';
import { isStorefrontRuntimeReady } from '../../utils/storefrontSetupStatus';
import { useNavigationLoading } from '../../contexts/NavigationLoadingContext';

function navigateSidebarPath(navigate, beginNavigation, path) {
  const raw = String(path || '');
  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const q = beforeHash.indexOf('?');
  const pathname = q >= 0 ? beforeHash.slice(0, q) : beforeHash;
  const extraParams =
    q >= 0 ? Object.fromEntries(new URLSearchParams(beforeHash.slice(q + 1))) : null;
  beginNavigation();
  const target =
    pathname === ROUTES.DOCS
      ? { pathname, search: q >= 0 ? `?${beforeHash.slice(q + 1)}` : undefined }
      : getNavigateToWithEmbed(pathname, extraParams);
  if (hash) target.hash = hash;
  navigate(target);
}

const baseNavigationGroups = (domain = null) => {
  const dash = domain ? ROUTES.appDashboard(domain) : ROUTES.DASHBOARD;
  const tests = domain ? ROUTES.appTests(domain) : ROUTES.TESTS;
  const testsPersonalization = domain
    ? ROUTES.appTestsPersonalization(domain)
    : ROUTES.TESTS_PERSONALIZATION;
  const createTest = domain ? ROUTES.appCreateTest(domain) : ROUTES.CREATE_TEST;
  const analytics = domain ? ROUTES.appAnalytics(domain) : ROUTES.ANALYTICS;
  const goalsMetrics = domain ? ROUTES.appGoalsMetrics(domain) : null;
  const docsFeatureGuides = buildDocsPath({ mode: 'feature-guides' });
  const docsSetup = buildDocsPath({ mode: 'setup', sectionId: 'installation' });
  const supportPath = domain ? ROUTES.appSupport(domain) : ROUTES.SUPPORT;
  const appSettings = domain
    ? `${ROUTES.appSettings(domain)}?tab=installation&guided_setup=1`
    : ROUTES.SETUP;
  return [
    ...(domain
      ? [
          {
            label: 'Account',
            items: [{ path: ROUTES.USER_PANEL, label: 'Home', icon: HomeIcon }],
          },
        ]
      : []),
    {
      label: 'Main',
      items: [
        { path: dash, label: 'Dashboard', icon: ChartVerticalIcon },
        { path: tests, label: 'All Tests', icon: ClipboardChecklistIcon },
        {
          path: testsPersonalization,
          label: 'Personalization',
          icon: MagicIcon,
          badgeKey: 'personalization',
        },
        { path: createTest, label: 'Create Test', icon: PlusIcon },
        { path: analytics, label: 'Analytics', icon: ChartLineIcon },
        ...(goalsMetrics
          ? [{ path: goalsMetrics, label: 'Goals & Metrics', icon: TargetIcon }]
          : []),
      ],
    },
    {
      label: 'Configuration',
      items: [{ path: appSettings, label: 'Store settings', icon: SettingsIcon }],
    },
    {
      label: 'Help',
      items: [
        { path: docsFeatureGuides, label: 'Feature guides', icon: BookIcon },
        { path: docsSetup, label: 'Setup docs', icon: BookIcon },
        { path: supportPath, label: 'Support', icon: ChatIcon },
      ],
    },
  ];
};

function Sidebar({ collapsed = false, onToggleSidebar, mobileOpen = false, onMobileClose }) {
  const [showLogo, setShowLogo] = useState(true);
  const [showIcon, setShowIcon] = useState(true);
  const [showCollapseButton, setShowCollapseButton] = useState(false);
  const [hoverDrawer, setHoverDrawer] = useState(null); // { label, top, height }
  const navigate = useNavigate();
  const location = useLocation();
  const { beginNavigation } = useNavigationLoading();
  const goTo = useCallback(
    path => navigateSidebarPath(navigate, beginNavigation, path),
    [navigate, beginNavigation]
  );
  const { data: tests = [] } = useTests();
  const appDomain = getAppDomainFromPath(location.pathname);
  const isAccountContext =
    !appDomain && (location.pathname === ROUTES.USER_PANEL || location.pathname === ROUTES.DOMAINS);
  const [setupHealth, setSetupHealth] = useState({ loading: false, ready: null });

  const personalizationCount = useMemo(
    () =>
      tests.filter(t => ['personalized', 'rollout'].includes(t.personalization_mode || '')).length,
    [tests]
  );

  const navigationGroups = useMemo(() => {
    if (isAccountContext) {
      return [
        {
          label: 'Account',
          items: [
            { path: ROUTES.USER_PANEL, label: 'Home', icon: HomeIcon },
            { path: ROUTES.DOMAINS, label: 'My domains', icon: ConnectIcon },
          ],
        },
        {
          label: 'Help',
          items: [
            {
              path: buildDocsPath({ mode: 'feature-guides' }),
              label: 'Feature guides',
              icon: BookIcon,
            },
            { path: ROUTES.SUPPORT, label: 'Support', icon: ChatIcon },
          ],
        },
      ];
    }
    return baseNavigationGroups(appDomain);
  }, [isAccountContext, appDomain]);

  useEffect(() => {
    let cancelled = false;
    if (!appDomain || !isShopifyStoreDomain(appDomain)) {
      setSetupHealth({ loading: false, ready: null });
      return () => {
        cancelled = true;
      };
    }
    setSetupHealth({ loading: true, ready: null });
    apiGet('/shopify/setup/status')
      .then(response => {
        if (cancelled) return;
        const data = response?.data || {};
        const ready =
          Boolean(data?.appUrl) && Boolean(data?.proxyTargetUrl) && isStorefrontRuntimeReady(data);
        setSetupHealth({ loading: false, ready });
      })
      .catch(() => {
        if (!cancelled) setSetupHealth({ loading: false, ready: null });
      });
    return () => {
      cancelled = true;
    };
  }, [appDomain]);

  const handleNavMouseEnter = useCallback(
    (item, el) => {
      if (!collapsed || !el) return;
      const rect = el.getBoundingClientRect();
      setHoverDrawer({ label: item.label, top: rect.top, height: rect.height });
    },
    [collapsed]
  );

  const handleNavMouseLeave = useCallback(() => {
    setHoverDrawer(null);
  }, []);

  const allPaths = navigationGroups.flatMap(g => g.items.map(i => i.path));
  const searchParams = new URLSearchParams(location.search || '');
  const viewParam = searchParams.get('view');

  const isActive = (path, _item) => {
    const [normalizedPath, normalizedSearch = ''] = String(path || '').split('?');
    const pathSearchParams = new URLSearchParams(normalizedSearch);
    if (path === ROUTES.USER_PANEL) return location.pathname === ROUTES.USER_PANEL;
    const dashboardPath = appDomain ? ROUTES.appDashboard(appDomain) : ROUTES.DASHBOARD;
    if (path === dashboardPath) {
      return location.pathname === dashboardPath || location.pathname === dashboardPath + '/';
    }
    const testsListPath = appDomain ? ROUTES.appTests(appDomain) : ROUTES.TESTS;
    if (
      path ===
      (appDomain ? ROUTES.appTestsPersonalization(appDomain) : ROUTES.TESTS_PERSONALIZATION)
    ) {
      return location.pathname === testsListPath && viewParam === 'personalization';
    }
    if (path === testsListPath) {
      return location.pathname === testsListPath && viewParam !== 'personalization';
    }
    if (normalizedPath !== path && location.pathname === normalizedPath) {
      if (pathSearchParams.size === 0) return true;
      return Array.from(pathSearchParams.entries()).every(
        ([key, value]) => searchParams.get(key) === value
      );
    }
    if (location.pathname === path) return true;
    if (location.pathname.startsWith(path)) {
      const otherPaths = allPaths.filter(p => p !== path && p.startsWith(path));
      if (otherPaths.length > 0) {
        const matchesMoreSpecific = otherPaths.some(
          otherPath =>
            location.pathname === otherPath || location.pathname.startsWith(otherPath + '/')
        );
        return !matchesMoreSpecific;
      }
      return true;
    }
    return false;
  };

  const homePath = appDomain ? ROUTES.appDashboard(appDomain) : ROUTES.USER_PANEL;

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Logo/Brand Section */}
      <div
        className="sidebar-header"
        onMouseEnter={() => collapsed && setShowCollapseButton(true)}
        onMouseLeave={() => collapsed && setShowCollapseButton(false)}
      >
        {!collapsed ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              gap: '0.75rem',
            }}
          >
            <div
              onClick={() => goTo(homePath)}
              className="sidebar-brand"
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && goTo(homePath)}
              aria-label={appDomain ? 'Go to Dashboard' : 'Go to Home'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flex: 1,
                minWidth: 0,
              }}
            >
              {showLogo && (
                <img
                  src="/logo.svg"
                  alt="RipX Logo"
                  style={{
                    height: '36px',
                    width: 'auto',
                    objectFit: 'contain',
                    flexShrink: 0,
                  }}
                  onError={() => {
                    setShowLogo(false);
                  }}
                />
              )}
              <div>
                <Text variant="headingLg" as="h2" fontWeight="bold" tone="base">
                  RipX
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  AB Testing Platform
                </Text>
              </div>
            </div>
            {/* Collapse Button - Visible when expanded */}
            <button
              onClick={e => {
                e.stopPropagation();
                onToggleSidebar && onToggleSidebar();
              }}
              className="sidebar-collapse-button"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M11 6L7 9L11 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="9"
                  cy="9"
                  r="8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.2"
                />
              </svg>
            </button>
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '48px',
            }}
          >
            {/* Icon - Hidden when collapse button is shown */}
            <div
              onClick={() => goTo(homePath)}
              className="sidebar-brand sidebar-brand-icon"
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && goTo(homePath)}
              aria-label={appDomain ? 'Go to Dashboard' : 'Go to Home'}
              style={{
                opacity: showCollapseButton ? 0 : 1,
                transition: 'opacity 0.2s ease',
              }}
            >
              {showIcon && (
                <img
                  src="/icon.svg"
                  alt="RipX Icon"
                  style={{
                    height: '32px',
                    width: '32px',
                    objectFit: 'contain',
                  }}
                  onError={e => {
                    // Hide image on error, show text fallback
                    setShowIcon(false);
                    e.target.style.display = 'none';
                  }}
                />
              )}
              {!showIcon && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text variant="headingLg" as="h2" fontWeight="bold" tone="base">
                    R
                  </Text>
                </div>
              )}
            </div>
            {/* Collapse Button - Shown on hover when collapsed */}
            {showCollapseButton && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onToggleSidebar && onToggleSidebar();
                }}
                className="sidebar-collapse-button sidebar-collapse-button-hover"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 6L11 10L7 14"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    opacity="0.3"
                  />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation Items - Grouped */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigationGroups.map(group => (
          <div key={group.label} className="sidebar-nav-group">
            {!collapsed && (
              <div className="sidebar-nav-group-label">
                <Text variant="bodySm" as="span" tone="subdued" fontWeight="medium">
                  {group.label}
                </Text>
              </div>
            )}
            <BlockStack gap="050">
              {group.items.map(item => {
                const active = isActive(item.path, item);
                const IconComponent = item.icon;
                const badgeCount =
                  item.badgeKey === 'personalization' ? personalizationCount : null;
                const isSetupHealthApplicable =
                  isShopifyStoreDomain(appDomain || '') &&
                  item.path ===
                    `${ROUTES.appSettings(appDomain)}?tab=installation&guided_setup=1` &&
                  (setupHealth.loading || setupHealth.ready !== null);
                const setupHealthToneClass = setupHealth.loading
                  ? 'sidebar-nav-badge--neutral'
                  : setupHealth.ready
                    ? 'sidebar-nav-badge--success'
                    : 'sidebar-nav-badge--warning';
                const setupHealthLabel = setupHealth.loading
                  ? 'Checking'
                  : setupHealth.ready
                    ? 'Ready'
                    : 'Needs setup';
                const showSetupHealthBadge = !collapsed && isSetupHealthApplicable;
                const showSetupHealthDot = collapsed && isSetupHealthApplicable;
                const content = (
                  <>
                    <span className="sidebar-nav-icon">
                      <Icon source={IconComponent} />
                      {showSetupHealthDot && (
                        <span
                          className={`sidebar-nav-status-dot ${setupHealthToneClass}`}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    {!collapsed && (
                      <Text
                        className="sidebar-nav-label"
                        variant="bodyMd"
                        fontWeight={active ? 'semibold' : 'regular'}
                        tone={active ? 'base' : 'subdued'}
                        as="span"
                      >
                        {item.label}
                      </Text>
                    )}
                    {!collapsed &&
                      badgeCount !== null &&
                      badgeCount !== undefined &&
                      badgeCount > 0 && <span className="sidebar-nav-badge">{badgeCount}</span>}
                    {showSetupHealthBadge && (
                      <span className={`sidebar-nav-badge ${setupHealthToneClass}`}>
                        {setupHealthLabel}
                      </span>
                    )}
                    {active && !collapsed && <span className="sidebar-nav-active-dot" />}
                  </>
                );
                const btn = (
                  <button
                    key={item.path}
                    onClick={() => {
                      goTo(item.path);
                      if (onMobileClose) onMobileClose();
                    }}
                    onMouseEnter={() => prefetchOnHover(item.path)}
                    className={`sidebar-nav-item ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {content}
                  </button>
                );
                return collapsed ? (
                  <div
                    key={item.path}
                    className="sidebar-nav-item-wrapper"
                    onMouseEnter={e => handleNavMouseEnter(item, e.currentTarget)}
                    onMouseLeave={handleNavMouseLeave}
                  >
                    {btn}
                    {hoverDrawer?.label === item.label && (
                      <div
                        className="sidebar-hover-drawer"
                        style={{
                          top: hoverDrawer.top,
                          minHeight: hoverDrawer.height,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            {hoverDrawer.label}
                          </Text>
                          {showSetupHealthDot && (
                            <Text variant="bodySm" as="span" tone="subdued">
                              {setupHealthLabel}
                            </Text>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  btn
                );
              })}
            </BlockStack>
          </div>
        ))}
      </nav>

      {/* Footer - Compact version badge */}
      {!collapsed && (
        <div className="sidebar-footer">
          <span className="sidebar-version">v1.0</span>
        </div>
      )}
    </div>
  );
}

export default Sidebar;
