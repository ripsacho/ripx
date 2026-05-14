import React from 'react';
import { Badge, Button, InlineStack, Text } from '@shopify/polaris';
import { getVariantColor, getVariantColorLight } from '../../../utils/variantColors';
import { getCheckoutStudioNextAction } from './checkoutStudioReadiness';
import styles from '../TargetingSection.module.css';

function getReadinessLabel(status) {
  if (status === 'blocked') return 'Blocked';
  if (status === 'needs_attention') return 'Needs attention';
  return 'Ready';
}

export default function CheckoutVariantTable({
  variants = [],
  configuredCount = 0,
  nonControlCount = 1,
  phaseDetails,
  checkoutPhase,
  getSummary,
  onOpenEditor,
}) {
  return (
    <div className={styles.checkoutVariantTableShell}>
      <InlineStack align="space-between" blockAlign="center" wrap gap="300">
        <div>
          <Text as="h5" variant="headingSm">
            Checkout variants
          </Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Compare readiness, saved assets, and the next best action before opening the builder.
          </Text>
        </div>
        <Badge tone={configuredCount > 0 ? 'success' : 'attention'}>
          {configuredCount}/{nonControlCount || 1} treatment ready
        </Badge>
      </InlineStack>
      <div className={styles.checkoutVariantTable} role="table" aria-label="Checkout variants">
        <div className={styles.checkoutVariantTableHead} role="row">
          <span role="columnheader">Variant</span>
          <span role="columnheader">Blocks</span>
          <span role="columnheader">Products</span>
          <span role="columnheader">Methods</span>
          <span role="columnheader">Readiness</span>
          <span role="columnheader">Goal</span>
          <span role="columnheader">Actions</span>
        </div>
        {variants.map((variant, index) => {
          const variantColor = getVariantColor(index);
          const summary = getSummary(variant, index);
          const nextAction = getCheckoutStudioNextAction(summary, checkoutPhase);
          return (
            <div
              key={`checkout-variant-row-${index}`}
              className={styles.checkoutVariantTableRow}
              role="row"
              style={{
                '--checkout-variant-accent': variantColor,
                '--checkout-variant-accent-soft': getVariantColorLight(variantColor),
              }}
            >
              <div className={styles.checkoutVariantTableCellMain} role="cell" data-label="Variant">
                <span className={styles.checkoutVariantBrowserDot} aria-hidden />
                <span>
                  <strong>{variant?.name || `Variant ${index + 1}`}</strong>
                  <span>
                    {summary.isControlLike
                      ? 'Control baseline'
                      : summary.variantConfigured
                        ? 'Configured treatment'
                        : 'Draft treatment'}{' '}
                    / {variant?.allocation ?? 0}% traffic
                  </span>
                </span>
              </div>
              <div className={styles.checkoutVariantTableCell} role="cell" data-label="Blocks">
                <strong>{summary.actionableSections.length}</strong>
                <span>renderable / {summary.allSections.length || 0} total</span>
              </div>
              <div className={styles.checkoutVariantTableCell} role="cell" data-label="Products">
                <strong>{summary.productSections.length}</strong>
                <span>
                  {summary.manualAddNeedsIds
                    ? 'Product IDs needed'
                    : summary.hasCollectionProducts
                      ? 'Collection runtime'
                      : summary.hasCartRelatedProducts
                        ? 'Cart runtime'
                        : 'Ready'}
                </span>
              </div>
              <div className={styles.checkoutVariantTableCell} role="cell" data-label="Methods">
                <strong>
                  {summary.paymentMethodCount}/{summary.deliveryMethodCount}
                </strong>
                <span>payment / delivery</span>
              </div>
              <div className={styles.checkoutVariantTableCell} role="cell" data-label="Readiness">
                <strong>{getReadinessLabel(summary.readiness?.status)}</strong>
                <span>
                  {summary.readiness?.blockerCount || 0} blockers /{' '}
                  {summary.readiness?.warningCount || 0} warnings
                </span>
              </div>
              <div className={styles.checkoutVariantTableCell} role="cell" data-label="Goal">
                <strong>{summary.primaryGoalLabel}</strong>
                <span>{phaseDetails?.title || 'Checkout'}</span>
              </div>
              <div className={styles.checkoutVariantTableActions} role="cell" data-label="Actions">
                <Button
                  size="slim"
                  onClick={() => onOpenEditor(index, nextAction.mode, nextAction)}
                >
                  {nextAction.shortLabel || nextAction.label}
                </Button>
                <Button
                  size="slim"
                  variant="secondary"
                  onClick={() => onOpenEditor(index, 'overview')}
                >
                  Edit
                </Button>
                <Button
                  size="slim"
                  variant="secondary"
                  onClick={() => onOpenEditor(index, 'preview')}
                >
                  Preview
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
