import React from 'react';
import { Badge, Button, InlineStack } from '@shopify/polaris';
import styles from '../TargetingSection.module.css';

function getStateLabel(state) {
  if (state === 'inactive') return 'Saved draft';
  if (state === 'active') return 'Active';
  if (state === 'global') return 'Global setting';
  return 'Ready';
}

export default function CheckoutModalCommandStrip({
  action,
  variantName = 'Checkout variant',
  phaseLabel = 'Checkout',
  allocation = 0,
  configured = false,
  modeLabel = 'Studio',
  modeState = 'ready',
  blockerCount = 0,
  warningCount = 0,
  onOpenConfidence,
  onChangeType,
}) {
  const statusTone = blockerCount > 0 ? 'critical' : warningCount > 0 ? 'attention' : 'success';
  const statusLabel =
    blockerCount > 0
      ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}`
      : warningCount > 0
        ? `${warningCount} warning${warningCount === 1 ? '' : 's'}`
        : 'Ready';

  return (
    <div className={styles.checkoutModalCommandStrip}>
      <div className={styles.checkoutModalCommandCopy}>
        <span className={styles.checkoutStudioEyebrow}>Checkout command workspace</span>
        <strong>{variantName}</strong>
        <span>
          {phaseLabel} · {allocation}% traffic · {configured ? 'Configured' : 'Needs content'}
        </span>
      </div>
      <div className={styles.checkoutModalCommandTask}>
        <span className={styles.checkoutStudioEyebrow}>Current task</span>
        <strong>{action?.label || 'Review checkout setup'}</strong>
        <span>{action?.reason || 'Use the guided studio steps to prepare this variant.'}</span>
      </div>
      <InlineStack gap="200" blockAlign="center" align="end" wrap>
        <Badge tone="info">{modeLabel}</Badge>
        <Badge tone={modeState === 'inactive' ? 'attention' : 'success'}>
          {getStateLabel(modeState)}
        </Badge>
        <Badge tone={statusTone}>{statusLabel}</Badge>
        {modeState === 'inactive' ? (
          <Button size="slim" onClick={onChangeType}>
            Change type
          </Button>
        ) : (
          <Button size="slim" variant="secondary" onClick={onOpenConfidence}>
            Open confidence
          </Button>
        )}
      </InlineStack>
    </div>
  );
}
