import React from 'react';
import { Box, Card } from '@shopify/polaris';
import { APP_META } from '../../constants';
import styles from './Settings.module.css';

export function SettingsAboutCard() {
  return (
    <Card className={styles.aboutCard}>
      <Box padding="400">
        <div className={styles.aboutSection}>
          <div className={styles.aboutTitleRow}>
            <span className={styles.aboutTitle}>RipX</span>
            <span className={styles.aboutBadge}>A/B Testing</span>
          </div>
          <div className={styles.aboutVersion}>Version {APP_META.VERSION}</div>
          <p className={styles.aboutDesc}>
            Store setup, testing defaults, integrations, and targeting for this shop.
          </p>
        </div>
      </Box>
    </Card>
  );
}
