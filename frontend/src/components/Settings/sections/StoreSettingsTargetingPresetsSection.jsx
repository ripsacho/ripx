import React from 'react';
import { Link } from 'react-router-dom';
import { BlockStack, Box, Button, Card, Text } from '@shopify/polaris';
import { DeleteIcon, TargetIcon } from '@shopify/polaris-icons';
import { CONTENT_GAP, ROUTES } from '../../../constants';
import { SectionTitleWithTip } from '../primitives/SectionTitleWithTip';
import { SECTION_HELP } from '../config/settingsSectionHelp';
import styles from '../Settings.module.css';

export function StoreSettingsTargetingPresetsSection({
  showAllAppSections,
  presetsLoading,
  targetingPresets,
  formatPresetSegments,
  onDeletePreset,
  appSettingsDomain,
}) {
  return (
    <Card className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull}`}>
      <Box padding="400">
        <BlockStack gap={CONTENT_GAP}>
          {showAllAppSections && (
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeaderIcon}>
                <TargetIcon />
              </div>
              <div className={styles.sectionHeaderContent}>
                <SectionTitleWithTip
                  title="Targeting presets"
                  tip={SECTION_HELP.targetingPresets}
                />
              </div>
            </div>
          )}
          <div className={styles.panelCardBody}>
            {presetsLoading ? (
              <div className={styles.presetsLoading}>
                <div
                  className={styles.loadingBlock}
                  style={{ height: 56, marginBottom: '0.75rem' }}
                />
                <div className={styles.loadingBlock} style={{ height: 56 }} />
              </div>
            ) : targetingPresets.length > 0 ? (
              <div className={styles.presetsGrid}>
                {targetingPresets.map(p => (
                  <div key={p.id} className={styles.presetCardItem}>
                    <div className={styles.presetCardContent}>
                      <div className={styles.presetName}>{p.name}</div>
                      <div className={styles.presetSegments}>{formatPresetSegments(p)}</div>
                    </div>
                    <Button
                      variant="plain"
                      tone="critical"
                      onClick={() => onDeletePreset(p.id)}
                      icon={DeleteIcon}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.presetsEmpty}>
                <div className={styles.presetsEmptyIcon}>
                  <TargetIcon />
                </div>
                <p className={styles.presetsEmptyText}>
                  Save targeting from the Test Wizard to reuse audiences and page rules on future
                  tests.
                </p>
                <Link
                  to={appSettingsDomain ? ROUTES.appTests(appSettingsDomain) : ROUTES.USER_PANEL}
                  className={styles.presetsEmptyCta}
                >
                  {appSettingsDomain ? 'Create a test' : 'Open stores'}
                </Link>
              </div>
            )}
          </div>
        </BlockStack>
      </Box>
    </Card>
  );
}
