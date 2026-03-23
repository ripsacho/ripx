/**
 * Store Switcher Component
 *
 * Multi-store: switch between websites on a single account.
 * Shows dropdown with current store and list of stores.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Popover, ActionList, Text, BlockStack, Icon } from '@shopify/polaris';
import { StoreIcon } from '@shopify/polaris-icons';
import {
  apiGet,
  setCurrentStore as persistCurrentStore,
  getUrlWithEmbedParams,
  isEmbeddedInIframe,
} from '../../services';
import { ROUTES, STORAGE_KEYS, RIPX_STORE_SWITCHED_EVENT } from '../../constants';
import { getAppDomainFromPath } from '../../utils/breadcrumb';
import styles from './StoreSwitcher.module.css';

const STORE_SWITCH_TOAST_TTL_MS = 60_000;

function queueStoreSwitchToast(domain) {
  if (!domain || typeof domain !== 'string') return;
  try {
    const label = domain.replace(/^www\./, '');
    sessionStorage.setItem(
      STORAGE_KEYS.STORE_SWITCH_TOAST,
      JSON.stringify({
        domain,
        label,
        exp: Date.now() + STORE_SWITCH_TOAST_TTL_MS,
      })
    );
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function domainsMatch(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function StoreSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const domainFromUrl = getAppDomainFromPath(location.pathname);
  const [active, setActive] = useState(false);
  const [stores, setStores] = useState([]);
  const [currentStore, setCurrentStore] = useState(null);
  const [, setPlatform] = useState(null);
  const [loading, setLoading] = useState(false);
  const [justSwitched, setJustSwitched] = useState(false);
  const switchPulseTimerRef = useRef(null);

  useEffect(() => {
    const onStoreSwitched = () => {
      if (switchPulseTimerRef.current) {
        window.clearTimeout(switchPulseTimerRef.current);
      }
      setJustSwitched(true);
      switchPulseTimerRef.current = window.setTimeout(() => {
        setJustSwitched(false);
        switchPulseTimerRef.current = null;
      }, 3200);
    };
    window.addEventListener(RIPX_STORE_SWITCHED_EVENT, onStoreSwitched);
    return () => {
      window.removeEventListener(RIPX_STORE_SWITCHED_EVENT, onStoreSwitched);
      if (switchPulseTimerRef.current) {
        window.clearTimeout(switchPulseTimerRef.current);
      }
    };
  }, []);

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

  /** URL updates immediately on navigate; /account/stores currentStore only updates on refetch */
  const activeStore = domainFromUrl || currentStore;

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
      if (domainsMatch(domain, activeStore)) {
        setActive(false);
        return;
      }
      persistCurrentStore(domain);
      queueStoreSwitchToast(domain);
      setActive(false);
      if (isEmbeddedInIframe()) {
        window.location.href = getUrlWithEmbedParams(ROUTES.appDashboard(domain), { shop: domain });
      } else {
        navigate(ROUTES.appDashboard(domain));
      }
    },
    [activeStore, navigate]
  );

  const multiStore = stores.length > 1;
  // Only show "Add another website" when account has at least one standalone store (not when all are Shopify)
  const hasStandaloneStore = stores.some(s => (s.platform || '').toLowerCase() === 'standalone');
  const showAddWebsite = hasStandaloneStore && stores.length > 0;

  if (stores.length === 0 || (!multiStore && !showAddWebsite)) {
    return null;
  }

  const displayLabel = activeStore
    ? activeStore.replace(/^www\./, '').split('.')[0]
    : 'Select store';
  const displayLabelFull = activeStore ? activeStore.replace(/^www\./, '') : displayLabel;

  const actionItems = [
    ...stores.map(store => {
      const plat = (store.platform || '').toLowerCase();
      const badge = plat === 'shopify' ? 'Shopify' : 'Standalone';
      return {
        content: `${store.domain} · ${badge}`,
        onAction: () => handleStoreSelect(store.domain),
        active: domainsMatch(store.domain, activeStore),
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
          className={`${styles.storeSwitcher} ${active ? styles.active : ''} ${justSwitched ? styles.justSwitched : ''}`}
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
