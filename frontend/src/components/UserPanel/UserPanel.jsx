/**
 * User Panel – compact command-center layout after login.
 * Telemetry header, dashboard grid (domains + side rail), dense domain rows.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Icon, Spinner, Banner } from '@shopify/polaris';
import {
  GlobeIcon,
  ExternalIcon,
  LinkIcon,
  SettingsIcon,
  ProfileIcon,
  BookIcon,
  NotificationIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
} from '@shopify/polaris-icons';
import { PageShell, LegalFooter } from '../Shared';
import { ROUTES, STORAGE_KEYS } from '../../constants';
import {
  apiMeGet,
  apiGet,
  apiPost,
  getAccountApiKey,
  getDomainKeys,
  setCurrentStore,
  unwrapData,
  getEmailToken,
  isEmbeddedInIframe,
  getConnectUrl,
  getUrlWithEmbedParams,
  getNavigateToWithEmbed,
  openCenteredPopup,
  fetchShopifyConnectionStatus,
} from '../../services';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../../utils/shopifyAdmin';
import {
  shouldOpenShopifyApp,
  isShopifyStoreOpenableState,
} from '../../utils/shopifyConnectionHealth';
import {
  buildCommandCenterSetupSteps,
  getShopifyDomainPrimaryCtaLabel,
  getShopifyDomainStatusPresentation,
  summarizeCommandCenterSetupSteps,
} from '../../utils/commandCenterPresentation';
import { isStorefrontRuntimeReady } from '../../utils/storefrontSetupStatus';
import { invalidateShopifyConnectionQueries } from '../../utils/shopifyQueryInvalidation';
import { resolveShopifyOAuthUrl, fetchShopifyOAuthConfig } from '../../utils/shopifyOAuthFlow';
import { useAdminMe, useShopifyInstallStatus, useStorefrontSetupReadiness } from '../../hooks';
import { OAUTH_SUCCESS_MESSAGE_TYPE } from '../Connect/OAuthSuccess';
import styles from './UserPanel.module.css';

const SHOPIFY_CONNECT_POPUP_CLOSE_SIGNAL_KEY_PREFIX = 'ripx-shopify-connect-close';
const SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX = 'ripx-shopify-connect-popup-active';
const SHOPIFY_CONNECT_POPUP_SESSION_KEY = 'ripx-shopify-connect-popup-session';
const SHOPIFY_TUNNEL_HINT_DISMISS_KEY_PREFIX = 'ripx-oauth-tunnel-dev-hint';
const PINNED_DOMAINS_STORAGE_KEY = 'ripx-command-center-pinned-domains';
const CONNECT_POPUP_WINDOW_NAME = 'ripx-shopify-connect';
const OPEN_DOMAIN_TIMEOUT_MS = 20000;
const PENDING_CONNECT_MAX_MS = 120000;

function markShopifyConnectPopupWindow(popupWindow, shop) {
  if (!popupWindow || popupWindow.closed || !shop) return;
  try {
    popupWindow.name = CONNECT_POPUP_WINDOW_NAME;
  } catch {
    // ignore popup naming errors
  }
  try {
    popupWindow.sessionStorage.setItem(SHOPIFY_CONNECT_POPUP_SESSION_KEY, shop);
    popupWindow.sessionStorage.setItem(
      `${SHOPIFY_CONNECT_POPUP_SESSION_KEY}:${shop}`,
      String(Date.now())
    );
  } catch {
    // Cross-origin popups cannot be marked after navigation; window.name remains the fallback.
  }
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const DOMAIN_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs action' },
  { id: 'ready', label: 'Ready' },
];

function domainNeedsAttention({
  installState,
  setupSummary,
  isShopify,
  canOpen,
  needsScopeUpdate,
}) {
  if (['needs_install', 'needs_link', 'restricted', 'checking'].includes(installState)) {
    return true;
  }
  if (needsScopeUpdate) {
    return true;
  }
  if (isShopify && setupSummary?.pendingCount > 0) {
    return true;
  }
  if (!isShopify && !canOpen) {
    return true;
  }
  return false;
}

function domainIsReady({ isShopifyReady, setupSummary, canOpen, isShopify }) {
  if (isShopify) {
    return isShopifyReady && (setupSummary?.total === 0 || setupSummary?.allComplete);
  }
  return !!canOpen;
}

function readPinnedDomains() {
  if (typeof window === 'undefined') {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(PINNED_DOMAINS_STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
  } catch {
    return new Set();
  }
}

function readRecentStoreDomain() {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return normalizeShopifyDomain(window.localStorage.getItem(STORAGE_KEYS.CURRENT_STORE) || '');
  } catch {
    return '';
  }
}

function buildDomainCatalogEntry(
  domainRow,
  {
    accountKey,
    domainKeys,
    getShopifyInstallState,
    getShopifyInstallDetail,
    getStorefrontReadiness,
  }
) {
  const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
  if (!domain) {
    return null;
  }
  const isShopify = isShopifyStoreDomain(domain);
  const platform = isShopify
    ? 'shopify'
    : typeof domainRow === 'object' && domainRow?.platform
      ? domainRow.platform
      : 'standalone';
  const installState = isShopify ? getShopifyInstallState(domain) : null;
  const installDetail = isShopify ? getShopifyInstallDetail(domain) : null;
  const setupStatus = isShopify ? getStorefrontReadiness(domain) : null;
  const setupSteps = buildCommandCenterSetupSteps({
    installState,
    installDetail,
    setupStatus,
    isShopify,
  });
  const setupSummary = summarizeCommandCenterSetupSteps(setupSteps);
  const keyForDomain = accountKey || (domainKeys && domainKeys[domain]);
  const canOpen = !!keyForDomain || isShopify;
  const presentation = getShopifyDomainStatusPresentation({
    installState,
    installDetail,
    canOpen,
    isShopify,
  });
  const needsAttention = domainNeedsAttention({
    installState,
    setupSummary,
    isShopify,
    canOpen,
    needsScopeUpdate: presentation.needsScopeUpdate,
  });
  const isReady = domainIsReady({
    isShopifyReady: presentation.isShopifyReady,
    setupSummary,
    canOpen,
    isShopify,
  });
  const setupPercent =
    setupSummary.total > 0 ? Math.round((setupSummary.complete / setupSummary.total) * 100) : 100;
  const pendingSteps = setupSteps.filter(step => !step.complete);
  return {
    domainRow,
    domain,
    platform,
    isShopify,
    installState,
    installDetail,
    setupStatus,
    setupSteps,
    setupSummary,
    canOpen,
    presentation,
    needsAttention,
    isReady,
    setupPercent,
    pendingSteps,
    statusLabel: presentation.statusLabel,
    needsScopeUpdate: presentation.needsScopeUpdate,
    isShopifyReady: presentation.isShopifyReady,
  };
}

function SetupProgressRing({ percent, size = 34, label }) {
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const safePercent = Math.min(100, Math.max(0, percent));
  const offset = circumference - (safePercent / 100) * circumference;
  return (
    <div
      className={styles.setupProgressRing}
      style={{ width: size, height: size }}
      aria-label={label}
      title={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className={styles.setupProgressRingTrack}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className={styles.setupProgressRingFill}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.setupProgressRingValue}>{safePercent}</span>
    </div>
  );
}

const ACCOUNT_TILES = [
  {
    to: ROUTES.PROFILE,
    icon: ProfileIcon,
    label: 'Profile',
    desc: 'Profile, account & API access',
  },
  {
    to: ROUTES.DOCS,
    icon: BookIcon,
    label: 'Documentation',
    desc: 'Guides & API',
    external: true,
  },
  {
    to: ROUTES.NOTIFICATIONS,
    icon: NotificationIcon,
    label: 'Notifications',
    desc: 'Alerts & updates',
  },
];

function UserPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const useEmailDomains = !!getEmailToken();
  const { data: meData, isLoading: meLoading, isError: meError, isAdmin } = useAdminMe();

  const {
    data: domainsData,
    isLoading: domainsLoading,
    error: domainsError,
  } = useQuery({
    queryKey: ['me', 'panel', 'domains'],
    queryFn: async () => {
      if (useEmailDomains) {
        const res = await apiMeGet('/me/domains');
        const payload = unwrapData(res) || {};
        return { domains: payload.domains ?? [] };
      }
      const res = await apiGet('/account/stores');
      const raw = res.data?.data ?? res.data;
      const stores = raw?.stores ?? [];
      return {
        domains: stores.map(s => ({
          domain: s.domain,
          platform: /\.myshopify\.com$/i.test(s.domain) ? 'shopify' : s.platform || 'standalone',
        })),
      };
    },
    staleTime: 30 * 1000,
  });

  const isLoading = meLoading || domainsLoading;
  const error = domainsError;
  const domains = React.useMemo(
    () => (Array.isArray(domainsData?.domains) ? domainsData.domains : []),
    [domainsData]
  );
  const canAddDomains = useEmailDomains;
  const {
    getState: getShopifyInstallStateFromHook,
    getMessage: getShopifyInstallMessage,
    getDetail: getShopifyInstallDetail,
  } = useShopifyInstallStatus(domains, 'user-panel');
  const { data: oauthConfig } = useQuery({
    queryKey: ['shopify', 'oauth-config'],
    queryFn: () => fetchShopifyOAuthConfig({ forceRefresh: true }),
    staleTime: 60 * 1000,
  });
  const [oauthNotice, setOauthNotice] = useState(null);
  const [tunnelHintDismissed, setTunnelHintDismissed] = useState(false);
  const greeting = getTimeGreeting();
  const userEmail = !meError && (meData?.email || meData?.user?.email);
  const domainCount = domains.length;

  const accountKey = getAccountApiKey();
  const domainKeys = getDomainKeys();
  const [openingDomain, setOpeningDomain] = useState(null);
  const connectPopupRef = useRef(null);
  const connectVerifyLocksRef = useRef(new Map());
  const pendingConnectStartedRef = useRef(0);
  const handleOpenAppRef = useRef(null);
  const [pendingShopifyConnect, setPendingShopifyConnect] = useState(null);

  const openDomainApp = useCallback(
    normalizedShop => {
      if (!normalizedShop) {
        return;
      }
      setCurrentStore(normalizedShop);
      if (isEmbeddedInIframe()) {
        window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalizedShop), {
          shop: normalizedShop,
        });
      } else {
        navigate(ROUTES.appDashboard(normalizedShop));
      }
    },
    [navigate]
  );

  const verifyConnectedAndOpen = useCallback(
    async targetShop => {
      const normalized = normalizeShopifyDomain(targetShop || '');
      if (!normalized) {
        return false;
      }
      if (connectVerifyLocksRef.current.get(normalized)) {
        return false;
      }
      connectVerifyLocksRef.current.set(normalized, true);
      try {
        if (getEmailToken()) {
          try {
            await apiPost('/me/domains/link-shopify', { shop: normalized });
          } catch {
            // Link may fail before OAuth completes; connection-status will reflect state.
          }
        }
        const status = await fetchShopifyConnectionStatus(normalized);
        const connected = shouldOpenShopifyApp(status);
        if (connected) {
          invalidateShopifyConnectionQueries(queryClient, normalized);
          queryClient.invalidateQueries({ queryKey: ['me', 'panel', 'domains'] });
          queryClient.invalidateQueries({ queryKey: ['me', 'storefront-readiness'] });
          setPendingShopifyConnect(null);
          try {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem(
                `${SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX}:${normalized}`
              );
              window.localStorage.setItem(
                `${SHOPIFY_CONNECT_POPUP_CLOSE_SIGNAL_KEY_PREFIX}:${normalized}`,
                String(Date.now())
              );
            }
          } catch {
            // ignore storage errors
          }
          const existingPopup = connectPopupRef.current;
          if (existingPopup && !existingPopup.closed) {
            try {
              existingPopup.close();
            } catch {
              // ignore popup close errors
            } finally {
              connectPopupRef.current = null;
            }
          }
          openDomainApp(normalized);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        connectVerifyLocksRef.current.delete(normalized);
      }
    },
    [openDomainApp, queryClient]
  );

  const getShopifyInstallState = useCallback(
    domainValue => {
      if (!isShopifyStoreDomain(domainValue)) return null;
      const normalized = normalizeShopifyDomain(domainValue);
      if (
        openingDomain === domainValue ||
        openingDomain === normalized ||
        (pendingShopifyConnect &&
          (pendingShopifyConnect === domainValue || pendingShopifyConnect === normalized))
      ) {
        return 'checking';
      }
      const hookState = getShopifyInstallStateFromHook(domainValue) || 'unknown';
      if (hookState === 'verify_unavailable') {
        return 'needs_install';
      }
      if (hookState === 'scopes_stale') {
        return 'scopes_stale';
      }
      return hookState;
    },
    [openingDomain, pendingShopifyConnect, getShopifyInstallStateFromHook]
  );
  const shopifyDomains = domains.filter(domainRow =>
    isShopifyStoreDomain(typeof domainRow === 'string' ? domainRow : domainRow?.domain)
  );
  const installStateByShop = React.useMemo(() => {
    const map = {};
    shopifyDomains.forEach(domainRow => {
      const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
      const normalized = normalizeShopifyDomain(domain || '');
      if (normalized) {
        map[normalized] = getShopifyInstallState(domain);
      }
    });
    return map;
  }, [shopifyDomains, getShopifyInstallState]);
  const { getReadiness: getStorefrontReadiness } = useStorefrontSetupReadiness(
    domains,
    installStateByShop,
    'user-panel'
  );
  const connectedShopifyCount = shopifyDomains.filter(domainRow => {
    const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
    const state = getShopifyInstallState(domain);
    return state === 'connected' || isShopifyStoreOpenableState(state);
  }).length;
  const needsAttentionCount = shopifyDomains.filter(domainRow => {
    const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
    const state = getShopifyInstallState(domain);
    return ['needs_install', 'needs_link', 'restricted'].includes(state);
  }).length;
  const permissionsAttentionCount = shopifyDomains.filter(domainRow => {
    const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
    const detail = getShopifyInstallDetail(domain);
    return (
      getShopifyInstallState(domain) === 'scopes_stale' &&
      Array.isArray(detail?.missingScopes) &&
      detail.missingScopes.length > 0
    );
  }).length;
  const storefrontSetupAttentionCount = shopifyDomains.filter(domainRow => {
    const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
    const state = getShopifyInstallState(domain);
    if (!isShopifyStoreOpenableState(state)) {
      return false;
    }
    const readiness = getStorefrontReadiness(domain);
    if (!readiness || readiness.available === false) {
      return false;
    }
    return !isStorefrontRuntimeReady(readiness);
  }).length;
  const standaloneCount = Math.max(0, domainCount - shopifyDomains.length);
  const showOAuthAlignmentWarning =
    Boolean(oauthNotice) || Boolean(oauthConfig?.showOAuthAlignmentWarning);
  const systemAttentionTotal = needsAttentionCount + storefrontSetupAttentionCount;
  const systemStatus = showOAuthAlignmentWarning
    ? { label: 'Config alert', tone: 'warning' }
    : systemAttentionTotal > 0
      ? { label: 'Setup pending', tone: 'attention' }
      : { label: 'Operational', tone: 'ok' };
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandSelected, setCommandSelected] = useState(0);
  const [domainFilter, setDomainFilter] = useState('all');
  const [domainSearch, setDomainSearch] = useState('');
  const [expandedDomains, setExpandedDomains] = useState(() => new Set());
  const [pinnedDomains, setPinnedDomains] = useState(() => readPinnedDomains());
  const autoExpandInitializedRef = useRef(false);
  const commandInputRef = useRef(null);
  const tunnelHintBase = oauthConfig?.base || oauthConfig?.partnerDashboard?.applicationUrl || '';
  const tunnelHintStorageKey = tunnelHintBase
    ? `${SHOPIFY_TUNNEL_HINT_DISMISS_KEY_PREFIX}:${tunnelHintBase}`
    : '';

  useEffect(() => {
    if (!tunnelHintStorageKey || typeof window === 'undefined') {
      setTunnelHintDismissed(false);
      return;
    }
    try {
      setTunnelHintDismissed(window.localStorage.getItem(tunnelHintStorageKey) === '1');
    } catch {
      setTunnelHintDismissed(false);
    }
  }, [tunnelHintStorageKey]);

  const toggleDomainExpanded = useCallback(domainValue => {
    setExpandedDomains(current => {
      const next = new Set(current);
      if (next.has(domainValue)) {
        next.delete(domainValue);
      } else {
        next.add(domainValue);
      }
      return next;
    });
  }, []);

  const togglePinDomain = useCallback(domainValue => {
    setPinnedDomains(current => {
      const next = new Set(current);
      if (next.has(domainValue)) {
        next.delete(domainValue);
      } else {
        next.add(domainValue);
      }
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(PINNED_DOMAINS_STORAGE_KEY, JSON.stringify(Array.from(next)));
        }
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const domainCatalog = useMemo(
    () =>
      domains
        .map(domainRow =>
          buildDomainCatalogEntry(domainRow, {
            accountKey,
            domainKeys,
            getShopifyInstallState,
            getShopifyInstallDetail,
            getStorefrontReadiness,
          })
        )
        .filter(Boolean),
    [
      accountKey,
      domainKeys,
      domains,
      getShopifyInstallDetail,
      getShopifyInstallState,
      getStorefrontReadiness,
    ]
  );

  const filterCounts = useMemo(
    () => ({
      all: domainCatalog.length,
      attention: domainCatalog.filter(entry => entry.needsAttention).length,
      ready: domainCatalog.filter(entry => entry.isReady).length,
    }),
    [domainCatalog]
  );

  const recentStoreDomain = useMemo(() => readRecentStoreDomain(), [domains]);

  const portfolioSetup = useMemo(() => {
    const shopifyEntries = domainCatalog.filter(
      entry => entry.isShopify && entry.setupSummary.total > 0
    );
    if (!shopifyEntries.length) {
      return null;
    }
    const complete = shopifyEntries.reduce((sum, entry) => sum + entry.setupSummary.complete, 0);
    const total = shopifyEntries.reduce((sum, entry) => sum + entry.setupSummary.total, 0);
    return {
      complete,
      total,
      percent: total > 0 ? Math.round((complete / total) * 100) : 100,
    };
  }, [domainCatalog]);

  const resumeDomainEntry = useMemo(() => {
    if (!recentStoreDomain) {
      return null;
    }
    return (
      domainCatalog.find(
        entry => normalizeShopifyDomain(entry.domain) === recentStoreDomain && entry.canOpen
      ) || null
    );
  }, [domainCatalog, recentStoreDomain]);

  const displayDomains = useMemo(() => {
    const q = domainSearch.trim().toLowerCase();
    const filtered = domainCatalog.filter(entry => {
      if (q && !entry.domain.toLowerCase().includes(q)) {
        return false;
      }
      if (domainFilter === 'attention') {
        return entry.needsAttention;
      }
      if (domainFilter === 'ready') {
        return entry.isReady;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      const aPinned = pinnedDomains.has(a.domain);
      const bPinned = pinnedDomains.has(b.domain);
      if (aPinned !== bPinned) {
        return aPinned ? -1 : 1;
      }
      if (a.needsAttention !== b.needsAttention) {
        return a.needsAttention ? -1 : 1;
      }
      const aRecent = normalizeShopifyDomain(a.domain) === recentStoreDomain;
      const bRecent = normalizeShopifyDomain(b.domain) === recentStoreDomain;
      if (aRecent !== bRecent) {
        return aRecent ? -1 : 1;
      }
      return a.domain.localeCompare(b.domain);
    });
  }, [domainCatalog, domainFilter, domainSearch, pinnedDomains, recentStoreDomain]);

  useEffect(() => {
    if (isLoading || autoExpandInitializedRef.current || domainCatalog.length === 0) {
      return;
    }
    autoExpandInitializedRef.current = true;
    const autoExpand = domainCatalog
      .filter(entry => entry.needsAttention && entry.setupSummary.pendingCount > 0)
      .slice(0, 3)
      .map(entry => entry.domain);
    if (autoExpand.length > 0) {
      setExpandedDomains(new Set(autoExpand));
    }
  }, [domainCatalog, isLoading]);

  const commandPaletteItems = useMemo(() => {
    const items = [];
    if (resumeDomainEntry) {
      items.push({
        id: 'resume',
        label: `Resume ${resumeDomainEntry.domain}`,
        sublabel: 'Last opened workspace',
        shortcut: 'L',
        onSelect: () => {
          setCommandPaletteOpen(false);
          handleOpenAppRef.current?.({ domain: resumeDomainEntry.domain });
        },
      });
    }
    if (canAddDomains) {
      items.push({
        id: 'add-domain',
        label: 'Add domain',
        sublabel: 'Connect a Shopify store or standalone site',
        shortcut: 'D',
        onSelect: () => {
          setCommandPaletteOpen(false);
          navigate(getNavigateToWithEmbed(ROUTES.DOMAINS, { action: 'add' }));
        },
      });
    }
    items.push({
      id: 'domains',
      label: 'Manage domains',
      sublabel: `${domainCount} connected`,
      shortcut: 'M',
      onSelect: () => {
        setCommandPaletteOpen(false);
        navigate(getNavigateToWithEmbed(ROUTES.DOMAINS));
      },
    });
    items.push({
      id: 'profile',
      label: 'Open profile',
      shortcut: 'P',
      onSelect: () => {
        setCommandPaletteOpen(false);
        navigate(ROUTES.PROFILE);
      },
    });
    items.push({
      id: 'notifications',
      label: 'Notifications',
      onSelect: () => {
        setCommandPaletteOpen(false);
        navigate(ROUTES.NOTIFICATIONS);
      },
    });
    if (isAdmin) {
      items.push({
        id: 'admin',
        label: 'Admin console',
        shortcut: 'A',
        onSelect: () => {
          setCommandPaletteOpen(false);
          navigate(getNavigateToWithEmbed(ROUTES.ADMIN));
        },
      });
    }
    shopifyDomains.slice(0, 6).forEach(domainRow => {
      const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
      if (!domain) return;
      const state = getShopifyInstallState(domain);
      items.push({
        id: `open-${domain}`,
        label: `Open ${domain}`,
        sublabel:
          state === 'connected' || isShopifyStoreOpenableState(state)
            ? 'A/B tests'
            : 'Connect store',
        onSelect: () => {
          setCommandPaletteOpen(false);
          handleOpenAppRef.current?.({ domain });
        },
      });
    });
    return items;
  }, [
    canAddDomains,
    domainCount,
    getShopifyInstallState,
    isAdmin,
    navigate,
    resumeDomainEntry,
    shopifyDomains,
  ]);

  const filteredCommandItems = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return commandPaletteItems;
    return commandPaletteItems.filter(
      item =>
        item.label.toLowerCase().includes(q) ||
        (item.sublabel && item.sublabel.toLowerCase().includes(q))
    );
  }, [commandPaletteItems, commandQuery]);

  const safeCommandSelected = Math.min(
    commandSelected,
    Math.max(0, filteredCommandItems.length - 1)
  );

  useEffect(() => {
    setCommandSelected(0);
  }, [commandQuery]);

  useEffect(() => {
    const handle = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(open => {
          if (!open) {
            setCommandQuery('');
            setCommandSelected(0);
            setTimeout(() => commandInputRef.current?.focus(), 50);
          }
          return !open;
        });
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  useEffect(() => {
    if (!commandPaletteOpen) return undefined;
    const handle = e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandSelected(s => Math.min(s + 1, filteredCommandItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandSelected(s => Math.max(s - 1, 0));
      } else if (e.key === 'Enter' && filteredCommandItems[safeCommandSelected]?.onSelect) {
        e.preventDefault();
        filteredCommandItems[safeCommandSelected].onSelect();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [commandPaletteOpen, filteredCommandItems, safeCommandSelected]);

  const dismissTunnelDevHint = useCallback(() => {
    setTunnelHintDismissed(true);
    if (!tunnelHintStorageKey || typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(tunnelHintStorageKey, '1');
    } catch {
      // ignore storage errors
    }
  }, [tunnelHintStorageKey]);

  const openShopifyConnectPopup = useCallback(
    (url, shop, preferredPopup = null) => {
      const normalized = normalizeShopifyDomain(shop || '');
      const existingPopup = preferredPopup || connectPopupRef.current;
      if (existingPopup && !existingPopup.closed) {
        try {
          markShopifyConnectPopupWindow(existingPopup, normalized);
          existingPopup.location.href = url;
          existingPopup.focus();
          connectPopupRef.current = existingPopup;
          if (normalized) {
            setPendingShopifyConnect(normalized);
            try {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(
                  `${SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX}:${normalized}`,
                  String(Date.now())
                );
              }
            } catch {
              // ignore storage errors
            }
          }
          return true;
        } catch {
          // ignore popup navigation errors; fallback to opening a new popup
        }
      }
      const popup = openCenteredPopup(url);
      if (popup) {
        connectPopupRef.current = popup;
        markShopifyConnectPopupWindow(popup, normalized);
        if (normalized) {
          setPendingShopifyConnect(normalized);
          try {
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(
                `${SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX}:${normalized}`,
                String(Date.now())
              );
            }
          } catch {
            // ignore storage errors
          }
        }
        return true;
      }
      // Browser blocked popup/new-tab. Fallback to in-app connection gate instead
      // of redirecting main tab to an auth page.
      setPendingShopifyConnect(null);
      if (normalized) {
        openDomainApp(normalized);
      }
      return false;
    },
    [openDomainApp]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = event => {
      try {
        if (event?.data?.type !== OAUTH_SUCCESS_MESSAGE_TYPE) return;
        if (
          event.origin &&
          event.origin !== window.location.origin &&
          !String(event.origin).includes('shopify.com')
        ) {
          return;
        }
        const shop = normalizeShopifyDomain(event?.data?.shop || '');
        if (!shop) return;
        if (pendingShopifyConnect && shop !== normalizeShopifyDomain(pendingShopifyConnect)) {
          return;
        }
        verifyConnectedAndOpen(shop);
      } catch {
        // ignore malformed messages
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [pendingShopifyConnect, verifyConnectedAndOpen]);

  useEffect(() => {
    if (!pendingShopifyConnect) {
      pendingConnectStartedRef.current = 0;
      return undefined;
    }
    if (!pendingConnectStartedRef.current) {
      pendingConnectStartedRef.current = Date.now();
    }
    const clearPendingConnect = () => {
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(
            `${SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX}:${pendingShopifyConnect}`
          );
        }
      } catch {
        // ignore storage errors
      }
      pendingConnectStartedRef.current = 0;
      setPendingShopifyConnect(null);
    };
    const tick = async () => {
      if (
        pendingConnectStartedRef.current &&
        Date.now() - pendingConnectStartedRef.current > PENDING_CONNECT_MAX_MS
      ) {
        clearPendingConnect();
        return;
      }
      const done = await verifyConnectedAndOpen(pendingShopifyConnect);
      if (done) return;
      if (connectPopupRef.current && connectPopupRef.current.closed) {
        const retried = await verifyConnectedAndOpen(pendingShopifyConnect);
        if (!retried) {
          clearPendingConnect();
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 1800);
    return () => window.clearInterval(timer);
  }, [pendingShopifyConnect, verifyConnectedAndOpen]);

  useEffect(() => {
    if (typeof window === 'undefined' || !pendingShopifyConnect) return undefined;
    const normalized = normalizeShopifyDomain(pendingShopifyConnect);
    const closeSignalKey = `${SHOPIFY_CONNECT_POPUP_CLOSE_SIGNAL_KEY_PREFIX}:${normalized}`;
    const onStorage = event => {
      if (event.key !== closeSignalKey || !event.newValue) return;
      verifyConnectedAndOpen(normalized);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [pendingShopifyConnect, verifyConnectedAndOpen]);

  useEffect(
    () => () => {
      try {
        if (connectPopupRef.current && !connectPopupRef.current.closed) {
          connectPopupRef.current.close();
        }
      } catch {
        // ignore popup close errors
      }
    },
    []
  );

  const handleOpenApp = async domainRow => {
    const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
    if (!domain || openingDomain) return;
    setOpeningDomain(domain);
    const openingTimeout = window.setTimeout(() => {
      setOpeningDomain(current => (current === domain ? null : current));
    }, OPEN_DOMAIN_TIMEOUT_MS);
    const isShopify = isShopifyStoreDomain(domain);
    const normalized = isShopify ? normalizeShopifyDomain(domain) : domain;
    const key = accountKey || (domainKeys && (domainKeys[domain] || domainKeys[normalized]));
    try {
      if (isShopify) {
        const gesturePopup = openCenteredPopup('about:blank');
        if (gesturePopup) {
          markShopifyConnectPopupWindow(gesturePopup, normalized);
          connectPopupRef.current = gesturePopup;
        }
        if (key) {
          try {
            window.localStorage.setItem(STORAGE_KEYS.API_KEY, key);
          } catch {
            // ignore localStorage errors
          }
        }
        const alreadyConnected = await verifyConnectedAndOpen(normalized);
        if (alreadyConnected) {
          if (gesturePopup && !gesturePopup.closed) {
            try {
              gesturePopup.close();
            } catch {
              // ignore popup close errors
            }
          }
          return;
        }
        try {
          const oauth = await resolveShopifyOAuthUrl(normalized);
          if (oauth.oauthWarning) {
            setOauthNotice(oauth.oauthWarning);
          }
          if (oauth.url) {
            openShopifyConnectPopup(oauth.url, normalized, gesturePopup);
            return;
          }
          if (oauth.error) {
            setOauthNotice(oauth.error);
          }
          if (oauth.signInRequired) {
            const connectUrl = getConnectUrl({
              shop: normalized,
              reason: ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
            });
            openShopifyConnectPopup(connectUrl, normalized, gesturePopup);
            return;
          }
        } catch (err) {
          if (err?.response?.status === 401) {
            const connectUrl = getConnectUrl({
              shop: normalized,
              reason: ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
            });
            openShopifyConnectPopup(connectUrl, normalized, gesturePopup);
            return;
          } else {
            if (gesturePopup && !gesturePopup.closed) {
              try {
                gesturePopup.close();
              } catch {
                // ignore popup close errors
              }
            }
            if (isEmbeddedInIframe()) {
              window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalized), {
                shop: normalized,
              });
            } else {
              navigate(ROUTES.appDashboard(normalized));
            }
          }
        }
        return;
      }
      if (!key) return;
      try {
        window.localStorage.setItem(STORAGE_KEYS.API_KEY, key);
        setCurrentStore(domain);
        if (isEmbeddedInIframe()) {
          window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(domain), {
            shop: domain,
          });
        } else {
          navigate(ROUTES.appDashboard(domain));
        }
      } catch {
        // ignore localStorage errors
      }
    } finally {
      window.clearTimeout(openingTimeout);
      setOpeningDomain(null);
    }
  };
  handleOpenAppRef.current = handleOpenApp;

  if (isLoading) {
    return (
      <PageShell className={styles.panelPage}>
        <div className={styles.appCanvas}>
          <header className={styles.commandHeader}>
            <div className={styles.commandHeaderBg} aria-hidden="true">
              <div className={styles.heroGradient} />
              <div className={styles.heroGrid} />
            </div>
            <div className={styles.commandHeaderInner}>
              <div className={styles.loadingWrap}>
                <Spinner accessibilityLabel="Loading" size="large" />
              </div>
            </div>
          </header>
        </div>
      </PageShell>
    );
  }

  const focusTitle =
    domainCount === 0
      ? 'Connect your first domain'
      : needsAttentionCount > 0
        ? 'Finish store setup'
        : storefrontSetupAttentionCount > 0
          ? 'Complete storefront setup'
          : 'Open a store and start testing';
  const focusText =
    domainCount === 0
      ? 'Add a Shopify store or standalone site to unlock experiments and analytics.'
      : needsAttentionCount > 0
        ? `${needsAttentionCount} Shopify ${needsAttentionCount === 1 ? 'store needs' : 'stores need'} install, link, or access review.`
        : storefrontSetupAttentionCount > 0
          ? `${storefrontSetupAttentionCount} ${storefrontSetupAttentionCount === 1 ? 'store needs' : 'stores need'} App Proxy or theme embed setup before tests can run on the storefront.`
          : permissionsAttentionCount > 0
            ? `${permissionsAttentionCount} ${permissionsAttentionCount === 1 ? 'store has' : 'stores have'} optional permission updates. You can still open and run tests.`
            : 'Your connected stores are ready. Choose a domain to create or review tests.';
  const focusActionLabel =
    domainCount === 0 ? 'Add domain' : needsAttentionCount > 0 ? 'Review domains' : 'Open domains';

  return (
    <PageShell className={styles.panelPage}>
      <div className={styles.appCanvas}>
        <header className={styles.commandHeader}>
          <div className={styles.commandHeaderBg} aria-hidden="true">
            <div className={styles.heroGradient} />
            <div className={styles.heroGrid} />
            <div className={styles.heroOrb1} />
            <div className={styles.heroOrb2} />
          </div>
          <div className={styles.commandHeaderInner}>
            <div className={styles.commandHeaderMain}>
              <div className={styles.commandHeaderBrand}>
                <div className={styles.commandHeaderBrandTop}>
                  <p className={styles.heroGreeting}>{greeting}</p>
                  <span
                    className={`${styles.systemStatus} ${
                      systemStatus.tone === 'warning'
                        ? styles.systemStatusWarning
                        : systemStatus.tone === 'attention'
                          ? styles.systemStatusAttention
                          : styles.systemStatusOk
                    }`}
                    role="status"
                  >
                    <span className={styles.systemStatusDot} aria-hidden="true" />
                    {systemStatus.label}
                  </span>
                </div>
                <h1 className={styles.heroTitle}>
                  <span className={styles.heroTitleAccent}>RipX</span>
                  <span className={styles.heroTitleSuffix}> command center</span>
                </h1>
                <p className={styles.heroSubtitle}>
                  {userEmail ? (
                    <>
                      Signed in as <strong>{userEmail}</strong>
                    </>
                  ) : (
                    'Launch tests, review setup, and manage stores from one workspace.'
                  )}
                </p>
              </div>
              <div className={styles.telemetryStrip} aria-label="Account telemetry">
                <div className={styles.telemetryChip}>
                  <span className={styles.telemetryLabel}>Domains</span>
                  <span className={styles.telemetryValue}>{domainCount}</span>
                </div>
                <div className={styles.telemetryChip}>
                  <span className={styles.telemetryLabel}>Shopify</span>
                  <span className={styles.telemetryValue}>
                    {connectedShopifyCount}/{shopifyDomains.length || 0}
                  </span>
                </div>
                <div className={styles.telemetryChip}>
                  <span className={styles.telemetryLabel}>Standalone</span>
                  <span className={styles.telemetryValue}>{standaloneCount}</span>
                </div>
                <div
                  className={`${styles.telemetryChip} ${
                    needsAttentionCount > 0 || storefrontSetupAttentionCount > 0
                      ? styles.telemetryChipAlert
                      : ''
                  }`}
                >
                  <span className={styles.telemetryLabel}>Attention</span>
                  <span className={styles.telemetryValue}>
                    {needsAttentionCount + storefrontSetupAttentionCount}
                  </span>
                </div>
              </div>
            </div>
            <div className={styles.commandToolbar} aria-label="Quick navigation">
              <button
                type="button"
                className={styles.toolbarChip}
                onClick={() => {
                  setCommandQuery('');
                  setCommandSelected(0);
                  setCommandPaletteOpen(true);
                  setTimeout(() => commandInputRef.current?.focus(), 50);
                }}
              >
                <Icon source={SearchIcon} tone="base" />
                <span>Quick actions</span>
                <kbd className={styles.toolbarKbd}>⌘K</kbd>
              </button>
              {canAddDomains && (
                <Link
                  to={getNavigateToWithEmbed(ROUTES.DOMAINS, { action: 'add' })}
                  className={styles.toolbarChip}
                >
                  <Icon source={PlusIcon} tone="base" />
                  <span>Add domain</span>
                </Link>
              )}
              <Link to={getNavigateToWithEmbed(ROUTES.DOMAINS)} className={styles.toolbarChip}>
                <Icon source={GlobeIcon} tone="base" />
                <span>Domains</span>
              </Link>
              {isAdmin && (
                <Link to={getNavigateToWithEmbed(ROUTES.ADMIN)} className={styles.toolbarChip}>
                  <Icon source={SettingsIcon} tone="base" />
                  <span>Admin</span>
                </Link>
              )}
              {domainCount === 0 ? (
                <Link to={ROUTES.DOMAINS} className={styles.toolbarChipPrimary}>
                  Get started
                  <Icon source={ChevronRightIcon} tone="subdued" />
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <div className={styles.appContent}>
          {showOAuthAlignmentWarning ? (
            <div className={styles.oauthNoticeWrap}>
              <Banner
                tone="warning"
                title="Shopify install URL alignment required"
                onDismiss={() => setOauthNotice(null)}
              >
                <p className={styles.oauthNoticeText}>
                  {oauthNotice ||
                    oauthConfig?.mismatchWarning ||
                    'OAuth redirect host must match your Shopify Partner Dashboard Application URL.'}
                </p>
                {oauthConfig?.partnerDashboard?.applicationUrl && (
                  <p className={styles.oauthNoticeMeta}>
                    Application URL: {oauthConfig.partnerDashboard.applicationUrl}
                    <br />
                    Redirect URL: {oauthConfig.partnerDashboard.allowedRedirectionUrl}
                  </p>
                )}
              </Banner>
            </div>
          ) : null}
          {oauthConfig?.tunnelDevHint && !tunnelHintDismissed ? (
            <div className={styles.oauthNoticeWrap}>
              <Banner tone="info" title="Local dev tunnel" onDismiss={dismissTunnelDevHint}>
                <p className={styles.oauthNoticeText}>{oauthConfig.tunnelDevHint}</p>
                {oauthConfig?.partnerDashboard?.applicationUrl && (
                  <p className={styles.oauthNoticeMeta}>
                    Application URL: {oauthConfig.partnerDashboard.applicationUrl}
                    <br />
                    Redirect URL: {oauthConfig.partnerDashboard.allowedRedirectionUrl}
                  </p>
                )}
              </Banner>
            </div>
          ) : null}

          <div className={styles.dashboardGrid}>
            <div className={styles.dashboardMain}>
              {error && (
                <div className={styles.bannerWrap}>
                  <Banner tone="critical" onDismiss={() => {}}>
                    {error?.message || 'Failed to load your data. Try refreshing.'}
                  </Banner>
                </div>
              )}

              {domains.length === 0 ? (
                <Card className={styles.emptyCard}>
                  <div className={styles.emptyCardInner}>
                    <div className={styles.emptyIconWrap}>
                      <span className={styles.emptyIcon}>
                        <Icon source={GlobeIcon} tone="base" />
                      </span>
                    </div>
                    <h2 className={styles.emptyTitle}>No domains yet</h2>
                    <p className={styles.emptyDesc}>
                      Connect a store or site to run A/B tests, track conversions, and analyze
                      results.
                    </p>
                    <div className={styles.emptyActions}>
                      <Button url={ROUTES.DOMAINS} variant="primary" size="large" icon={GlobeIcon}>
                        Add domain
                      </Button>
                      <a
                        href={ROUTES.DOCS}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.emptyLink}
                      >
                        Learn how to connect
                      </a>
                    </div>
                  </div>
                </Card>
              ) : (
                <section className={styles.domainsSection} aria-labelledby="domains-heading">
                  <div className={styles.domainsSectionCard}>
                    <div className={styles.domainsSectionHeader}>
                      <div className={styles.domainsSectionTitleWrap}>
                        <div className={styles.domainsSectionTitleRow}>
                          <span className={styles.domainsSectionIcon} aria-hidden="true">
                            <Icon source={GlobeIcon} tone="base" />
                          </span>
                          <div>
                            <h2 id="domains-heading" className={styles.domainsSectionTitle}>
                              Your domains
                            </h2>
                            <p className={styles.domainsSectionDesc}>
                              Open a store workspace or finish setup inline.
                            </p>
                          </div>
                        </div>
                        <div
                          className={styles.domainsSectionPills}
                          aria-label="Domain status summary"
                        >
                          <span>{connectedShopifyCount} Shopify ready</span>
                          {needsAttentionCount > 0 && <span>{needsAttentionCount} need setup</span>}
                          {storefrontSetupAttentionCount > 0 && (
                            <span>{storefrontSetupAttentionCount} need storefront setup</span>
                          )}
                          {standaloneCount > 0 && <span>{standaloneCount} standalone</span>}
                        </div>
                      </div>
                      <Link to={ROUTES.DOMAINS} className={styles.domainsSectionPrimaryAction}>
                        Manage
                        <Icon source={ChevronRightIcon} tone="subdued" />
                      </Link>
                    </div>
                    <div className={styles.domainsSectionControls}>
                      <div className={styles.domainSearchWrap}>
                        <Icon source={SearchIcon} tone="subdued" />
                        <input
                          type="search"
                          value={domainSearch}
                          onChange={event => setDomainSearch(event.target.value)}
                          placeholder="Search domains…"
                          className={styles.domainSearchInput}
                          aria-label="Search domains"
                        />
                      </div>
                      <div
                        className={styles.domainFilterTabs}
                        role="tablist"
                        aria-label="Filter domains"
                      >
                        {DOMAIN_FILTERS.map(filter => {
                          const count = filterCounts[filter.id] ?? 0;
                          return (
                            <button
                              key={filter.id}
                              type="button"
                              role="tab"
                              aria-selected={domainFilter === filter.id}
                              className={`${styles.domainFilterTab} ${
                                domainFilter === filter.id ? styles.domainFilterTabActive : ''
                              }`}
                              onClick={() => setDomainFilter(filter.id)}
                            >
                              {filter.label}
                              <span className={styles.domainFilterTabCount}>{count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className={styles.domainListHeader} aria-hidden="true">
                      <span className={styles.domainListHeaderStore}>Store</span>
                      <span className={styles.domainListHeaderSetup}>Setup progress</span>
                      <span className={styles.domainListHeaderActions}>Actions</span>
                    </div>
                    <div className={styles.domainList}>
                      {displayDomains.length === 0 ? (
                        <div className={styles.domainListEmpty}>
                          <p>No domains match this filter.</p>
                          <Button
                            variant="plain"
                            onClick={() => {
                              setDomainFilter('all');
                              setDomainSearch('');
                            }}
                          >
                            Clear filters
                          </Button>
                        </div>
                      ) : null}
                      {displayDomains.map((entry, index) => {
                        const {
                          domain,
                          platform,
                          isShopify,
                          installState,
                          setupSummary,
                          setupSteps,
                          canOpen,
                          setupPercent,
                          pendingSteps,
                          statusLabel,
                          needsScopeUpdate,
                          isShopifyReady,
                        } = entry;
                        const isPinned = pinnedDomains.has(domain);
                        const isRecent =
                          normalizeShopifyDomain(domain) === recentStoreDomain && recentStoreDomain;
                        const presentation = entry.presentation;
                        const statusClass =
                          presentation.statusTone === 'connected'
                            ? styles.domainTileStatusConnected
                            : presentation.statusTone === 'checking'
                              ? styles.domainTileStatusChecking
                              : styles.domainTileStatusDisconnected;
                        const primaryCtaLabel = getShopifyDomainPrimaryCtaLabel({
                          installState,
                          isShopifyReady,
                          canOpen,
                          isConnecting:
                            openingDomain === domain ||
                            (pendingShopifyConnect &&
                              normalizeShopifyDomain(pendingShopifyConnect) ===
                                normalizeShopifyDomain(domain)),
                        });
                        const isExpanded = expandedDomains.has(domain);
                        const hasSetupDetails =
                          isShopify && setupSteps.length > 0 && setupSummary.pendingCount > 0;
                        return (
                          <div
                            key={domain}
                            className={`${styles.domainRow} ${isExpanded ? styles.domainRowExpanded : ''} ${
                              isPinned ? styles.domainRowPinned : ''
                            } ${isRecent ? styles.domainRowRecent : ''}`}
                            style={{ animationDelay: `${index * 40}ms` }}
                          >
                            <div className={styles.domainRowIdentity}>
                              {hasSetupDetails ? (
                                <button
                                  type="button"
                                  className={`${styles.domainRowExpand} ${
                                    isExpanded ? styles.domainRowExpandOpen : ''
                                  }`}
                                  onClick={() => toggleDomainExpanded(domain)}
                                  aria-expanded={isExpanded}
                                  aria-label={`${isExpanded ? 'Hide' : 'Show'} setup details for ${domain}`}
                                >
                                  <span
                                    className={`${styles.domainRowExpandIcon} ${
                                      isExpanded ? styles.domainRowExpandIconOpen : ''
                                    }`}
                                    aria-hidden="true"
                                  >
                                    <Icon source={ChevronRightIcon} tone="subdued" />
                                  </span>
                                </button>
                              ) : (
                                <span className={styles.domainRowExpandSpacer} aria-hidden="true" />
                              )}
                              {isShopify && setupSummary.total > 0 ? (
                                <SetupProgressRing
                                  percent={setupPercent}
                                  size={36}
                                  label={`Setup ${setupPercent}% complete for ${domain}`}
                                />
                              ) : (
                                <span className={styles.domainRowIcon} aria-hidden="true">
                                  <Icon source={GlobeIcon} tone="subdued" />
                                </span>
                              )}
                              <div className={styles.domainRowMeta}>
                                <div className={styles.domainRowHeader}>
                                  <div className={styles.domainRowHeaderMain}>
                                    <span className={styles.domainRowName}>{domain}</span>
                                    <div className={styles.domainRowHeaderTags}>
                                      {isPinned ? (
                                        <span className={styles.domainRowBadgePinned}>Pinned</span>
                                      ) : null}
                                      {isRecent ? (
                                        <span className={styles.domainRowBadgeRecent}>Recent</span>
                                      ) : null}
                                      {platform && platform !== 'shopify' ? (
                                        <span className={styles.domainTileBadge}>{platform}</span>
                                      ) : isShopify ? (
                                        <span className={styles.domainTileBadgeShopify}>
                                          Shopify
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className={`${styles.domainPinButton} ${
                                      isPinned ? styles.domainPinButtonActive : ''
                                    }`}
                                    onClick={() => togglePinDomain(domain)}
                                    aria-label={isPinned ? `Unpin ${domain}` : `Pin ${domain}`}
                                    title={isPinned ? 'Unpin' : 'Pin to top'}
                                  >
                                    {isPinned ? '★' : '☆'}
                                  </button>
                                </div>
                                <div className={styles.domainRowStatusLine}>
                                  <span
                                    className={statusClass}
                                    title={
                                      isShopify && installState !== 'connected'
                                        ? getShopifyInstallMessage(domain) || undefined
                                        : undefined
                                    }
                                  >
                                    {statusLabel}
                                  </span>
                                  {isShopify && setupSummary.total > 0 ? (
                                    <span className={styles.domainSetupFraction}>
                                      {setupSummary.complete}/{setupSummary.total} setup
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            {isShopify && setupSummary.total > 0 ? (
                              <div
                                className={styles.domainSetupProgress}
                                aria-label={`Setup ${setupPercent}% complete for ${domain}`}
                              >
                                <div className={styles.domainSetupProgressTrack}>
                                  <span style={{ width: `${setupPercent}%` }} />
                                </div>
                                {setupSummary.pendingCount > 0 && setupSummary.nextStep ? (
                                  <p className={styles.domainSetupHint}>
                                    Next: {setupSummary.nextStep.label}
                                  </p>
                                ) : null}
                                {!isExpanded &&
                                pendingSteps.length > 0 &&
                                pendingSteps.length <= 4 ? (
                                  <ul
                                    className={styles.domainSetupChecklistCompact}
                                    aria-label={`Pending setup for ${domain}`}
                                  >
                                    {pendingSteps.slice(0, 2).map(step => (
                                      <li key={step.id}>{step.label}</li>
                                    ))}
                                  </ul>
                                ) : null}
                              </div>
                            ) : null}

                            {isExpanded && isShopify && setupSteps.length > 0 ? (
                              <div className={styles.domainRowDetails}>
                                <ul
                                  className={styles.domainSetupChecklist}
                                  aria-label={`Setup progress for ${domain}`}
                                >
                                  {setupSteps.map(step => (
                                    <li
                                      key={step.id}
                                      className={
                                        step.complete
                                          ? styles.domainSetupStepComplete
                                          : styles.domainSetupStepPending
                                      }
                                    >
                                      <span
                                        className={styles.domainSetupStepMarker}
                                        aria-hidden="true"
                                      >
                                        {step.complete ? '✓' : '○'}
                                      </span>
                                      <span>{step.label}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}

                            <div className={styles.domainRowActions}>
                              {canOpen ? (
                                <>
                                  <Button
                                    variant="primary"
                                    size="slim"
                                    icon={ExternalIcon}
                                    onClick={() => handleOpenApp({ domain })}
                                    className={styles.domainTileCta}
                                    loading={
                                      openingDomain === domain ||
                                      (pendingShopifyConnect &&
                                        normalizeShopifyDomain(pendingShopifyConnect) ===
                                          normalizeShopifyDomain(domain))
                                    }
                                    disabled={
                                      !!openingDomain &&
                                      openingDomain !== domain &&
                                      normalizeShopifyDomain(openingDomain) !==
                                        normalizeShopifyDomain(domain)
                                    }
                                  >
                                    {primaryCtaLabel}
                                  </Button>
                                  {isShopifyReady &&
                                  setupSummary.pendingCount > 0 &&
                                  installState !== 'needs_install' &&
                                  installState !== 'needs_link' ? (
                                    <Button
                                      variant="plain"
                                      size="slim"
                                      url={ROUTES.appSetup(normalizeShopifyDomain(domain))}
                                      className={styles.domainTileSecondaryCta}
                                    >
                                      Setup
                                    </Button>
                                  ) : null}
                                  {needsScopeUpdate ? (
                                    <Button
                                      variant="plain"
                                      size="slim"
                                      onClick={() => handleOpenApp({ domain })}
                                      className={styles.domainTileSecondaryCta}
                                    >
                                      Permissions
                                    </Button>
                                  ) : null}
                                </>
                              ) : (
                                <Button
                                  variant="plain"
                                  size="slim"
                                  icon={LinkIcon}
                                  url={ROUTES.DOMAINS}
                                  className={styles.domainTileCta}
                                >
                                  Connect
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}
            </div>

            <aside className={styles.dashboardRail} aria-label="Workspace shortcuts">
              {resumeDomainEntry ? (
                <section className={styles.resumeCard} aria-label="Resume last workspace">
                  <span className={styles.resumeCardEyebrow}>Continue</span>
                  <h2 className={styles.resumeCardTitle}>{resumeDomainEntry.domain}</h2>
                  <p className={styles.resumeCardText}>
                    Pick up where you left off in your last opened store workspace.
                  </p>
                  <Button
                    variant="primary"
                    size="slim"
                    icon={ExternalIcon}
                    onClick={() => handleOpenApp({ domain: resumeDomainEntry.domain })}
                    loading={
                      openingDomain === resumeDomainEntry.domain ||
                      (pendingShopifyConnect &&
                        normalizeShopifyDomain(pendingShopifyConnect) ===
                          normalizeShopifyDomain(resumeDomainEntry.domain))
                    }
                  >
                    Resume workspace
                  </Button>
                </section>
              ) : null}

              {portfolioSetup ? (
                <section className={styles.portfolioHealth} aria-label="Portfolio setup health">
                  <div className={styles.portfolioHealthHeader}>
                    <span className={styles.portfolioHealthLabel}>Portfolio setup</span>
                    <strong className={styles.portfolioHealthValue}>
                      {portfolioSetup.percent}%
                    </strong>
                  </div>
                  <div className={styles.portfolioHealthTrack} aria-hidden="true">
                    <span style={{ width: `${portfolioSetup.percent}%` }} />
                  </div>
                  <p className={styles.portfolioHealthMeta}>
                    {portfolioSetup.complete}/{portfolioSetup.total} required steps complete across
                    Shopify stores
                  </p>
                </section>
              ) : null}

              <section className={styles.focusPanel} aria-label="Recommended next step">
                <div className={styles.focusPanelMain}>
                  <span className={styles.focusPanelEyebrow}>Recommended</span>
                  <h2 className={styles.focusPanelTitle}>{focusTitle}</h2>
                  <p className={styles.focusPanelText}>{focusText}</p>
                </div>
                <Link to={ROUTES.DOMAINS} className={styles.focusPanelAction}>
                  {focusActionLabel}
                  <Icon source={ChevronRightIcon} tone="subdued" />
                </Link>
              </section>

              <nav className={styles.accountSection} aria-label="Account">
                <h2 className={styles.accountSectionTitle}>Account</h2>
                <div className={styles.accountRail}>
                  {ACCOUNT_TILES.map(({ to, icon: IconSrc, label, external }) => {
                    const content = (
                      <>
                        <span className={styles.accountRailIcon}>
                          <Icon source={IconSrc} tone="base" />
                        </span>
                        <span className={styles.accountRailLabel}>{label}</span>
                        <Icon source={ChevronRightIcon} tone="subdued" />
                      </>
                    );
                    return external ? (
                      <a
                        key={to}
                        href={to}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.accountRailLink}
                      >
                        {content}
                      </a>
                    ) : (
                      <Link key={to} to={to} className={styles.accountRailLink}>
                        {content}
                      </Link>
                    );
                  })}
                </div>
              </nav>
            </aside>
          </div>

          <footer className={styles.appFooter}>
            <LegalFooter />
          </footer>
        </div>
      </div>

      {commandPaletteOpen ? (
        <div
          className={styles.commandPaletteOverlay}
          onClick={() => setCommandPaletteOpen(false)}
          role="presentation"
        >
          <div
            className={styles.commandPalette}
            onClick={event => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command center quick actions"
          >
            <div className={styles.commandPaletteSearch}>
              <input
                ref={commandInputRef}
                type="text"
                value={commandQuery}
                onChange={event => setCommandQuery(event.target.value)}
                placeholder="Search actions or stores…"
                className={styles.commandPaletteInput}
                aria-label="Search command palette"
              />
            </div>
            <div className={styles.commandPaletteList}>
              {filteredCommandItems.length === 0 ? (
                <div className={styles.commandPaletteEmpty}>No results</div>
              ) : (
                filteredCommandItems.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.commandPaletteItem} ${
                      index === safeCommandSelected ? styles.commandPaletteItemActive : ''
                    }`}
                    onClick={() => item.onSelect?.()}
                    onMouseEnter={() => setCommandSelected(index)}
                  >
                    <span>
                      {item.label}
                      {item.sublabel ? (
                        <span className={styles.commandPaletteSublabel}>{item.sublabel}</span>
                      ) : null}
                    </span>
                    {item.shortcut ? (
                      <kbd className={styles.commandPaletteKbd}>⌘{item.shortcut}</kbd>
                    ) : null}
                  </button>
                ))
              )}
            </div>
            <div className={styles.commandPaletteFooter}>
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export default UserPanel;
