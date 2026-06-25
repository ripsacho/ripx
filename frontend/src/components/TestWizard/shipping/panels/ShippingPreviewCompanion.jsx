import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@shopify/polaris';

import { buildShippingCheckoutPreviewRows } from '../buildShippingCheckoutPreviewRows';

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
  shippingCurrentRates = [],
  activeDeliveryMethodNames = [],
  activeSelectedMethodIds = [],
  activeDeliveryMethodCodes = [],
  activeConfiguredRates = [],
  replacesExistingRates = false,
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
  const hideTargetKey = [
    activeDeliveryMethodNames.join('|'),
    activeSelectedMethodIds.join('|'),
    activeDeliveryMethodCodes.join('|'),
  ].join('::');
  const configuredRatesKey = activeConfiguredRates
    .map(rate => `${rate?.name || ''}:${rate?.amount || ''}`)
    .join('|');
  const nativeRatesKey = shippingCurrentRates
    .map(rate => `${rate?.name || ''}:${rate?.amount || ''}`)
    .join('|');

  const { checkoutRows, previewCaption } = useMemo(
    () =>
      buildShippingCheckoutPreviewRows({
        usesControlView,
        shippingCurrentRates,
        activeDeliveryMethodNames,
        activeSelectedMethodIds,
        activeDeliveryMethodCodes,
        activeConfiguredRates,
        replacesExistingRates,
        checkoutPreviewTitle,
        checkoutPreviewPrice,
        checkoutPreviewDescription,
        checkoutPreviewPromiseLabel,
      }),
    [
      usesControlView,
      shippingCurrentRates,
      activeDeliveryMethodNames,
      activeSelectedMethodIds,
      activeDeliveryMethodCodes,
      activeConfiguredRates,
      replacesExistingRates,
      checkoutPreviewTitle,
      checkoutPreviewPrice,
      checkoutPreviewDescription,
      checkoutPreviewPromiseLabel,
    ]
  );

  const [activeSlide, setActiveSlide] = useState(0);
  const slideCount = checkoutRows.length;
  const activeRow = checkoutRows[activeSlide] || checkoutRows[0] || null;

  useEffect(() => {
    setActiveSlide(0);
  }, [
    usesControlView,
    slideCount,
    hideTargetKey,
    configuredRatesKey,
    nativeRatesKey,
    activeStrategy,
  ]);

  useEffect(() => {
    if (activeSlide >= slideCount) {
      setActiveSlide(Math.max(0, slideCount - 1));
    }
  }, [activeSlide, slideCount]);

  const goToPreviousSlide = useCallback(() => {
    setActiveSlide(current => Math.max(0, current - 1));
  }, []);

  const goToNextSlide = useCallback(() => {
    setActiveSlide(current => Math.min(slideCount - 1, current + 1));
  }, [slideCount]);

  useEffect(() => {
    if (slideCount <= 1) return undefined;

    const handleKeyDown = event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPreviousSlide();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNextSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slideCount, goToPreviousSlide, goToNextSlide]);

  const handleTouchStart = useCallback(event => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    event.currentTarget.dataset.touchStartX = String(touch.clientX);
  }, []);

  const handleTouchEnd = useCallback(
    event => {
      const touch = event.changedTouches?.[0];
      const startX = Number(event.currentTarget.dataset.touchStartX || NaN);
      if (!touch || !Number.isFinite(startX)) return;
      const deltaX = touch.clientX - startX;
      if (Math.abs(deltaX) < 36) return;
      if (deltaX > 0) {
        goToPreviousSlide();
      } else {
        goToNextSlide();
      }
    },
    [goToPreviousSlide, goToNextSlide]
  );

  const getSlideBadgeLabel = row => {
    if (row?.tone === 'variant') return 'RipX rate';
    if (usesControlView) return 'Baseline';
    return 'Shopify';
  };

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
        <div className={stepStyles.shippingPreviewSliderHeader}>
          <span className={stepStyles.shippingStudioEyebrow}>Shopper preview</span>
          {slideCount > 1 ? (
            <span className={stepStyles.shippingPreviewSliderCounter}>
              {activeSlide + 1} / {slideCount}
            </span>
          ) : null}
        </div>

        {slideCount > 1 ? (
          <div
            className={stepStyles.shippingPreviewSliderTabs}
            role="tablist"
            aria-label="Shipping method previews"
          >
            {checkoutRows.map((row, index) => (
              <button
                type="button"
                key={row.key}
                role="tab"
                aria-selected={index === activeSlide}
                className={`${stepStyles.shippingPreviewSliderTab} ${
                  index === activeSlide ? stepStyles.shippingPreviewSliderTabActive : ''
                } ${row.tone === 'variant' ? stepStyles.shippingPreviewSliderTabVariant : ''}`}
                onClick={() => setActiveSlide(index)}
              >
                <span>{row.title}</span>
                <small>{row.price}</small>
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={stepStyles.shippingPreviewSlider}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className={stepStyles.shippingPreviewSliderViewport}>
            {activeRow ? (
              <div
                className={`${stepStyles.shippingCheckoutMockCard} ${
                  activeRow.tone === 'variant' ? stepStyles.shippingCheckoutMockCardVariant : ''
                } ${stepStyles.shippingPreviewSliderCard}`}
                key={activeRow.key}
              >
                <div className={stepStyles.shippingPreviewSliderCardBadge}>
                  {getSlideBadgeLabel(activeRow)}
                </div>
                <div className={stepStyles.shippingCheckoutMockHeader}>
                  <div>
                    <span className={stepStyles.shippingCheckoutMockTitle}>{activeRow.title}</span>
                    <span className={stepStyles.shippingCheckoutMockPrice}>{activeRow.price}</span>
                  </div>
                  <span
                    className={`${stepStyles.shippingCheckoutMockRadio} ${stepStyles.shippingPreviewSliderRadioSelected}`}
                    aria-hidden="true"
                  />
                </div>
                <div className={stepStyles.shippingCheckoutMockLines}>
                  <span>{activeRow.description}</span>
                  <span>{activeRow.promiseLabel}</span>
                </div>
              </div>
            ) : (
              <div className={stepStyles.shippingPreviewSliderEmpty}>
                Configure a rate to preview what shoppers will see at checkout.
              </div>
            )}
          </div>

          {slideCount > 1 ? (
            <div className={stepStyles.shippingPreviewSliderNav}>
              <button
                type="button"
                className={stepStyles.shippingPreviewSliderArrow}
                onClick={goToPreviousSlide}
                disabled={activeSlide === 0}
                aria-label="Previous shipping method preview"
              >
                ‹
              </button>
              <div className={stepStyles.shippingPreviewSliderDots}>
                {checkoutRows.map((row, index) => (
                  <button
                    type="button"
                    key={row.key}
                    aria-label={`Show ${row.title}`}
                    className={`${stepStyles.shippingPreviewSliderDot} ${
                      index === activeSlide ? stepStyles.shippingPreviewSliderDotActive : ''
                    }`}
                    onClick={() => setActiveSlide(index)}
                  />
                ))}
              </div>
              <button
                type="button"
                className={stepStyles.shippingPreviewSliderArrow}
                onClick={goToNextSlide}
                disabled={activeSlide >= slideCount - 1}
                aria-label="Next shipping method preview"
              >
                ›
              </button>
            </div>
          ) : null}
        </div>

        <div className={stepStyles.shippingRailPreviewHint}>{previewCaption}</div>
      </div>
    </aside>
  );
}

export default memo(ShippingPreviewCompanion);
