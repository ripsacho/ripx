/**
 * Shown when user lands on /app/:domain for a Shopify store that isn't connected yet.
 * Prompts to connect via Shopify OAuth; does not render the AB test app.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Page, Card, BlockStack, Text, Button, InlineStack, Banner } from '@shopify/polaris';
import { ROUTES } from '../../constants';
import { normalizeShopifyDomain } from '../../utils/shopifyAdmin';
import { isEmbeddedInIframe } from '../../services';
import styles from './ConnectStoreGate.module.css';

function getShopifyConnectUrl(shopDomain) {
  const normalized = normalizeShopifyDomain(shopDomain);
  if (!normalized) return ROUTES.CONNECT;
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth?shop=${encodeURIComponent(normalized)}`;
}

export default function ConnectStoreGate({
  domain,
  onConnect,
  connecting = false,
  popupBlocked = false,
  statusMessage = '',
}) {
  const normalized = normalizeShopifyDomain(domain || '');
  const connectUrl = getShopifyConnectUrl(domain);
  const handleConnect = () => {
    if (typeof onConnect === 'function') {
      onConnect();
      return;
    }
    if (isEmbeddedInIframe()) window.open(connectUrl, '_blank', 'noopener,noreferrer');
    else window.location.href = connectUrl;
  };

  return (
    <div className={styles.gateWrapper}>
      <Page>
        <div className={styles.gateContent}>
          <Card>
            <BlockStack gap="400">
              <Text as="h1" variant="headingLg">
                Connect this store
              </Text>
              <Text as="p" tone="subdued">
                <strong>{normalized || domain}</strong> isn’t connected to RipX yet. Connect with
                Shopify to run A/B tests for this store.
              </Text>
              <InlineStack gap="300" blockAlign="start">
                <Button variant="primary" size="large" onClick={handleConnect} loading={connecting}>
                  {connecting ? 'Connecting…' : 'Connect with Shopify'}
                </Button>
                <Button
                  variant="plain"
                  onClick={() => {
                    window.location.href = connectUrl;
                  }}
                >
                  Open full page
                </Button>
                <Link to={ROUTES.CONNECT}>
                  <Button variant="plain">Other sign-in options</Button>
                </Link>
              </InlineStack>
              {popupBlocked && (
                <Banner tone="warning">
                  Popup was blocked by the browser. Allow popups for this site or use{' '}
                  <strong>Open full page</strong>.
                </Banner>
              )}
              {statusMessage && (
                <Banner tone="info">
                  <Text as="p" variant="bodySm">
                    {statusMessage}
                  </Text>
                </Banner>
              )}
              <Text as="p" variant="bodySm" tone="subdued">
                OAuth opens in a popup so you can keep this page open. After approval, we sync this
                store automatically.
              </Text>
            </BlockStack>
          </Card>
          <p className={styles.gateBack}>
            <Link to={ROUTES.USER_PANEL} className={styles.gateBackLink}>
              ← Back to home
            </Link>
          </p>
        </div>
      </Page>
    </div>
  );
}
