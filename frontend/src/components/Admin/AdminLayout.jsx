/**
 * AdminLayout
 *
 * Layout for admin panel: sidebar with grouped collapsible nav, search filter (expanded),
 * collapsible rail with hover labels, footer actions, and main content. Matches project design system.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { Text, Icon, Tooltip, TextField } from '@shopify/polaris';
import {
  HomeIcon,
  ProfileIcon,
  GlobeIcon,
  ClipboardChecklistIcon,
  ListBulletedIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  ArrowLeftIcon,
  KeyIcon,
  ClockIcon,
  FlagIcon,
  LinkIcon,
  ChartVerticalIcon,
  EmailIcon,
  SearchIcon,
} from '@shopify/polaris-icons';
import { ROUTES, APP_META } from '../../constants';
import { getHealthUrl } from '../../services/api';
import TopBar from '../Layout/TopBar';
import styles from './Admin.module.css';

const ADMIN_TITLE_SUFFIX = `Admin · ${APP_META.NAME}`;

/** Grouped admin nav: collapsible sections + filter when expanded */
const adminNavGroups = [
  {
    id: 'overview',
    label: 'Overview',
    collapsible: false,
    items: [{ path: ROUTES.ADMIN_OVERVIEW, label: 'Overview', icon: HomeIcon }],
  },
  {
    id: 'core',
    label: 'Core',
    collapsible: true,
    items: [
      { path: ROUTES.ADMIN_USERS, label: 'Users', icon: ProfileIcon },
      { path: ROUTES.ADMIN_DOMAINS, label: 'Domains', icon: GlobeIcon },
      { path: ROUTES.ADMIN_TESTS, label: 'Tests', icon: ClipboardChecklistIcon },
      { path: ROUTES.ADMIN_ACCOUNTS, label: 'Accounts', icon: ProfileIcon },
    ],
  },
  {
    id: 'system',
    label: 'System & data',
    collapsible: true,
    items: [
      { path: ROUTES.ADMIN_AUDIT, label: 'Audit log', icon: ListBulletedIcon },
      { path: ROUTES.ADMIN_KV, label: 'Key-value store', icon: KeyIcon },
      { path: ROUTES.ADMIN_JOBS, label: 'Jobs', icon: ClockIcon },
      { path: ROUTES.ADMIN_FEATURE_FLAGS, label: 'Feature flags', icon: FlagIcon },
      { path: ROUTES.ADMIN_AGGREGATION, label: 'Aggregation', icon: ClockIcon },
    ],
  },
  {
    id: 'shops',
    label: 'Shops & limits',
    collapsible: true,
    items: [
      { path: ROUTES.ADMIN_SHOP_SESSIONS, label: 'Shop sessions', icon: ProfileIcon },
      {
        path: ROUTES.ADMIN_SHOP_SETTINGS_OVERRIDES,
        label: 'Shop settings overrides',
        icon: KeyIcon,
      },
      { path: ROUTES.ADMIN_RATE_LIMIT_OVERRIDES, label: 'Rate limit overrides', icon: FlagIcon },
      { path: ROUTES.ADMIN_BLOCK_LIST, label: 'Block list', icon: GlobeIcon },
      { path: ROUTES.ADMIN_PROMO_LINKS, label: 'Promo links', icon: LinkIcon },
      { path: ROUTES.ADMIN_CONFLICTS, label: 'Conflicts', icon: ListBulletedIcon },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    collapsible: true,
    items: [
      { path: ROUTES.ADMIN_WEBHOOK_EVENTS, label: 'Webhook events', icon: ListBulletedIcon },
      {
        path: ROUTES.ADMIN_TARGETING_PRESETS,
        label: 'Targeting presets',
        icon: ClipboardChecklistIcon,
      },
      { path: ROUTES.ADMIN_WEBHOOKS, label: 'Webhooks', icon: LinkIcon },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring & support',
    collapsible: true,
    items: [
      { path: ROUTES.ADMIN_TEST_HEALTH, label: 'Test health', icon: ClipboardChecklistIcon },
      { path: ROUTES.ADMIN_NOTIFICATIONS, label: 'Notifications', icon: ListBulletedIcon },
      { path: ROUTES.ADMIN_SUPPORT_TICKETS, label: 'Support tickets', icon: EmailIcon },
      { path: ROUTES.ADMIN_SIGNIFICANCE_ALERTS, label: 'Significance alerts', icon: FlagIcon },
      { path: ROUTES.ADMIN_EVENT_CATALOG, label: 'Event catalog', icon: ListBulletedIcon },
      { path: ROUTES.ADMIN_CLIENT_ERRORS, label: 'Client errors', icon: ListBulletedIcon },
    ],
  },
  {
    id: 'product',
    label: 'Product & policy',
    collapsible: true,
    items: [
      { path: ROUTES.ADMIN_CONSENT_SCRIPT, label: 'Consent & script', icon: KeyIcon },
      { path: ROUTES.ADMIN_LEGAL, label: 'Terms & Privacy', icon: KeyIcon },
      { path: ROUTES.ADMIN_MAINTENANCE, label: 'Maintenance', icon: ClockIcon },
      { path: ROUTES.ADMIN_ANNOUNCEMENT_BANNER, label: 'Announcement banner', icon: FlagIcon },
      { path: ROUTES.ADMIN_MAIL_PROCESSES, label: 'Email delivery', icon: EmailIcon },
      { path: ROUTES.ADMIN_USAGE_EXPORT, label: 'Usage export', icon: ChartVerticalIcon },
    ],
  },
];

const pathToSection = Object.fromEntries(
  adminNavGroups.flatMap(g => g.items.map(i => [i.path, i.label]))
);

const initialExpandedGroups = () =>
  Object.fromEntries(adminNavGroups.filter(g => g.collapsible).map(g => [g.id, true]));

function filterAdminNavGroups(groups, query) {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map(g => ({
      ...g,
      items: g.items.filter(
        item =>
          item.label.toLowerCase().includes(q) ||
          item.path.toLowerCase().includes(q.replace(/\s+/g, ''))
      ),
    }))
    .filter(g => g.items.length > 0);
}

function findGroupIdForPath(pathname) {
  const g = adminNavGroups.find(group => group.items.some(i => i.path === pathname));
  return g?.id ?? null;
}

const ADMIN_NAV_SECTIONS_KEY = 'ripx-admin-nav-sections';
const ADMIN_NAV_FILTER_ID = 'admin-nav-filter';

function loadExpandedGroupsFromStorage() {
  const base = initialExpandedGroups();
  const allowed = new Set(adminNavGroups.filter(g => g.collapsible).map(g => g.id));
  try {
    const raw = sessionStorage.getItem(ADMIN_NAV_SECTIONS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    const next = { ...base };
    for (const [k, v] of Object.entries(parsed)) {
      if (allowed.has(k) && typeof v === 'boolean') next[k] = v;
    }
    return next;
  } catch {
    return base;
  }
}

function AdminLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [navSearch, setNavSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(loadExpandedGroupsFromStorage);
  const [hoverDrawer, setHoverDrawer] = useState(null); // { label, groupLabel?, top, height, left }
  const [showBackToTop, setShowBackToTop] = useState(false);
  const navScrollRef = useRef(null);
  const healthUrl = getHealthUrl();
  const SCROLL_THRESHOLD = 280;

  const searchShortcutLabel = useMemo(() => {
    if (typeof navigator === 'undefined') return 'Ctrl+K';
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '')
      ? '⌘K'
      : 'Ctrl+K';
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setShowBackToTop(window.scrollY > SCROLL_THRESHOLD);
    };
    onScroll(); // initial check
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleNavMouseEnter = useCallback((item, ev) => {
    if (!ev?.currentTarget) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    setHoverDrawer({
      label: item.label,
      groupLabel: item.groupLabel,
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

  const filteredNavGroups = useMemo(
    () => filterAdminNavGroups(adminNavGroups, navSearch),
    [navSearch]
  );

  const isSearching = navSearch.trim().length > 0;

  const toggleGroup = useCallback(id => {
    setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const expandAllGroups = useCallback(() => {
    setExpandedGroups(
      Object.fromEntries(adminNavGroups.filter(g => g.collapsible).map(g => [g.id, true]))
    );
  }, []);

  const collapseAllGroups = useCallback(() => {
    setExpandedGroups(
      Object.fromEntries(adminNavGroups.filter(g => g.collapsible).map(g => [g.id, false]))
    );
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(ADMIN_NAV_SECTIONS_KEY, JSON.stringify(expandedGroups));
    } catch {
      /* ignore quota / private mode */
    }
  }, [expandedGroups]);

  useEffect(() => {
    const gid = findGroupIdForPath(location.pathname);
    if (gid && adminNavGroups.find(g => g.id === gid)?.collapsible) {
      setExpandedGroups(prev => ({ ...prev, [gid]: true }));
    }
  }, [location.pathname]);

  useEffect(() => {
    if (collapsed) return;
    const root = navScrollRef.current;
    if (!root) return;
    const active = root.querySelector('[aria-current="page"]');
    if (!active || typeof active.scrollIntoView !== 'function') return;
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    active.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [location.pathname, collapsed, filteredNavGroups, navSearch]);

  useEffect(() => {
    const onKey = e => {
      if (collapsed) return;
      const t = e.target;
      const tag = t?.tagName;
      const editable = t?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById(ADMIN_NAV_FILTER_ID)?.focus();
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        document.getElementById(ADMIN_NAV_FILTER_ID)?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed]);

  useEffect(() => {
    document.body.classList.add('admin-page');
    return () => document.body.classList.remove('admin-page');
  }, []);

  useEffect(() => {
    const section = pathToSection[location.pathname] || 'Admin';
    const title =
      section === 'Overview' ? ADMIN_TITLE_SUFFIX : `${section} · ${ADMIN_TITLE_SUFFIX}`;
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [location.pathname]);

  return (
    <>
      <div className={`${styles.adminLayout} ${collapsed ? styles.adminSidebarCollapsed : ''}`}>
        <aside className={`${styles.adminSidebar} ${collapsed ? styles.collapsed : ''}`}>
          <div className={styles.adminSidebarHeader}>
            <div className={styles.adminSidebarHeaderRow}>
              {!collapsed && (
                <button
                  type="button"
                  className={styles.adminSidebarBrand}
                  onClick={() => navigate(ROUTES.ADMIN_OVERVIEW)}
                  aria-label="RipX Admin home"
                >
                  <img
                    src="/logo.svg"
                    alt=""
                    className={styles.adminSidebarLogo}
                    width={36}
                    height={36}
                  />
                  <div className={styles.adminSidebarBrandText}>
                    <span className={styles.adminSidebarAppName}>RipX</span>
                    <Text
                      as="p"
                      variant="bodySm"
                      tone="subdued"
                      className={styles.adminSidebarSubtitle}
                    >
                      Admin
                    </Text>
                  </div>
                </button>
              )}
              {collapsed && (
                <>
                  <button
                    type="button"
                    className={styles.adminSidebarLogoCollapsedBtn}
                    onClick={() => navigate(ROUTES.ADMIN_OVERVIEW)}
                    aria-label="RipX Admin home"
                  >
                    <img
                      src="/logo.svg"
                      alt="RipX"
                      className={styles.adminSidebarLogoCollapsed}
                      width={32}
                      height={32}
                    />
                  </button>
                  <Tooltip content="Expand sidebar" preferredPosition="right">
                    <button
                      type="button"
                      onClick={() => setCollapsed(false)}
                      className={styles.adminExpandBtnCollapsed}
                      aria-label="Expand sidebar"
                    >
                      <svg
                        className={styles.adminExpandBtnCollapsedSvg}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </button>
                  </Tooltip>
                </>
              )}
              {!collapsed && (
                <Tooltip content="Collapse sidebar" preferredPosition="right">
                  <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    className={styles.adminCollapseBtn}
                    aria-label="Collapse sidebar"
                  >
                    <Icon source={ChevronLeftIcon} tone="base" />
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
          <div className={styles.adminNavShell}>
            {!collapsed && (
              <div className={styles.adminNavSearch}>
                <TextField
                  id={ADMIN_NAV_FILTER_ID}
                  label="Filter admin pages"
                  labelHidden
                  placeholder="Search pages…"
                  value={navSearch}
                  onChange={setNavSearch}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setNavSearch('')}
                  prefix={<Icon source={SearchIcon} tone="subdued" />}
                />
                <div className={styles.adminNavSearchMeta} aria-hidden="true">
                  <span className={styles.adminNavSearchHint}>Filter</span>
                  <kbd className={styles.adminNavKbd}>{searchShortcutLabel}</kbd>
                  <kbd className={styles.adminNavKbd}>/</kbd>
                </div>
                {!isSearching ? (
                  <div className={styles.adminNavBulk}>
                    <button
                      type="button"
                      className={styles.adminNavBulkBtn}
                      onClick={expandAllGroups}
                    >
                      Expand all
                    </button>
                    <span className={styles.adminNavBulkSep} aria-hidden>
                      ·
                    </span>
                    <button
                      type="button"
                      className={styles.adminNavBulkBtn}
                      onClick={collapseAllGroups}
                    >
                      Collapse all
                    </button>
                  </div>
                ) : null}
              </div>
            )}
            <nav ref={navScrollRef} className={styles.adminNav} aria-label="Admin navigation">
              {collapsed
                ? adminNavGroups
                    .flatMap(g => g.items.map(item => ({ ...item, groupLabel: g.label })))
                    .map(item => {
                      const isActive = location.pathname === item.path;
                      const btn = (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => navigate(item.path)}
                          className={`${styles.adminNavItem} ${isActive ? styles.active : ''}`}
                          aria-current={isActive ? 'page' : undefined}
                          onMouseEnter={e => handleNavMouseEnter(item, e)}
                          onMouseLeave={handleNavMouseLeave}
                        >
                          <span className={styles.adminNavIcon}>
                            <Icon source={item.icon} tone="base" />
                          </span>
                          <span className={styles.adminNavItemText}>{item.label}</span>
                        </button>
                      );
                      return (
                        <div key={item.path} className={styles.adminNavItemWrapper}>
                          {btn}
                        </div>
                      );
                    })
                : filteredNavGroups.map(group => {
                    const open = !group.collapsible || isSearching || expandedGroups[group.id];
                    const groupHasActive = group.items.some(i => i.path === location.pathname);
                    return (
                      <div key={group.id} className={styles.adminNavGroup}>
                        {group.collapsible ? (
                          <button
                            type="button"
                            className={`${styles.adminNavGroupToggle} ${groupHasActive ? styles.adminNavGroupToggleActive : ''}`}
                            onClick={() => toggleGroup(group.id)}
                            aria-expanded={open}
                            aria-controls={`admin-nav-group-${group.id}`}
                            id={`admin-nav-heading-${group.id}`}
                          >
                            <span className={styles.adminNavGroupLabelRow}>
                              <span className={styles.adminNavGroupLabel}>{group.label}</span>
                              <span className={styles.adminNavGroupCount}>
                                {group.items.length}
                              </span>
                            </span>
                            <span className={styles.adminNavGroupChevron} aria-hidden>
                              <Icon
                                source={open ? ChevronDownIcon : ChevronRightIcon}
                                tone="subdued"
                              />
                            </span>
                          </button>
                        ) : null}
                        {open ? (
                          <div
                            className={`${styles.adminNavGroupItems} ${!group.collapsible ? styles.adminNavGroupItemsFlat : ''}`}
                            id={`admin-nav-group-${group.id}`}
                            role="group"
                            aria-labelledby={
                              group.collapsible ? `admin-nav-heading-${group.id}` : undefined
                            }
                          >
                            {group.items.map(item => {
                              const isActive = location.pathname === item.path;
                              return (
                                <button
                                  key={item.path}
                                  type="button"
                                  onClick={() => navigate(item.path)}
                                  className={`${styles.adminNavItem} ${isActive ? styles.active : ''}`}
                                  aria-current={isActive ? 'page' : undefined}
                                >
                                  <span className={styles.adminNavIcon}>
                                    <Icon source={item.icon} tone="base" />
                                  </span>
                                  <span className={styles.adminNavItemText}>{item.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
              {!collapsed && filteredNavGroups.length === 0 ? (
                <p className={styles.adminNavEmpty}>No pages match your search.</p>
              ) : null}
            </nav>
          </div>
          <div className={styles.adminSidebarFooter}>
            <div className={styles.adminSidebarFooterActions}>
              <Tooltip content="Back to RipX app (Home)" preferredPosition="right">
                <button
                  type="button"
                  className={styles.adminBackToApp}
                  onClick={() => navigate(ROUTES.USER_PANEL)}
                  aria-label="Back to app"
                >
                  <span className={styles.adminSidebarBtnContent}>
                    <span className={styles.adminSidebarBtnIcon}>
                      <Icon source={ArrowLeftIcon} tone="base" />
                    </span>
                    <span className={styles.adminSidebarBtnLabel}>Back to app</span>
                  </span>
                </button>
              </Tooltip>
              <Tooltip content="My domains" preferredPosition="right">
                <button
                  type="button"
                  className={styles.adminSidebarFooterLink}
                  onClick={() => navigate(ROUTES.DOMAINS)}
                  aria-label="My domains"
                >
                  <span className={styles.adminSidebarBtnContent}>
                    <span className={styles.adminSidebarBtnIcon}>
                      <Icon source={GlobeIcon} tone="base" />
                    </span>
                    <span className={styles.adminSidebarBtnLabel}>My domains</span>
                  </span>
                </button>
              </Tooltip>
            </div>
            {!collapsed && <div className={styles.adminSidebarFooterBrand}>RipX Admin</div>}
          </div>
        </aside>
        <div className={styles.adminRightColumn}>
          <TopBar
            inline
            sidebarWidth={collapsed ? 80 : 260}
            sidebarCollapsed={collapsed}
            showMobileToggle={false}
          />
          <main className={styles.adminContent}>
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
            {hoverDrawer.groupLabel &&
            hoverDrawer.groupLabel !== hoverDrawer.label &&
            hoverDrawer.groupLabel !== 'Overview' ? (
              <span className={styles.adminHoverDrawerSub}>{hoverDrawer.groupLabel}</span>
            ) : null}
            <span className={styles.adminHoverDrawerTitle}>{hoverDrawer.label}</span>
          </div>,
          document.body
        )}
      {showBackToTop &&
        createPortal(
          <div className={styles.adminFloatingBackToTopWrap}>
            <span className={styles.adminFloatingBackToTopLabel} aria-hidden="true">
              Back to top
            </span>
            <Tooltip content="Scroll to top" preferredPosition="above">
              <button
                type="button"
                className={styles.adminFloatingBackToTop}
                onClick={handleBackToTop}
                aria-label="Scroll to top"
              >
                <span className={styles.adminFloatingBackToTopIcon}>
                  <Icon source={ArrowUpIcon} tone="base" />
                </span>
              </button>
            </Tooltip>
          </div>,
          document.body
        )}
    </>
  );
}

export default AdminLayout;
