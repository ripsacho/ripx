/**
 * Sidebar Navigation Component
 *
 * Premium collapsible sidebar with enhanced UI
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BlockStack, Text, Icon } from '@shopify/polaris';
import {
  ChartVerticalIcon,
  ClipboardChecklistIcon,
  PlusIcon,
  ChartLineIcon,
  CompassIcon,
  SettingsIcon,
  ProfileIcon,
  BookIcon,
  ConnectIcon,
  MagicIcon,
} from '@shopify/polaris-icons';
import { ROUTES } from '../../constants';
import { hasEmailSession, getApiKey, getShopDomain } from '../../services';
import { useTests } from '../../hooks';
import { prefetchOnHover } from '../../utils/prefetch';

const baseNavigationGroups = [
  {
    label: 'Main',
    items: [
      { path: ROUTES.DASHBOARD, label: 'Dashboard', icon: ChartVerticalIcon },
      { path: ROUTES.TESTS, label: 'All Tests', icon: ClipboardChecklistIcon },
      {
        path: ROUTES.TESTS_PERSONALIZATION,
        label: 'Personalization',
        icon: MagicIcon,
        badgeKey: 'personalization',
      },
      { path: ROUTES.CREATE_TEST, label: 'Create Test', icon: PlusIcon },
      { path: ROUTES.ANALYTICS, label: 'Analytics', icon: ChartLineIcon },
    ],
  },
  {
    label: 'Setup & Settings',
    items: [
      { path: ROUTES.SETUP, label: 'Setup Wizard', icon: CompassIcon },
      { path: ROUTES.SETTINGS, label: 'Settings', icon: SettingsIcon },
      { path: ROUTES.DOCS, label: 'Documentation', icon: BookIcon },
      { path: ROUTES.PROFILE, label: 'Profile', icon: ProfileIcon },
    ],
  },
];

function Sidebar({ collapsed = false, onToggleSidebar, mobileOpen = false, onMobileClose }) {
  const [showLogo, setShowLogo] = useState(true);
  const [showIcon, setShowIcon] = useState(true);
  const [showCollapseButton, setShowCollapseButton] = useState(false);
  const [hoverDrawer, setHoverDrawer] = useState(null); // { label, top, height }
  const navigate = useNavigate();
  const location = useLocation();
  const { data: tests = [] } = useTests();

  const personalizationCount = useMemo(
    () =>
      tests.filter(t => ['personalized', 'rollout'].includes(t.personalization_mode || '')).length,
    [tests]
  );

  const emailOnly = hasEmailSession() && !getApiKey() && !getShopDomain();

  const navigationGroups = useMemo(() => {
    if (emailOnly) {
      return [
        {
          label: 'Account',
          items: [{ path: ROUTES.DOMAINS, label: 'My domains', icon: ConnectIcon }],
        },
      ];
    }
    /* Connect/Sign in is a full-page auth route – not shown in sidebar to avoid opening it inside app layout */
    return baseNavigationGroups;
  }, [emailOnly]);

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
    if (path === ROUTES.DASHBOARD) return location.pathname === ROUTES.DASHBOARD;
    if (path === ROUTES.TESTS_PERSONALIZATION) {
      return location.pathname === '/tests' && viewParam === 'personalization';
    }
    if (path === ROUTES.TESTS) {
      return location.pathname === '/tests' && viewParam !== 'personalization';
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
              onClick={() => navigate(ROUTES.DASHBOARD)}
              className="sidebar-brand"
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(ROUTES.DASHBOARD)}
              aria-label="Go to Dashboard"
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
              onClick={() => navigate(ROUTES.DASHBOARD)}
              className="sidebar-brand sidebar-brand-icon"
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && navigate(ROUTES.DASHBOARD)}
              aria-label="Go to Dashboard"
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
                const content = (
                  <>
                    <span className="sidebar-nav-icon">
                      <Icon source={IconComponent} />
                    </span>
                    {!collapsed && (
                      <Text
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
                    {active && !collapsed && <span className="sidebar-nav-active-dot" />}
                  </>
                );
                const btn = (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
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
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          {hoverDrawer.label}
                        </Text>
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
