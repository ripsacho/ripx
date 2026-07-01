import React from 'react';
import { Badge, Button, Text } from '@shopify/polaris';
import styles from '../Settings.module.css';

export function SettingsSectionLead({
  title,
  summary,
  badgeLabel,
  badgeTone = 'info',
  actionLabel,
  onAction,
}) {
  return (
    <div className={styles.settingsSectionLead}>
      <div className={styles.settingsSectionLeadCopy}>
        <div className={styles.settingsSectionLeadTitleRow}>
          <Text variant="headingSm" as="h2" className={styles.settingsSectionLeadTitle}>
            {title}
          </Text>
          {badgeLabel ? <Badge tone={badgeTone}>{badgeLabel}</Badge> : null}
        </div>
        <Text as="p" variant="bodySm" tone="subdued" className={styles.settingsSectionLeadSummary}>
          {summary}
        </Text>
      </div>
      {actionLabel && onAction ? (
        <div className={styles.settingsSectionLeadActions}>
          <Button size="slim" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
