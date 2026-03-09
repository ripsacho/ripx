/**
 * Store Switcher Component
 *
 * Multi-store: switch between websites on a single account.
 * Shows dropdown with current store and list of stores.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Popover, ActionList, Text, BlockStack, Icon } from '@shopify/polaris';
import { StoreIcon } from '@shopify/polaris-icons';
import {
  apiGet,
  setCurrentStore as persistCurrentStore,
  getUrlWithEmbedParams,
  isEmbeddedInIframe,
} from '../../services';
import { ROUTES } from '../../constants';
import styles from './StoreSwitcher.module.css';

function StoreSwitcher() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [stores, setStores] = useState([]);
  const [currentStore, setCurrentStore] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStores = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiGet('/account/stores');
      const data = res.data;
      setStores(data?.stores || []);
      setCurrentStore(data?.currentStore || null);
      setPlatform(data?.platform || null);
    } catch {
      setStores([]);
      setCurrentStore(null);
      setPlatform(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const handleActivatorClick = useCallback(() => {
    setActive(a => {
      if (!a) {
        fetchStores();
      }
      return !a;
    });
  }, [fetchStores]);

  const handleStoreSelect = useCallback(
    domain => {
      if (domain === currentStore) {
        setActive(false);
        return;
      }
      persistCurrentStore(domain);
      setActive(false);
      if (isEmbeddedInIframe()) {
        window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(domain), { shop: domain });
      } else {
        navigate(ROUTES.appDashboard(domain));
      }
    },
    [currentStore, navigate]
  );

  const multiStore = stores.length > 1;
  // Only show "Add another website" when account has at least one standalone store (not when all are Shopify)
  const hasStandaloneStore = stores.some(s => (s.platform || '').toLowerCase() === 'standalone');
  const showAddWebsite = hasStandaloneStore && stores.length > 0;

  if (stores.length === 0 || (!multiStore && !showAddWebsite)) {
    return null;
  }

  const displayLabel = currentStore
    ? currentStore.replace(/^www\./, '').split('.')[0]
    : 'Select store';
  const displayLabelFull = currentStore ? currentStore.replace(/^www\./, '') : displayLabel;

  const actionItems = [
    ...stores.map(store => {
      const plat = (store.platform || '').toLowerCase();
      const badge = plat === 'shopify' ? 'Shopify' : 'Standalone';
      return {
        content: `${store.domain} · ${badge}`,
        onAction: () => handleStoreSelect(store.domain),
        active: store.domain === currentStore,
      };
    }),
    ...(stores.length > 0 && hasStandaloneStore
      ? [
          { content: '—', disabled: true },
          {
            content: 'Add another website',
            onAction: () => {
              setActive(false);
              navigate(ROUTES.CONNECT_ADD);
            },
          },
        ]
      : []),
  ];

  return (
    <Popover
      active={active}
      activator={
        <button
          type="button"
          onClick={handleActivatorClick}
          aria-label="Switch store"
          className={`${styles.storeSwitcher} ${active ? styles.active : ''}`}
        >
          <Icon source={StoreIcon} />
          <span className={styles.storeLabel} title={displayLabelFull}>
            {displayLabel}
          </span>
          <svg
            className={styles.chevron}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      }
      onClose={() => setActive(false)}
      preferredAlignment="left"
      preferredPosition="below"
    >
      <div className={styles.storePopover}>
        <BlockStack gap="200">
          <Text variant="headingSm" as="h2">
            Switch store
          </Text>
          {loading ? (
            <Text variant="bodySm" tone="subdued">
              Loading...
            </Text>
          ) : (
            <ActionList items={actionItems} />
          )}
        </BlockStack>
      </div>
    </Popover>
  );
}

export default StoreSwitcher;
