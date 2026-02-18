/**
 * Connect Component
 *
 * For standalone (non-Shopify) sites: register new site or enter API key.
 * Supports both Shopify and standalone with clear platform options.
 */

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Box,
} from '@shopify/polaris';
import { CustomTabs } from '../Shared';
import { ClipboardIcon } from '@shopify/polaris-icons';
import { PageShell } from '../Shared';
import { CONTENT_GAP, FORM_GAP, STORAGE_KEYS, ROUTES } from '../../constants';
import { getApiKey, apiPostPublic, apiPost } from '../../services';
import styles from './Connect.module.css';

function Connect() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam === 'add' && getApiKey() ? 2 : 0);

  useEffect(() => {
    if (tabParam === 'add' && getApiKey()) {
      setActiveTab(2);
    }
  }, [tabParam]);

  const hasApiKey = !!getApiKey();
  const tabCount = hasApiKey ? 3 : 2;
  const safeActiveTab = activeTab >= tabCount ? 0 : activeTab;
  const [apiKey, setApiKey] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [newApiKey, setNewApiKey] = useState(null);
  const [addDomain, setAddDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);

  const handleConnect = (e) => {
    e?.preventDefault();
    setError(null);

    const trimmed = apiKey.trim();
    if (!trimmed) {
      setError('Please enter your API key');
      return;
    }

    if (!trimmed.startsWith('sk_')) {
      setError('API key should start with sk_');
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_KEYS.API_KEY, trimmed);
      window.localStorage.removeItem(STORAGE_KEYS.SHOP_DOMAIN);
      window.localStorage.removeItem(STORAGE_KEYS.CURRENT_STORE);
      setSuccess('Connected! Redirecting to dashboard...');
      setTimeout(() => {
        window.location.href = ROUTES.DASHBOARD;
      }, 800);
    } catch (err) {
      setError('Could not save credentials');
    }
  };

  const handleRegister = async (e) => {
    e?.preventDefault();
    setError(null);
    setSuccess(null);
    setNewApiKey(null);

    const trimmed = domain.trim().replace(/^https?:\/\//, '').split('/')[0];
    if (!trimmed) {
      setError('Please enter your website domain (e.g. example.com)');
      return;
    }
    // Basic domain format: has at least one dot, valid chars
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(trimmed)) {
      setError('Enter a valid domain (e.g. example.com or www.example.com)');
      return;
    }

    setRegistering(true);
    try {
      const res = await apiPostPublic('/tenants/standalone', { domain: trimmed });
      const data = res.data;
      const key = data?.apiKey;
      if (key) {
        setNewApiKey(key);
        setSuccess('Site registered. Copy and store your API key securely — it will not be shown again.');
      } else {
        setError('Registration succeeded but no API key returned');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Registration failed';
      setError(
        msg.includes('already registered')
          ? `${msg} Use the "I have an API key" tab to connect with your existing key.`
          : msg
      );
    } finally {
      setRegistering(false);
    }
  };

  const handleUseNewKey = () => {
    if (newApiKey) {
      try {
        window.localStorage.setItem(STORAGE_KEYS.API_KEY, newApiKey);
        const normalizedDomain = domain.trim().replace(/^https?:\/\//, '').split('/')[0];
        if (normalizedDomain) {
          window.localStorage.setItem(STORAGE_KEYS.SHOP_DOMAIN, normalizedDomain);
          window.localStorage.setItem(STORAGE_KEYS.CURRENT_STORE, normalizedDomain);
        }
        setSuccess('Connected! Redirecting to dashboard...');
        setTimeout(() => {
          window.location.href = ROUTES.DASHBOARD;
        }, 800);
      } catch {
        setError('Could not save API key');
      }
    }
  };

  const handleCopyKey = async () => {
    if (!newApiKey) return;
    try {
      await navigator.clipboard.writeText(newApiKey);
      setSuccess('API key copied to clipboard');
    } catch {
      setError('Could not copy');
    }
  };

  const handleClear = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEYS.API_KEY);
      window.location.reload();
    } catch {
      // Ignore
    }
  };

  const handleAddWebsite = async (e) => {
    e?.preventDefault();
    setError(null);
    setSuccess(null);
    const trimmed = addDomain.trim().replace(/^https?:\/\//, '').split('/')[0];
    if (!trimmed) {
      setError('Please enter your website domain');
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(trimmed)) {
      setError('Enter a valid domain (e.g. example.com)');
      return;
    }
    setAddingDomain(true);
    try {
      await apiPost('/account/stores', { domain: trimmed });
      try {
        window.localStorage.setItem(STORAGE_KEYS.SHOP_DOMAIN, trimmed);
        window.localStorage.setItem(STORAGE_KEYS.CURRENT_STORE, trimmed);
      } catch {
        // ignore storage errors
      }
      setSuccess(`Website ${trimmed} added. Switching to it now...`);
      setAddDomain('');
      setTimeout(() => {
        window.location.href = ROUTES.DASHBOARD;
      }, 1000);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to add website';
      const is409 = err?.response?.status === 409;
      setError(
        is409 && msg.toLowerCase().includes('already registered')
          ? 'This domain is already in your account. Switch to it using the store selector above.'
          : msg
      );
    } finally {
      setAddingDomain(false);
    }
  };

  const tabs = [
    { id: 'connect', content: 'I have an API key' },
    { id: 'register', content: 'Register new site' },
    ...(hasApiKey ? [{ id: 'add', content: 'Add another website' }] : []),
  ];

  return (
    <PageShell
      message={error || success}
      messageType={error ? 'error' : 'success'}
      onCloseMessage={() => {
        setError(null);
        setSuccess(null);
      }}
      messageDuration={error ? 5000 : 3000}
    >
      <Page title="Connect RipX">
        <div className={styles.connectPage}>
          <div className={styles.connectHero}>
            <h1 className={styles.connectHeroTitle}>Connect your website</h1>
            <p className={styles.connectHeroSubtitle}>
              RipX works with any website — WordPress, Webflow, custom HTML, or Shopify.
              Register your domain to get an API key, or enter an existing key.
            </p>
            <span className={styles.connectBadge}>Non-Shopify / Standalone</span>
          </div>

          <Card className={styles.connectCard}>
            <Box padding="400">
              <CustomTabs tabs={tabs} selected={safeActiveTab} onSelect={setActiveTab}>
                <Box paddingBlockStart="400">
                  {safeActiveTab === 0 && (
                    <BlockStack gap={CONTENT_GAP}>
                      <Text variant="headingMd" as="h2">
                        Enter API Key
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Use an API key from a previously registered site.
                      </Text>
                      <form onSubmit={handleConnect}>
                        <FormLayout>
                          <TextField
                            label="RipX API Key"
                            value={apiKey}
                            onChange={setApiKey}
                            type="password"
                            placeholder="sk_..."
                            autoComplete="off"
                            helpText="Your API key from tenant registration"
                            error={error}
                          />
                          <InlineStack gap={FORM_GAP}>
                            <Button submit variant="primary">
                              Connect
                            </Button>
                            {hasApiKey && (
                              <Button onClick={handleClear} tone="critical">
                                Clear & use different key
                              </Button>
                            )}
                          </InlineStack>
                        </FormLayout>
                      </form>
                    </BlockStack>
                  )}

                  {safeActiveTab === 1 && (
                    <BlockStack gap={CONTENT_GAP}>
                      <Text variant="headingMd" as="h2">
                        Register New Site
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Register your website domain to get an API key. Use the exact domain
                        visitors see (e.g. example.com or www.example.com).
                      </Text>

                      {!newApiKey ? (
                        <form onSubmit={handleRegister}>
                          <FormLayout>
                            <TextField
                              label="Website domain"
                              value={domain}
                              onChange={setDomain}
                              placeholder="example.com"
                              autoComplete="off"
                              helpText="Your site domain without https://"
                              error={error}
                            />
                            <Button submit variant="primary" loading={registering}>
                              Register & get API key
                            </Button>
                          </FormLayout>
                        </form>
                      ) : (
                        <BlockStack gap={CONTENT_GAP}>
                          <FormLayout>
                            <TextField
                              label="Your API key (save this — shown once)"
                              value={newApiKey}
                              readOnly
                              type="password"
                              helpText="Copy and store securely. Use in X-RipX-API-Key header or at /connect"
                            />
                            <InlineStack gap={FORM_GAP}>
                              <Button icon={ClipboardIcon} onClick={handleCopyKey}>
                                Copy key
                              </Button>
                              <Button variant="primary" onClick={handleUseNewKey}>
                                Use this key & connect
                              </Button>
                            </InlineStack>
                          </FormLayout>
                        </BlockStack>
                      )}
                    </BlockStack>
                  )}

                  {safeActiveTab === 2 && hasApiKey && (
                    <BlockStack gap={CONTENT_GAP}>
                      <Text variant="headingMd" as="h2">
                        Add another website
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Add more websites to your account. Use the store selector in the top bar to switch between them.
                      </Text>
                      <form onSubmit={handleAddWebsite}>
                        <FormLayout>
                          <TextField
                            label="Website domain"
                            value={addDomain}
                            onChange={setAddDomain}
                            placeholder="another-site.com"
                            autoComplete="off"
                            helpText="Domain visitors see (e.g. example.com)"
                            error={error}
                          />
                          <Button submit variant="primary" loading={addingDomain}>
                            Add website
                          </Button>
                        </FormLayout>
                      </form>
                    </BlockStack>
                  )}
                </Box>
              </CustomTabs>
            </Box>
          </Card>

          <div className={styles.connectNextSteps}>
            <h3 className={styles.connectNextStepsTitle}>What happens next</h3>
            <p className={styles.connectNextStepsText}>
              After connecting, you&apos;ll land on the dashboard. Go to{' '}
              <Link to={ROUTES.SETUP}>Setup Wizard</Link> or{' '}
              <Link to={ROUTES.SETTINGS}>Settings → Installation</Link> to copy the script snippet and add it to your site.
              One script tag — that&apos;s all you need.
            </p>
          </div>
        </div>
      </Page>
    </PageShell>
  );
}

export default Connect;
