/**
 * Top Bar Component
 *
 * Premium top navigation bar matching site UI - gradient accent, breadcrumb, action group
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  InlineStack,
  Popover,
  ActionList,
  Text,
  BlockStack,
  Button,
  Icon,
  Tooltip,
} from '@shopify/polaris';
import { NotificationIcon, SettingsIcon, ProfileIcon } from '@shopify/polaris-icons';
import { getShopDomain, apiGet, apiPut } from '../../services';
import { ROUTES } from '../../constants';
import { useAdminMe } from '../../hooks';
import StoreSwitcher from '../StoreSwitcher/StoreSwitcher';
import styles from './TopBar.module.css';

const OpenInNewTabIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M11 4H6a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-5m-5 0h4m0 0l-4-4m4 4L8 12"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ROUTE_LABELS = {
  [ROUTES.DASHBOARD]: 'Dashboard',
  [ROUTES.TESTS]: 'Tests',
  [ROUTES.CREATE_TEST]: 'Create Test',
  [ROUTES.ANALYTICS]: 'Analytics',
  [ROUTES.SETTINGS]: 'Settings',
  [ROUTES.SETUP]: 'Setup',
  [ROUTES.PROFILE]: 'Profile',
  [ROUTES.NOTIFICATIONS]: 'Notifications',
  [ROUTES.DOCS]: 'Documentation',
  '/tests/new': 'Create Test',
};

function getBreadcrumb(pathname, search = '') {
  const view = new URLSearchParams(search).get('view');
  if (pathname === ROUTES.DASHBOARD) return { current: 'Dashboard' };
  if (pathname === ROUTES.TESTS) {
    return view === 'personalization'
      ? { parent: 'Tests', current: 'Personalization' }
      : { parent: 'Tests', current: 'All Tests' };
  }
  if (pathname.startsWith('/tests/') && pathname.includes('/analytics')) {
    return { parent: 'Tests', current: 'Analytics' };
  }
  if (
    pathname.startsWith('/tests/') &&
    !pathname.includes('/analytics') &&
    pathname !== '/tests/new'
  ) {
    const testId = pathname.split('/')[2];
    return { parent: 'Tests', current: testId ? 'Test Details' : 'Tests' };
  }
  if (pathname === ROUTES.CREATE_TEST) return { parent: 'Tests', current: 'Create Test' };
  if (pathname === ROUTES.ANALYTICS) return { current: 'Analytics' };
  if (pathname === ROUTES.SETTINGS) return { current: 'Settings' };
  if (pathname === ROUTES.SETUP) return { current: 'Setup Wizard' };
  if (pathname === ROUTES.PROFILE) return { current: 'Profile' };
  if (pathname === ROUTES.NOTIFICATIONS) return { current: 'Notifications' };
  if (pathname === ROUTES.DOCS) return { current: 'Documentation' };
  if (pathname === ROUTES.CONNECT) return { current: 'Connect' };
  if (pathname === ROUTES.DOMAINS) return { current: 'My domains' };
  if (pathname.startsWith(ROUTES.ADMIN)) {
    if (pathname === ROUTES.ADMIN || pathname === ROUTES.ADMIN_OVERVIEW)
      return { current: 'Admin' };
    if (pathname === ROUTES.ADMIN_USERS) return { current: 'Admin · Users' };
    if (pathname === ROUTES.ADMIN_DOMAINS) return { current: 'Admin · Domains' };
    if (pathname === ROUTES.ADMIN_TESTS) return { current: 'Admin · Tests' };
    if (pathname === ROUTES.ADMIN_AUDIT) return { current: 'Admin · Audit log' };
    return { current: 'Admin' };
  }
  // Unknown route (e.g. 404)
  const knownPaths = [
    ROUTES.DASHBOARD,
    ROUTES.TESTS,
    ROUTES.CREATE_TEST,
    ROUTES.ANALYTICS,
    ROUTES.SETTINGS,
    ROUTES.SETUP,
    ROUTES.PROFILE,
    ROUTES.NOTIFICATIONS,
    ROUTES.DOCS,
    ROUTES.CONNECT,
    ROUTES.DOMAINS,
  ];
  const isKnown =
    knownPaths.includes(pathname) ||
    pathname.startsWith('/tests/') ||
    pathname.startsWith(ROUTES.ADMIN);
  if (!isKnown) return { current: 'Page not found' };
  return { current: ROUTE_LABELS[pathname] || 'RipX' };
}

const LockIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function TopBar({
  sidebarWidth = 280,
  sidebarCollapsed = false,
  showMobileToggle = false,
  onMobileToggle,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, isLoading } = useAdminMe();
  const [userMenuActive, setUserMenuActive] = useState(false);
  const [settingsMenuActive, setSettingsMenuActive] = useState(false);
  const [notificationsActive, setNotificationsActive] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const toggleUserMenu = useCallback(() => setUserMenuActive(a => !a), []);
  const toggleSettingsMenu = useCallback(() => setSettingsMenuActive(a => !a), []);

  const breadcrumb = useMemo(
    () => getBreadcrumb(location.pathname, location.search),
    [location.pathname, location.search]
  );

  const fetchNotifications = useCallback(async () => {
    try {
      setNotificationsLoading(true);
      const res = await apiGet('/notifications', { limit: 10 });
      const data = res.data;
      setNotifications(data?.notifications || []);
      setUnreadCount(data?.unreadCount ?? 0);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (notificationsActive) fetchNotifications();
  }, [notificationsActive, fetchNotifications]);

  const handleMarkRead = useCallback(async id => {
    try {
      await apiPut(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await apiPut('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  }, []);

  const userMenuActions = [
    {
      content: 'My Profile',
      onAction: () => {
        setUserMenuActive(false);
        navigate('/profile');
      },
    },
    {
      content: 'Account Settings',
      onAction: () => {
        setUserMenuActive(false);
        navigate('/profile?tab=account');
      },
    },
    {
      content: 'Preferences',
      onAction: () => {
        setUserMenuActive(false);
        navigate('/profile?tab=preferences');
      },
    },
    {
      content: 'Logout',
      destructive: true,
      className: 'logout-action-item',
      onAction: () => {
        setUserMenuActive(false);
        const shopDomain = getShopDomain();
        if (shopDomain) {
          window.location.href = `https://${shopDomain}/admin`;
        } else {
          window.location.href = ROUTES.DASHBOARD;
        }
      },
    },
  ];

  const settingsMenuActions = [
    {
      content: 'General Settings',
      onAction: () => {
        setSettingsMenuActive(false);
        navigate('/settings');
      },
    },
    {
      content: 'Notifications',
      onAction: () => {
        setSettingsMenuActive(false);
        navigate('/profile?tab=preferences');
      },
    },
    {
      content: 'API Keys',
      onAction: () => {
        setSettingsMenuActive(false);
        navigate('/profile?tab=account');
      },
    },
  ];

  const effectiveLeft = sidebarCollapsed ? 80 : sidebarWidth;
  const isEmbeddedInShopify = typeof window !== 'undefined' && window.self !== window.top;
  const openInNewTab = useCallback(() => {
    const shop = getShopDomain();
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    if (shop && !params.has('shop')) params.set('shop', shop);
    const query = params.toString();
    window.open(query ? base + '?' + query : base, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <div className={`top-bar ${styles.topBar}`} style={{ '--topbar-left': `${effectiveLeft}px` }}>
      <div className={styles.topBarLeft}>
        {showMobileToggle && (
          <button
            type="button"
            onClick={onMobileToggle}
            aria-label="Toggle navigation"
            className={styles.mobileToggle}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 6H20M4 12H20M4 18H20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <span className={styles.breadcrumb}>
          {breadcrumb.parent && (
            <>
              <span>{breadcrumb.parent}</span>
              <span style={{ margin: '0 0.35rem', opacity: 0.5 }}>/</span>
            </>
          )}
          <span className={styles.breadcrumbCurrent}>{breadcrumb.current}</span>
        </span>
      </div>

      <div className={styles.topBarRight}>
        <StoreSwitcher />
        {!isLoading && isAdmin && (
          <Tooltip content="Admin panel" preferredPosition="below">
            <button
              type="button"
              onClick={() => navigate(ROUTES.ADMIN)}
              aria-label="Open admin panel"
              className={styles.adminEntryBtn}
              title="Admin panel"
            >
              <LockIcon />
              <span className={styles.adminEntryLabel}>Admin</span>
            </button>
          </Tooltip>
        )}
        <div className={styles.actionGroup}>
          {isEmbeddedInShopify && (
            <Tooltip content="Open in new tab" preferredPosition="below">
              <button
                type="button"
                onClick={openInNewTab}
                aria-label="Open RipX in a new tab"
                className={styles.iconBtn}
              >
                <OpenInNewTabIcon />
              </button>
            </Tooltip>
          )}
          <Popover
            active={notificationsActive}
            activator={
              <button
                type="button"
                onClick={() => setNotificationsActive(a => !a)}
                aria-label="Notifications"
                className={`${styles.iconBtn} ${notificationsActive ? styles.active : ''}`}
              >
                <Icon source={NotificationIcon} />
                {unreadCount > 0 && (
                  <span className={styles.notificationBadge} aria-label={`${unreadCount} unread`}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            }
            onClose={() => setNotificationsActive(false)}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <div className={styles.notificationPopover}>
              <div className={styles.notificationPopoverHeader}>
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">
                    Notifications
                  </Text>
                  {unreadCount > 0 && (
                    <Button size="slim" variant="plain" onClick={handleMarkAllRead}>
                      Mark all read
                    </Button>
                  )}
                </InlineStack>
              </div>
              <div className={styles.notificationPopoverList}>
                {notificationsLoading ? (
                  <Text variant="bodySm" tone="subdued">
                    Loading...
                  </Text>
                ) : notifications.length === 0 ? (
                  <>
                    <Text variant="bodySm" tone="subdued" as="p">
                      No new notifications
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      You&apos;ll see test completion alerts and significance updates here.
                    </Text>
                  </>
                ) : (
                  <BlockStack gap="200">
                    {notifications.map(n => (
                      <div
                        key={n.id}
                        className={`${styles.notificationItem} ${!n.read ? styles.notificationItemUnread : ''}`}
                      >
                        <Text variant="bodyMd" fontWeight="semibold" as="p">
                          {n.title}
                        </Text>
                        {n.message && (
                          <Text variant="bodySm" tone="subdued" as="p">
                            {n.message}
                          </Text>
                        )}
                        <Text variant="bodySm" tone="subdued" as="p">
                          {new Date(n.createdAt).toLocaleDateString()}
                        </Text>
                        {!n.read && (
                          <Button size="slim" variant="plain" onClick={() => handleMarkRead(n.id)}>
                            Mark read
                          </Button>
                        )}
                      </div>
                    ))}
                  </BlockStack>
                )}
              </div>
              <div className={styles.notificationPopoverFooter}>
                <Button
                  fullWidth
                  variant="plain"
                  onClick={() => {
                    setNotificationsActive(false);
                    navigate(ROUTES.NOTIFICATIONS);
                  }}
                >
                  See all notifications
                </Button>
              </div>
            </div>
          </Popover>

          <Popover
            active={settingsMenuActive}
            activator={
              <button
                type="button"
                onClick={toggleSettingsMenu}
                aria-label="Settings"
                className={`${styles.iconBtn} ${settingsMenuActive ? styles.active : ''}`}
              >
                <Icon source={SettingsIcon} />
              </button>
            }
            onClose={toggleSettingsMenu}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <ActionList items={settingsMenuActions} />
          </Popover>

          <Popover
            active={userMenuActive}
            activator={
              <button
                type="button"
                onClick={toggleUserMenu}
                aria-label="User menu"
                className={`${styles.iconBtn} ${userMenuActive ? styles.active : ''}`}
              >
                <Icon source={ProfileIcon} />
              </button>
            }
            onClose={toggleUserMenu}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <ActionList items={userMenuActions} />
          </Popover>
        </div>
      </div>
    </div>
  );
}

export default TopBar;
