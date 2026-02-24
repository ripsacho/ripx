/**
 * AdminLayout
 *
 * Layout for admin panel: fixed sidebar (nav + footer), collapsible with hover drawer,
 * content area with head (breadcrumb) and foot (links, version). Matches project design system.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { Text, Icon } from '@shopify/polaris';
import {
  HomeIcon,
  ProfileIcon,
  GlobeIcon,
  ClipboardChecklistIcon,
  ListBulletedIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  KeyIcon,
  ClockIcon,
  FlagIcon,
  LinkIcon,
  ChartVerticalIcon,
} from '@shopify/polaris-icons';
import { ROUTES } from '../../constants';
import styles from './Admin.module.css';

const adminNav = [
  { path: ROUTES.ADMIN_OVERVIEW, label: 'Overview', icon: HomeIcon },
  { path: ROUTES.ADMIN_USERS, label: 'Users', icon: ProfileIcon },
  { path: ROUTES.ADMIN_DOMAINS, label: 'Domains', icon: GlobeIcon },
  { path: ROUTES.ADMIN_TESTS, label: 'Tests', icon: ClipboardChecklistIcon },
  { path: ROUTES.ADMIN_AUDIT, label: 'Audit log', icon: ListBulletedIcon },
  { path: ROUTES.ADMIN_KV, label: 'Key-value store', icon: KeyIcon },
  { path: ROUTES.ADMIN_JOBS, label: 'Jobs', icon: ClockIcon },
  { path: ROUTES.ADMIN_FEATURE_FLAGS, label: 'Feature flags', icon: FlagIcon },
  { path: ROUTES.ADMIN_PROMO_LINKS, label: 'Promo links', icon: LinkIcon },
  { path: ROUTES.ADMIN_BLOCK_LIST, label: 'Block list', icon: GlobeIcon },
  { path: ROUTES.ADMIN_WEBHOOK_EVENTS, label: 'Webhook events', icon: ListBulletedIcon },
  {
    path: ROUTES.ADMIN_TARGETING_PRESETS,
    label: 'Targeting presets',
    icon: ClipboardChecklistIcon,
  },
  { path: ROUTES.ADMIN_WEBHOOKS, label: 'Webhooks', icon: LinkIcon },
  { path: ROUTES.ADMIN_SHOP_SESSIONS, label: 'Shop sessions', icon: ProfileIcon },
  { path: ROUTES.ADMIN_CONFLICTS, label: 'Conflicts', icon: ListBulletedIcon },
  { path: ROUTES.ADMIN_TEST_HEALTH, label: 'Test health', icon: ClipboardChecklistIcon },
  { path: ROUTES.ADMIN_SHOP_SETTINGS_OVERRIDES, label: 'Shop settings overrides', icon: KeyIcon },
  { path: ROUTES.ADMIN_RATE_LIMIT_OVERRIDES, label: 'Rate limit overrides', icon: FlagIcon },
  { path: ROUTES.ADMIN_NOTIFICATIONS, label: 'Notifications', icon: ListBulletedIcon },
  { path: ROUTES.ADMIN_SIGNIFICANCE_ALERTS, label: 'Significance alerts', icon: FlagIcon },
  { path: ROUTES.ADMIN_EVENT_CATALOG, label: 'Event catalog', icon: ListBulletedIcon },
  { path: ROUTES.ADMIN_CLIENT_ERRORS, label: 'Client errors', icon: ListBulletedIcon },
  { path: ROUTES.ADMIN_CONSENT_SCRIPT, label: 'Consent & script', icon: KeyIcon },
  { path: ROUTES.ADMIN_ACCOUNTS, label: 'Accounts', icon: ProfileIcon },
  { path: ROUTES.ADMIN_AGGREGATION, label: 'Aggregation', icon: ClockIcon },
  { path: ROUTES.ADMIN_LEGAL, label: 'Terms & Privacy', icon: KeyIcon },
  { path: ROUTES.ADMIN_MAINTENANCE, label: 'Maintenance', icon: ClockIcon },
  { path: ROUTES.ADMIN_ANNOUNCEMENT_BANNER, label: 'Announcement banner', icon: FlagIcon },
  { path: ROUTES.ADMIN_USAGE_EXPORT, label: 'Usage export', icon: ChartVerticalIcon },
];

const pathToSection = {
  [ROUTES.ADMIN_OVERVIEW]: 'Overview',
  [ROUTES.ADMIN_USERS]: 'Users',
  [ROUTES.ADMIN_DOMAINS]: 'Domains',
  [ROUTES.ADMIN_TESTS]: 'Tests',
  [ROUTES.ADMIN_AUDIT]: 'Audit log',
  [ROUTES.ADMIN_KV]: 'Key-value store',
  [ROUTES.ADMIN_JOBS]: 'Jobs',
  [ROUTES.ADMIN_FEATURE_FLAGS]: 'Feature flags',
  [ROUTES.ADMIN_PROMO_LINKS]: 'Promo links',
  [ROUTES.ADMIN_BLOCK_LIST]: 'Block list',
  [ROUTES.ADMIN_WEBHOOK_EVENTS]: 'Webhook events',
  [ROUTES.ADMIN_TARGETING_PRESETS]: 'Targeting presets',
  [ROUTES.ADMIN_WEBHOOKS]: 'Webhooks',
  [ROUTES.ADMIN_SHOP_SESSIONS]: 'Shop sessions',
  [ROUTES.ADMIN_CONFLICTS]: 'Conflicts',
  [ROUTES.ADMIN_TEST_HEALTH]: 'Test health',
  [ROUTES.ADMIN_SHOP_SETTINGS_OVERRIDES]: 'Shop settings overrides',
  [ROUTES.ADMIN_RATE_LIMIT_OVERRIDES]: 'Rate limit overrides',
  [ROUTES.ADMIN_NOTIFICATIONS]: 'Notifications',
  [ROUTES.ADMIN_SIGNIFICANCE_ALERTS]: 'Significance alerts',
  [ROUTES.ADMIN_EVENT_CATALOG]: 'Event catalog',
  [ROUTES.ADMIN_CLIENT_ERRORS]: 'Client errors',
  [ROUTES.ADMIN_CONSENT_SCRIPT]: 'Consent & script',
  [ROUTES.ADMIN_ACCOUNTS]: 'Accounts',
  [ROUTES.ADMIN_AGGREGATION]: 'Aggregation',
  [ROUTES.ADMIN_LEGAL]: 'Terms & Privacy',
  [ROUTES.ADMIN_MAINTENANCE]: 'Maintenance',
  [ROUTES.ADMIN_ANNOUNCEMENT_BANNER]: 'Announcement banner',
  [ROUTES.ADMIN_USAGE_EXPORT]: 'Usage export',
};

function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const section = pathToSection[location.pathname] || 'Admin';
  const [collapsed, setCollapsed] = useState(false);
  const [hoverDrawer, setHoverDrawer] = useState(null); // { label, top, height }

  const healthUrl = `${import.meta.env.VITE_API_URL || ''}/api/health`;

  const handleNavMouseEnter = useCallback((item, ev) => {
    if (!ev?.currentTarget) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    setHoverDrawer({
      label: item.label,
      left: rect.right + 4,
      top: rect.top,
      height: rect.height,
    });
  }, []);

  const handleNavMouseLeave = useCallback(() => {
    setHoverDrawer(null);
  }, []);

  const handleBackToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    document.body.classList.add('admin-page');
    return () => document.body.classList.remove('admin-page');
  }, []);

  return (
    <>
      <div className={`${styles.adminLayout} ${collapsed ? styles.adminSidebarCollapsed : ''}`}>
        <aside className={`${styles.adminSidebar} ${collapsed ? styles.collapsed : ''}`}>
          <div className={styles.adminSidebarHeader}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                width: '100%',
              }}
            >
              {!collapsed && (
                <>
                  <Text as="h2" variant="headingMd" className={styles.adminSidebarTitle}>
                    Admin
                  </Text>
                  <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    className={styles.adminCollapseBtn}
                    aria-label="Collapse sidebar"
                    title="Collapse sidebar"
                  >
                    <Icon source={ChevronRightIcon} tone="base" />
                  </button>
                </>
              )}
              {collapsed && (
                <button
                  type="button"
                  onClick={() => setCollapsed(false)}
                  className={styles.adminCollapseBtn}
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <Icon source={ChevronLeftIcon} tone="base" />
                </button>
              )}
            </div>
            {!collapsed && (
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminSidebarSubtitle}>
                Control panel
              </Text>
            )}
          </div>
          <nav className={styles.adminNav} aria-label="Admin navigation">
            {adminNav.map(item => {
              const isActive = location.pathname === item.path;
              const btn = (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`${styles.adminNavItem} ${isActive ? styles.active : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  onMouseEnter={e => collapsed && handleNavMouseEnter(item, e)}
                  onMouseLeave={collapsed ? handleNavMouseLeave : undefined}
                >
                  <span className={styles.adminNavIcon}>
                    <Icon source={item.icon} tone="base" />
                  </span>
                  <span className={styles.adminNavItemText}>{item.label}</span>
                </button>
              );
              return collapsed ? (
                <div key={item.path} className={styles.adminNavItemWrapper}>
                  {btn}
                </div>
              ) : (
                btn
              );
            })}
          </nav>
          <div className={styles.adminSidebarFooter}>
            {!collapsed && <div className={styles.adminSidebarFooterBrand}>RipX Admin</div>}
            <div className={styles.adminSidebarFooterActions}>
              <button
                type="button"
                className={styles.adminBackToTop}
                onClick={handleBackToTop}
                title="Scroll to top"
                aria-label="Scroll to top"
              >
                <Icon source={ArrowUpIcon} tone="base" />
                {!collapsed && <span>Back to top</span>}
              </button>
              <button
                type="button"
                className={styles.adminBackToApp}
                onClick={() => navigate(ROUTES.DASHBOARD)}
                title="Go to dashboard"
                aria-label="Back to app"
              >
                <Icon source={HomeIcon} tone="base" />
                {!collapsed && <span>Back to app</span>}
              </button>
            </div>
          </div>
        </aside>
        <main className={styles.adminContent}>
          <header className={styles.adminContentHead} aria-label="Admin section">
            <nav className={styles.adminBreadcrumb} aria-label="Breadcrumb">
              <button
                type="button"
                className={styles.adminBreadcrumbItem}
                onClick={() => navigate(ROUTES.ADMIN_OVERVIEW)}
              >
                Admin
              </button>
              <span className={styles.adminBreadcrumbSep}>/</span>
              <span className={styles.adminBreadcrumbCurrent}>{section}</span>
            </nav>
          </header>
          <div className={styles.adminContentInner}>{children}</div>
          <footer className={styles.adminContentFoot}>
            <div className={styles.adminFooterInner}>
              <span className={styles.adminFooterCopy}>RipX Admin</span>
              <a
                href={healthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.adminFooterLink}
              >
                System health
              </a>
              <button
                type="button"
                className={styles.adminFooterLinkBtn}
                onClick={() => navigate(ROUTES.DOCS)}
              >
                Docs
              </button>
            </div>
          </footer>
        </main>
      </div>
      {collapsed &&
        hoverDrawer &&
        createPortal(
          <div
            className={styles.adminHoverDrawer}
            style={{
              left: hoverDrawer.left,
              top: hoverDrawer.top,
              minHeight: hoverDrawer.height,
            }}
          >
            {hoverDrawer.label}
          </div>,
          document.body
        )}
    </>
  );
}

export default AdminLayout;
