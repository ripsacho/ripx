import React from 'react';
import { Text } from '@shopify/polaris';
import styles from './SettingsPrimitives.module.css';

/**
 * Merchant-friendly setup progress for Store setup section.
 */
export function SetupProgressHeader({
  completed = 0,
  total = 0,
  label = 'Setup progress',
  hint = '',
}) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeCompleted = Math.min(Math.max(0, Number(completed) || 0), safeTotal || 0);
  const percent =
    safeTotal > 0 ? Math.round((safeCompleted / safeTotal) * 100) : safeCompleted > 0 ? 100 : 0;
  const isComplete = safeTotal > 0 && safeCompleted >= safeTotal;

  return (
    <div
      className={styles.setupProgressHeader}
      role="status"
      aria-label={`${label}: ${safeCompleted} of ${safeTotal} complete`}
    >
      <div className={styles.setupProgressHeaderRow}>
        <div>
          <Text as="p" variant="bodySm" tone="subdued">
            {label}
          </Text>
          <Text as="p" variant="headingSm">
            {isComplete
              ? 'Your store is ready to test'
              : `${safeCompleted} of ${safeTotal || '—'} steps complete`}
          </Text>
        </div>
        <span className={styles.setupProgressPercent}>{percent}%</span>
      </div>
      <div className={styles.setupProgressTrack} aria-hidden="true">
        <div
          className={`${styles.setupProgressFill} ${
            isComplete ? styles.setupProgressFillComplete : ''
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {hint ? (
        <Text as="p" variant="bodySm" tone="subdued">
          {hint}
        </Text>
      ) : null}
    </div>
  );
}
