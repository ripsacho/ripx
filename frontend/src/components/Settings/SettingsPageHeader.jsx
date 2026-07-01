import React from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Card,
  Icon,
  InlineStack,
  Text,
  Tooltip,
} from '@shopify/polaris';
import { SettingsIcon, InfoIcon } from '@shopify/polaris-icons';
import { ROUTES } from '../../constants';
import { SettingsSystemsMetricsRow } from './primitives/SettingsSystemsMetricsRow';
import styles from './Settings.module.css';

export function SettingsPageHeader({
  isAppSettings,
  title,
  subtitle,
  subtitleHelp,
  showSetupBadge,
  setupComplete,
  showSystemsMetrics,
  systemsMetrics,
  onSystemsMetricSelect,
  showQuickNav,
  quickNavSections,
  activeAppSectionId,
  onQuickNavSelect,
  showAccountFallback,
  settingsLoadError,
  onDismissLoadError,
  onRetrySettings,
  isGuidedSetupMode,
  onClearGuidedSetup,
  showSetupFirstBanner,
  installationHubPath,
}) {
  return (
    <div className={styles.settingsHeader}>
      <div className={styles.settingsShell}>
        <div className={styles.settingsShellMeta} aria-hidden="true">
          <span className={styles.settingsShellMetaLabel}>RipX</span>
          <span className={styles.settingsShellMetaDot} />
          <span className={styles.settingsShellMetaValue}>
            {isAppSettings ? 'Store control panel' : 'Account workspace'}
          </span>
        </div>
        <div className={styles.settingsShellHeaderRow}>
          <div className={styles.settingsShellTitleGroup}>
            <div className={styles.settingsShellIcon} aria-hidden>
              <SettingsIcon />
            </div>
            <div className={styles.settingsShellTitleBlock}>
              <h1 className={styles.settingsShellTitle}>{title}</h1>
              <div className={styles.settingsShellSubtitleRow}>
                <p className={styles.settingsShellSubtitle}>{subtitle}</p>
                {isAppSettings && subtitleHelp ? (
                  <Tooltip content={subtitleHelp}>
                    <span
                      className={styles.settingsShellSubtitleHint}
                      tabIndex={0}
                      aria-label="More about store settings"
                    >
                      <Icon source={InfoIcon} />
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            </div>
          </div>
          {showSetupBadge ? (
            <div className={styles.settingsShellBadges}>
              <Badge tone={setupComplete ? 'success' : 'attention'}>
                {setupComplete ? 'Setup ready' : 'Setup pending'}
              </Badge>
            </div>
          ) : null}
        </div>

        {showSystemsMetrics ? (
          <SettingsSystemsMetricsRow
            metrics={systemsMetrics}
            onMetricSelect={onSystemsMetricSelect}
          />
        ) : null}

        {showQuickNav ? (
          <div className={styles.settingsShellQuickNav}>
            <Text as="span" variant="bodySm" className={styles.settingsShellQuickNavLabel}>
              Jump to
            </Text>
            <div className={styles.settingsShellQuickNavScroll}>
              <div className={styles.settingsShellQuickNavTrack}>
                {quickNavSections.map(section => (
                  <button
                    key={section.id}
                    type="button"
                    className={`${styles.settingsShellQuickNavChip} ${
                      activeAppSectionId === section.id
                        ? styles.settingsShellQuickNavChipActive
                        : ''
                    }`}
                    onClick={() => onQuickNavSelect(section.id)}
                    aria-current={activeAppSectionId === section.id ? 'true' : undefined}
                  >
                    <span className={styles.settingsShellQuickNavChipMain}>
                      <span className={styles.settingsShellQuickNavChipLabel}>{section.label}</span>
                      <span className={styles.settingsShellQuickNavChipMeta}>
                        <span
                          className={`${styles.settingsShellQuickNavChipDot} ${
                            section.status === 'ok'
                              ? styles.settingsShellQuickNavChipDotOk
                              : section.status === 'warn'
                                ? styles.settingsShellQuickNavChipDotWarn
                                : styles.settingsShellQuickNavChipDotNeutral
                          }`}
                          aria-hidden="true"
                        />
                        {section.status === 'ok'
                          ? section.id === 'installation'
                            ? 'Ready'
                            : section.id === 'integrations'
                              ? 'Connected'
                              : section.id === 'presets'
                                ? 'Saved'
                                : 'Available'
                          : section.status === 'warn'
                            ? 'Needs focus'
                            : 'Available'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {showAccountFallback ? (
        <Card className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull}`}>
          <Box padding="400">
            <BlockStack gap="200">
              <Text variant="bodyMd" as="p">
                Appearance is now a personal profile preference, so one user changing theme will not
                affect anyone else on the account.
              </Text>
              <InlineStack gap="200" wrap>
                <Link to={ROUTES.PROFILE_APPEARANCE} className={styles.quickLinkBtn}>
                  Open appearance
                </Link>
                <Link to={ROUTES.USER_PANEL} className={styles.quickLinkBtn}>
                  Open store settings
                </Link>
              </InlineStack>
            </BlockStack>
          </Box>
        </Card>
      ) : null}

      {settingsLoadError ? (
        <Banner
          tone="critical"
          onDismiss={onDismissLoadError}
          action={{ content: 'Retry', onAction: onRetrySettings }}
        >
          Couldn&apos;t load store settings. Retry when your connection is stable.
        </Banner>
      ) : null}

      {isGuidedSetupMode ? (
        <Banner
          tone="info"
          title="Store setup mode"
          action={{ content: 'Exit guided mode', onAction: onClearGuidedSetup }}
        >
          <p>Only setup actions are shown. Exit to edit other settings.</p>
        </Banner>
      ) : null}

      {showSetupFirstBanner ? (
        <Banner tone="warning" title="Finish store setup first">
          <p>
            Complete store setup before changing advanced settings.{' '}
            <Link to={installationHubPath} className={styles.installDocLink}>
              Go to Store setup
            </Link>
          </p>
        </Banner>
      ) : null}
    </div>
  );
}
