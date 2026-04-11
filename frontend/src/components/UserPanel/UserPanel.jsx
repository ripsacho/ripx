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
} from '../../services';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../../utils/shopifyAdmin';
import { useAdminMe } from '../../hooks';
import { OAUTH_SUCCESS_MESSAGE_TYPE } from '../Connect/OAuthSuccess';
import styles from './UserPanel.module.css';

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const ACCOUNT_TILES = [
  { to: ROUTES.PROFILE, icon: ProfileIcon, label: 'Profile', desc: 'Theme & preferences' },
  { to: ROUTES.SETTINGS, icon: SettingsIcon, label: 'Settings', desc: 'Account settings' },
  { to: ROUTES.DOCS, icon: BookIcon, label: 'Documentation', desc: 'Guides & API' },
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
  const domains = domainsData?.domains ?? [];
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
        const res = await apiGet('/account/stores');
        const raw = res?.data?.data ?? res?.data;
        const stores = raw?.stores ?? [];
        const connected = stores.some(
          s => (s.domain || '').toLowerCase() === (normalized || '').toLowerCase()
        );
        if (connected) {
          try {
            if (connectPopupRef.current && !connectPopupRef.current.closed) {
              connectPopupRef.current.close();
            }
          } catch {
            // ignore popup close errors
          }
          setPendingShopifyConnect(null);
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

  const openShopifyConnectPopup = useCallback((url, shop) => {
    const normalized = normalizeShopifyDomain(shop || '');
    const popup = openCenteredPopup(url);
    if (popup) {
      connectPopupRef.current = popup;
      if (normalized) {
        setPendingShopifyConnect(normalized);
      }
      return true;
    }
    // Keep user on Home page; fallback to opening a new tab.
    const newTab = window.open(url, '_blank', 'noopener,noreferrer');
    if (newTab && normalized) {
      setPendingShopifyConnect(normalized);
    }
    return Boolean(newTab);
  }, []);

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
          setPendingShopifyConnect(null);
        }
      }
    };
    tick();
    const timer = window.setInterval(tick, 1800);
    return () => window.clearInterval(timer);
  }, [pendingShopifyConnect, verifyConnectedAndOpen]);

  const handleOpenApp = async domainRow => {
    const domain = typeof domainRow === 'string' ? domainRow : domainRow?.domain;
    if (!domain || openingDomain) return;
    setOpeningDomain(domain);
    const isShopify = isShopifyStoreDomain(domain);
    const normalized = isShopify ? normalizeShopifyDomain(domain) : domain;
    const key = accountKey || (domainKeys && (domainKeys[domain] || domainKeys[normalized]));
    try {
      if (isShopify) {
        if (key) {
          try {
            window.localStorage.setItem(STORAGE_KEYS.API_KEY, key);
          } catch {
            // ignore localStorage errors
          }
          setCurrentStore(normalized);
          if (isEmbeddedInIframe()) {
            window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalized), {
              shop: normalized,
            });
          } else {
            navigate(ROUTES.appDashboard(normalized));
          }
          return;
        }
        setCurrentStore(normalized);
        try {
          const res = await apiGet('/account/stores');
          const raw = res?.data?.data ?? res?.data;
          const stores = raw?.stores ?? [];
          const connected = stores.some(
            s => (s.domain || '').toLowerCase() === (normalized || '').toLowerCase()
          );
          if (connected) {
            if (isEmbeddedInIframe()) {
              window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(normalized), {
                shop: normalized,
              });
            } else {
              navigate(ROUTES.appDashboard(normalized));
            }
          } else {
            const origin = typeof window !== 'undefined' ? window.location.origin : '';
            try {
              const startRes = await apiGet('/auth/start', {
                shop: normalized,
                callback_base: origin || undefined,
              });
              const url = unwrapData(startRes)?.redirectUrl;
              if (url) {
                openShopifyConnectPopup(url, normalized);
                return;
              }
            } catch {
              /* fallback to same-origin OAuth (cookie may be set) */
            }
            const fallbackUrl = `${origin}/api/auth?shop=${encodeURIComponent(normalized)}${origin ? `&callback_base=${encodeURIComponent(origin)}` : ''}`;
            openShopifyConnectPopup(fallbackUrl, normalized);
          }
        } catch (err) {
          if (err?.response?.status === 401) {
            const connectUrl = getConnectUrl({
              shop: normalized,
              reason: ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
            });
            openShopifyConnectPopup(connectUrl, normalized);
          } else {
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
                  Signed in as <strong>{userEmail}</strong>. Open a domain to run experiments and
                  view analytics.
                </>
              ) : (
                'Open a domain to run A/B tests, analytics, and experiments.'
              )}
            </p>
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
          {domainCount === 0 ? (
            <>
              <div className={styles.statsDivider} aria-hidden="true" />
              <Link to={ROUTES.DOMAINS} className={styles.statsCta}>
                Add your first domain
                <Icon source={ChevronRightIcon} tone="subdued" />
              </Link>
            </>
          ) : null}
        </div>

        <div className={styles.appContent}>
          {/* Account – large tiles */}
          <nav className={styles.accountSection} aria-label="Account">
            <h2 className={styles.accountSectionTitle}>Account</h2>
            <div className={styles.accountTiles}>
              {ACCOUNT_TILES.map(({ to, icon: IconSrc, label, desc }) => (
                <Link key={to} to={to} className={styles.accountTile}>
                  <span className={styles.accountTileIcon}>
                    <Icon source={IconSrc} tone="base" />
                  </span>
                  <span className={styles.accountTileLabel}>{label}</span>
                  <span className={styles.accountTileDesc}>{desc}</span>
                  <span className={styles.accountTileArrow}>
                    <Icon source={ChevronRightIcon} tone="subdued" />
                  </span>
                </Link>
              ))}
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
                  <Link to={ROUTES.DOCS} className={styles.emptyLink}>
                    Learn how to connect
                  </Link>
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
                    <p className={styles.domainsSectionDesc}>
                      Open a domain to run A/B tests and view analytics, or connect one with an API
                      key.
                    </p>
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
                    const keyForDomain = accountKey || (domainKeys && domainKeys[domain]);
                    const isShopify = isShopifyStoreDomain(domain);
                    const canOpen = !!keyForDomain || isShopify;
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
                            <span
                              className={
                                canOpen
                                  ? styles.domainTileStatusConnected
                                  : styles.domainTileStatusDisconnected
                              }
                            >
                              {canOpen ? 'Connected' : 'Connect with API key'}
                            </span>
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
                                  {openingDomain === domain ? 'Connecting…' : 'Open A/B tests'}
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
