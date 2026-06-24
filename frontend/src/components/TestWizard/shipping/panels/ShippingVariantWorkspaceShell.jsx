import { memo, useMemo } from 'react';
import { Badge, InlineStack, Text } from '@shopify/polaris';
import useRenderDebugCounter from '../hooks/useRenderDebugCounter';

function ShippingVariantWorkspaceShell({
  stepStyles,
  shippingVariants,
  activeShippingVariantIndex,
  onSelectVariant,
  getShippingReadiness,
  getVariantColor,
  getVariantColorLight,
  getShippingVariantSummary,
  activeVariantName,
  strategyGuidance,
  activeReadiness,
  renderEditorPanel,
  shippingReadinessList,
}) {
  useRenderDebugCounter('ShippingVariantWorkspaceShell', () => ({
    activeVariantIndex: activeShippingVariantIndex,
    variants: shippingVariants.length,
    readinessItems: shippingReadinessList.length,
  }));
  const variantTabs = useMemo(
    () =>
      shippingVariants.map((variant, index) => {
        const readiness = getShippingReadiness(variant, index);
        const active = index === activeShippingVariantIndex;
        const color = getVariantColor(index);
        return (
          <button
            key={`shipping-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`shipping-variant-panel-${index}`}
            className={`${stepStyles.shippingBrowserTab} ${
              active ? stepStyles.shippingBrowserTabActive : ''
            }`}
            style={{
              '--shipping-variant-accent': color,
              '--shipping-variant-accent-soft': getVariantColorLight(color, 0.12),
            }}
            onClick={() => onSelectVariant(index)}
          >
            <span className={stepStyles.shippingBrowserTabTop}>
              <span className={stepStyles.shippingBrowserTabDot} aria-hidden />
              <strong>{variant?.name || `Variant ${index + 1}`}</strong>
            </span>
            <span className={stepStyles.shippingBrowserTabSummary}>
              {getShippingVariantSummary(variant, index)}
            </span>
            <span className={stepStyles.shippingBrowserTabMeta}>
              <Badge tone={readiness.tone} size="small">
                {readiness.label}
              </Badge>
            </span>
          </button>
        );
      }),
    [
      shippingVariants,
      getShippingReadiness,
      activeShippingVariantIndex,
      getVariantColor,
      stepStyles.shippingBrowserTab,
      stepStyles.shippingBrowserTabActive,
      stepStyles.shippingBrowserTabTop,
      stepStyles.shippingBrowserTabDot,
      stepStyles.shippingBrowserTabSummary,
      stepStyles.shippingBrowserTabMeta,
      getVariantColorLight,
      onSelectVariant,
      getShippingVariantSummary,
    ]
  );
  const comparisonChips = useMemo(
    () =>
      shippingReadinessList.map(item => (
        <button
          key={`shipping-compare-${item.index}`}
          type="button"
          className={`${stepStyles.shippingComparisonChip} ${
            item.index === activeShippingVariantIndex ? stepStyles.shippingComparisonChipActive : ''
          }`}
          onClick={() => onSelectVariant(item.index)}
        >
          <span>
            <strong>{item.variant?.name || `Variant ${item.index + 1}`}</strong>
            {item.summary}
          </span>
          <Badge tone={item.readiness.tone} size="small">
            {item.readiness.label}
          </Badge>
        </button>
      )),
    [
      shippingReadinessList,
      stepStyles.shippingComparisonChip,
      activeShippingVariantIndex,
      stepStyles.shippingComparisonChipActive,
      onSelectVariant,
    ]
  );

  return (
    <div className={stepStyles.shippingVariantStudio}>
      <div className={stepStyles.shippingVariantCommandBar}>
        <div className={stepStyles.shippingVariantCommandCopy}>
          <span className={stepStyles.shippingStudioEyebrow}>Shipping variant studio</span>
          <strong>Configure each shipping experience without leaving the editor.</strong>
          <span>
            Choose methods to hide and configure variant shipping rows in one guided flow.
          </span>
        </div>
      </div>
      <div className={stepStyles.shippingBrowserFrame}>
        <div
          className={stepStyles.shippingBrowserTabs}
          role="tablist"
          aria-label="Shipping test variants"
        >
          {variantTabs}
        </div>

        <div
          id={`shipping-variant-panel-${activeShippingVariantIndex}`}
          role="tabpanel"
          className={stepStyles.shippingVariantPanel}
        >
          <div className={stepStyles.shippingVariantPanelHeader}>
            <div>
              <span className={stepStyles.shippingStudioEyebrow}>Active tab</span>
              <Text variant="headingMd" as="h3" fontWeight="bold">
                {activeVariantName}
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                {strategyGuidance}
              </Text>
            </div>
            <InlineStack gap="200" blockAlign="center" wrap>
              <Badge tone={activeReadiness?.tone || 'info'}>
                {activeReadiness?.label || 'Ready'}
              </Badge>
            </InlineStack>
          </div>

          <div className={stepStyles.shippingVariantWorkspace}>{renderEditorPanel()}</div>
        </div>
      </div>

      <div className={stepStyles.shippingComparisonStrip} aria-label="Shipping variant comparison">
        {comparisonChips}
      </div>
    </div>
  );
}

export default memo(ShippingVariantWorkspaceShell);
