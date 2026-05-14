import React from 'react';
import { Badge, Button, InlineStack, Text } from '@shopify/polaris';
import styles from '../TargetingSection.module.css';

export default function CheckoutStudioCommandHeader({
  phaseDetails,
  phaseActionLabel,
  variantCount = 0,
  configuredCount,
  nonControlCount,
  blockerCount,
  warningCount,
  action,
  topBlocker,
  onPrimaryAction,
  onVerify,
}) {
  const readinessTone = blockerCount > 0 ? 'critical' : warningCount > 0 ? 'attention' : 'success';
  const readinessText =
    blockerCount > 0
      ? `${blockerCount} blocker${blockerCount === 1 ? '' : 's'}`
      : warningCount > 0
        ? `${warningCount} warning${warningCount === 1 ? '' : 's'}`
        : 'Launch path clear';

  return (
    <div className={styles.checkoutStudioCommandHeader}>
      <div className={styles.checkoutStudioCommandCopy}>
        <span className={styles.checkoutStudioEyebrow}>Checkout Variant Studio</span>
        <Text as="h3" variant="headingMd" fontWeight="bold">
          {action?.label || 'Review checkout studio'}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          {topBlocker ||
            action?.reason ||
            'Review the current checkout test type and verify the launch path.'}
        </Text>
      </div>
      <div className={styles.checkoutStudioCommandMeta}>
        <InlineStack gap="200" blockAlign="center" wrap>
          <Badge tone="info">{phaseDetails?.title || 'Checkout test'}</Badge>
          {phaseActionLabel ? <Badge tone="info">{phaseActionLabel}</Badge> : null}
          <Badge tone={configuredCount > 0 ? 'success' : 'attention'}>
            {configuredCount}/{nonControlCount || 1} treatments configured
          </Badge>
          <Badge tone="info">
            {variantCount} variant{variantCount === 1 ? '' : 's'}
          </Badge>
          <Badge tone={readinessTone}>{readinessText}</Badge>
        </InlineStack>
        <InlineStack gap="200" blockAlign="center" wrap>
          <Button variant="secondary" onClick={onVerify}>
            Shopify verification
          </Button>
          <Button variant="primary" onClick={onPrimaryAction}>
            {action?.shortLabel || action?.label || 'Continue'}
          </Button>
        </InlineStack>
      </div>
    </div>
  );
}
