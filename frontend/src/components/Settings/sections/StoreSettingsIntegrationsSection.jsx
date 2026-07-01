import React from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  FormLayout,
  InlineStack,
  Text,
  TextField,
} from '@shopify/polaris';
import { ChartVerticalIcon } from '@shopify/polaris-icons';
import { CONTENT_GAP } from '../../../constants';
import { SectionTitleWithTip } from '../primitives/SectionTitleWithTip';
import { SECTION_HELP } from '../config/settingsSectionHelp';
import { INTEGRATIONS_CONFIG } from '../config/settingsConstants';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import styles from '../Settings.module.css';

export function StoreSettingsIntegrationsSection({
  showAllAppSections,
  integrationsError,
  onDismissIntegrationsError,
  onRetryIntegrations,
  configuredIntegrationCount,
  integrationsRefreshing,
  onRefreshIntegrations,
  integrationsOverview,
  integrations,
  integrationConfig,
  onIntegrationConfigChange,
  integrationsSaving,
  onSaveIntegrations,
  bigQueryExporting,
  onBigQueryExport,
}) {
  return (
    <>
      {integrationsError && (
        <div className={styles.settingsPanelBannerWrap}>
          <Banner
            tone="critical"
            onDismiss={onDismissIntegrationsError}
            action={{ content: 'Retry', onAction: onRetryIntegrations }}
          >
            Couldn&apos;t load integration status. Check your connection and retry.
          </Banner>
        </div>
      )}
      {!showAllAppSections && configuredIntegrationCount === 0 && !integrationsError && (
        <Banner tone="info">
          <p>
            Integrations are optional. Connect GA4 or BigQuery only when you need event forwarding
            or warehouse exports.
          </p>
        </Banner>
      )}
      {!showAllAppSections && (
        <InlineStack align="end">
          <Button variant="plain" onClick={onRefreshIntegrations} loading={integrationsRefreshing}>
            Refresh status
          </Button>
        </InlineStack>
      )}
      {showAllAppSections && (
        <Card
          className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull} ${styles.integrationsHeaderCard}`}
        >
          <Box padding="400">
            <BlockStack gap="300">
              <div className={styles.sectionHeaderWithAction}>
                <div className={styles.sectionHeader}>
                  <div className={`${styles.sectionHeaderIcon} ${styles.integrationsHeaderIcon}`}>
                    <ChartVerticalIcon />
                  </div>
                  <div className={styles.sectionHeaderContent}>
                    <SectionTitleWithTip
                      title="Analytics & data"
                      tip={SECTION_HELP.analyticsData}
                    />
                  </div>
                </div>
                <Button
                  variant="plain"
                  onClick={onRefreshIntegrations}
                  loading={integrationsRefreshing}
                  accessibilityLabel="Refresh integration status"
                >
                  Refresh status
                </Button>
              </div>
              <div className={styles.settingsOverviewGrid}>
                {integrationsOverview.map(item => (
                  <div key={item.id} className={styles.settingsOverviewMetric}>
                    <span className={styles.settingsOverviewLabel}>{item.label}</span>
                    <span className={styles.settingsOverviewValue}>{item.value}</span>
                    <span className={styles.settingsOverviewHint}>{item.hint}</span>
                  </div>
                ))}
              </div>
            </BlockStack>
          </Box>
        </Card>
      )}

      <div className={styles.integrationCardsRow}>
        {INTEGRATIONS_CONFIG.map(({ key, title, Icon: IntegrationIcon, iconClass, configHint }) => {
          const data = integrations?.[key];
          const configured = data?.configured;
          const lastExport = key === 'bigquery' ? data?.lastExportAt : null;
          const lastExportLabel = formatRelativeTime(lastExport);
          const isLoading = integrations === null;
          return (
            <Card
              key={key}
              className={`${styles.settingsPanelCard} ${styles.integrationCardWrapper} ${configured ? styles.integrationCardConnected : ''}`}
            >
              <Box padding="400">
                <BlockStack gap={CONTENT_GAP}>
                  <div className={styles.sectionHeader}>
                    <div
                      className={`${styles.sectionHeaderIcon} ${styles.integrationIcon} ${styles[iconClass]}`}
                    >
                      <IntegrationIcon />
                    </div>
                    <div
                      className={`${styles.sectionHeaderContent} ${styles.integrationCardHeader}`}
                    >
                      <div className={styles.integrationCardTitleRow}>
                        <SectionTitleWithTip
                          title={title}
                          tip={
                            isLoading ? 'Loading integration details…' : (data?.hint ?? configHint)
                          }
                          asHeading="h3"
                          titleClassName={styles.integrationCardTitle}
                        />
                        {!isLoading && (
                          <Badge
                            tone={configured ? 'success' : 'info'}
                            className={styles.integrationCardBadge}
                          >
                            {key === 'ga4'
                              ? configured
                                ? 'Active'
                                : 'Not configured'
                              : configured
                                ? 'Configured'
                                : 'Not configured'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.panelCardBody}>
                    {isLoading ? (
                      <div
                        className={styles.loadingBlock}
                        style={{ height: 60, marginTop: '0.5rem' }}
                      />
                    ) : (
                      <>
                        {key === 'ga4' && (
                          <FormLayout>
                            <TextField
                              label="Measurement ID"
                              value={integrationConfig.ga4MeasurementId}
                              onChange={v =>
                                onIntegrationConfigChange(c => ({ ...c, ga4MeasurementId: v }))
                              }
                              placeholder="G-XXXXXXXXXX"
                              autoComplete="off"
                            />
                            <TextField
                              label="API Secret"
                              type="password"
                              value={integrationConfig.ga4ApiSecret}
                              onChange={v =>
                                onIntegrationConfigChange(c => ({ ...c, ga4ApiSecret: v }))
                              }
                              placeholder={
                                integrationConfig.ga4ApiSecret === '••••••••'
                                  ? '••••••••'
                                  : 'Enter API secret'
                              }
                              autoComplete="off"
                              helpText="From GA4 Admin → Data Streams → Measurement Protocol"
                            />
                          </FormLayout>
                        )}
                        {key === 'bigquery' && (
                          <FormLayout>
                            <TextField
                              label="Project ID"
                              value={integrationConfig.bigqueryProjectId}
                              onChange={v =>
                                onIntegrationConfigChange(c => ({ ...c, bigqueryProjectId: v }))
                              }
                              placeholder="your-gcp-project"
                              autoComplete="off"
                            />
                            <TextField
                              label="Dataset"
                              value={integrationConfig.bigqueryDataset}
                              onChange={v =>
                                onIntegrationConfigChange(c => ({ ...c, bigqueryDataset: v }))
                              }
                              placeholder="ripx_analytics"
                              autoComplete="off"
                            />
                            <TextField
                              label="Service Account JSON"
                              value={
                                integrationConfig.bigqueryCredentials === '[configured]'
                                  ? ''
                                  : integrationConfig.bigqueryCredentials
                              }
                              onChange={v =>
                                onIntegrationConfigChange(c => ({ ...c, bigqueryCredentials: v }))
                              }
                              placeholder={
                                integrationConfig.bigqueryCredentials === '[configured]'
                                  ? '[Already configured — leave blank to keep]'
                                  : 'Paste full JSON key'
                              }
                              multiline={4}
                              autoComplete="off"
                              helpText="Paste the full JSON from GCP Service Account key file"
                            />
                            {configured && (
                              <>
                                <p className={styles.integrationLastExport}>
                                  Last export:{' '}
                                  <strong {...(!lastExportLabel && { 'data-subdued': true })}>
                                    {lastExportLabel || 'Never'}
                                  </strong>
                                </p>
                                <div className={styles.integrationActions}>
                                  <Button
                                    variant="primary"
                                    onClick={() => onBigQueryExport(false)}
                                    loading={bigQueryExporting}
                                  >
                                    Export incremental
                                  </Button>
                                  <Button
                                    onClick={() => onBigQueryExport(true)}
                                    loading={bigQueryExporting}
                                  >
                                    Full export
                                  </Button>
                                </div>
                              </>
                            )}
                          </FormLayout>
                        )}
                        {!configured && <div className={styles.configHint}>{configHint}</div>}
                        {configured && key === 'ga4' && (
                          <div className={styles.integrationActiveNote}>
                            Events are forwarded automatically
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </BlockStack>
              </Box>
            </Card>
          );
        })}
      </div>

      <Card
        className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull} ${styles.integrationsSaveCard}`}
      >
        <Box padding="400">
          <div className={styles.integrationsSaveBar}>
            <div className={styles.integrationsSaveCopy}>
              <SectionTitleWithTip
                title="Finish changes"
                tip={SECTION_HELP.integrationsSave}
                asHeading="p"
                variant="bodySm"
                fontWeight="semibold"
              />
            </div>
            <InlineStack align="end" gap="300">
              <Button variant="primary" onClick={onSaveIntegrations} loading={integrationsSaving}>
                Save integration settings
              </Button>
            </InlineStack>
          </div>
        </Box>
      </Card>
    </>
  );
}
