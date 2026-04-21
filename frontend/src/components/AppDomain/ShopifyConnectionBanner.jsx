/**
 * ShopifyConnectionBanner
 *
 * When viewing a Shopify store (/app/:domain), validates that the store is connected
 * (has a valid OAuth session). If not, shows a persistent banner with a link to connect.
 * Re-checks periodically so we catch session expiry or revoked access.
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import { Banner } from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import { apiGet, getConnectUrl, redirectToAppUrl } from '../../services';
import { ROUTES } from '../../constants';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../../utils/shopifyAdmin';

/** When disconnected, poll so a completed OAuth in another tab clears the banner without full reload. */
const RECHECK_WHEN_DISCONNECTED_MS = 90 * 1000;
/** Healthy embeds: treat as fresh longer to avoid redundant auth traffic (connection-status mirrors shop auth). */
const CONNECTION_STATUS_STALE_MS = 5 * 60 * 1000;

function ShopifyConnectionBanner() {
  const { domain } = useParams();
  const isShopify = domain ? isShopifyStoreDomain(domain) : false;

  const {
    data,
    isError,
    error,
    isFetched,
    refetch: _refetch,
  } = useQuery({
    queryKey: ['shopify', 'connection-status', domain],
    queryFn: async () => {
      const res = await apiGet('/shopify/connection-status');
      return res.data;
    },
    retry: false,
    staleTime: CONNECTION_STATUS_STALE_MS,
    // Poll only while the banner would show; when connected, rely on staleTime + refetchOnWindowFocus (default).
    refetchInterval: query => (query.state.data?.connected ? false : RECHECK_WHEN_DISCONNECTED_MS),
    refetchIntervalInBackground: false,
    enabled: Boolean(domain && isShopify),
  });

  if (!domain || !isShopify) return null;
  if (!isFetched) return null;
  if (!isError && data?.connected) return null;

  const normalizedShop = normalizeShopifyDomain(domain);
  const connectUrl = getConnectUrl({
    shop: normalizedShop,
    reason: ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
  });
  const statusCode = error?.response?.status;

  const handleConnect = () => {
    redirectToAppUrl(connectUrl);
  };

  return (
    <Banner
      title="Store not connected"
      tone="warning"
      action={{
        content: 'Connect store',
        onAction: handleConnect,
      }}
    >
      <p>
        This Shopify store ({domain}) is not connected to RipX or the connection is invalid.
        {statusCode === 401 && ' Sign in and connect this store to load data and use the app.'}
        {isError &&
          !statusCode &&
          ' Store data could not be loaded. Connect the store to continue.'}
      </p>
      <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>
        <a
          href={connectUrl}
          onClick={e => {
            e.preventDefault();
            handleConnect();
          }}
        >
          Connect this store
        </a>
        {" — you'll sign in (if needed) and complete the Shopify install for this store."}
      </p>
    </Banner>
  );
}

export default ShopifyConnectionBanner;
