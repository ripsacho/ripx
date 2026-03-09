/**
 * Top Bar Component
 *
 * Premium top navigation bar matching site UI - gradient accent, breadcrumb, action group
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { InlineStack, Popover, Text, BlockStack, Button, Icon, Tooltip } from '@shopify/polaris';
import { NotificationIcon, SettingsIcon, ProfileIcon } from '@shopify/polaris-icons';
import { getShopDomain, apiGet, apiPut, getUrlWithEmbedParams } from '../../services';
import { ROUTES, UNIVERSAL_APP_ROUTES } from '../../constants';
import { useAdminMe } from '../../hooks';
import { getBreadcrumb, getAppDomainFromPath } from '../../utils/breadcrumb';
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
  const { isAdmin, isLoading, role } = useAdminMe();
  const showAdminEntry = Boolean(!isLoading && isAdmin && role);
  const [userMenuActive, setUserMenuActive] = useState(false);
  const [settingsMenuActive, setSettingsMenuActive] = useState(false);
  const [notificationsActive, setNotificationsActive] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  /* Profile, Docs, Notifications: always root. Settings: in app → app settings; elsewhere → account settings (theme) */
  const profilePath = ROUTES.PROFILE;
  const notificationsPath = ROUTES.NOTIFICATIONS;
  const docsPath = ROUTES.DOCS;
  const appDomain = getAppDomainFromPath(location.pathname);
  const settingsPath = appDomain ? ROUTES.appSettings(appDomain) : ROUTES.SETTINGS;
  const _isUniversalPage = UNIVERSAL_APP_ROUTES.includes(location.pathname);

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

  const closeUserMenu = useCallback(() => setUserMenuActive(false), []);
  const closeSettingsMenu = useCallback(() => setSettingsMenuActive(false), []);

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
        {/* Store switcher only in the app (per-store context); hidden on Home and universal pages */}
        {appDomain ? <StoreSwitcher /> : null}
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
                    navigate(notificationsPath);
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
                aria-label="Settings menu"
                className={`${styles.iconBtn} ${settingsMenuActive ? styles.active : ''}`}
              >
                <Icon source={SettingsIcon} />
              </button>
            }
            onClose={() => setSettingsMenuActive(false)}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <div className={styles.menuList} role="menu">
              <button
                type="button"
                className={styles.menuItem}
                role="menuitem"
                onClick={() => {
                  closeSettingsMenu();
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
                  closeSettingsMenu();
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
                  closeSettingsMenu();
                  navigate(profilePath + '?tab=account');
                }}
              >
                API Keys
              </button>
            </div>
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
            onClose={() => setUserMenuActive(false)}
            preferredAlignment="right"
            preferredPosition="below"
          >
            <div className={styles.menuList} role="menu">
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
                  navigate(profilePath + '?tab=account');
                }}
              >
                Account
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
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDestructive}`}
                role="menuitem"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </Popover>
        </div>
      </div>
    </div>
  );
}

export default TopBar;
