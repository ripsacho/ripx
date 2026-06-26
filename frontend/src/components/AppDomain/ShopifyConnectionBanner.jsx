/**
 * ShopifyConnectionBanner
 *
 * When viewing a Shopify store (/app/:domain), validates that the store is connected
 * (has a valid OAuth session). If not, shows a persistent banner with a link to connect.
 * Re-checks periodically so we catch session expiry or revoked access.
 */

import React, { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Banner } from '@shopify/polaris';
import { useQuery } from '@tanstack/react-query';
import {
  fetchShopifyConnectionStatus,
  getConnectUrl,
  redirectToAppUrl,
  getShopifyConnectionErrorMeta,
} from '../../services';
import { ROUTES } from '../../constants';
import { isShopifyStoreDomain, normalizeShopifyDomain } from '../../utils/shopifyAdmin';
import {
  isShopifyConnectionHealthy,
  needsScopeReauthorization,
  shouldOpenShopifyApp,
} from '../../utils/shopifyConnectionHealth';
import {
  launchShopifyPermissionUpdate,
  buildShopifyPermissionUpdateLaunchUrl,
} from '../../utils/shopifyOAuthFlow';

/** When disconnected, poll so a completed OAuth in another tab clears the banner without full reload. */
const RECHECK_WHEN_DISCONNECTED_MS = 90 * 1000;
/** Healthy embeds: treat as fresh longer to avoid redundant auth traffic (connection-status mirrors shop auth). */
const CONNECTION_STATUS_STALE_MS = 5 * 60 * 1000;

function ShopifyConnectionBanner() {
  const { domain } = useParams();
  const isShopify = domain ? isShopifyStoreDomain(domain) : false;
  const [scopeUpdateLoading, setScopeUpdateLoading] = useState(false);
  const [scopeUpdateError, setScopeUpdateError] = useState(null);

  const {
    data,
    isError,
    error,
    isFetched,
    refetch: _refetch,
  } = useQuery({
    queryKey: ['shopify', 'connection-status', domain],
    queryFn: () => fetchShopifyConnectionStatus(domain || ''),
    retry: false,
    staleTime: CONNECTION_STATUS_STALE_MS,
    // Poll only while the banner would show; when connected, rely on staleTime + refetchOnWindowFocus (default).
    refetchInterval: query =>
      isShopifyConnectionHealthy(query.state.data) ? false : RECHECK_WHEN_DISCONNECTED_MS,
    refetchIntervalInBackground: false,
    enabled: Boolean(domain && isShopify),
  });

  const handleScopeUpdate = useCallback(async () => {
    const normalizedShop = normalizeShopifyDomain(domain || '');
    if (!normalizedShop || scopeUpdateLoading) {
      return;
    }
    setScopeUpdateError(null);
    setScopeUpdateLoading(true);
    try {
      const result = await launchShopifyPermissionUpdate(normalizedShop);
      if (result.launched) {
        return;
      }
      if (result.popupBlocked && result.url) {
        setScopeUpdateError(
          'Popup blocked. Allow popups for this site, then try again — or open the permissions update link in a new tab.'
        );
        return;
      }
      // Shop is connected — never bounce to Connect for scope refresh; surface actionable error instead.
      if (isShopifyConnectionHealthy(data)) {
        setScopeUpdateError(result.error || 'Could not start permission update. Try again.');
        return;
      }
      if (result.signInRequired) {
        redirectToAppUrl(
          getConnectUrl({
            shop: normalizedShop,
            reason: ROUTES.CONNECT_REASON?.SCOPE_UPDATE || 'scope_update',
          })
        );
        return;
      }
      setScopeUpdateError(result.error || 'Could not start permission update. Try again.');
    } catch {
      setScopeUpdateError('Could not start permission update. Try again.');
    } finally {
      setScopeUpdateLoading(false);
    }
  }, [domain, scopeUpdateLoading, data]);

  if (!domain || !isShopify) return null;
  if (!isFetched) return null;

  const normalizedShop = normalizeShopifyDomain(domain);
  const scopeReauthNeeded = !isError && needsScopeReauthorization(data);
  if (!isError && isShopifyConnectionHealthy(data)) {
    if (scopeReauthNeeded) {
      return (
        <Banner
          title="Optional permission update"
          tone="info"
          action={{
            content: 'Update permissions',
            onAction: handleScopeUpdate,
            loading: scopeUpdateLoading,
          }}
        >
          <p>
            {data?.connection?.message ||
              'RipX can run tests with your current connection. Update permissions when you need newer features.'}
          </p>
          {scopeUpdateError ? (
            <p style={{ marginTop: '0.5rem' }}>
              {scopeUpdateError}{' '}
              {buildShopifyPermissionUpdateLaunchUrl(normalizedShop) ? (
                <a
                  href={buildShopifyPermissionUpdateLaunchUrl(normalizedShop)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open permissions update
                </a>
              ) : null}
            </p>
          ) : null}
        </Banner>
      );
    }
    return null;
  }

  if (!isError && shouldOpenShopifyApp(data)) {
    return null;
  }

  const disconnectedMessage =
    !isError && data?.connection?.message ? data.connection.message : null;

  const connectUrl = getConnectUrl({
    shop: normalizedShop,
    reason: ROUTES.CONNECT_REASON?.SIGN_IN_TO_CONNECT || 'sign_in_to_connect',
  });
  const statusCode = error?.response?.status;
  const errorMeta = isError ? getShopifyConnectionErrorMeta(error) : null;
  const actionLabel =
    errorMeta?.state === 'needs_install'
      ? 'Install in Shopify'
      : errorMeta?.state === 'needs_link'
        ? 'Link store'
        : errorMeta?.state === 'restricted'
          ? 'Review access'
          : 'Connect store';

  const handleConnect = () => {
    redirectToAppUrl(connectUrl);
  };

  return (
    <Banner
      title="Store not connected"
      tone="warning"
      action={{
        content: actionLabel,
        onAction: handleConnect,
      }}
    >
      <p>
        {disconnectedMessage ||
          (errorMeta?.message
            ? errorMeta.message
            : errorMeta?.state === 'needs_link'
              ? `This Shopify store (${domain}) is installed but not linked to your RipX account.`
              : errorMeta?.state === 'restricted'
                ? `This Shopify store (${domain}) is connected, but your account access is restricted.`
                : `This Shopify store (${domain}) is not connected to RipX or the connection is invalid.`)}
        {statusCode === 401 &&
          ' Sign in and install/connect this store to load data and use the app.'}
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
