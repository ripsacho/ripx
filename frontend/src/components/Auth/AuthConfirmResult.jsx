/**
 * Auth confirm result – shown after user clicks the email confirmation link.
 * Backend redirects here with ?status=success|error&message=...
 * Displays a clear success or error UI instead of raw JSON.
 */

import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, Card, Text, BlockStack, Box, Button } from '@shopify/polaris';
import { PageShell, LegalFooter } from '../Shared';
import { ROUTES } from '../../constants';
import styles from './AuthConfirmResult.module.css';

function AuthConfirmResult() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') || 'error';
  const message = searchParams.get('message') || '';

  const isSuccess = status === 'success';

  return (
    <PageShell className={styles.confirmPageWrapper}>
      <Page title="">
        <div className={styles.confirmPage}>
          <div className={styles.confirmCardWrapper}>
            <Card className={isSuccess ? styles.confirmCardSuccess : styles.confirmCardError}>
              <div className={styles.confirmCardInner}>
                <div className={styles.confirmIcon} aria-hidden>
                  {isSuccess ? (
                    <span className={styles.confirmIconSuccess}>✓</span>
                  ) : (
                    <span className={styles.confirmIconError}>!</span>
                  )}
                </div>
                <BlockStack gap="400">
                  <Text as="h1" variant="headingLg">
                    {isSuccess ? 'Email confirmed' : 'Link invalid or expired'}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {isSuccess
                      ? message ||
                        'Your account is pending approval. You will receive an email when an administrator accepts your registration. Then you can sign in.'
                      : message ||
                        'This confirmation link is invalid or has already been used. Request a new one from the sign-in page.'}
                  </Text>
                  <Box paddingBlockStart="300">
                    <Link to={ROUTES.CONNECT}>
                      <Button variant="primary" size="large">
                        {isSuccess ? 'Go to sign in' : 'Back to sign in'}
                      </Button>
                    </Link>
                  </Box>
                </BlockStack>
              </div>
            </Card>
          </div>
          <LegalFooter />
        </div>
      </Page>
    </PageShell>
  );
}

export default AuthConfirmResult;
