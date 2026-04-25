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
const CONNECT_POPUP_WINDOW_NAME = 'ripx-shopify-connect';
const SHOPIFY_CONNECT_POPUP_CLOSE_SIGNAL_KEY_PREFIX = 'ripx-shopify-connect-close';
const SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX = 'ripx-shopify-connect-popup-active';
const SHOPIFY_CONNECT_POPUP_SESSION_KEY = 'ripx-shopify-connect-popup-session';

export default function OAuthSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const shop = (searchParams.get('shop') || '').trim().toLowerCase();
  const requestedShop = (searchParams.get('requested_shop') || '').trim().toLowerCase();
  const launchIntent = (searchParams.get('launch') || '').trim().toLowerCase();
  const isDiscountLaunch = launchIntent === 'discount_setup';
  const [notified, setNotified] = useState(false);

  const isOpenedInNewTab = typeof window !== 'undefined' && !!window.opener;
  const isConnectPopupWindow =
    typeof window !== 'undefined' &&
    typeof window.name === 'string' &&
    window.name.trim() === CONNECT_POPUP_WINDOW_NAME;
  const isMarkedConnectPopup =
    typeof window !== 'undefined' &&
    (() => {
      try {
        const popupShop = String(
          window.sessionStorage.getItem(SHOPIFY_CONNECT_POPUP_SESSION_KEY) || ''
        )
          .trim()
          .toLowerCase();
        if (popupShop && popupShop === shop) return true;
        const raw = window.sessionStorage.getItem(`${SHOPIFY_CONNECT_POPUP_SESSION_KEY}:${shop}`);
        const ts = Number(raw);
        return Number.isFinite(ts) && Date.now() - ts <= 30 * 60 * 1000;
      } catch {
        return false;
      }
    })();
  const isPopupFlowWindow = isOpenedInNewTab || isConnectPopupWindow || isMarkedConnectPopup;

  useEffect(() => {
    if (!shop) {
      navigate(ROUTES.DOMAINS || '/domains', { replace: true });
      return;
    }
    if (isPopupFlowWindow && !notified) {
      const payload = {
        type: OAUTH_SUCCESS_MESSAGE_TYPE,
        shop: shop.trim().toLowerCase(),
        launch: isDiscountLaunch ? 'discount_setup' : '',
      };
      // When opened from a popup, notify opener (if available), then close this window.
      // window.opener can be null in some browser/privacy cases even for popup flows, so we
      // also rely on polling in the main window.
      const ourOrigin = window.location.origin;
      try {
        if (window.opener) {
          window.opener.postMessage(payload, 'https://admin.shopify.com');
        }
      } catch {
        try {
          if (window.opener) {
            window.opener.postMessage(payload, ourOrigin);
          }
        } catch {
          // Opener is other origin; ignore.
        }
      }
      setNotified(true);
      // Close quickly once the success view appears in popup/new-tab flow.
      const closeTimer = window.setTimeout(() => {
        window.close();
      }, 700);
      return () => window.clearTimeout(closeTimer);
    } else if (!isPopupFlowWindow) {
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
  }, [shop, isPopupFlowWindow, notified, navigate, isDiscountLaunch]);

  useEffect(() => {
    if (!shop || !isPopupFlowWindow) return undefined;
    const closeSignalKey = `${SHOPIFY_CONNECT_POPUP_CLOSE_SIGNAL_KEY_PREFIX}:${shop}`;
    const popupActiveKey = `${SHOPIFY_CONNECT_POPUP_ACTIVE_KEY_PREFIX}:${shop}`;
    const shouldCloseFromSignal = () => {
      try {
        const raw = window.localStorage.getItem(closeSignalKey);
        if (!raw) return false;
        const ts = Number(raw);
        if (!Number.isFinite(ts)) return false;
        // Accept recent close signals only.
        return Date.now() - ts <= 2 * 60 * 1000;
      } catch {
        return false;
      }
    };
    const closeFromSignal = () => {
      if (!shouldCloseFromSignal()) return false;
      try {
        window.localStorage.removeItem(closeSignalKey);
        window.localStorage.removeItem(popupActiveKey);
        window.sessionStorage.removeItem(SHOPIFY_CONNECT_POPUP_SESSION_KEY);
        window.sessionStorage.removeItem(`${SHOPIFY_CONNECT_POPUP_SESSION_KEY}:${shop}`);
      } catch {
        // ignore storage errors
      }
      window.close();
      return true;
    };
    if (closeFromSignal()) {
      return undefined;
    }
    const onStorage = event => {
      if (event?.key !== closeSignalKey) return;
      closeFromSignal();
    };
    const signalPoll = window.setInterval(() => {
      closeFromSignal();
    }, 250);
    // Safety fallback so popup does not remain open forever if signal is missed.
    const fallbackTimer = window.setTimeout(() => {
      try {
        window.localStorage.removeItem(popupActiveKey);
      } catch {
        // ignore storage errors
      }
      window.close();
    }, 15000);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(signalPoll);
      window.clearTimeout(fallbackTimer);
    };
  }, [shop, isPopupFlowWindow]);

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
                  {isPopupFlowWindow ? (
                    <>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Connection complete. This window closes automatically; if it stays open, you
                        can close it and return to the app.
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
