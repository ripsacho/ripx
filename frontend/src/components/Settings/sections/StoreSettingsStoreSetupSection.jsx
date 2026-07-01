import React from 'react';
import { Link } from 'react-router-dom';
import { Badge, Banner, BlockStack, Box, Button, Card, InlineStack, Text } from '@shopify/polaris';
import { ClipboardIcon, CodeIcon } from '@shopify/polaris-icons';
import { CONTENT_GAP, ROUTES } from '../../../constants';
import { getDocsLinkForSection } from '../../../utils/docsLinks';
import { SetupProgressHeader } from '../primitives/SetupProgressHeader';
import { SetupStepRow } from '../primitives/SetupStepRow';
import { TechnicalHealthChecksPanel } from '../primitives/TechnicalHealthChecksPanel';
import styles from '../Settings.module.css';

export function StoreSettingsStoreSetupSection({
  showAllAppSections,
  installation,
  installationLoading,
  installationError,
  setupComplete,
  storeSetupProgress,
  installationChecklistRows,
  storeHealth,
  checkoutLaunchTone,
  checkoutLaunchLabel,
  checkoutDiagCheckedLabel,
  checkoutDiagIsStale,
  onOpenAdvanced,
  onOpenSnippetModal,
  onFetchInstallation,
  showInstallationSupportCards,
  copiedSnippet,
  onCopySnippet,
  onCopy,
}) {
  return (
    <>
      {installation && (
        <Card className={`${styles.settingsPanelCard} ${styles.installHubCard}`}>
          <Box padding="500">
            <BlockStack gap="400">
              <div className={styles.installHubHeader}>
                {showAllAppSections ? (
                  <div className={styles.installHubHeaderContent}>
                    <Text variant="headingMd" as="h2">
                      Store setup
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Work through each step below. Technical health checks stay collapsed until you
                      need them.
                    </Text>
                  </div>
                ) : null}
                <InlineStack gap="200" wrap blockAlign="center">
                  <Badge tone={checkoutLaunchTone}>{checkoutLaunchLabel}</Badge>
                  {checkoutDiagCheckedLabel && (
                    <Badge tone={checkoutDiagIsStale ? 'attention' : 'success'}>
                      Last checked {checkoutDiagCheckedLabel}
                    </Badge>
                  )}
                </InlineStack>
              </div>
              <SetupProgressHeader
                completed={storeSetupProgress.completed}
                total={storeSetupProgress.total}
                label="Setup progress"
                hint={
                  setupComplete
                    ? 'You can launch tests from the dashboard or test wizard.'
                    : 'Finish the steps below to run price, offer, and shipping tests reliably.'
                }
              />
              <div className={styles.setupStepList}>
                {installationChecklistRows.map(item => (
                  <SetupStepRow
                    key={item.id}
                    title={item.title}
                    summary={item.summary}
                    status={item.status}
                    tone={item.tone}
                    actionLabel={item.actionLabel}
                    onAction={item.onAction}
                    loading={item.loading}
                    disabled={item.disabled}
                    actionTooltip={item.actionTooltip}
                    secondaryLabel={item.secondaryLabel}
                    onSecondaryAction={item.onSecondaryAction}
                    secondaryTooltip={item.secondaryTooltip}
                  />
                ))}
              </div>
              <TechnicalHealthChecksPanel
                storeHealth={storeHealth}
                onOpenAdvanced={onOpenAdvanced}
              />
              <div className={styles.installChecklistFooter}>
                {installation?.domain && (
                  <a
                    href={getDocsLinkForSection('installation', { domain: installation.domain })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.installDocLink}
                  >
                    Setup guide
                  </a>
                )}
                <div className={styles.installChecklistFooterActions}>
                  <Button variant="plain" size="slim" onClick={onOpenSnippetModal}>
                    Get head script
                  </Button>
                  <Button variant="plain" size="slim" onClick={onOpenAdvanced}>
                    Open Advanced
                  </Button>
                </div>
              </div>
            </BlockStack>
          </Box>
        </Card>
      )}

      {showInstallationSupportCards && (
        <Card
          className={`${styles.settingsPanelCard} ${styles.installMain} ${styles.storefrontSnippetCard}`}
        >
          <Box padding="500">
            <BlockStack gap="400">
              <div className={styles.snippetSectionHeader}>
                <div className={styles.snippetSectionHeaderIcon}>
                  <CodeIcon />
                </div>
                <div className={styles.snippetSectionHeaderContent}>
                  <Text variant="headingMd" as="h2" className={styles.snippetSectionTitle}>
                    Theme embed & snippet
                  </Text>
                  {installation && (
                    <div className={styles.snippetBadges}>
                      <span className={styles.snippetPlatformBadge}>
                        {installation.platform === 'shopify' ? 'Shopify' : 'Standalone'}
                      </span>
                      {installation.scriptVerified && (
                        <span
                          className={styles.snippetVerifiedBadge}
                          title="Script detected on your site"
                        >
                          Script detected
                        </span>
                      )}
                    </div>
                  )}
                  <Text
                    as="p"
                    variant="bodySm"
                    tone="subdued"
                    className={styles.snippetSectionDesc}
                  >
                    {installationLoading
                      ? 'Loading your installation details…'
                      : installationError || !installation
                        ? 'Load the app to finish setup and get your embed instructions.'
                        : installation.platform === 'shopify'
                          ? 'Enable the theme app embed or copy the fallback script into your theme <head>.'
                          : "Copy the direct app script and paste it into your site's <head>."}
                  </Text>
                </div>
              </div>

              {installationLoading ? (
                <div className={styles.installationSkeleton}>
                  <div
                    className={styles.loadingBlock}
                    style={{ height: 48, marginBottom: '1rem' }}
                  />
                  <div className={styles.loadingBlock} style={{ height: 140 }} />
                  <div
                    className={styles.loadingBlock}
                    style={{ height: 32, marginTop: '1.5rem' }}
                  />
                  <div
                    className={styles.loadingBlock}
                    style={{ height: 40, marginTop: '0.5rem' }}
                  />
                </div>
              ) : installationError || !installation ? (
                <div className={styles.installationEmpty}>
                  <div className={styles.installationEmptyIcon}>
                    <CodeIcon />
                  </div>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {installationError
                      ? "We couldn't load embed instructions. Retry, or reopen Store setup after reconnecting your domain."
                      : 'Open Store setup to load embed instructions and verification steps.'}
                  </Text>
                  <div className={styles.installationEmptyActions}>
                    {installationError && (
                      <Button size="slim" onClick={onFetchInstallation}>
                        Retry
                      </Button>
                    )}
                    <Link to={ROUTES.USER_PANEL} className={styles.installationEmptyCta}>
                      Open stores
                    </Link>
                  </div>
                </div>
              ) : (
                <div className={styles.installSupportCompact}>
                  <div className={styles.installSupportGrid}>
                    <div className={styles.installSupportMetric}>
                      <span className={styles.installSupportMetricLabel}>Snippet</span>
                      <span className={styles.installSupportMetricValue}>Ready to copy</span>
                    </div>
                    <div className={styles.installSupportMetric}>
                      <span className={styles.installSupportMetricLabel}>Script status</span>
                      <span className={styles.installSupportMetricValue}>
                        {installation.scriptVerified ? 'Detected on site' : 'Not verified yet'}
                      </span>
                    </div>
                    <div className={styles.installSupportMetric}>
                      <span className={styles.installSupportMetricLabel}>Optional helpers</span>
                      <span className={styles.installSupportMetricValue}>
                        {[
                          Array.isArray(installation.instructions?.steps) &&
                          installation.instructions.steps.length > 0
                            ? 'Setup steps'
                            : null,
                          installation.instructions?.altMethod ? 'Alt embed' : null,
                          installation.instructions?.cartNative ? 'Cart native' : null,
                        ]
                          .filter(Boolean)
                          .join(' • ') || 'None'}
                      </span>
                    </div>
                  </div>
                  <InlineStack gap="200" wrap>
                    <Button size="slim" onClick={onOpenSnippetModal}>
                      Get head script
                    </Button>
                    <Button
                      icon={ClipboardIcon}
                      onClick={onCopySnippet}
                      variant="plain"
                      size="slim"
                    >
                      {copiedSnippet ? 'Copied!' : 'Copy snippet'}
                    </Button>
                    <Button
                      icon={ClipboardIcon}
                      onClick={() => onCopy(installation.scriptUrl, 'URL copied')}
                      variant="plain"
                      size="slim"
                    >
                      Copy URL
                    </Button>
                    <Button url={installation.scriptUrl} external variant="plain" size="slim">
                      Test script
                    </Button>
                  </InlineStack>
                </div>
              )}
            </BlockStack>
          </Box>
        </Card>
      )}

      {installation && showInstallationSupportCards && (
        <Card className={`${styles.settingsPanelCard} ${styles.installSide}`}>
          <Box padding="500">
            <BlockStack gap={CONTENT_GAP}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderIcon}>
                  <CodeIcon />
                </div>
                <div className={styles.sectionHeaderContent}>
                  <Text variant="headingMd" as="h2">
                    Setup helpers
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Fallback options for themes that need a manual assist.
                  </Text>
                </div>
              </div>
              <div className={styles.panelCardBody}>
                <BlockStack gap="200">
                  <div className={styles.installSupportItem}>
                    <div className={styles.installSupportItemMain}>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        Setup steps
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {Array.isArray(installation.instructions?.steps) &&
                        installation.instructions.steps.length > 0
                          ? `${installation.instructions.steps.length} optional manual step(s) available.`
                          : 'No extra manual steps are suggested right now.'}
                      </Text>
                    </div>
                    <Badge
                      tone={
                        Array.isArray(installation.instructions?.steps) &&
                        installation.instructions.steps.length > 0
                          ? 'attention'
                          : 'success'
                      }
                    >
                      {Array.isArray(installation.instructions?.steps) &&
                      installation.instructions.steps.length > 0
                        ? `${installation.instructions.steps.length} available`
                        : 'None'}
                    </Badge>
                  </div>
                  <InlineStack gap="200" wrap>
                    <Button size="slim" onClick={onOpenSnippetModal}>
                      View embed instructions
                    </Button>
                    <Button size="slim" variant="plain" onClick={onOpenAdvanced}>
                      Open Advanced tools
                    </Button>
                  </InlineStack>
                </BlockStack>
              </div>
            </BlockStack>
          </Box>
        </Card>
      )}

      {installation &&
        installation.platform === 'standalone' &&
        !installationLoading &&
        !installationError && (
          <Card className={`${styles.settingsPanelCard} ${styles.checkoutDiagCard}`}>
            <Box padding="500">
              <Banner tone="info">
                <Text as="p" variant="bodyMd">
                  Checkout price alignment uses Shopify&apos;s discount function and only applies to
                  Shopify stores. Standalone sites still run price tests via the storefront script.
                </Text>
              </Banner>
            </Box>
          </Card>
        )}
    </>
  );
}
