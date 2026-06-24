import { memo, useMemo } from 'react';
import { Badge } from '@shopify/polaris';

function ShippingPreviewCompanion({
  stepStyles,
  isActiveControlLike,
  activeStrategy,
  activeReadiness,
  hasShippingBlocker,
  shippingBlockerMessage,
  checkoutPreviewTitle,
  checkoutPreviewPrice,
  checkoutPreviewDescription,
  checkoutPreviewPromiseLabel,
}) {
  const badgeTone = useMemo(() => {
    if (isActiveControlLike) return 'success';
    if (hasShippingBlocker) return 'attention';
    return activeReadiness?.tone === 'success' ? 'success' : 'info';
  }, [isActiveControlLike, hasShippingBlocker, activeReadiness?.tone]);
  const badgeLabel = useMemo(() => {
    if (isActiveControlLike) return 'Baseline';
    if (hasShippingBlocker) return 'Needs setup';
    return activeReadiness?.label || 'Ready';
  }, [isActiveControlLike, hasShippingBlocker, activeReadiness?.label]);
  const title = useMemo(() => {
    if (isActiveControlLike) return 'Control variant keeps Shopify shipping unchanged.';
    if (hasShippingBlocker) return shippingBlockerMessage;
    return 'Draft shopper preview for the active variant.';
  }, [isActiveControlLike, hasShippingBlocker, shippingBlockerMessage]);
  const usesControlView = isActiveControlLike || activeStrategy === 'control';

  return (
    <aside className={stepStyles.shippingReadinessRail}>
      <div className={stepStyles.shippingSetupOverviewCard}>
        <div className={stepStyles.shippingSetupOverviewHeader}>
          <span className={stepStyles.shippingStudioEyebrow}>Preview companion</span>
          <Badge tone={badgeTone} size="small">
            {badgeLabel}
          </Badge>
        </div>
        <div className={stepStyles.shippingSetupOverviewTitle}>{title}</div>
      </div>

      <div className={stepStyles.shippingImpactPreview}>
        <span className={stepStyles.shippingStudioEyebrow}>Shopper preview</span>
        <div className={stepStyles.shippingCheckoutMockCard}>
          <div className={stepStyles.shippingCheckoutMockHeader}>
            <div>
              <span className={stepStyles.shippingCheckoutMockTitle}>
                {usesControlView ? 'Shopify live shipping method' : checkoutPreviewTitle}
              </span>
              <span className={stepStyles.shippingCheckoutMockPrice}>
                {usesControlView ? 'Current price' : checkoutPreviewPrice}
              </span>
            </div>
            <span className={stepStyles.shippingCheckoutMockRadio} aria-hidden="true" />
          </div>
          <div className={stepStyles.shippingCheckoutMockLines}>
            <span>
              {usesControlView
                ? 'Control uses your live Shopify shipping labels.'
                : checkoutPreviewDescription || 'No checkout subline will be sent.'}
            </span>
            <span>
              {usesControlView
                ? 'Delivery promise comes from Shopify settings.'
                : checkoutPreviewPromiseLabel}
            </span>
          </div>
        </div>
        <div className={stepStyles.shippingRailPreviewHint}>
          This is a draft estimate. Run diagnostics and apply from Step 4 for Shopify-backed
          verification.
        </div>
      </div>
    </aside>
  );
}

export default memo(ShippingPreviewCompanion);
