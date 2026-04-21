/**
 * Layout for domain-scoped AB test app (/app/:domain/*).
 * Syncs :domain from URL to current store. For Shopify stores without an API key,
 * verifies the store is connected (session exists) before showing the app.
 * If not connected, shows an in-place connect gate that can launch OAuth in a popup.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation, Navigate, Outlet } from 'react-router-dom';
import { BlockStack } from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import { ROUTES, STORAGE_KEYS, RIPX_STORE_SWITCHED_EVENT } from '../../constants';
import {
  setCurrentStore,
  getApiKey,
  getAccountApiKey,
  getDomainKeys,
  hasEmailSession,
  apiGet,
  openCenteredPopup,
} from '../../services';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../../utils/shopifyAdmin';
import { RouteLoading } from '../LoadingSkeleton/RouteLoading';
import ShopifyConnectionBanner from './ShopifyConnectionBanner';
import ConnectStoreGate from './ConnectStoreGate';
import Toast from '../Toast/Toast';
import { OAUTH_SUCCESS_MESSAGE_TYPE } from '../Connect/OAuthSuccess';

/** OAuth start URL to connect a Shopify store */
function getShopifyConnectUrl(shopDomain) {
  const normalized = normalizeShopifyDomain(shopDomain);
  if (!normalized) return ROUTES.CONNECT;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/api/auth?shop=${encodeURIComponent(normalized)}`;
}

/** Basic domain segment validation – no path traversal or empty */
function isValidDomainParam(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const t = domain.trim();
  return t.length > 0 && !t.includes('/') && !t.includes('..');
}

function AppDomainLayout() {
  const { domain } = useParams();
  const location = useLocation();
  const [storeSynced, setStoreSynced] = useState(false);
  const [storeSwitchToast, setStoreSwitchToast] = useState(null);
  const connectPopupRef = useRef(null);
  const [connectPopupOpen, setConnectPopupOpen] = useState(false);
  const [connectPopupBlocked, setConnectPopupBlocked] = useState(false);
  const [connectStatusMessage, setConnectStatusMessage] = useState('');
  const [connectRequested, setConnectRequested] = useState(false);

  const validDomain = domain && isValidDomainParam(domain);
  const apiKey = getApiKey();
  const accountKey = getAccountApiKey();
  const domainKeys = getDomainKeys();
  const keyForDomain =
    apiKey ||
    accountKey ||
    (domain && (domainKeys[domain] || domainKeys[normalizeShopifyDomain(domain)]));
  const isShopify = domain ? isShopifyStoreDomain(domain) : false;
  const needsShopifySessionCheck = isShopify && !keyForDomain;
  const hasEmailAuth = hasEmailSession();
  const isAppSettingsRoute = Boolean(domain) && location.pathname === ROUTES.appSettings(domain);
  const appSettingsQuery = new URLSearchParams(location.search || '');
  const requestedSettingsTab = String(appSettingsQuery.get('tab') || '')
    .trim()
    .toLowerCase();
  const allowDisconnectedSettingsView =
    hasEmailAuth &&
    isAppSettingsRoute &&
    (!requestedSettingsTab ||
      requestedSettingsTab === 'installation' ||
      String(appSettingsQuery.get('guided_setup') || '').trim() === '1' ||
      String(appSettingsQuery.get('auto_discount_setup') || '').trim() === '1');

  useEffect(() => {
    if (validDomain) {
      setCurrentStore(domain);
      setStoreSynced(true);
    }
  }, [domain, validDomain]);

  const {
    data: connectionData,
    isError,
    error,
    isLoading,
    isFetched,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['shopify', 'connection-gate', domain],
    queryFn: async () => {
      const res = await apiGet('/shopify/connection-status');
      return res?.data?.data ?? res?.data ?? {};
    },
    retry: false,
    // For gate checks, prefer shop-auth truth source over account store list to avoid false negatives
    // when a browser has an email token for a different user account.
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(validDomain && needsShopifySessionCheck && storeSynced),
  });

  const is401 = isError && error?.response?.status === 401;
  const connected = Boolean(connectionData?.connected);
  const notConnected = needsShopifySessionCheck && isFetched && (is401 || isError || !connected);

  const openConnectPopup = useCallback(() => {
    if (!domain) return;
    const connectUrl = getShopifyConnectUrl(domain);
    const popup = openCenteredPopup(connectUrl);
    setConnectRequested(true);
    if (!popup) {
      setConnectPopupBlocked(true);
      setConnectPopupOpen(false);
      setConnectStatusMessage('Popup blocked. Allow popups or use Open full page.');
      return;
    }
    connectPopupRef.current = popup;
    setConnectPopupBlocked(false);
    setConnectPopupOpen(true);
    setConnectStatusMessage('Waiting for Shopify approval…');
  }, [domain]);

  useEffect(() => {
    if (!domain) return undefined;
    const normalizedDomain = normalizeShopifyDomain(domain);
    const onMessage = event => {
      const data = event?.data;
      if (!data || data.type !== OAUTH_SUCCESS_MESSAGE_TYPE) return;
      const connectedShop = normalizeShopifyDomain(data.shop || '');
      if (!connectedShop || connectedShop !== normalizedDomain) return;
      setConnectPopupOpen(false);
      setConnectPopupBlocked(false);
      setConnectStatusMessage('Store connected. Syncing now…');
      refetch();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [domain, refetch]);

  useEffect(() => {
    if (!connectPopupOpen) return undefined;
    const timer = window.setInterval(() => {
      const popup = connectPopupRef.current;
      if (!popup || popup.closed) {
        setConnectPopupOpen(false);
        refetch();
      }
    }, 700);
    return () => window.clearInterval(timer);
  }, [connectPopupOpen, refetch]);

  useEffect(
    () => () => {
      try {
        if (connectPopupRef.current && !connectPopupRef.current.closed) {
          connectPopupRef.current.close();
        }
      } catch (_) {
        /* ignore */
      }
    },
    []
  );

  useEffect(() => {
    if (connected) {
      setConnectStatusMessage('');
      setConnectPopupBlocked(false);
      setConnectPopupOpen(false);
    }
  }, [connected]);

  useEffect(() => {
    if (!validDomain || !domain) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.STORE_SWITCH_TOAST);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.exp === 'number' && parsed.exp < Date.now()) {
        sessionStorage.removeItem(STORAGE_KEYS.STORE_SWITCH_TOAST);
        return;
      }
      const urlDom = domain.trim().toLowerCase();
      const storedDom = (parsed.domain || '').trim().toLowerCase();
      if (!storedDom || storedDom !== urlDom) return;
      const label = parsed.label || parsed.domain;
      setStoreSwitchToast({ label });
      try {
        window.dispatchEvent(
          new CustomEvent(RIPX_STORE_SWITCHED_EVENT, { detail: { domain: parsed.domain } })
        );
      } catch (_) {
        /* ignore */
      }
    } catch {
      try {
        sessionStorage.removeItem(STORAGE_KEYS.STORE_SWITCH_TOAST);
      } catch (_) {
        /* ignore */
      }
    }
  }, [domain, validDomain]);

  const storeSwitchToastEl = storeSwitchToast ? (
    <Toast
      title="Now viewing"
      detail={storeSwitchToast.label}
      type="success"
      icon="store-switch"
      className="toast-store-switch"
      showProgress
      duration={5500}
      onClose={() => {
        try {
          sessionStorage.removeItem(STORAGE_KEYS.STORE_SWITCH_TOAST);
        } catch (_) {
          /* ignore */
        }
        setStoreSwitchToast(null);
      }}
    />
  ) : null;

  if (!validDomain) {
    return <Navigate to={ROUTES.USER_PANEL} replace />;
  }

  // Email-session users can switch to Shopify stores without pre-existing domain keys.
  // For Shopify domains we run the explicit connection check above instead.
  if (hasEmailSession() && !keyForDomain && !isShopify) {
    return <Navigate to={ROUTES.DOMAINS} replace />;
  }

  if (needsShopifySessionCheck) {
    if (!storeSynced || isLoading || (storeSynced && !isFetched)) {
      return (
        <>
          {storeSwitchToastEl}
          <RouteLoading message="Checking connection…" fullScreen />
        </>
      );
    }
    if (notConnected && !allowDisconnectedSettingsView) {
      return (
        <>
          {storeSwitchToastEl}
          <ConnectStoreGate
            domain={domain}
            onConnect={openConnectPopup}
            connecting={connectPopupOpen || (connectRequested && isFetching)}
            popupBlocked={connectPopupBlocked}
            statusMessage={connectStatusMessage}
          />
        </>
      );
    }
  }

  return (
    <>
      {storeSwitchToastEl}
      <BlockStack gap="400">
        {isShopify && <ShopifyConnectionBanner />}
        <Outlet />
      </BlockStack>
    </>
  );
}

export default AppDomainLayout;
