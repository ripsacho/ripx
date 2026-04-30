/**
 * User Panel – command-center layout after login.
 * Drastic layout: full hero with orbs, stats strip, account tiles, staggered domain cards.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
} from '@shopify/polaris-icons';
import { PageShell, LegalFooter } from '../Shared';
import { ROUTES, STORAGE_KEYS } from '../../constants';
import {
  apiMeGet,
  apiGet,
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
import { useAdminMe, useShopifyInstallStatus } from '../../hooks';
import { OAUTH_SUCCESS_MESSAGE_TYPE } from '../Connect/OAuthSuccess';
import styles from './UserPanel.module.css';

const SHOPIFY_CONNECT_POPUP_CLOSE_SIGNAL_KEY_PREFIX = 'ripx-shopify-connect-close';
const SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX = 'ripx-shopify-connect-popup-active';
const SHOPIFY_CONNECT_POPUP_SESSION_KEY = 'ripx-shopify-connect-popup-session';
const CONNECT_POPUP_WINDOW_NAME = 'ripx-shopify-connect';

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

const ACCOUNT_TILES = [
  { to: ROUTES.PROFILE, icon: ProfileIcon, label: 'Profile', desc: 'Theme & preferences' },
  {
    to: ROUTES.SETTINGS,
    icon: SettingsIcon,
    label: 'Settings',
    desc: 'Installation hub & account settings',
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
  const { statusByShop: shopifyInstallStatus } = useShopifyInstallStatus(domains, 'user-panel');
  const greeting = getTimeGreeting();
  const userEmail = !meError && (meData?.email || meData?.user?.email);
  const domainCount = domains.length;

  const accountKey = getAccountApiKey();
  const domainKeys = getDomainKeys();
  const [openingDomain, setOpeningDomain] = useState(null);
  const connectPopupRef = useRef(null);
  const connectVerifyLockRef = useRef(false);
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
      if (!normalized || connectVerifyLockRef.current) {
        return false;
      }
      connectVerifyLockRef.current = true;
      try {
        const status = await fetchShopifyConnectionStatus(normalized);
        const connected = Boolean(status?.connected);
        if (connected) {
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
        connectVerifyLockRef.current = false;
      }
    },
    [openDomainApp]
  );

  const getShopifyInstallState = useCallback(
    domainValue => {
      if (!isShopifyStoreDomain(domainValue)) return null;
      const normalized = normalizeShopifyDomain(domainValue);
      if (openingDomain === domainValue || openingDomain === normalized) return 'checking';
      return shopifyInstallStatus?.[normalized] || 'unknown';
    },
    [openingDomain, shopifyInstallStatus]
  );
  const shopifyDomains = domains.filter(domainRow =>
    isShopifyStoreDomain(typeof domainRow === 'string' ? domainRow : domainRow?.domain)
  );
  const connectedShopifyCount = shopifyDomains.filter(domainRow => {
    const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
    return getShopifyInstallState(domain) === 'connected';
  }).length;
  const needsAttentionCount = shopifyDomains.filter(domainRow => {
    const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
    const state = getShopifyInstallState(domain);
    return ['needs_install', 'needs_link', 'restricted'].includes(state);
  }).length;
  const standaloneCount = Math.max(0, domainCount - shopifyDomains.length);

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
    if (!pendingShopifyConnect) return undefined;
    const tick = async () => {
      const done = await verifyConnectedAndOpen(pendingShopifyConnect);
      if (done) return;
      if (connectPopupRef.current && connectPopupRef.current.closed) {
        const retried = await verifyConnectedAndOpen(pendingShopifyConnect);
        if (!retried) {
          try {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem(
                `${SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX}:${pendingShopifyConnect}`
              );
            }
          } catch {
            // ignore storage errors
          }
          setPendingShopifyConnect(null);
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 1800);
    return () => window.clearInterval(timer);
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
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          try {
            const startRes = await apiGet('/auth/start', {
              shop: normalized,
              callback_base: origin || undefined,
            });
            const url = unwrapData(startRes)?.redirectUrl;
            if (url) {
              openShopifyConnectPopup(url, normalized, gesturePopup);
              return;
            }
          } catch {
            /* fallback to same-origin OAuth (cookie may be set) */
          }
          const fallbackUrl = `${origin}/api/auth?shop=${encodeURIComponent(normalized)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
          openShopifyConnectPopup(fallbackUrl, normalized, gesturePopup);
        } catch (err) {
          if (err?.response?.status === 401) {
            const connectUrl = getConnectUrl({
              shop: normalized,
              reason: ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
            });
            openShopifyConnectPopup(connectUrl, normalized, gesturePopup);
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
      setOpeningDomain(null);
    }
  };

  if (isLoading) {
    return (
      <PageShell className={styles.panelPage}>
        <div className={styles.appCanvas}>
          <div className={styles.hero}>
            <div className={styles.heroGradient} />
            <div className={styles.heroGrid} aria-hidden="true" />
            <div className={styles.heroOrb1} aria-hidden="true" />
            <div className={styles.heroOrb2} aria-hidden="true" />
            <div className={styles.heroContent}>
              <div className={styles.loadingWrap}>
                <Spinner accessibilityLabel="Loading" size="large" />
              </div>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className={styles.panelPage}>
      <div className={styles.appCanvas}>
        {/* Hero – full impact */}
        <header className={styles.hero}>
          <div className={styles.heroGradient} />
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroOrb1} aria-hidden="true" />
          <div className={styles.heroOrb2} aria-hidden="true" />
          <div className={styles.heroContent}>
            <p className={styles.heroGreeting}>{greeting}</p>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitleAccent}>RipX</span>
              <span className={styles.heroTitleSuffix}> command center</span>
            </h1>
            <p className={styles.heroSubtitle}>
              {userEmail ? (
                <>
                  Signed in as <strong>{userEmail}</strong>. Pick a store, launch a test, or finish
                  setup from one place.
                </>
              ) : (
                'Pick a store, launch a test, or finish setup from one place.'
              )}
            </p>
            <div className={styles.heroInsightGrid} aria-label="Account overview">
              <div className={styles.heroInsightCard}>
                <span className={styles.heroInsightLabel}>Portfolio</span>
                <span className={styles.heroInsightValue}>{domainCount}</span>
                <span className={styles.heroInsightHint}>
                  {domainCount === 1 ? 'domain connected' : 'domains connected'}
                </span>
              </div>
              <div className={styles.heroInsightCard}>
                <span className={styles.heroInsightLabel}>Shopify</span>
                <span className={styles.heroInsightValue}>
                  {connectedShopifyCount}/{shopifyDomains.length}
                </span>
                <span className={styles.heroInsightHint}>stores ready</span>
              </div>
              <div
                className={`${styles.heroInsightCard} ${
                  needsAttentionCount > 0 ? styles.heroInsightCardAttention : ''
                }`}
              >
                <span className={styles.heroInsightLabel}>Action needed</span>
                <span className={styles.heroInsightValue}>{needsAttentionCount}</span>
                <span className={styles.heroInsightHint}>
                  {needsAttentionCount === 1 ? 'store to review' : 'stores to review'}
                </span>
              </div>
            </div>
            <div className={styles.quickActions}>
              <Link to={getNavigateToWithEmbed(ROUTES.DOMAINS)} className={styles.quickActionCard}>
                <span className={styles.quickActionIcon}>
                  <Icon source={GlobeIcon} tone="base" />
                </span>
                <span className={styles.quickActionText}>
                  <span className={styles.quickActionLabel}>Domains</span>
                  <span className={styles.quickActionDesc}>Stores &amp; sites</span>
                </span>
                <span className={styles.quickActionArrow}>
                  <Icon source={ChevronRightIcon} tone="subdued" />
                </span>
              </Link>
              {isAdmin && (
                <Link to={getNavigateToWithEmbed(ROUTES.ADMIN)} className={styles.quickActionCard}>
                  <span className={styles.quickActionIcon}>
                    <Icon source={SettingsIcon} tone="base" />
                  </span>
                  <span className={styles.quickActionText}>
                    <span className={styles.quickActionLabel}>Admin</span>
                    <span className={styles.quickActionDesc}>System &amp; users</span>
                  </span>
                  <span className={styles.quickActionArrow}>
                    <Icon source={ChevronRightIcon} tone="subdued" />
                  </span>
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* Stats strip – count only when domains exist; single CTA when empty */}
        <div className={styles.statsStrip}>
          <div className={styles.statsItem}>
            <span className={styles.statsValue}>{domainCount}</span>
            <span className={styles.statsLabel}>{domainCount === 1 ? 'Domain' : 'Domains'}</span>
          </div>
          <div className={styles.statsDivider} aria-hidden="true" />
          <div className={styles.statsItem}>
            <span className={styles.statsValue}>{shopifyDomains.length}</span>
            <span className={styles.statsLabel}>Shopify</span>
          </div>
          <div className={styles.statsDivider} aria-hidden="true" />
          <div className={styles.statsItem}>
            <span className={styles.statsValue}>{standaloneCount}</span>
            <span className={styles.statsLabel}>Standalone</span>
          </div>
          {domainCount === 0 ? (
            <>
              <Link to={ROUTES.DOMAINS} className={styles.statsCta}>
                Add your first domain
                <Icon source={ChevronRightIcon} tone="subdued" />
              </Link>
            </>
          ) : null}
        </div>

        <div className={styles.appContent}>
          <section className={styles.focusPanel} aria-label="Recommended next step">
            <div className={styles.focusPanelMain}>
              <span className={styles.focusPanelEyebrow}>Recommended</span>
              <h2 className={styles.focusPanelTitle}>
                {domainCount === 0
                  ? 'Connect your first domain'
                  : needsAttentionCount > 0
                    ? 'Finish store setup'
                    : 'Open a store and start testing'}
              </h2>
              <p className={styles.focusPanelText}>
                {domainCount === 0
                  ? 'Add a Shopify store or standalone site to unlock experiments and analytics.'
                  : needsAttentionCount > 0
                    ? `${needsAttentionCount} Shopify ${needsAttentionCount === 1 ? 'store needs' : 'stores need'} install, link, or access review.`
                    : 'Your connected stores are ready. Choose a domain to create or review tests.'}
              </p>
            </div>
            <Link to={ROUTES.DOMAINS} className={styles.focusPanelAction}>
              {domainCount === 0
                ? 'Add domain'
                : needsAttentionCount > 0
                  ? 'Review domains'
                  : 'Open domains'}
              <Icon source={ChevronRightIcon} tone="subdued" />
            </Link>
          </section>

          {/* Account – large tiles */}
          <nav className={styles.accountSection} aria-label="Account">
            <h2 className={styles.accountSectionTitle}>Account</h2>
            <div className={styles.accountTiles}>
              {ACCOUNT_TILES.map(({ to, icon: IconSrc, label, desc, external }) => {
                const content = (
                  <>
                    <span className={styles.accountTileIcon}>
                      <Icon source={IconSrc} tone="base" />
                    </span>
                    <span className={styles.accountTileLabel}>{label}</span>
                    <span className={styles.accountTileDesc}>{desc}</span>
                    <span className={styles.accountTileArrow}>
                      <Icon source={ChevronRightIcon} tone="subdued" />
                    </span>
                  </>
                );
                return external ? (
                  <a
                    key={to}
                    href={to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.accountTile}
                  >
                    {content}
                  </a>
                ) : (
                  <Link key={to} to={to} className={styles.accountTile}>
                    {content}
                  </Link>
                );
              })}
            </div>
          </nav>

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
                  Connect a store or site to run A/B tests, track conversions, and analyze results.
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
                      <h2 id="domains-heading" className={styles.domainsSectionTitle}>
                        Your domains
                      </h2>
                    </div>
                    <div className={styles.domainsSectionPills} aria-label="Domain status summary">
                      <span>{connectedShopifyCount} Shopify ready</span>
                      {needsAttentionCount > 0 && <span>{needsAttentionCount} need setup</span>}
                      {standaloneCount > 0 && <span>{standaloneCount} standalone</span>}
                    </div>
                  </div>
                  <div className={styles.domainsSectionActions}>
                    <Link to={ROUTES.DOMAINS} className={styles.domainsSectionPrimaryAction}>
                      Manage domains
                      <Icon source={ChevronRightIcon} tone="subdued" />
                    </Link>
                  </div>
                </div>
                <div className={styles.domainGrid}>
                  {domains.map((d, index) => {
                    const domain = typeof d === 'string' ? d : d?.domain;
                    const platform = isShopifyStoreDomain(domain)
                      ? 'shopify'
                      : typeof d === 'object' && d?.platform
                        ? d.platform
                        : 'standalone';
                    const installState = isShopifyStoreDomain(domain)
                      ? getShopifyInstallState(domain)
                      : null;
                    const keyForDomain = accountKey || (domainKeys && domainKeys[domain]);
                    const isShopify = isShopifyStoreDomain(domain);
                    const canOpen = !!keyForDomain || isShopify;
                    const statusLabel = isShopify
                      ? installState === 'connected'
                        ? 'Connected'
                        : installState === 'needs_install'
                          ? 'Needs install'
                          : installState === 'needs_link'
                            ? 'Needs link'
                            : installState === 'restricted'
                              ? 'Restricted'
                              : installState === 'checking'
                                ? 'Checking…'
                                : 'Status unknown'
                      : canOpen
                        ? 'Connected'
                        : 'Connect with API key';
                    const statusClass = isShopify
                      ? installState === 'connected'
                        ? styles.domainTileStatusConnected
                        : styles.domainTileStatusDisconnected
                      : canOpen
                        ? styles.domainTileStatusConnected
                        : styles.domainTileStatusDisconnected;
                    return (
                      <div
                        key={domain}
                        className={styles.domainTile}
                        style={{ animationDelay: `${index * 60}ms` }}
                      >
                        <div className={styles.domainTileInner}>
                          <div className={styles.domainTileIcon}>
                            <Icon source={GlobeIcon} tone="subdued" />
                          </div>
                          <div className={styles.domainTileBody}>
                            <div className={styles.domainTileHeader}>
                              <span className={styles.domainTileName}>{domain}</span>
                              {platform && platform !== 'shopify' && (
                                <span className={styles.domainTileBadge}>{platform}</span>
                              )}
                            </div>
                            <span className={statusClass}>{statusLabel}</span>
                            <div className={styles.domainTileActions}>
                              {canOpen ? (
                                <Button
                                  variant="primary"
                                  size="medium"
                                  icon={ExternalIcon}
                                  onClick={() => handleOpenApp({ domain })}
                                  className={styles.domainTileCta}
                                  loading={openingDomain === domain}
                                  disabled={!!openingDomain}
                                >
                                  {openingDomain === domain
                                    ? 'Connecting…'
                                    : isShopify && installState === 'needs_install'
                                      ? 'Install app'
                                      : isShopify && installState === 'needs_link'
                                        ? 'Link app'
                                        : isShopify && installState === 'restricted'
                                          ? 'Review access'
                                          : 'Open A/B tests'}
                                </Button>
                              ) : (
                                <Button
                                  variant="plain"
                                  size="medium"
                                  icon={LinkIcon}
                                  url={ROUTES.DOMAINS}
                                  className={styles.domainTileCta}
                                >
                                  Connect
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          <footer className={styles.appFooter}>
            <LegalFooter />
          </footer>
        </div>
      </div>
    </PageShell>
  );
}

export default UserPanel;
