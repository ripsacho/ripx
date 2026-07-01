import React from 'react';
import { Button, Text } from '@shopify/polaris';
import styles from './Settings.module.css';

export function SettingsDisplayOptions({
  isAppSettings,
  isGuidedSetupMode,
  settingsLayoutMode,
  onSettingsLayoutModeChange,
  layoutDensity,
  onLayoutDensityChange,
}) {
  return (
    <div className={styles.settingsContextStrip}>
      <details className={styles.settingsDisplayOptions}>
        <summary>Display options</summary>
        <div className={styles.settingsDisplayOptionsBody}>
          {isAppSettings && !isGuidedSetupMode ? (
            <div className={styles.settingsContextControlGroup}>
              <Text as="span" variant="bodySm" tone="subdued">
                View
              </Text>
              <div className={styles.settingsContextToggleGroup}>
                <Button
                  size="micro"
                  pressed={settingsLayoutMode === 'tabbed'}
                  onClick={() => onSettingsLayoutModeChange('tabbed')}
                >
                  Sections
                </Button>
                <Button
                  size="micro"
                  pressed={settingsLayoutMode === 'all'}
                  onClick={() => onSettingsLayoutModeChange('all')}
                >
                  All sections
                </Button>
              </div>
            </div>
          ) : null}
          <div className={styles.settingsContextControlGroup}>
            <Text as="span" variant="bodySm" tone="subdued">
              Density
            </Text>
            <div className={styles.settingsContextToggleGroup}>
              <Button
                size="micro"
                pressed={layoutDensity === 'comfortable'}
                onClick={() => onLayoutDensityChange('comfortable')}
              >
                Comfortable
              </Button>
              <Button
                size="micro"
                pressed={layoutDensity === 'compact'}
                onClick={() => onLayoutDensityChange('compact')}
              >
                Compact
              </Button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
