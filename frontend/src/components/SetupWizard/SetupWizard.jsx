/**
 * Setup Wizard Component
 *
 * Guides merchants through setup:
 * - Shopify: App Proxy + App Embed
 * - Standalone: Copy script → Add to site
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  Page,
  Card,
  Layout,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Button,
  Banner,
  List,
  Divider,
  ProgressBar,
  ButtonGroup,
} from '@shopify/polaris';
import { SettingsIcon, CodeIcon } from '@shopify/polaris-icons';
import { apiGet, getShopDomain, isStandaloneMode } from '../../services';
import { isShopifyStoreDomain } from '../../utils/shopifyAdmin';
import { isStorefrontRuntimeReady } from '../../utils/storefrontSetupStatus';
import { PageShell } from '../Shared';
import { ROUTES } from '../../constants';
import { RIPX_STOREFRONT_SCRIPT_VERSION } from '../../constants/app';
import styles from './SetupWizard.module.css';

const StepIcon = ({ type }) => {
  if (type === 'link') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10.59 13.41a1 1 0 0 0 1.41 1.41l4.24-4.24a3 3 0 1 0-4.24-4.24l-1.59 1.59a1 1 0 1 0 1.41 1.41l1.59-1.59a1 1 0 1 1 1.41 1.41l-4.24 4.24z" />
        <path d="M7.76 17.24a3 3 0 1 0 4.24 4.24l1.59-1.59a1 1 0 0 0-1.41-1.41l-1.59 1.59a1 1 0 0 1-1.41-1.41l4.24-4.24a1 1 0 1 0-1.41-1.41l-4.24 4.24z" />
      </svg>
    );
  }
  if (type === 'proxy') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6a2 2 0 0 1 2-2h3a1 1 0 1 1 0 2H7v12h3a1 1 0 1 1 0 2H7a2 2 0 0 1-2-2V6z" />
        <path d="M14 4a1 1 0 1 1 0 2h3v12h-3a1 1 0 1 1 0 2h3a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3z" />
        <path d="M9 12a1 1 0 0 1 1-1h4.17l-1.58-1.59a1 1 0 0 1 1.41-1.41l3.3 3.3a1 1 0 0 1 0 1.41l-3.3 3.3a1 1 0 0 1-1.41-1.41l1.58-1.59H10a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (type === 'embed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 2a2 2 0 0 1 2 2v2h2a2 2 0 1 1 0 4h-2v4h4v-2a2 2 0 1 1 4 0v2a4 4 0 0 1-4 4h-4v2a2 2 0 1 1-4 0v-2H7a4 4 0 0 1-4-4v-2a2 2 0 1 1 4 0v2h4V10H7a2 2 0 1 1 0-4h4V4a2 2 0 0 1 2-2z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
    </svg>
  );
};

function SetupWizard() {
  const { domain } = useParams();
  const [setupStatus, setSetupStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);
  const [copiedMessage, setCopiedMessage] = useState(null);
  const [installation, setInstallation] = useState(null);
  const [installationLoading, setInstallationLoading] = useState(false);

  const isShopifyFromRoute = domain && isShopifyStoreDomain(domain);
  const standalone = !isShopifyFromRoute && isStandaloneMode();
  const shopDomain = setupStatus?.shopDomain || getShopDomain();
  const settingsPath = domain ? ROUTES.appSettings(domain) : ROUTES.PROFILE_ACCOUNT;
  const installationHubPath = domain
    ? `${ROUTES.appSettings(domain)}?tab=installation&guided_setup=1`
    : settingsPath;
  const appUrl = setupStatus?.appUrl || '';
  const proxyTargetUrl = setupStatus?.proxyTargetUrl || '';
  const proxyScriptUrl = useMemo(() => {
    if (installation?.scriptUrl) {
      return installation.scriptUrl;
    }
    if (!shopDomain) return '';
    return `https://${shopDomain}/apps/ripx/script.js?v=${RIPX_STOREFRONT_SCRIPT_VERSION}`;
  }, [shopDomain, installation?.scriptUrl]);

  const proxyOk = setupStatus?.proxyStatus?.ok;
  const proxyStatusCode = setupStatus?.proxyStatus?.statusCode;
  const embedDetected = setupStatus?.embedStatus?.detected;
  const embedStatusCode = setupStatus?.embedStatus?.statusCode;
  const storefrontRuntimeReady = isStorefrontRuntimeReady(setupStatus);

  const fetchInstallation = useCallback(async () => {
    setInstallationLoading(true);
    setError(null);
    try {
      const res = await apiGet('/settings/installation');
      setInstallation(res.data?.installation || null);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load installation');
    } finally {
      setInstallationLoading(false);
    }
  }, []);

  const checkSetupStatus = useCallback(async () => {
    if (standalone) {
      await fetchInstallation();
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const response = await apiGet('/shopify/setup/status');
      setSetupStatus(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to check setup status');
    } finally {
      setChecking(false);
    }
  }, [standalone, fetchInstallation]);

  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  const totalSteps = 4;
  const completedSteps = [
    Boolean(appUrl),
    Boolean(proxyTargetUrl),
    Boolean(embedDetected || setupStatus?.embedStatus?.via === 'app_proxy'),
    Boolean(storefrontRuntimeReady || proxyOk),
  ].filter(Boolean).length;
  const progress = Math.round((completedSteps / totalSteps) * 100);
  const allComplete = storefrontRuntimeReady || progress === 100;
  const stepItems = [
    { id: 1, label: 'Confirm App URL', done: Boolean(appUrl) },
    { id: 2, label: 'Configure App Proxy', done: Boolean(proxyTargetUrl) },
    {
      id: 3,
      label: 'Enable App Embed',
      done: Boolean(embedDetected || setupStatus?.embedStatus?.via === 'app_proxy'),
    },
    { id: 4, label: 'Verify Script URL', done: Boolean(storefrontRuntimeReady || proxyOk) },
  ];

  /** Auto-refresh status every 30s when setup is incomplete (Shopify only) */
  useEffect(() => {
    if (standalone || allComplete) return;
    const interval = setInterval(checkSetupStatus, 30000);
    return () => clearInterval(interval);
  }, [standalone, allComplete, checkSetupStatus]);

  /** Auto-refresh installation every 15s when standalone and script not yet detected */
  useEffect(() => {
    if (!standalone || !installation || installation.scriptVerified) return;
    const interval = setInterval(fetchInstallation, 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run when scriptVerified or standalone changes
  }, [standalone, installation?.scriptVerified, fetchInstallation]);

  const copyToClipboard = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedMessage(`${label} copied`);
      setTimeout(() => setCopiedMessage(null), 2000);
    } catch (err) {
      setCopiedMessage('Copy failed');
      setTimeout(() => setCopiedMessage(null), 2000);
    }
  };

  const embedBlockedByPassword =
    embedStatusCode === 401 || embedStatusCode === 302 || embedStatusCode === 403;

  if (!standalone && domain) {
    return <Navigate to={installationHubPath} replace />;
  }

  const copyToClipboardStandalone = async (value, label) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedMessage(`${label} copied`);
      setTimeout(() => setCopiedMessage(null), 2000);
    } catch {
      setCopiedMessage('Copy failed');
      setTimeout(() => setCopiedMessage(null), 2000);
    }
  };

  /** Standalone setup UI — copy script, add to site, verify script detected */
  if (standalone) {
    const inst = installation;
    const scriptUrl = inst?.scriptUrl || '';
    const snippetHtml = inst?.snippetHtml || '';
    const scriptVerified = !!inst?.scriptVerified;

    return (
      <PageShell className={styles.setupPage}>
        <Page title="" subtitle="">
          <div className={styles.setupLayout}>
            <div className={styles.setupHero}>
              <div className={styles.setupHeroIcon}>
                <CodeIcon />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h1 className={styles.setupHeroTitle}>Standalone Site Setup</h1>
                <p className={styles.setupHeroSubtitle}>
                  Add the RipX script to your website and verify it loads. Works with any platform —
                  WordPress, Webflow, custom HTML, etc.
                </p>
              </div>
              <InlineStack gap="200" blockAlign="center" wrap>
                {scriptVerified ? (
                  <Badge tone="success">Script detected</Badge>
                ) : (
                  <Badge tone="attention">Script not detected yet</Badge>
                )}
                <ButtonGroup>
                  <Button onClick={fetchInstallation} loading={installationLoading} size="slim">
                    Refresh
                  </Button>
                  <Button url={settingsPath} size="slim">
                    Advanced settings
                  </Button>
                </ButtonGroup>
              </InlineStack>
            </div>

            <div className={styles.setupBody}>
              {error && (
                <>
                  {error.includes('Add a domain') ||
                  (error.includes('domain') && error.includes('first')) ? (
                    <Banner
                      tone="info"
                      title="Add a domain first"
                      action={{ content: 'Go to My domains', url: ROUTES.DOMAINS }}
                      onDismiss={() => setError(null)}
                    >
                      <p>
                        Add at least one domain in My domains, then return to Setup to get your
                        script and verify it.
                      </p>
                    </Banner>
                  ) : (
                    <Banner tone="critical" title="Error" onDismiss={() => setError(null)}>
                      <p>{error}</p>
                    </Banner>
                  )}
                </>
              )}
              {scriptVerified && (
                <Banner tone="success" title="Script detected on your site">
                  <p>
                    RipX has detected the script loading on{' '}
                    <strong>{inst?.domain || 'your domain'}</strong>. You can create tests and start
                    tracking from the Dashboard.
                  </p>
                </Banner>
              )}
              {copiedMessage && (
                <Banner tone="success">
                  <p>{copiedMessage}</p>
                </Banner>
              )}

              {/* Step progress: 1 — 2 — 3 */}
              <div className={styles.standaloneStepProgress} aria-label="Setup progress">
                <div className={styles.standaloneStepProgressTrack}>
                  <span className={`${styles.stepPill} ${styles.stepPillDone}`}>1</span>
                  <span className={styles.stepPillConnector} />
                  <span className={`${styles.stepPill} ${styles.stepPillDone}`}>2</span>
                  <span className={styles.stepPillConnector} />
                  <span
                    className={
                      scriptVerified
                        ? `${styles.stepPill} ${styles.stepPillDone}`
                        : `${styles.stepPill} ${styles.stepPillActive}`
                    }
                  >
                    3
                  </span>
                </div>
                <p className={styles.standaloneStepProgressLabel}>
                  {scriptVerified ? 'Setup complete' : 'Copy script → Add to site → Verify'}
                </p>
              </div>

              <Layout>
                <Layout.Section>
                  <BlockStack gap="500">
                    <Card sectioned className={`${styles.heroCard} ${styles.standaloneStepCard}`}>
                      <BlockStack gap="300">
                        <div className={styles.standaloneStepHeader}>
                          <span className={styles.stepNumberPill}>1</span>
                          <Text variant="headingLg" as="h2">
                            Copy your script
                          </Text>
                        </div>
                        <Text variant="bodyMd" tone="subdued">
                          Copy the script URL below. Your domain:{' '}
                          <strong>{inst?.domain || '—'}</strong>
                        </Text>
                        {installationLoading ? (
                          <Text variant="bodyMd" tone="subdued">
                            Loading...
                          </Text>
                        ) : scriptUrl ? (
                          <BlockStack gap="300">
                            <div className={styles.snippetBlock}>
                              <code className={styles.snippetCode}>{scriptUrl}</code>
                              <Button
                                variant="plain"
                                size="slim"
                                onClick={() => copyToClipboardStandalone(scriptUrl, 'Script URL')}
                                className={styles.snippetCopyBtn}
                              >
                                Copy
                              </Button>
                            </div>
                            <InlineStack gap="200">
                              <Button
                                variant="primary"
                                onClick={() => copyToClipboardStandalone(scriptUrl, 'Script URL')}
                              >
                                Copy script URL
                              </Button>
                              <Button
                                onClick={() => copyToClipboardStandalone(snippetHtml, 'Snippet')}
                              >
                                Copy full snippet
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        ) : (
                          <Button onClick={fetchInstallation} loading={installationLoading}>
                            Load installation
                          </Button>
                        )}
                      </BlockStack>
                    </Card>

                    <Card sectioned className={styles.standaloneStepCard}>
                      <BlockStack gap="300">
                        <div className={styles.standaloneStepHeader}>
                          <span className={styles.stepNumberPill}>2</span>
                          <Text variant="headingLg" as="h2">
                            Add to your site
                          </Text>
                        </div>
                        <List type="number">
                          <List.Item>
                            Paste the script tag into your site&apos;s <code>&lt;head&gt;</code> or
                            before <code>&lt;/body&gt;</code>
                          </List.Item>
                          <List.Item>
                            Use the exact domain visitors see (e.g. example.com or www.example.com)
                          </List.Item>
                          <List.Item>
                            Save and publish. The script will load automatically on page load.
                          </List.Item>
                        </List>
                        <Text variant="bodyMd" tone="subdued">
                          Need the full snippet? Go to{' '}
                          <a href={settingsPath} className={styles.setupLink}>
                            App settings → Installation
                          </a>{' '}
                          for the complete HTML.
                        </Text>
                      </BlockStack>
                    </Card>

                    <Card
                      sectioned
                      className={
                        scriptVerified
                          ? `${styles.scriptVerifiedCard} ${styles.standaloneStepCard}`
                          : `${styles.standaloneStepCard} ${styles.standaloneStepCardWaiting}`
                      }
                    >
                      <BlockStack gap="300">
                        <div className={styles.standaloneStepHeader}>
                          <span
                            className={`${styles.stepNumberPill} ${scriptVerified ? styles.stepNumberPillSuccess : ''}`}
                          >
                            3
                          </span>
                          <InlineStack gap="200" blockAlign="center" wrap>
                            <Text variant="headingLg" as="h2">
                              Verify script on your site
                            </Text>
                            <span aria-live="polite" aria-atomic="true">
                              {scriptVerified ? (
                                <Badge tone="success">Detected</Badge>
                              ) : (
                                <Badge tone="attention">Waiting</Badge>
                              )}
                            </span>
                          </InlineStack>
                        </div>
                        {scriptVerified ? (
                          <>
                            <Text variant="bodyMd" tone="success">
                              The RipX script has been detected on <strong>{inst?.domain}</strong>.
                              Setup is complete.
                            </Text>
                            <Button url={ROUTES.USER_PANEL} variant="primary">
                              Go to Dashboard
                            </Button>
                          </>
                        ) : (
                          <>
                            <Text variant="bodyMd" tone="subdued">
                              After adding the script to your site, load a page on your domain. We
                              will detect the script and show a green status here. This may take a
                              few seconds after the page loads.
                            </Text>
                            <InlineStack gap="200">
                              <Button onClick={fetchInstallation} loading={installationLoading}>
                                Check again
                              </Button>
                              <Text variant="bodySm" tone="subdued">
                                Status auto-refreshes every 15 seconds until detected.
                              </Text>
                            </InlineStack>
                          </>
                        )}
                      </BlockStack>
                    </Card>

                    {scriptVerified && (
                      <Card sectioned className={styles.nextStepsCard}>
                        <BlockStack gap="300">
                          <Text variant="headingMd" as="h3">
                            Next steps
                          </Text>
                          <Text variant="bodyMd" tone="subdued">
                            Create a test and start tracking. Visit the Dashboard to see results and
                            analytics.
                          </Text>
                          <Button url={ROUTES.USER_PANEL} variant="primary" size="large">
                            Go to Dashboard
                          </Button>
                        </BlockStack>
                      </Card>
                    )}
                  </BlockStack>
                </Layout.Section>
                <Layout.Section secondary>
                  <Card sectioned className={styles.railCard}>
                    <BlockStack gap="300">
                      <Text variant="headingSm" as="h2">
                        Quick reference
                      </Text>
                      <BlockStack gap="200">
                        <Text variant="bodySm" tone="subdued">
                          Domain: {inst?.domain || '—'}
                        </Text>
                        <Text variant="bodySm" tone="subdued">
                          Platform: Standalone (non-Shopify)
                        </Text>
                        {scriptVerified ? (
                          <Text variant="bodySm" tone="success">
                            Script: Detected on site
                          </Text>
                        ) : (
                          <Text variant="bodySm" tone="subdued">
                            Script: Not detected yet
                          </Text>
                        )}
                      </BlockStack>
                      <Divider />
                      <Button url={settingsPath} size="slim">
                        App settings → Installation
                      </Button>
                    </BlockStack>
                  </Card>
                </Layout.Section>
              </Layout>
            </div>
          </div>
        </Page>
      </PageShell>
    );
  }

  return (
    <PageShell className={styles.setupPage}>
      <Page title="" subtitle="">
        <div className={styles.setupLayout}>
          <div className={styles.setupHero}>
            <div className={styles.setupHeroIcon}>
              <SettingsIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className={styles.setupHeroTitle}>Storefront Setup Wizard</h1>
              <p className={styles.setupHeroSubtitle}>
                Guided setup — status auto-refreshes every 30s until complete
              </p>
            </div>
            <div className={styles.setupHeroActions}>
              <Badge tone={allComplete ? 'success' : 'info'}>
                {completedSteps}/{totalSteps} completed
              </Badge>
              <Button url={settingsPath} size="slim">
                Advanced settings
              </Button>
            </div>
          </div>

          <div className={styles.setupBody}>
            <Layout>
              <Layout.Section>
                <BlockStack gap="400">
                  <Card sectioned className={styles.heroCard}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="headingLg" as="h1">
                            Connect your storefront in minutes
                          </Text>
                          <Text variant="bodyMd" tone="subdued">
                            Follow the guided steps to enable App Proxy, App Embed, and verify
                            script loading.
                          </Text>
                        </BlockStack>
                        <div className={styles.heroBadge}>
                          <Badge tone={progress === 100 ? 'success' : 'info'}>
                            {completedSteps}/{totalSteps} completed
                          </Badge>
                        </div>
                      </InlineStack>
                      <ProgressBar
                        progress={progress}
                        tone={progress === 100 ? 'success' : 'primary'}
                      />
                      <InlineStack
                        className={styles.setupHeroCardActions}
                        align="space-between"
                        blockAlign="center"
                      >
                        <Text variant="bodySm" tone="subdued">
                          Status auto-refreshes every 30s. Click Refresh to check now.
                        </Text>
                        <ButtonGroup>
                          <Button onClick={checkSetupStatus} loading={checking}>
                            Refresh status
                          </Button>
                          <Button
                            primary
                            onClick={() => copyToClipboard(proxyScriptUrl, 'Script URL')}
                            disabled={!proxyScriptUrl}
                          >
                            Copy script URL
                          </Button>
                        </ButtonGroup>
                      </InlineStack>
                    </BlockStack>
                  </Card>

                  {error && (
                    <Banner tone="critical" title="Setup check failed">
                      <p>{error}</p>
                    </Banner>
                  )}
                  {allComplete && !error && (
                    <Banner tone="success" title="Setup complete">
                      <p>Your storefront is connected and the script is loading successfully.</p>
                    </Banner>
                  )}
                  {copiedMessage && (
                    <Banner tone="success">
                      <p>{copiedMessage}</p>
                    </Banner>
                  )}

                  <Card sectioned className={styles.statusCard}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingMd" as="h2">
                          Live Status
                        </Text>
                        <Text variant="bodySm" tone="subdued">
                          Proxy: {proxyStatusCode ?? 'N/A'} · Embed: {embedStatusCode ?? 'N/A'}
                        </Text>
                      </InlineStack>
                      <InlineStack
                        gap="600"
                        blockAlign="center"
                        wrap
                        className={styles.statusBadges}
                      >
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="bodyMd">App Proxy</Text>
                          {proxyOk === undefined ? (
                            <Badge tone="warning">Not checked</Badge>
                          ) : (
                            <Badge tone={proxyOk ? 'success' : 'critical'}>
                              {proxyOk ? 'Connected' : 'Not connected'}
                            </Badge>
                          )}
                        </InlineStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="bodyMd">App Embed</Text>
                          {embedDetected === undefined ? (
                            <Badge tone="warning">Not checked</Badge>
                          ) : embedBlockedByPassword ? (
                            <Badge tone="warning">Blocked</Badge>
                          ) : (
                            <Badge tone={embedDetected ? 'success' : 'critical'}>
                              {embedDetected ? 'Enabled' : 'Not enabled'}
                            </Badge>
                          )}
                        </InlineStack>
                      </InlineStack>
                      <Divider />
                      <BlockStack gap="200">
                        <InlineStack
                          align="space-between"
                          blockAlign="start"
                          className={styles.statusValueRow}
                        >
                          <Text variant="bodySm" tone="subdued" className={styles.statusValueLabel}>
                            App URL
                          </Text>
                          <InlineStack
                            gap="200"
                            blockAlign="start"
                            className={styles.statusValueActions}
                          >
                            <Text variant="bodySm" className={styles.statusValueText}>
                              {appUrl || 'Not set'}
                            </Text>
                            <Button
                              size="slim"
                              onClick={() => copyToClipboard(appUrl, 'App URL')}
                              disabled={!appUrl}
                            >
                              Copy
                            </Button>
                          </InlineStack>
                        </InlineStack>
                        <InlineStack
                          align="space-between"
                          blockAlign="start"
                          className={styles.statusValueRow}
                        >
                          <Text variant="bodySm" tone="subdued" className={styles.statusValueLabel}>
                            App Proxy target URL
                          </Text>
                          <InlineStack
                            gap="200"
                            blockAlign="start"
                            className={styles.statusValueActions}
                          >
                            <Text variant="bodySm" className={styles.statusValueText}>
                              {proxyTargetUrl || 'Not set'}
                            </Text>
                            <Button
                              size="slim"
                              onClick={() => copyToClipboard(proxyTargetUrl, 'Proxy URL')}
                              disabled={!proxyTargetUrl}
                            >
                              Copy
                            </Button>
                          </InlineStack>
                        </InlineStack>
                        <InlineStack
                          align="space-between"
                          blockAlign="start"
                          className={styles.statusValueRow}
                        >
                          <Text variant="bodySm" tone="subdued" className={styles.statusValueLabel}>
                            Script URL
                          </Text>
                          <InlineStack
                            gap="200"
                            blockAlign="start"
                            className={styles.statusValueActions}
                          >
                            <Text variant="bodySm" className={styles.statusValueText}>
                              {proxyScriptUrl || 'Missing shop domain'}
                            </Text>
                            <Button
                              size="slim"
                              onClick={() => copyToClipboard(proxyScriptUrl, 'Script URL')}
                              disabled={!proxyScriptUrl}
                            >
                              Copy
                            </Button>
                          </InlineStack>
                        </InlineStack>
                      </BlockStack>
                    </BlockStack>
                  </Card>

                  {embedBlockedByPassword && (
                    <Banner tone="warning" title="Storefront is password protected">
                      <p>
                        Embed detection may show as not enabled until the store password is removed,
                        or you temporarily disable the password while checking.
                      </p>
                    </Banner>
                  )}

                  <Card sectioned className={styles.stepsCard}>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h2">
                        Guided Steps
                      </Text>
                      <div className={styles.stepsGrid}>
                        <Card sectioned className={styles.stepCard}>
                          <BlockStack gap="200">
                            <div className={styles.stepHeader}>
                              <div className={styles.stepTitleGroup}>
                                <div className={styles.stepIcon} aria-hidden="true">
                                  <StepIcon type="link" />
                                  <span className={styles.stepNumber}>1</span>
                                </div>
                                <Text variant="headingSm" as="h3">
                                  Confirm App URL
                                </Text>
                              </div>
                              <Badge tone={appUrl ? 'success' : 'warning'}>
                                {appUrl ? 'Done' : 'Needs action'}
                              </Badge>
                            </div>
                            <Text variant="bodySm" tone="subdued">
                              This should be your current dev tunnel or production domain.
                            </Text>
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodySm">{appUrl || 'Not set'}</Text>
                              <Button
                                size="slim"
                                onClick={() => copyToClipboard(appUrl, 'App URL')}
                                disabled={!appUrl}
                              >
                                Copy
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Card>

                        <Card sectioned className={styles.stepCard}>
                          <BlockStack gap="200">
                            <div className={styles.stepHeader}>
                              <div className={styles.stepTitleGroup}>
                                <div className={styles.stepIcon} aria-hidden="true">
                                  <StepIcon type="proxy" />
                                  <span className={styles.stepNumber}>2</span>
                                </div>
                                <Text variant="headingSm" as="h3">
                                  Configure App Proxy
                                </Text>
                              </div>
                              <Badge tone={proxyTargetUrl ? 'success' : 'warning'}>
                                {proxyTargetUrl ? 'Done' : 'Needs action'}
                              </Badge>
                            </div>
                            <List type="bullet">
                              <List.Item>Subpath prefix: apps</List.Item>
                              <List.Item>Subpath: ripx</List.Item>
                              <List.Item>Proxy URL: {proxyTargetUrl || 'Not set'}</List.Item>
                            </List>
                            <InlineStack gap="200" blockAlign="center">
                              <Button
                                size="slim"
                                onClick={() => copyToClipboard(proxyTargetUrl, 'Proxy URL')}
                                disabled={!proxyTargetUrl}
                              >
                                Copy proxy URL
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Card>

                        <Card sectioned className={styles.stepCard}>
                          <BlockStack gap="200">
                            <div className={styles.stepHeader}>
                              <div className={styles.stepTitleGroup}>
                                <div className={styles.stepIcon} aria-hidden="true">
                                  <StepIcon type="embed" />
                                  <span className={styles.stepNumber}>3</span>
                                </div>
                                <Text variant="headingSm" as="h3">
                                  Enable App Embed
                                </Text>
                              </div>
                              <Badge tone={embedDetected ? 'success' : 'warning'}>
                                {embedDetected ? 'Done' : 'Needs action'}
                              </Badge>
                            </div>
                            <List type="bullet">
                              <List.Item>Online Store → Themes → Customize</List.Item>
                              <List.Item>
                                App Embeds → Enable “RipX App Embed” (injects in head)
                              </List.Item>
                              <List.Item>Save the theme</List.Item>
                            </List>
                            {embedBlockedByPassword && (
                              <Text variant="bodySm" tone="subdued">
                                Password protection can hide embed detection while testing.
                              </Text>
                            )}
                          </BlockStack>
                        </Card>

                        <Card sectioned className={styles.stepCard}>
                          <BlockStack gap="200">
                            <div className={styles.stepHeader}>
                              <div className={styles.stepTitleGroup}>
                                <div className={styles.stepIcon} aria-hidden="true">
                                  <StepIcon type="verify" />
                                  <span className={styles.stepNumber}>4</span>
                                </div>
                                <Text variant="headingSm" as="h3">
                                  Verify Script URL
                                </Text>
                              </div>
                              <Badge tone={proxyOk ? 'success' : 'warning'}>
                                {proxyOk ? 'Done' : 'Needs action'}
                              </Badge>
                            </div>
                            <Text variant="bodySm" tone="subdued">
                              This should return JavaScript (not 404).
                            </Text>
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="bodySm">
                                {proxyScriptUrl || 'Missing shop domain'}
                              </Text>
                              <Button
                                size="slim"
                                onClick={() => copyToClipboard(proxyScriptUrl, 'Script URL')}
                                disabled={!proxyScriptUrl}
                              >
                                Copy
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Card>
                      </div>
                    </BlockStack>
                  </Card>

                  <Divider />

                  <Card sectioned>
                    <BlockStack gap="200">
                      <Text variant="headingMd" as="h2">
                        Troubleshooting
                      </Text>
                      <List type="bullet">
                        <List.Item>
                          404 on script URL means the App Proxy isn’t configured or saved yet.
                        </List.Item>
                        <List.Item>
                          “App Embed not enabled” means the embed toggle is off in the theme editor.
                        </List.Item>
                        <List.Item>
                          Password protected storefronts can hide embed detection.
                        </List.Item>
                      </List>
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Layout.Section>
              <Layout.Section secondary>
                <Card sectioned className={styles.railCard}>
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h2">
                      Progress
                    </Text>
                    <ProgressBar
                      progress={progress}
                      tone={progress === 100 ? 'success' : 'primary'}
                    />
                    <div className={styles.railList}>
                      {stepItems.map(step => (
                        <div key={step.id} className={styles.railItem}>
                          <div className={styles.railDot}>{step.done ? '✓' : step.id}</div>
                          <Text variant="bodySm">{step.label}</Text>
                        </div>
                      ))}
                    </div>
                    <Divider />
                    <BlockStack gap="200">
                      <Text variant="bodySm" tone="subdued">
                        Need help? Re-check your status anytime.
                      </Text>
                      <Button onClick={checkSetupStatus} loading={checking}>
                        Refresh status
                      </Button>
                    </BlockStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </div>
        </div>
      </Page>
    </PageShell>
  );
}

export default SetupWizard;
