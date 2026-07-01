import React from 'react';
import { Badge, Button, Text, Tooltip } from '@shopify/polaris';
import styles from './SettingsPrimitives.module.css';

const TONE_TO_BADGE = {
  success: 'success',
  warning: 'warning',
  critical: 'critical',
  attention: 'attention',
};

function statusIcon(tone) {
  if (tone === 'success') return '✓';
  if (tone === 'critical') return '!';
  return '○';
}

/**
 * Single store-setup step — replaces table rows for merchant-facing checklist.
 */
export function SetupStepRow({
  title,
  summary,
  status,
  tone = 'attention',
  actionLabel,
  onAction,
  loading = false,
  disabled = false,
  actionTooltip,
  secondaryLabel,
  onSecondaryAction,
  secondaryTooltip,
}) {
  const badgeTone = TONE_TO_BADGE[tone] || 'attention';
  const primaryButton = (
    <Button size="slim" onClick={onAction} loading={loading} disabled={disabled}>
      {actionLabel}
    </Button>
  );
  const secondaryButton =
    secondaryLabel && onSecondaryAction ? (
      <Button size="slim" variant="plain" onClick={onSecondaryAction}>
        {secondaryLabel}
      </Button>
    ) : null;

  return (
    <div className={`${styles.setupStepRow} ${tone === 'success' ? styles.setupStepRowDone : ''}`}>
      <div className={styles.setupStepRowIcon} aria-hidden="true">
        {statusIcon(tone)}
      </div>
      <div className={styles.setupStepRowBody}>
        <div className={styles.setupStepRowTitleRow}>
          <Text as="span" variant="bodyMd" fontWeight="semibold">
            {title}
          </Text>
          <Badge tone={badgeTone}>{status}</Badge>
        </div>
        {summary ? (
          <Text as="p" variant="bodySm" tone="subdued">
            {summary}
          </Text>
        ) : null}
      </div>
      <div className={styles.setupStepRowActions}>
        {actionTooltip ? <Tooltip content={actionTooltip}>{primaryButton}</Tooltip> : primaryButton}
        {secondaryButton &&
          (secondaryTooltip ? (
            <Tooltip content={secondaryTooltip}>{secondaryButton}</Tooltip>
          ) : (
            secondaryButton
          ))}
      </div>
    </div>
  );
}
