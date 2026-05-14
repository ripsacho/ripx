import React from 'react';
import { Badge, Button, InlineStack, Text } from '@shopify/polaris';
import styles from '../TargetingSection.module.css';

export default function CheckoutSurfaceMode({
  surfaceCards = [],
  currentPhaseLabel = 'Current type',
  pendingSwitch,
  onSelectSurface,
  onCancelSwitch,
  onConfirmSwitch,
}) {
  const targetCard = surfaceCards.find(card => card.value === pendingSwitch?.value);

  return (
    <div className={styles.checkoutVariantBlock}>
      <InlineStack align="space-between" blockAlign="center" wrap gap="200">
        <div>
          <Text as="h5" variant="headingSm">
            Change checkout test type
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            This global setting applies to all variants. Inactive blocks and method settings stay
            saved as drafts until their test type is selected.
          </Text>
        </div>
        <Badge tone="info">All variants</Badge>
      </InlineStack>
      <div className={styles.checkoutSurfaceModeGrid}>
        {surfaceCards.map(card => (
          <button
            key={card.value}
            type="button"
            className={`${styles.checkoutSurfaceModeCard} ${
              card.active ? styles.checkoutSurfaceModeCardActive : ''
            }`}
            aria-pressed={card.active}
            onClick={() => onSelectSurface?.(card.value)}
          >
            <span className={styles.checkoutPhaseEyebrow}>{card.eyebrow}</span>
            <strong>{card.title}</strong>
            <span>{card.description}</span>
            <small>Active modes: {card.linkedModes}</small>
            <small>Saved assets: {card.configuredAssets}</small>
            <small>Required setup: {card.requiredSetup}</small>
            <em>{card.active ? 'Launch-valid test type' : 'Saved draft when inactive'}</em>
          </button>
        ))}
      </div>
      {pendingSwitch && targetCard ? (
        <div className={styles.checkoutSurfaceConfirmPanel} role="status" aria-live="polite">
          <div>
            <strong>
              Switch from {currentPhaseLabel} to {targetCard.title}?
            </strong>
            <span>
              Preserved drafts: {pendingSwitch.savedAssets.sections} checkout sections,{' '}
              {pendingSwitch.savedAssets.payment} payment targets, and{' '}
              {pendingSwitch.savedAssets.delivery} delivery targets. Only {targetCard.title} is
              launch-valid after this change.
            </span>
          </div>
          <InlineStack gap="200" blockAlign="center">
            <Button size="slim" onClick={onCancelSwitch}>
              Keep current type
            </Button>
            <Button
              size="slim"
              variant="primary"
              onClick={() => onConfirmSwitch?.(pendingSwitch.value)}
            >
              Confirm change
            </Button>
          </InlineStack>
        </div>
      ) : null}
      <div className={styles.checkoutVariantEmptyHint}>
        Runtime rule: checkout test type is owned by the test goal, not by an individual variant.
        Switching test type changes validation focus for every variant while preserving inactive
        configuration.
      </div>
    </div>
  );
}
