/**
 * OAuthSuccess – Shown after Shopify OAuth callback when store is connected.
 * When opened in a new tab (from embedded app), notifies opener via postMessage and asks user to close the tab.
 * When opened in same window (standalone), redirects to the app dashboard.
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Page, Card, Text, Button, BlockStack, Box } from '@shopify/polaris';
import { PageShell, LegalFooter } from '../Shared';
import { ROUTES } from '../../constants';
import { getUrlWithEmbedParams } from '../../services';
import styles from '../Auth/AuthConfirmResult.module.css';

export const OAUTH_SUCCESS_MESSAGE_TYPE = 'ripx-store-connected';

export default function OAuthSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const shop = (searchParams.get('shop') || '').trim().toLowerCase();
  const requestedShop = (searchParams.get('requested_shop') || '').trim().toLowerCase();
  const launchIntent = (searchParams.get('launch') || '').trim().toLowerCase();
  const isDiscountLaunch = launchIntent === 'discount_setup';
  const [notified, setNotified] = useState(false);

  const isOpenedInNewTab = typeof window !== 'undefined' && !!window.opener;

  useEffect(() => {
    if (!shop) {
      navigate(ROUTES.DOMAINS || '/domains', { replace: true });
      return;
    }
    if (isOpenedInNewTab && window.opener && !notified) {
      const payload = {
        type: OAUTH_SUCCESS_MESSAGE_TYPE,
        shop: shop.trim().toLowerCase(),
        launch: isDiscountLaunch ? 'discount_setup' : '',
      };
      const ourOrigin = window.location.origin;
      // When embedded in Shopify Admin, opener is often admin.shopify.com. Try that first to avoid console SecurityError; then try our origin for same-tab opener.
      try {
        window.opener.postMessage(payload, 'https://admin.shopify.com');
      } catch {
        try {
          window.opener.postMessage(payload, ourOrigin);
        } catch {
          // Opener is other origin; ignore.
        }
      }
      setNotified(true);
    } else if (!isOpenedInNewTab) {
      const timer = window.setTimeout(() => {
        const targetPath = isDiscountLaunch ? ROUTES.appSettings(shop) : ROUTES.appDashboard(shop);
        const nextParams = new URLSearchParams();
        if (isDiscountLaunch) {
          nextParams.set('tab', 'installation');
          nextParams.set('auto_discount_setup', '1');
        }
        const targetWithQuery = nextParams.toString()
          ? `${targetPath}?${nextParams.toString()}`
          : targetPath;
        const target = getUrlWithEmbedParams(targetWithQuery, { shop });
        navigate(target, { replace: true });
      }, 2000);
      return () => window.clearTimeout(timer);
    }
  }, [shop, isOpenedInNewTab, notified, navigate, isDiscountLaunch]);

  if (!shop) {
    return null;
  }

  return (
    <PageShell className={styles.confirmPageWrapper}>
      <Page title="">
        <div className={styles.confirmPage}>
          <div className={styles.confirmCardWrapper}>
            <Card className={styles.confirmCardSuccess}>
              <div className={styles.confirmCardInner}>
                <div className={styles.confirmIcon} aria-hidden>
                  <span className={styles.confirmIconSuccess}>✓</span>
                </div>
                <BlockStack gap="400">
                  <Text as="h1" variant="headingLg">
                    Store connected
                  </Text>
                  {requestedShop && requestedShop !== shop ? (
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd" tone="subdued">
                        We connected <strong>{shop}</strong>. You had requested{' '}
                        <strong>{requestedShop}</strong>.
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        To add {requestedShop} too, go to{' '}
                        <Link to={ROUTES.DOMAINS} style={{ fontWeight: 600 }}>
                          My domains
                        </Link>{' '}
                        and use “Copy link for incognito” for that store. Open the link in
                        incognito; on the instruction page do Step 1 (go to {requestedShop} admin,
                        log in, Back), then Step 2 (Continue to Shopify).
                      </Text>
                    </BlockStack>
                  ) : null}
                  {isOpenedInNewTab ? (
                    <>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        You can close this tab and return to the app in Shopify Admin. Your new
                        store has been added to your account.
                      </Text>
                      <Box paddingBlockStart="300">
                        <Button variant="primary" size="large" onClick={() => window.close()}>
                          Close this tab
                        </Button>
                      </Box>
                    </>
                  ) : (
                    <>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        {isDiscountLaunch
                          ? 'Taking you to Installation settings…'
                          : 'Taking you to the dashboard…'}
                      </Text>
                      <Box paddingBlockStart="300">
                        <Button
                          variant="primary"
                          size="large"
                          onClick={() => {
                            const targetPath = isDiscountLaunch
                              ? ROUTES.appSettings(shop)
                              : ROUTES.appDashboard(shop);
                            const nextParams = new URLSearchParams();
                            if (isDiscountLaunch) {
                              nextParams.set('tab', 'installation');
                              nextParams.set('auto_discount_setup', '1');
                            }
                            const targetWithQuery = nextParams.toString()
                              ? `${targetPath}?${nextParams.toString()}`
                              : targetPath;
                            const target = getUrlWithEmbedParams(targetWithQuery, { shop });
                            navigate(target, { replace: true });
                          }}
                        >
                          {isDiscountLaunch ? 'Go to Installation settings' : 'Go to dashboard'}
                        </Button>
                      </Box>
                    </>
                  )}
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
