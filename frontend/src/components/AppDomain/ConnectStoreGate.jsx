/**
 * Shown when user lands on /app/:domain for a Shopify store that isn't connected yet.
 * Prompts to connect via Shopify OAuth; does not render the AB test app.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Page, Card, BlockStack, Text, Button, InlineStack } from '@shopify/polaris';
import { ROUTES } from '../../constants';
import { normalizeShopifyDomain } from '../../utils/shopifyAdmin';
import { isEmbeddedInIframe } from '../../services';
import styles from './ConnectStoreGate.module.css';

function getShopifyConnectUrl(shopDomain) {
  const normalized = normalizeShopifyDomain(shopDomain);
  if (!normalized) return ROUTES.CONNECT;
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/api/auth?shop=${encodeURIComponent(normalized)}`;
}

export default function ConnectStoreGate({ domain }) {
  const normalized = normalizeShopifyDomain(domain || '');
  const connectUrl = getShopifyConnectUrl(domain);

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
                <Button
                  variant="primary"
                  size="large"
                  onClick={() => {
                    if (isEmbeddedInIframe())
                      window.open(connectUrl, '_blank', 'noopener,noreferrer');
                    else window.location.href = connectUrl;
                  }}
                >
                  Connect with Shopify
                </Button>
                <Link to={ROUTES.CONNECT}>
                  <Button variant="plain">Other sign-in options</Button>
                </Link>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                You’ll be taken to Shopify to approve access. After connecting, you can open this
                app from My domains or Home.
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
