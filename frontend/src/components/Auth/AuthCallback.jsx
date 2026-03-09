/**
 * Auth callback – exchange one-time token from magic link for JWT, then redirect.
 * Route: /auth/callback?token=...
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams, useLocation, Navigate } from 'react-router-dom';
import { Page, Spinner, Text, BlockStack } from '@shopify/polaris';
import { PageShell } from '../Shared';
import { ROUTES } from '../../constants';
import {
  setEmailToken,
  clearStoreSelection,
  getUrlWithEmbedParams,
  getConnectUrl,
} from '../../services';

import { getApiBaseUrl } from '../../services/api';

function AuthCallback() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const token = searchParams.get('token');
  const [status, setStatus] = useState('exchanging'); // exchanging | done | error
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage('Missing token');
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        const rememberMe = searchParams.get('remember_me') === '1';
        const verifyUrl = `${getApiBaseUrl()}/auth/verify-email?token=${encodeURIComponent(token)}${rememberMe ? '&remember_me=1' : ''}`;
        const res = await fetch(verifyUrl, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        const data = await res.json().catch(() => ({}));

        if (cancelled) return;

        if (!res.ok || !data?.token) {
          setStatus('error');
          setErrorMessage(data?.error || 'Invalid or expired link');
          return;
        }

        setEmailToken(data.token);
        clearStoreSelection();
        if (cancelled) return;
        window.location.replace(getUrlWithEmbedParams(ROUTES.USER_PANEL));
        setStatus('done');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMessage(err.message || 'Something went wrong');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, searchParams]);

  if (!token) {
    return <Navigate to={{ pathname: ROUTES.CONNECT, search: location.search }} replace />;
  }

  return (
    <PageShell>
      <Page title="Signing you in…">
        <BlockStack gap="400">
          {status === 'exchanging' && (
            <>
              <Spinner size="large" />
              <Text as="p" tone="subdued">
                Completing sign in…
              </Text>
            </>
          )}
          {status === 'error' && (
            <Text as="p" tone="critical">
              {errorMessage}. <a href={getConnectUrl()}>Go to sign in</a>.
            </Text>
          )}
        </BlockStack>
      </Page>
    </PageShell>
  );
}

export default AuthCallback;
