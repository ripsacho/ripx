/**
 * Top Bar Component
 *
 * Premium top navigation bar matching site UI - gradient accent, breadcrumb, action group
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { InlineStack, Popover, Text, BlockStack, Button, Icon, Tooltip } from '@shopify/polaris';
import {
  NotificationIcon,
  ProfileIcon,
  CheckCircleIcon,
  LinkIcon,
  ChevronDownIcon,
  PlusIcon,
  ChatIcon,
} from '@shopify/polaris-icons';
import { useQuery } from '@tanstack/react-query';
import {
  getShopDomain,
  apiGet,
  apiPut,
  getUrlWithEmbedParams,
  getConnectUrl,
  redirectToAppUrl,
} from '../../services';
import { ROUTES } from '../../constants';
import { useAdminMe } from '../../hooks';
import { getBreadcrumb, getAppDomainFromPath } from '../../utils/breadcrumb';
import {
  isShopifyStoreDomain,
  normalizeShopifyDomain,
  getShopifyStoreHandle,
} from '../../utils/shopifyAdmin';
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

function TopBar({
  sidebarWidth = 280,
  sidebarCollapsed = false,
  showMobileToggle = false,
  onMobileToggle,
  inline = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: adminMeData, isAdmin, isLoading, role } = useAdminMe();
  const showAdminEntry = Boolean(!isLoading && isAdmin && role);
  const userEmail =
    adminMeData?.adminId && String(adminMeData.adminId).includes('@') ? adminMeData.adminId : null;
  const shopDomain = adminMeData?.shopDomain || (!userEmail && adminMeData?.adminId) || null;
  const [userMenuActive, setUserMenuActive] = useState(false);
  const [helpPopoverActive, setHelpPopoverActive] = useState(false);
  const [notificationsActive, setNotificationsActive] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  /* Profile, Docs, Notifications: always root. Settings: in app → app settings; elsewhere → account settings (theme) */
  const profilePath = ROUTES.PROFILE;
  const notificationsPath = ROUTES.NOTIFICATIONS;
  const docsPath = ROUTES.DOCS;
  const supportPath = ROUTES.SUPPORT;
  const appDomain = getAppDomainFromPath(location.pathname);
  const settingsPath = appDomain ? ROUTES.appSettings(appDomain) : ROUTES.SETTINGS;

  const isShopifyStore = Boolean(appDomain && isShopifyStoreDomain(appDomain));
  const {
    data: connectionData,
    isFetched: connectionFetched,
    isError: connectionError,
  } = useQuery({
    queryKey: ['shopify', 'connection-status', appDomain],
    queryFn: async () => {
      const res = await apiGet('/shopify/connection-status');
      return res.data;
    },
    retry: false,
    staleTime: 2 * 60 * 1000,
    enabled: isShopifyStore,
  });
  const shopifyConnected = connectionFetched && !connectionError && connectionData?.connected;
  const shopifyNotConnected =
    isShopifyStore && connectionFetched && (connectionError || !connectionData?.connected);
  const shopifyStoreHandle = isShopifyStore && appDomain ? getShopifyStoreHandle(appDomain) : '';
  const handleConnectStore = useCallback(() => {
    if (!appDomain) return;
    const url = getConnectUrl({
      shop: normalizeShopifyDomain(appDomain),
      reason: ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
    });
    redirectToAppUrl(url);
  }, [appDomain]);

  const toggleUserMenu = useCallback(() => setUserMenuActive(a => !a), []);

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

  const closeUserMenu = useCallback(() => setUserMenuActive(false), []);

  const handleLogout = useCallback(() => {
    setUserMenuActive(false);
    const shopDomain = getShopDomain();
    if (shopDomain) {
      window.location.href = `https://${shopDomain}/admin`;
    } else {
      window.location.href = getUrlWithEmbedParams(ROUTES.USER_PANEL);
    }
  }, []);

  const effectiveLeft = inline ? 0 : sidebarCollapsed ? 80 : sidebarWidth;
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
    <div
      className={`top-bar ${styles.topBar} ${inline ? `top-bar-inline ${styles.topBarInline}` : ''}`}
      style={{ '--topbar-left': `${effectiveLeft}px` }}
    >
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
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          {breadcrumb.parent && (
            <>
              {breadcrumb.parentPath ? (
                <button
                  type="button"
                  onClick={() => navigate(breadcrumb.parentPath)}
                  className={styles.breadcrumbParent}
                >
                  {breadcrumb.parent}
                </button>
              ) : (
                <span>{breadcrumb.parent}</span>
              )}
              <span className={styles.breadcrumbSep} aria-hidden="true">
                /
              </span>
            </>
          )}
          <span className={styles.breadcrumbCurrent}>{breadcrumb.current}</span>
        </nav>
      </div>

      <div className={styles.topBarRight}>
        {/* 1) Store switcher + primary CTA (in app only) */}
        {appDomain ? <StoreSwitcher /> : null}
        {appDomain && (
          <button
            type="button"
            onClick={() => navigate(ROUTES.appCreateTest(appDomain))}
            className={styles.newTestBtn}
            aria-label="Create new A/B test"
            title="Create a new A/B test"
          >
            <Icon source={PlusIcon} />
            <span className={styles.newTestBtnLabel}>New Test</span>
          </button>
        )}
        {/* Divider between primary actions (store + New Test) and utilities */}
        {appDomain && <span className={styles.topBarRightDivider} aria-hidden="true" />}
        {/* 2) Utilities: Help (?), Support, Open in new tab (embed only), Notifications, User menu */}
        <div className={styles.actionGroup}>
          <Popover
            active={helpPopoverActive}
            activator={
              <Tooltip content="Help" preferredPosition="below">
                <button
                  type="button"
                  onClick={() => setHelpPopoverActive(a => !a)}
                  aria-label="Help – Documentation and Support"
                  aria-expanded={helpPopoverActive}
                  aria-haspopup="true"
                  className={`${styles.iconBtn} ${helpPopoverActive ? styles.active : ''}`}
                  title="Help"
                >
                  <span className={styles.helpIcon} aria-hidden>
                    ?
                  </span>
                </button>
              </Tooltip>
            }
            onClose={() => setHelpPopoverActive(false)}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <div className={styles.helpPopover}>
              <Text variant="headingSm" as="h2">
                Help
              </Text>
              <BlockStack gap="200">
                <button
                  type="button"
                  className={styles.helpPopoverLink}
                  onClick={() => {
                    setHelpPopoverActive(false);
                    navigate(docsPath);
                  }}
                >
                  Documentation
                </button>
                <button
                  type="button"
                  className={styles.helpPopoverLink}
                  onClick={() => {
                    setHelpPopoverActive(false);
                    navigate(supportPath);
                  }}
                >
                  Support
                </button>
              </BlockStack>
            </div>
          </Popover>
          <Tooltip content="Support" preferredPosition="below">
            <button
              type="button"
              onClick={() => navigate(supportPath)}
              aria-label="Go to Support"
              aria-current={location.pathname === supportPath ? 'page' : undefined}
              className={`${styles.iconBtn} ${location.pathname === supportPath ? styles.active : ''}`}
              title="Support"
            >
              <Icon source={ChatIcon} />
            </button>
          </Tooltip>
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
              <Tooltip
                content={
                  unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
                }
                preferredPosition="below"
              >
                <button
                  type="button"
                  onClick={() => setNotificationsActive(a => !a)}
                  aria-label={
                    unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
                  }
                  className={`${styles.iconBtn} ${notificationsActive ? styles.active : ''}`}
                >
                  <Icon source={NotificationIcon} />
                  {unreadCount > 0 && (
                    <span className={styles.notificationBadge} aria-label={`${unreadCount} unread`}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              </Tooltip>
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
                  <div className={styles.notificationEmptyState}>
                    <span className={styles.notificationEmptyIcon} aria-hidden>
                      •
                    </span>
                    <Text variant="bodySm" tone="subdued" as="p">
                      No new notifications
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="p">
                      You&apos;ll see test completion alerts and significance updates here.
                    </Text>
                  </div>
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
                    navigate(notificationsPath);
                  }}
                >
                  See all notifications
                </Button>
              </div>
            </div>
          </Popover>

          <span className={styles.actionGroupDivider} aria-hidden />
          <Popover
            active={userMenuActive}
            activator={
              <Tooltip
                content={userEmail || shopDomain || 'Account menu'}
                preferredPosition="below"
              >
                <button
                  type="button"
                  onClick={toggleUserMenu}
                  aria-label={userEmail ? `Account: ${userEmail}` : 'User menu'}
                  aria-expanded={userMenuActive}
                  aria-haspopup="true"
                  className={`${styles.userMenuTrigger} ${styles.iconBtn} ${userMenuActive ? styles.active : ''}`}
                >
                  <span className={styles.userMenuTriggerIconWrap}>
                    <Icon source={ProfileIcon} />
                  </span>
                  {(userEmail || shopDomain) && (
                    <span className={styles.userMenuTriggerLabel} title={userEmail || shopDomain}>
                      {userEmail
                        ? userEmail.length > 28
                          ? `${userEmail.slice(0, 12)}…${userEmail.slice(-10)}`
                          : userEmail
                        : shopDomain}
                    </span>
                  )}
                  <span className={styles.userMenuTriggerChevron} aria-hidden>
                    <Icon source={ChevronDownIcon} />
                  </span>
                </button>
              </Tooltip>
            }
            onClose={() => setUserMenuActive(false)}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <div className={styles.menuList} role="menu">
              {(userEmail || shopDomain) && (
                <div className={styles.userMenuHeader}>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {userEmail ? 'Signed in as' : 'Store'}
                  </Text>
                  <span className={styles.userEmail}>{userEmail || shopDomain}</span>
                </div>
              )}
              {/* Shopify store only: connection status */}
              {isShopifyStore && connectionFetched && shopifyStoreHandle && (
                <div
                  className={styles.userMenuConnection}
                  role="region"
                  aria-label="Shopify store connection"
                >
                  <div className={styles.userMenuConnectionLabel}>Shopify store</div>
                  {shopifyConnected ? (
                    <div
                      className={styles.userMenuConnectedCard}
                      aria-label={`${shopifyStoreHandle} connected to Shopify`}
                    >
                      <span className={styles.userMenuConnectedIcon} aria-hidden>
                        <Icon source={CheckCircleIcon} />
                      </span>
                      <div className={styles.userMenuConnectedText}>
                        <span className={styles.userMenuConnectedTitle}>Connected to Shopify</span>
                        <span className={styles.userMenuConnectedSub}>
                          {shopifyStoreHandle}
                          <span className={styles.userMenuConnectedSubSep} aria-hidden>
                            {' '}
                            ·{' '}
                          </span>
                          Store data synced
                        </span>
                      </div>
                    </div>
                  ) : shopifyNotConnected ? (
                    <div className={styles.userMenuNotConnected}>
                      <span className={styles.userMenuNotConnectedLabel}>
                        <span className={styles.userMenuNotConnectedIcon} aria-hidden>
                          <Icon source={LinkIcon} />
                        </span>
                        {shopifyStoreHandle} isn&apos;t linked
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          closeUserMenu();
                          handleConnectStore();
                        }}
                        className={styles.userMenuConnectBtn}
                        aria-label={`Connect ${shopifyStoreHandle} to Shopify`}
                      >
                        Connect to Shopify
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <div className={styles.menuSection}>
                <span className={styles.menuSectionTitle}>Navigate</span>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    closeUserMenu();
                    navigate(ROUTES.USER_PANEL);
                  }}
                >
                  Home
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    closeUserMenu();
                    navigate(ROUTES.DOMAINS);
                  }}
                >
                  My domains
                </button>
                {showAdminEntry && (
                  <button
                    type="button"
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => {
                      closeUserMenu();
                      navigate(ROUTES.ADMIN);
                    }}
                  >
                    Admin
                  </button>
                )}
              </div>

              <div className={styles.menuSection}>
                <span className={styles.menuSectionTitle}>Settings</span>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    closeUserMenu();
                    navigate(settingsPath);
                  }}
                >
                  {appDomain ? 'App settings' : 'Account settings'}
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    closeUserMenu();
                    navigate(notificationsPath);
                  }}
                >
                  Notifications
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    closeUserMenu();
                    navigate(profilePath + '?tab=account');
                  }}
                >
                  Account & API keys
                </button>
              </div>

              <div className={styles.menuSection}>
                <span className={styles.menuSectionTitle}>Resources</span>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    closeUserMenu();
                    navigate(profilePath);
                  }}
                >
                  My Profile
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    closeUserMenu();
                    navigate(profilePath + '?tab=preferences');
                  }}
                >
                  Preferences
                </button>
                <button
                  type="button"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => {
                    closeUserMenu();
                    navigate(docsPath);
                  }}
                >
                  Documentation
                </button>
              </div>

              <div className={styles.menuSection}>
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuItemDestructive}`}
                  role="menuitem"
                  onClick={handleLogout}
                >
                  Logout
                </button>
              </div>
            </div>
          </Popover>
        </div>
      </div>
    </div>
  );
}

export default TopBar;
