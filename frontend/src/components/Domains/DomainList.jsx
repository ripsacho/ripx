/**
 * Domain List – list domains the current user can access (email session).
 * Add domain, Open domain (set API key + current store, go to dashboard).
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Page,
  Card,
  DataTable,
  Modal,
  TextField,
  Text,
  BlockStack,
  Banner,
  Spinner,
  Icon,
} from '@shopify/polaris';
import { PlusIcon, ClipboardIcon, LinkIcon, GlobeIcon } from '@shopify/polaris-icons';
import { PageShell, LegalFooter } from '../Shared';
import { ROUTES, STORAGE_KEYS } from '../../constants';
import styles from './DomainList.module.css';
import {
  apiMeGet,
  apiMePost,
  apiMeDelete,
  apiGet,
  getAccountApiKey,
  setAccountApiKey,
  getDomainKeys,
  setDomainKey,
  unwrapData,
  clearAuthStorage,
  clearStoreSelection,
  getEmailToken,
  setCurrentStore,
} from '../../services';

function DomainList() {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [addError, setAddError] = useState(null);
  const [newlyReceivedApiKey, setNewlyReceivedApiKey] = useState(null);
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyError, setApiKeyError] = useState(null);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [domainToRemove, setDomainToRemove] = useState(null);

  const useEmailDomains = !!getEmailToken();

  const {
    data: meData,
    isLoading: meLoading,
    error: meError,
  } = useQuery({
    queryKey: ['me', 'domains'],
    queryFn: async () => {
      const res = await apiMeGet('/me/domains');
      return unwrapData(res) || { domains: [] };
    },
    staleTime: 30 * 1000,
    enabled: useEmailDomains,
  });

  const {
    data: accountStoresData,
    isLoading: accountStoresLoading,
    error: accountStoresError,
  } = useQuery({
    queryKey: ['account', 'stores'],
    queryFn: async () => {
      const res = await apiGet('/account/stores');
      const raw = res.data?.data ?? res.data;
      const stores = raw?.stores ?? [];
      return {
        domains: stores.map(s => ({ domain: s.domain, platform: s.platform || 'shopify' })),
        raw,
      };
    },
    staleTime: 30 * 1000,
    enabled: !useEmailDomains,
  });

  const data = useEmailDomains ? meData : accountStoresData;
  const isLoading = useEmailDomains ? meLoading : accountStoresLoading;
  const error = useEmailDomains ? meError : accountStoresError;
  const domains = data?.domains ?? [];

  const addMutation = useMutation({
    mutationFn: async domain => {
      const res = await apiMePost('/me/domains', { domain: domain.trim() });
      return unwrapData(res);
    },
    onSuccess: (payload, submittedDomain) => {
      const normalized = submittedDomain
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0];
      if (payload?.apiKey) {
        setAccountApiKey(payload.apiKey);
        setDomainKey(normalized, payload.apiKey);
        setNewlyReceivedApiKey(payload.apiKey);
      }
      queryClient.invalidateQueries({ queryKey: ['me', 'domains'] });
      setAddModalOpen(false);
      setNewDomain('');
      setAddError(null);
    },
    onError: err => {
      setAddError(err.response?.data?.error || err.message || 'Failed to add domain');
    },
  });

  const removeDomainMutation = useMutation({
    mutationFn: async ({ tenantId }) => {
      const res = await apiMeDelete(`/me/domains/${encodeURIComponent(tenantId)}`);
      return res.data;
    },
    onSuccess: (_data, { domain: domainName }) => {
      if (domainName) setDomainKey(domainName, null);
      queryClient.invalidateQueries({ queryKey: ['me', 'domains'] });
      setRemoveConfirmOpen(false);
      setDomainToRemove(null);
    },
    onError: () => {
      setRemoveConfirmOpen(false);
      setDomainToRemove(null);
    },
  });

  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiMePost('/me/account/regenerate-api-key', {});
      return unwrapData(res);
    },
    onSuccess: payload => {
      if (payload?.apiKey) {
        setAccountApiKey(payload.apiKey);
        setNewlyReceivedApiKey(payload.apiKey);
      }
      setRegenerateConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['me', 'domains'] });
    },
    onError: () => {
      setRegenerateConfirmOpen(false);
    },
  });

  const handleRegenerateApiKey = () => {
    regenerateKeyMutation.mutate();
  };

  const handleOpen = domainRow => {
    const key = getAccountApiKey() || getDomainKeys()[domainRow.domain];
    if (!key) {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEYS.API_KEY, key);
      setCurrentStore(domainRow.domain);
      window.location.href = ROUTES.DASHBOARD;
    } catch (_) {
      // ignore storage errors
    }
  };

  const handleOpenApp = domain => {
    setCurrentStore(domain);
    window.location.href = ROUTES.DASHBOARD;
  };

  const handleAddSubmit = () => {
    const trimmed = newDomain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    if (!trimmed) {
      setAddError('Enter a domain (e.g. example.com)');
      return;
    }
    setAddError(null);
    addMutation.mutate(trimmed);
  };

  const handleConnectWithApiKey = () => {
    setApiKeyError(null);
    const trimmed = (apiKeyValue || '').trim();
    if (!trimmed) {
      setApiKeyError('Enter your API key');
      return;
    }
    if (!trimmed.startsWith('sk_')) {
      setApiKeyError('API key should start with sk_');
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEYS.API_KEY, trimmed);
      clearStoreSelection();
      setApiKeyModalOpen(false);
      setApiKeyValue('');
      setApiKeyError(null);
      window.location.href = ROUTES.DASHBOARD;
    } catch (_) {
      setApiKeyError('Could not save API key');
    }
  };

  const handleLogout = () => {
    clearAuthStorage();
    window.location.href = ROUTES.CONNECT;
  };

  const accountKey = getAccountApiKey();
  const domainKeys = getDomainKeys();

  useEffect(() => {
    document.title = useEmailDomains ? 'My domains · RipX' : 'Your store · RipX';
    return () => {
      document.title = 'RipX';
    };
  }, [useEmailDomains]);

  const rows = useEmailDomains
    ? domains.map(d => {
        const keyForDomain = accountKey || domainKeys[d.domain];
        return [
          d.domain,
          d.platform || 'standalone',
          d.connection || '—',
          (d.permittedUsers || []).map(u => u.email).join(', ') || '—',
          d.myRole || '—',
          keyForDomain ? (
            <button type="button" className={styles.openDomainBtn} onClick={() => handleOpen(d)}>
              Open
            </button>
          ) : (
            <button
              type="button"
              className={styles.connectKeyHintBtn}
              onClick={() => setApiKeyModalOpen(true)}
              title="Paste your API key to open this domain"
            >
              Connect with API key
            </button>
          ),
          <button
            key={`remove-${d.id}`}
            type="button"
            className={styles.removeDomainBtn}
            onClick={() => {
              setDomainToRemove({ id: d.id, domain: d.domain });
              setRemoveConfirmOpen(true);
            }}
            title={`Remove ${d.domain} from your list`}
          >
            Remove
          </button>,
        ];
      })
    : domains.map(d => [
        d.domain,
        d.platform || 'standalone',
        <button
          key={`open-${d.domain}`}
          type="button"
          className={styles.openDomainBtn}
          onClick={() => handleOpenApp(d.domain)}
        >
          Open app
        </button>,
      ]);

  const isEmpty = domains.length === 0 && !isLoading && !error;
  const emptyStateMarkup =
    domains.length === 0 ? (
      useEmailDomains ? (
        <div className={styles.emptyStateFill}>
          <section className={styles.mainEmptySection} aria-label="No domains">
            <div className={styles.mainEmptyMessage}>
              <div className={styles.mainEmptyIcon}>
                <Icon source={GlobeIcon} tone="base" />
              </div>
              <h2 className={styles.mainEmptyHeading}>No domains connected</h2>
              <p className={styles.mainEmptyText}>
                You don’t have any domains yet. Add your first domain to connect a website and start
                running A/B tests with RipX.
              </p>
              <div className={styles.mainEmptyActions}>
                <button
                  type="button"
                  className={styles.mainEmptyCta}
                  onClick={() => setAddModalOpen(true)}
                >
                  <Icon source={PlusIcon} />
                  Add domain
                </button>
                <button
                  type="button"
                  className={styles.mainEmptySecondary}
                  onClick={() => setApiKeyModalOpen(true)}
                >
                  <Icon source={LinkIcon} />
                  Connect with API key
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className={styles.emptyStateFill}>
          <section className={styles.mainEmptySection} aria-label="No stores">
            <div className={styles.mainEmptyMessage}>
              <div className={styles.mainEmptyIcon}>
                <Icon source={GlobeIcon} tone="base" />
              </div>
              <h2 className={styles.mainEmptyHeading}>No stores</h2>
              <p className={styles.mainEmptyText}>
                No stores found for this session. Open the app from Shopify Admin or sign in to see
                your stores.
              </p>
            </div>
          </section>
        </div>
      )
    ) : null;

  return (
    <PageShell className={`${styles.domainsPage}${isEmpty ? ` ${styles.domainsPageEmpty}` : ''}`}>
      <div className={styles.domainsHeader}>
        <header className={styles.domainsTopBar}>
          <div className={styles.domainsTopBarTitle}>
            <img src="/logo.svg" alt="" className={styles.domainsLogo} width={32} height={32} />
            <span>My domains</span>
          </div>
          <div className={styles.domainsTopBarActions}>
            {useEmailDomains && (
              <>
                <button
                  type="button"
                  className={styles.domainsActionSecondary}
                  onClick={() => setApiKeyModalOpen(true)}
                >
                  <LinkIcon />
                  Connect with API key
                </button>
                <button
                  type="button"
                  className={styles.domainsActionPrimary}
                  onClick={() => setAddModalOpen(true)}
                >
                  <PlusIcon />
                  Add domain
                </button>
              </>
            )}
            <button type="button" className={styles.domainsActionSignOut} onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>
        <div className={styles.domainsHero}>
          <p className={styles.domainsHeroText}>
            {useEmailDomains
              ? 'Connect your websites and open any domain to manage A/B tests, analytics, and experiments.'
              : 'Open the app for your store to manage A/B tests, analytics, and experiments.'}
          </p>
          {domains.length > 0 && (
            <div className={styles.domainsHeroStat}>
              <span className={styles.domainsHeroStatValue}>{domains.length}</span>
              <span className={styles.domainsHeroStatLabel}>
                {domains.length === 1 ? 'domain' : 'domains'} connected
              </span>
            </div>
          )}
        </div>
      </div>
      <Page title="" subtitle="">
        <div className={styles.domainsContent}>
          <BlockStack gap="400">
            {useEmailDomains && newlyReceivedApiKey && (
              <div className={styles.bannerWrap}>
                <Banner
                  tone="warning"
                  title="Store your API key"
                  onDismiss={() => setNewlyReceivedApiKey(null)}
                  action={{
                    content: 'Copy key',
                    icon: ClipboardIcon,
                    onAction: () => {
                      try {
                        navigator.clipboard.writeText(newlyReceivedApiKey);
                      } catch (_) {
                        // clipboard not available
                      }
                    },
                  }}
                >
                  <p>
                    This key is shown only once. Copy it and store it securely. Use it in the
                    X-RipX-API-Key header or at Connect.
                  </p>
                  <p
                    style={{
                      marginTop: 8,
                      wordBreak: 'break-all',
                      fontFamily: 'monospace',
                      fontSize: '0.9em',
                    }}
                  >
                    {newlyReceivedApiKey}
                  </p>
                </Banner>
              </div>
            )}
            {/* Shown when user has domains (from API) but this browser has no stored API key – e.g. they added the domain on another device or cleared storage */}
            {useEmailDomains && !accountKey && domains.length > 0 && !newlyReceivedApiKey && (
              <div className={styles.bannerWrap}>
                <Banner
                  tone="info"
                  action={{
                    content: 'Get new API key',
                    onAction: () => setRegenerateConfirmOpen(true),
                    loading: regenerateKeyMutation.isPending,
                  }}
                  secondaryAction={{
                    content: 'Connect with API key',
                    onAction: () => setApiKeyModalOpen(true),
                  }}
                >
                  You have domains but no API key in this browser. Get a new key for this device
                  (invalidates any previous key), or paste an existing key with &quot;Connect with
                  API key&quot;.
                </Banner>
              </div>
            )}
            {error && (
              <div className={styles.bannerWrap}>
                <Banner
                  tone="critical"
                  action={{
                    content: 'Retry',
                    onAction: () =>
                      queryClient.invalidateQueries({
                        queryKey: useEmailDomains ? ['me', 'domains'] : ['account', 'stores'],
                      }),
                  }}
                  onDismiss={() =>
                    queryClient.invalidateQueries({
                      queryKey: useEmailDomains ? ['me', 'domains'] : ['account', 'stores'],
                    })
                  }
                >
                  {error.message || 'Failed to load domains'}
                </Banner>
              </div>
            )}
            {isLoading ? (
              <Card className={styles.domainsCard}>
                <div className={styles.loadingCard}>
                  <Spinner size="large" />
                  <Text as="p" fontWeight="medium">
                    Loading domains…
                  </Text>
                </div>
              </Card>
            ) : emptyStateMarkup ? (
              emptyStateMarkup
            ) : (
              <div className={styles.tableSection}>
                <div className={styles.tableSectionHeader}>
                  <h2 className={styles.tableSectionTitle}>
                    {useEmailDomains ? 'Your domains' : 'Your store'}
                  </h2>
                  <span className={styles.tableSectionBadge}>{domains.length}</span>
                </div>
                <Card className={`${styles.domainsCard} ${styles.tableCard}`}>
                  <DataTable
                    columnContentTypes={
                      useEmailDomains
                        ? ['text', 'text', 'text', 'text', 'text', 'text', 'text']
                        : ['text', 'text', 'text']
                    }
                    headings={
                      useEmailDomains
                        ? [
                            'Domain',
                            'Platform',
                            'Connection',
                            'Permitted users',
                            'Role',
                            'Actions',
                            'Remove',
                          ]
                        : ['Domain', 'Platform', 'Actions']
                    }
                    rows={rows}
                  />
                </Card>
              </div>
            )}
          </BlockStack>
          <div className={styles.legalWrap}>
            <LegalFooter />
          </div>
        </div>
      </Page>

      <Modal
        open={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setNewDomain('');
          setAddError(null);
        }}
        title="Add domain"
        primaryAction={{
          content: 'Add domain',
          onAction: handleAddSubmit,
          loading: addMutation.isPending,
        }}
      >
        <Modal.Section>
          <div className={styles.modalSectionInner}>
            <p className={styles.modalHint}>
              Enter your website domain (e.g. example.com). You’ll receive an API key to install on
              that site so you can run A/B tests.
            </p>
            <TextField
              label="Domain"
              value={newDomain}
              onChange={setNewDomain}
              placeholder="example.com"
              autoComplete="off"
              error={addError}
              helpText="Use the domain only, without https:// or path"
            />
          </div>
        </Modal.Section>
      </Modal>

      <Modal
        open={apiKeyModalOpen}
        onClose={() => {
          setApiKeyModalOpen(false);
          setApiKeyValue('');
          setApiKeyError(null);
        }}
        title="Connect with API key"
        primaryAction={{
          content: 'Connect',
          onAction: handleConnectWithApiKey,
        }}
      >
        <Modal.Section>
          <div className={styles.modalSectionInner}>
            <p className={styles.modalHint}>
              Paste an existing RipX API key (e.g. from another device or a site you already added).
              You’ll be taken to the dashboard for that store.
            </p>
            <TextField
              label="RipX API Key"
              value={apiKeyValue}
              onChange={setApiKeyValue}
              placeholder="sk_..."
              type="password"
              autoComplete="off"
              error={apiKeyError}
              helpText="Keys start with sk_ and are shown once when you add a domain"
            />
          </div>
        </Modal.Section>
      </Modal>

      <Modal
        open={removeConfirmOpen}
        onClose={() => {
          if (!removeDomainMutation.isPending) {
            setRemoveConfirmOpen(false);
            setDomainToRemove(null);
          }
        }}
        title="Remove domain"
        primaryAction={{
          content: 'Remove domain',
          destructive: true,
          onAction: () => {
            if (domainToRemove)
              removeDomainMutation.mutate({
                tenantId: domainToRemove.id,
                domain: domainToRemove.domain,
              });
          },
          loading: removeDomainMutation.isPending,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => {
              setRemoveConfirmOpen(false);
              setDomainToRemove(null);
            },
          },
        ]}
      >
        <Modal.Section>
          <p className={styles.modalHint}>
            {domainToRemove
              ? `Remove ${domainToRemove.domain} from your list? It will no longer appear here. You can add it again later.`
              : ''}
          </p>
        </Modal.Section>
      </Modal>

      <Modal
        open={regenerateConfirmOpen}
        onClose={() => !regenerateKeyMutation.isPending && setRegenerateConfirmOpen(false)}
        title="Get new API key"
        primaryAction={{
          content: 'Get new key',
          onAction: handleRegenerateApiKey,
          loading: regenerateKeyMutation.isPending,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setRegenerateConfirmOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <p className={styles.modalHint}>
            A new API key will be generated and the previous one will stop working. Use the new key
            in this browser to open your domains. Store it securely—it is shown only once.
          </p>
        </Modal.Section>
      </Modal>
    </PageShell>
  );
}

export default DomainList;
