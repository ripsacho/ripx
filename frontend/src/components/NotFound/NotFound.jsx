/**
 * NotFound (404) Component
 *
 * Shown when the user navigates to an unknown route.
 */

import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Page, Button, Text, InlineStack } from '@shopify/polaris';
import { HomeIcon } from '@shopify/polaris-icons';
import { getShopDomain } from '../../services';
import { getNotFoundHome } from '../../utils/notFoundHome';
import PageShell from '../Shared/PageShell';
import styles from './NotFound.module.css';

function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const { homePath, homeLabel } = getNotFoundHome(getShopDomain(), location.pathname);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Page not found - RipX';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <PageShell>
      <div className={styles.notFound}>
        <Page title="">
          <div className={styles.notFoundContent}>
            <div className={styles.notFoundCode}>404</div>
            <Text variant="headingXl" as="h1">
              Page not found
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </Text>
            <InlineStack gap="300">
              <Button
                icon={HomeIcon}
                variant="primary"
                onClick={() => navigate(homePath)}
                aria-label={homeLabel}
              >
                {homeLabel}
              </Button>
              <Button onClick={() => window.history.back()} aria-label="Go back to previous page">
                Go back
              </Button>
            </InlineStack>
          </div>
        </Page>
      </div>
    </PageShell>
  );
}

export default NotFound;
