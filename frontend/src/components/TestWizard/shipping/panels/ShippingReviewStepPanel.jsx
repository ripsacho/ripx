import React, { useState } from 'react';
import { Button, Modal } from '@shopify/polaris';

import {
  getConfigureFormKind,
  isIncentiveShippingCategory,
} from '../config/shippingWizardBlueprint';

export default function ShippingReviewStepPanel({
  stepStyles,
  selectedShippingCategory,
  selectedShippingCategoryLabel,
  activeDeliveryMethodNames,
  activeConfiguredRates,
  thresholdAmount,
  percentOff,
  discountAmount,
  hasShippingBlocker,
  shippingBlockerMessage,
  shippingOperationResult,
  onRunShippingDiagnostics,
}) {
  const timelineSteps = Array.isArray(shippingOperationResult?.pipelineTimeline)
    ? shippingOperationResult.pipelineTimeline
    : [];
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  const detailItems = Array.isArray(shippingOperationResult?.details)
    ? shippingOperationResult.details
    : [];
  const debugReport =
    shippingOperationResult?.debugReport && typeof shippingOperationResult.debugReport === 'object'
      ? shippingOperationResult.debugReport
      : null;
  const formatRateAmount = rate => {
    const amount = Number(rate?.amount);
    const currency = String(rate?.currency || 'USD').toUpperCase();
    if (!Number.isFinite(amount)) return `Calculated (${currency})`;
    return `${currency} ${amount.toFixed(2)}`;
  };
  const getRatePromiseLabel = rate => {
    const promise =
      rate?.delivery_promise && typeof rate.delivery_promise === 'object'
        ? rate.delivery_promise
        : {};
    const mode = String(promise.mode || '')
      .trim()
      .toLowerCase();
    const preset = String(promise.preset || '')
      .trim()
      .toLowerCase();
    if (mode === 'custom') {
      const minDate = String(promise.min_delivery_date || '').trim();
      const maxDate = String(promise.max_delivery_date || '').trim();
      return minDate || maxDate
        ? `${minDate || 'Start'} to ${maxDate || minDate || 'End'}`
        : 'Custom range';
    }
    if (mode === 'preset' && preset && preset !== 'none') {
      return preset.replace(/_/g, ' ');
    }
    return 'No promise';
  };
  const getTimelineChipClass = status => {
    if (status === 'pass') return stepStyles.shippingPipelineChipPass;
    if (status === 'warn') return stepStyles.shippingPipelineChipWarn;
    if (status === 'skipped') return stepStyles.shippingPipelineChipSkipped;
    return '';
  };
  const hiddenMethodCount = activeDeliveryMethodNames.length;
  const configuredRateCount = activeConfiguredRates.length;
  const hiddenMethodPreview = activeDeliveryMethodNames.slice(0, 3);
  const remainingHiddenMethodCount = Math.max(0, hiddenMethodCount - hiddenMethodPreview.length);
  const isIncentiveType = isIncentiveShippingCategory(selectedShippingCategory);
  const isFlatRateType = getConfigureFormKind(selectedShippingCategory) === 'flat_rate';
  const formatCurrencyAmount = value => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'Not set';
    return `$${amount.toFixed(2)}`;
  };
  const getIncentiveDetail = () => {
    if (selectedShippingCategory === 'threshold_free_shipping') {
      return {
        label: 'Cart threshold',
        value: formatCurrencyAmount(thresholdAmount),
      };
    }
    if (selectedShippingCategory === 'discount_percentage') {
      const pct = Number(percentOff);
      return {
        label: 'Discount',
        value: Number.isFinite(pct) ? `${pct}% off shipping` : 'Not set',
      };
    }
    if (selectedShippingCategory === 'discount_fixed') {
      return {
        label: 'Discount',
        value: formatCurrencyAmount(discountAmount),
      };
    }
    if (selectedShippingCategory === 'free_shipping') {
      return {
        label: 'Benefit',
        value: '100% off shipping',
      };
    }
    return null;
  };
  const incentiveDetail = getIncentiveDetail();
  const methodMetricLabel = isIncentiveType ? 'Targeted methods' : 'Hidden methods';
  const methodMetricEmptyLabel = isIncentiveType ? 'None targeted yet.' : 'None selected.';
  const offerMetricLabel = isFlatRateType ? 'Offer rows' : 'Strategy';
  const offerMetricValue = isFlatRateType
    ? String(configuredRateCount)
    : incentiveDetail?.value || selectedShippingCategoryLabel || 'Configured';
  const checkoutModeLabel = isFlatRateType
    ? configuredRateCount > 0
      ? 'Custom rows'
      : 'Control rate'
    : isIncentiveType
      ? 'Incentive'
      : 'Variant change';
  const hasPipelineWarn = timelineSteps.some(step => step?.status === 'warn');
  const hasPipelinePass = timelineSteps.some(step => step?.status === 'pass');
  const baseChecklistTone = hasShippingBlocker
    ? 'fail'
    : hasPipelineWarn
      ? 'warn'
      : hasPipelinePass
        ? 'pass'
        : 'neutral';
  const shopperChecklistTone =
    hasShippingBlocker || hasPipelineWarn
      ? baseChecklistTone
      : isFlatRateType
        ? configuredRateCount > 0
          ? 'pass'
          : 'neutral'
        : hiddenMethodCount > 0
          ? 'pass'
          : 'neutral';
  const getChecklistItemClass = tone => {
    if (tone === 'pass') return stepStyles.shippingReviewChecklistItemPass;
    if (tone === 'warn') return stepStyles.shippingReviewChecklistItemWarn;
    if (tone === 'fail') return stepStyles.shippingReviewChecklistItemFail;
    return '';
  };
  const getChecklistDotClass = tone => {
    if (tone === 'pass') return stepStyles.shippingReviewChecklistDotPass;
    if (tone === 'warn') return stepStyles.shippingReviewChecklistDotWarn;
    if (tone === 'fail') return stepStyles.shippingReviewChecklistDotFail;
    return '';
  };
  const getChecklistCountClass = tone => {
    if (tone === 'pass') return stepStyles.shippingReviewChecklistCountPass;
    if (tone === 'warn') return stepStyles.shippingReviewChecklistCountWarn;
    if (tone === 'fail') return stepStyles.shippingReviewChecklistCountFail;
    return '';
  };

  return (
    <section aria-label="Review shipping setup">
      <div className={stepStyles.shippingOfferReviewSummary}>
        <span className={stepStyles.shippingStudioEyebrow}>Shipping setup</span>
        <div className={stepStyles.shippingSetupHeader}>
          <div className={stepStyles.shippingSetupTitleGroup}>
            <strong>{selectedShippingCategoryLabel || 'Shipping setup'}</strong>
            <small>
              {isIncentiveType
                ? 'Review targeted methods and incentive settings before finishing setup.'
                : 'Review targets and visible rows before finishing setup.'}
            </small>
          </div>
          <span className={stepStyles.shippingSetupStatus}>
            {hasShippingBlocker
              ? 'Needs review'
              : baseChecklistTone === 'warn'
                ? 'Check warnings'
                : baseChecklistTone === 'pass'
                  ? 'Ready'
                  : 'Draft'}
          </span>
        </div>
        <div className={stepStyles.shippingSetupMetrics}>
          <div
            className={`${stepStyles.shippingSetupMetric} ${stepStyles.shippingSetupMetricPrimary}`}
          >
            <span>{methodMetricLabel}</span>
            <strong>{hiddenMethodCount}</strong>
            {hiddenMethodCount > 0 ? (
              <div className={stepStyles.shippingSetupInlineChips}>
                {hiddenMethodPreview.map(name => (
                  <span key={`hidden-${name}`} className={stepStyles.shippingConfigSummaryChip}>
                    {name}
                  </span>
                ))}
                {remainingHiddenMethodCount > 0 ? (
                  <span className={stepStyles.shippingConfigSummaryChip}>
                    +{remainingHiddenMethodCount}
                  </span>
                ) : null}
              </div>
            ) : (
              <small>{methodMetricEmptyLabel}</small>
            )}
          </div>
          <div
            className={`${stepStyles.shippingSetupMetric} ${stepStyles.shippingSetupMetricSecondary}`}
          >
            <span>{offerMetricLabel}</span>
            <strong>{offerMetricValue}</strong>
            {incentiveDetail ? <small>{incentiveDetail.label}</small> : null}
          </div>
          <div
            className={`${stepStyles.shippingSetupMetric} ${stepStyles.shippingSetupMetricSecondary}`}
          >
            <span>Checkout mode</span>
            <strong>{checkoutModeLabel}</strong>
          </div>
        </div>
      </div>

      {hasShippingBlocker ? (
        <div className={stepStyles.shippingInlineBlocker} role="alert">
          <strong>Review needed:</strong> {shippingBlockerMessage}
        </div>
      ) : null}

      <div className={stepStyles.shippingReviewChecklist}>
        <article
          className={`${stepStyles.shippingReviewChecklistItem} ${getChecklistItemClass(shopperChecklistTone)}`}
        >
          <header className={stepStyles.shippingReviewChecklistHeader}>
            <span
              className={`${stepStyles.shippingReviewChecklistDot} ${getChecklistDotClass(
                shopperChecklistTone
              )}`}
              aria-hidden
            />
            <div className={stepStyles.shippingReviewChecklistTitle}>
              <strong>Shopper sees</strong>
              <small>
                {isFlatRateType
                  ? configuredRateCount > 0
                    ? 'Configured rows shown at checkout.'
                    : 'Control checkout rate remains visible.'
                  : isIncentiveType
                    ? `${selectedShippingCategoryLabel || 'Incentive'} applied to targeted methods.`
                    : 'Variant shipping behavior applied at checkout.'}
              </small>
            </div>
            <span
              className={`${stepStyles.shippingReviewChecklistCount} ${getChecklistCountClass(
                shopperChecklistTone
              )}`}
            >
              {isFlatRateType ? configuredRateCount : hiddenMethodCount}
            </span>
          </header>
          {isFlatRateType && configuredRateCount > 0 ? (
            <div className={stepStyles.shippingReviewRateList}>
              {activeConfiguredRates.map((rate, index) => (
                <div className={stepStyles.shippingReviewRateRow} key={`review-rate-${index}`}>
                  <div className={stepStyles.shippingReviewRateHeader}>
                    <strong>
                      {String(rate?.name || `Rate ${index + 1}`).trim() || `Rate ${index + 1}`}
                    </strong>
                    <span>{formatRateAmount(rate)}</span>
                  </div>
                  <div className={stepStyles.shippingReviewRateMeta}>
                    <small className={stepStyles.shippingReviewPromisePill}>
                      {getRatePromiseLabel(rate)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : isIncentiveType && hiddenMethodCount > 0 ? (
            <div className={stepStyles.shippingReviewRateList}>
              {activeDeliveryMethodNames.map(name => (
                <div className={stepStyles.shippingReviewRateRow} key={`review-target-${name}`}>
                  <div className={stepStyles.shippingReviewRateHeader}>
                    <strong>{name}</strong>
                    <span>{selectedShippingCategoryLabel || 'Incentive target'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <small>
              {isFlatRateType
                ? 'No custom rows configured. Control checkout rate remains visible.'
                : isIncentiveType
                  ? 'Select targeted methods in Step 2 to preview shopper impact.'
                  : 'Complete setup details to preview shopper impact.'}
            </small>
          )}
        </article>
      </div>
      {shippingOperationResult ? (
        <div className={stepStyles.shippingInlineNote}>
          <strong>{shippingOperationResult.title}</strong>
          <div>{shippingOperationResult.message}</div>
          {timelineSteps.length > 0 ? (
            <div className={stepStyles.shippingPipelineTimeline}>
              {timelineSteps.map(step => (
                <span
                  key={step.key || step.label}
                  className={`${stepStyles.shippingPipelineChip} ${getTimelineChipClass(step.status)}`}
                >
                  {step.label}
                </span>
              ))}
            </div>
          ) : null}
          {detailItems.length > 0 ? (
            <>
              <div className={stepStyles.shippingPipelineDetailsToggle}>
                <Button
                  size="slim"
                  variant="tertiary"
                  disclosure={detailsOpen ? 'up' : 'down'}
                  onClick={() => setDetailsOpen(open => !open)}
                >
                  {detailsOpen ? 'Hide details' : 'View details'}
                </Button>
              </div>
              {detailsOpen ? (
                <ul className={stepStyles.shippingPipelineDetailsList}>
                  {detailItems.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
          {debugReport || typeof onRunShippingDiagnostics === 'function' ? (
            <div className={stepStyles.shippingDebugReportLinkRow}>
              {debugReport ? (
                <Button variant="plain" onClick={() => setDebugModalOpen(true)}>
                  View debug report
                </Button>
              ) : null}
              {typeof onRunShippingDiagnostics === 'function' ? (
                <Button variant="plain" onClick={onRunShippingDiagnostics}>
                  Run diagnostics
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {debugReport ? (
        <Modal
          open={debugModalOpen}
          onClose={() => setDebugModalOpen(false)}
          title="Shipping debug report"
          primaryAction={{
            content: 'Close',
            onAction: () => setDebugModalOpen(false),
          }}
        >
          <Modal.Section>
            <pre className={stepStyles.shippingDebugReportPre}>
              {JSON.stringify(debugReport, null, 2)}
            </pre>
          </Modal.Section>
        </Modal>
      ) : null}
    </section>
  );
}
