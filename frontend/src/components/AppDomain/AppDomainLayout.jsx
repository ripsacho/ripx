/**
 * Layout for domain-scoped AB test app (/app/:domain/*).
 * Syncs :domain from URL to current store. For Shopify stores without an API key,
 * verifies the store is connected (session exists) before showing the app.
 * If not connected, redirects to the Shopify OAuth flow to connect that store first.
 */

import React, { useEffect, useState, useRef } from 'react';
import { useParams, Navigate, Outlet } from 'react-router-dom';
import { BlockStack } from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import { ROUTES } from '../../constants';
import {
  setCurrentStore,
  getApiKey,
  getAccountApiKey,
  getDomainKeys,
  hasEmailSession,
  apiGet,
} from '../../services';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../../utils/shopifyAdmin';
import { RouteLoading } from '../LoadingSkeleton/RouteLoading';
import ShopifyConnectionBanner from './ShopifyConnectionBanner';

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
  const [storeSynced, setStoreSynced] = useState(false);
  const redirectAttempted = useRef(false);

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

  useEffect(() => {
    if (validDomain) {
      setCurrentStore(domain);
      setStoreSynced(true);
    }
  }, [domain, validDomain]);

  const {
    data: storesData,
    isError,
    error,
    isLoading,
    isFetched,
  } = useQuery({
    queryKey: ['account', 'stores', 'layout', domain],
    queryFn: () => apiGet('/account/stores'),
    retry: false,
    staleTime: 60 * 1000,
    enabled: Boolean(validDomain && needsShopifySessionCheck && storeSynced),
  });

  const is401 = isError && error?.response?.status === 401;
  const raw = storesData?.data?.data ?? storesData?.data;
  const stores = raw?.stores ?? [];
  const connected = stores.some(
    s => (s.domain || '').toLowerCase() === (domain || '').toLowerCase()
  );
  const notConnected = needsShopifySessionCheck && isFetched && (is401 || isError || !connected);

  useEffect(() => {
    if (!notConnected || redirectAttempted.current || !domain) return;
    redirectAttempted.current = true;
    window.location.href = getShopifyConnectUrl(domain);
  }, [notConnected, domain]);

  if (!validDomain) {
    return <Navigate to={ROUTES.USER_PANEL} replace />;
  }

  if (hasEmailSession() && !keyForDomain) {
    return <Navigate to={ROUTES.DOMAINS} replace />;
  }

  if (needsShopifySessionCheck) {
    if (!storeSynced || isLoading || (storeSynced && !isFetched)) {
      return <RouteLoading message="Checking connection…" fullScreen />;
    }
    if (notConnected) {
      return <RouteLoading message="Redirecting to connect store…" fullScreen />;
    }
  }

  return (
    <BlockStack gap="400">
      {isShopify && <ShopifyConnectionBanner />}
      <Outlet />
    </BlockStack>
  );
}

export default AppDomainLayout;
