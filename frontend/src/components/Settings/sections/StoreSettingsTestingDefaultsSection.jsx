import React from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Text,
  TextField,
} from '@shopify/polaris';
import { ChartVerticalIcon, SettingsIcon, TargetIcon } from '@shopify/polaris-icons';
import { CONTENT_GAP, ROUTES } from '../../../constants';
import { SectionTitleWithTip } from '../primitives/SectionTitleWithTip';
import { SECTION_HELP } from '../config/settingsSectionHelp';
import {
  CONFIDENCE_QUICK,
  DEFAULT_SETTINGS,
  SAMPLE_SIZE_QUICK,
  SETTINGS_PRESETS,
} from '../config/settingsConstants';
import styles from '../Settings.module.css';

export function StoreSettingsTestingDefaultsSection({
  showAllAppSections,
  showStandaloneApiKey,
  settings,
  onSettingsChange,
  saving,
  onSave,
  selectedSettingsPresetKey,
  generalSectionSummary,
  generalDefaultsOverview,
  presetApplyingKey,
  onApplyPreset,
  webhookDeliveryStatus,
  webhookEventsSummary,
  onOpenWebhooksModal,
}) {
  return (
    <>
      {showStandaloneApiKey && (
        <Card className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull}`}>
          <Box padding="400">
            <BlockStack gap={CONTENT_GAP}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderIcon}>
                  <SettingsIcon />
                </div>
                <div className={styles.sectionHeaderContent}>
                  <SectionTitleWithTip title="API Key" tip={SECTION_HELP.apiKeyStandalone} />
                  <Text as="p" variant="bodySm" tone="subdued">
                    <Link to={ROUTES.CONNECT}>Connect</Link> to change keys, or clear storage and
                    reload.
                  </Text>
                </div>
              </div>
            </BlockStack>
          </Box>
        </Card>
      )}

      <Card
        className={`${styles.settingsPanelCard} ${styles.testConfigCard} ${
          showAllAppSections ? styles.settingsPanelCardFull : ''
        }`}
      >
        <Box padding="500">
          <BlockStack gap="400">
            <div className={styles.sectionHeaderWithAction}>
              {showAllAppSections && (
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionHeaderIcon}>
                    <TargetIcon />
                  </div>
                  <div className={styles.sectionHeaderContent}>
                    <SectionTitleWithTip
                      title="Test configuration"
                      tip={SECTION_HELP.testConfiguration}
                    />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Set the default confidence, sample size, and stop behavior for new tests.
                    </Text>
                  </div>
                </div>
              )}
              <InlineStack gap="200" wrap blockAlign="center">
                <Button variant="primary" onClick={onSave} loading={saving}>
                  Save defaults
                </Button>
              </InlineStack>
            </div>

            {!showAllAppSections && (
              <div className={styles.testConfigHeroMetrics}>
                {generalDefaultsOverview.map(item => (
                  <div
                    key={item.id}
                    className={`${styles.settingsOverviewMetric} ${styles.testConfigOverviewMetric}`}
                  >
                    <span className={styles.settingsOverviewLabel}>{item.label}</span>
                    <span className={styles.settingsOverviewValue}>{item.value}</span>
                    <span className={styles.settingsOverviewHint}>{item.hint}</span>
                  </div>
                ))}
              </div>
            )}

            {showAllAppSections && (
              <div className={styles.testConfigHero}>
                <div className={styles.testConfigHeroMain}>
                  <span className={styles.configSubsection}>Defaults snapshot</span>
                  <Text as="h3" variant="headingMd">
                    {selectedSettingsPresetKey
                      ? SETTINGS_PRESETS[selectedSettingsPresetKey]?.label || 'Preset aligned'
                      : 'Custom defaults'}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {generalSectionSummary}
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Badge tone={selectedSettingsPresetKey ? 'success' : 'attention'}>
                      {selectedSettingsPresetKey ? 'Preset aligned' : 'Custom mix'}
                    </Badge>
                    <Badge tone={settings.autoStopEnabled ? 'success' : 'info'}>
                      {settings.autoStopEnabled ? 'Auto-stop on' : 'Manual stop review'}
                    </Badge>
                  </InlineStack>
                </div>
                <div className={styles.testConfigHeroMetrics}>
                  {generalDefaultsOverview.map(item => (
                    <div
                      key={item.id}
                      className={`${styles.settingsOverviewMetric} ${styles.testConfigOverviewMetric}`}
                    >
                      <span className={styles.settingsOverviewLabel}>{item.label}</span>
                      <span className={styles.settingsOverviewValue}>{item.value}</span>
                      <span className={styles.settingsOverviewHint}>{item.hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.testConfigPresets}>
              <span className={styles.configSubsection}>Quick presets</span>
              <div className={styles.presetCardsGrid}>
                {Object.entries(SETTINGS_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    disabled={presetApplyingKey !== null}
                    className={`${styles.presetCard} ${key === 'recommended' ? styles.presetCardRecommended : ''} ${selectedSettingsPresetKey === key ? styles.presetCardSelected : ''}`}
                    onClick={() => onApplyPreset(key, preset)}
                  >
                    {presetApplyingKey === key ? (
                      <span className={styles.presetCardLoading}>Applying…</span>
                    ) : (
                      <>
                        <span className={styles.presetCardLabel}>{preset.label}</span>
                        <span className={styles.presetCardDesc}>{preset.description}</span>
                        <span className={styles.presetCardMeta}>
                          {preset.minSampleSize} visitors ·{' '}
                          {Math.round(preset.confidenceLevel * 100)}% confidence
                        </span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.testConfigCustom}>
              <span className={styles.configSubsection}>Customize</span>
              <div className={styles.configCallout}>
                <span className={styles.configCalloutLabel}>Current operating mode</span>
                <span className={styles.configCalloutValue}>
                  {selectedSettingsPresetKey
                    ? SETTINGS_PRESETS[selectedSettingsPresetKey]?.label || 'Custom'
                    : 'Custom'}
                </span>
                <span className={styles.configCalloutHint}>
                  {selectedSettingsPresetKey
                    ? 'You are aligned with one of RipX’s preset strategies.'
                    : 'These values are customized beyond the standard presets.'}
                </span>
              </div>
              <div className={styles.configFieldGroups}>
                <div className={styles.configFieldGrid}>
                  <div className={styles.configFieldGroup}>
                    <Text
                      variant="bodySm"
                      fontWeight="semibold"
                      as="span"
                      className={styles.configFieldLabel}
                    >
                      Minimum Sample Size
                    </Text>
                    <div className={styles.configQuickSelect}>
                      {SAMPLE_SIZE_QUICK.map(n => (
                        <Button
                          key={n}
                          size="slim"
                          pressed={settings.minSampleSize === n}
                          onClick={() => onSettingsChange({ ...settings, minSampleSize: n })}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                    <div className={styles.configTextField}>
                      <TextField
                        label="Or enter custom (10–10,000)"
                        type="number"
                        value={String(settings.minSampleSize ?? DEFAULT_SETTINGS.minSampleSize)}
                        onChange={value => {
                          const num = parseInt(String(value).replace(/\D/g, ''), 10);
                          onSettingsChange({
                            ...settings,
                            minSampleSize: Number.isFinite(num)
                              ? Math.max(10, Math.min(10000, num))
                              : DEFAULT_SETTINGS.minSampleSize,
                          });
                        }}
                        helpText="Minimum visitors before showing results"
                        min={10}
                        max={10000}
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  <div className={styles.configFieldGroup}>
                    <Text
                      variant="bodySm"
                      fontWeight="semibold"
                      as="span"
                      className={styles.configFieldLabel}
                    >
                      Confidence Level
                    </Text>
                    <div className={styles.configQuickSelect}>
                      {CONFIDENCE_QUICK.map(({ label, value }) => (
                        <Button
                          key={value}
                          size="slim"
                          pressed={Math.abs(Number(settings.confidenceLevel) - value) < 0.001}
                          onClick={() => onSettingsChange({ ...settings, confidenceLevel: value })}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                    <div className={styles.configTextField}>
                      <TextField
                        label="Or enter custom (0.8–0.99)"
                        type="number"
                        value={String(settings.confidenceLevel ?? DEFAULT_SETTINGS.confidenceLevel)}
                        onChange={value => {
                          const num = parseFloat(String(value).replace(/[^\d.]/g, ''));
                          onSettingsChange({
                            ...settings,
                            confidenceLevel: Number.isFinite(num)
                              ? Math.max(0.8, Math.min(0.99, num))
                              : DEFAULT_SETTINGS.confidenceLevel,
                          });
                        }}
                        helpText="Higher = more conservative, waits for stronger evidence"
                        min={0.8}
                        max={1}
                        step={0.01}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.configFieldGroup}>
                  <div className={styles.configAutoStop}>
                    <Checkbox
                      label="Auto-stop when winner is clear"
                      helpText="Automatically stop tests when statistical significance is reached — recommended for most users"
                      checked={settings.autoStopEnabled}
                      onChange={checked =>
                        onSettingsChange({ ...settings, autoStopEnabled: checked })
                      }
                    />
                  </div>
                </div>

                <div className={styles.configFooterBar}>
                  <Text as="p" variant="bodySm" tone="subdued">
                    These defaults apply to new tests only. Existing tests keep their current
                    settings.
                  </Text>
                  <InlineStack gap="200" wrap>
                    <Button variant="primary" onClick={onSave} loading={saving}>
                      Save defaults
                    </Button>
                  </InlineStack>
                </div>
              </div>
            </div>
          </BlockStack>
        </Box>
      </Card>

      <div
        className={`${styles.generalSideStack} ${
          showAllAppSections ? styles.generalSideStackInline : ''
        }`}
      >
        <Card
          className={`${styles.settingsPanelCard} ${styles.generalSideCard} ${styles.generalCompactCard}`}
        >
          <Box padding="400">
            <BlockStack gap="300">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderIcon}>
                  <ChartVerticalIcon />
                </div>
                <div className={styles.sectionHeaderContent}>
                  <SectionTitleWithTip title="Webhook delivery" tip={SECTION_HELP.webhooks} />
                  <Text as="p" variant="bodySm" tone="subdued">
                    Keep this off unless another system needs test lifecycle events from RipX.
                  </Text>
                </div>
              </div>
              <div className={styles.configCallout}>
                <span className={styles.configCalloutLabel}>Delivery status</span>
                <span className={styles.configCalloutValue}>{webhookDeliveryStatus}</span>
                <span className={styles.configCalloutHint}>
                  {String(settings.outboundWebhookUrl || '').trim()
                    ? webhookEventsSummary
                    : 'No webhook endpoint configured'}
                </span>
              </div>
              <InlineStack gap="200" wrap>
                <Button size="slim" onClick={onOpenWebhooksModal}>
                  Edit webhook delivery
                </Button>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>

        <Card
          className={`${styles.settingsPanelCard} ${styles.generalSideCard} ${styles.quickLinksCard}`}
        >
          <Box padding="400">
            <BlockStack gap="300">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderIcon}>
                  <SettingsIcon />
                </div>
                <div className={styles.sectionHeaderContent}>
                  <SectionTitleWithTip
                    title="User preferences"
                    tip={SECTION_HELP.userPreferences}
                  />
                  <Text as="p" variant="bodySm" tone="subdued">
                    <Link to={ROUTES.PROFILE} className={styles.setupWizardLink}>
                      Open Profile
                    </Link>{' '}
                    for notifications, personal theme, and dashboard preferences.
                  </Text>
                </div>
              </div>
              <InlineStack gap="200" wrap>
                <Link to={ROUTES.PROFILE} className={styles.quickLinkBtn}>
                  Open Profile
                </Link>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>
      </div>
    </>
  );
}
