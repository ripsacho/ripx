import { memo, useCallback, useMemo, useState } from 'react';
import { Button } from '@shopify/polaris';
import styles from '../ShippingStudio.module.css';
import useRenderDebugCounter from '../hooks/useRenderDebugCounter';

function statusLabel(status) {
  if (status === 'pass') return 'Pass';
  if (status === 'fail') return 'Fail';
  if (status === 'warn') return 'Warn';
  if (status === 'manual') return 'Manual';
  return 'Pending';
}

function statusClass(status) {
  if (status === 'pass') return styles.debugStatusPass;
  if (status === 'fail') return styles.debugStatusFail;
  if (status === 'warn') return styles.debugStatusWarn;
  return styles.debugStatusUnknown;
}

function ShippingOperationsPanel({
  canRun = false,
  canApply = false,
  disabledReason = '',
  applyDisabledReason = '',
  loadingAction = '',
  latestResult = null,
  activeVariantLabel = '',
  onRunDiagnostics,
  onRunLiveDebug,
  onCleanupStale,
  onDryRun,
  onApply,
}) {
  useRenderDebugCounter('ShippingOperationsPanel', () => ({
    loadingAction,
    canRun,
    canApply,
    hasLatestResult: Boolean(latestResult),
  }));
  const disabled = !canRun || Boolean(loadingAction);
  const applyDisabled = !canApply || Boolean(loadingAction);
  const debugChecklist = useMemo(() => latestResult?.debugChecklist || null, [latestResult]);
  const liveDebug = useMemo(() => latestResult?.liveDebugReport || null, [latestResult]);
  const debugSteps = useMemo(
    () => (Array.isArray(debugChecklist?.steps) ? debugChecklist.steps : []),
    [debugChecklist]
  );
  const primaryBlocker = useMemo(() => debugChecklist?.primary_blocker || null, [debugChecklist]);
  const storefrontChecks = useMemo(
    () => (Array.isArray(liveDebug?.storefront_checks) ? liveDebug.storefront_checks : []),
    [liveDebug]
  );
  const manualChecklist = useMemo(
    () =>
      Array.isArray(debugChecklist?.storefront_manual_checks)
        ? debugChecklist.storefront_manual_checks
        : [],
    [debugChecklist]
  );
  const [copyState, setCopyState] = useState('idle');

  const handleCopyDebug = useCallback(async () => {
    const payload = liveDebug || debugChecklist || latestResult;
    if (!payload || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
      window.setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [debugChecklist, latestResult, liveDebug]);

  return (
    <section className={styles.panel} aria-label="Shipping operations">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Step 4 actions</span>
          <strong>Diagnose and apply.</strong>
          {activeVariantLabel ? (
            <p className={styles.mutedText}>Variant: {activeVariantLabel}</p>
          ) : null}
        </div>
      </div>

      <div className={styles.actionRow}>
        <Button
          disabled={disabled}
          loading={loadingAction === 'diagnostics'}
          onClick={onRunDiagnostics}
          size="slim"
        >
          {loadingAction === 'diagnostics' ? 'Running...' : 'Diagnostics'}
        </Button>
        <Button
          disabled={disabled}
          loading={loadingAction === 'liveDebug'}
          onClick={onRunLiveDebug}
          size="slim"
        >
          {loadingAction === 'liveDebug' ? 'Debugging...' : 'Live debug'}
        </Button>
        <Button
          disabled={disabled}
          loading={loadingAction === 'cleanupStale'}
          onClick={onCleanupStale}
          size="slim"
        >
          {loadingAction === 'cleanupStale' ? 'Cleaning...' : 'Clean stale refs'}
        </Button>
        <Button
          disabled={disabled}
          loading={loadingAction === 'dryRun'}
          onClick={onDryRun}
          size="slim"
        >
          {loadingAction === 'dryRun' ? 'Checking...' : 'Dry run'}
        </Button>
        <Button
          disabled={applyDisabled}
          loading={loadingAction === 'apply'}
          onClick={onApply}
          size="slim"
          variant="primary"
        >
          {loadingAction === 'apply' ? 'Applying...' : 'Apply'}
        </Button>
      </div>

      {!canRun && disabledReason ? <p className={styles.mutedText}>{disabledReason}</p> : null}
      {canRun && !canApply && applyDisabledReason ? (
        <p className={styles.mutedText}>{applyDisabledReason}</p>
      ) : null}
      {latestResult ? (
        <div className={styles.reviewGrid}>
          <div className={styles.reviewRow}>
            <strong>{latestResult.title}</strong>
            <span className={styles.mutedText}>{latestResult.message}</span>
            {(liveDebug || debugChecklist) && (
              <div className={styles.debugActionRow}>
                <Button size="slim" onClick={handleCopyDebug}>
                  {copyState === 'copied'
                    ? 'Copied'
                    : copyState === 'failed'
                      ? 'Copy failed'
                      : 'Copy debug JSON'}
                </Button>
              </div>
            )}
            {Array.isArray(liveDebug?.likely_issues) && liveDebug.likely_issues.length > 0 ? (
              <div className={styles.debugBlockerCard}>
                <span className={styles.eyebrow}>Issues</span>
                {liveDebug.likely_issues.map(issue => (
                  <p className={styles.debugFixText} key={issue}>
                    {issue}
                  </p>
                ))}
              </div>
            ) : null}
            {liveDebug?.callback_probe ? (
              <div className={styles.debugManualChecks}>
                <span className={styles.eyebrow}>Callback probe</span>
                <p className={styles.mutedText}>
                  {liveDebug.callback_probe.ok
                    ? `OK — returned ${liveDebug.callback_probe.rates_count} rate(s)${
                        liveDebug.callback_probe.rates?.[0]?.service_name
                          ? `: ${liveDebug.callback_probe.rates[0].service_name}`
                          : ''
                      }`
                    : `Failed — ${liveDebug.callback_probe.error || 'no response'}`}
                </p>
              </div>
            ) : null}
            {liveDebug?.live_shopify ? (
              <div className={styles.debugManualChecks}>
                <span className={styles.eyebrow}>Shopify carriers</span>
                <p className={styles.mutedText}>
                  Matching callback: {liveDebug.live_shopify.matching_callback_count || 0}, stale:{' '}
                  {liveDebug.live_shopify.stale_callback_count || 0}
                </p>
                {Array.isArray(liveDebug.live_shopify.ripx_carrier_services) &&
                  liveDebug.live_shopify.ripx_carrier_services.map(service => (
                    <p className={styles.mutedText} key={service.id || service.name}>
                      {service.name} · {service.callback_host || 'no host'} ·{' '}
                      {service.callback_matches ? 'synced' : 'stale'}
                    </p>
                  ))}
              </div>
            ) : null}
            {primaryBlocker ? (
              <div className={styles.debugBlockerCard}>
                <span className={styles.eyebrow}>Primary issue</span>
                <strong>{primaryBlocker.title}</strong>
                <p className={styles.mutedText}>{primaryBlocker.detail}</p>
                {primaryBlocker.fix ? (
                  <p className={styles.debugFixText}>{primaryBlocker.fix}</p>
                ) : null}
              </div>
            ) : null}
            {debugSteps.length > 0 ? (
              <div className={styles.debugChecklist}>
                <span className={styles.eyebrow}>Checklist</span>
                {debugSteps.map(step => (
                  <div className={styles.debugChecklistRow} key={step.id}>
                    <span className={`${styles.debugStatusPill} ${statusClass(step.status)}`}>
                      {statusLabel(step.status)}
                    </span>
                    <div className={styles.debugChecklistCopy}>
                      <strong>{step.title}</strong>
                      <p className={styles.mutedText}>{step.detail}</p>
                      {step.status === 'fail' && step.fix ? (
                        <p className={styles.debugFixText}>{step.fix}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {storefrontChecks.length > 0 ? (
              <div className={styles.debugManualChecks}>
                <span className={styles.eyebrow}>Storefront checks</span>
                {storefrontChecks.map(item => (
                  <div className={styles.debugManualCheckRow} key={item.title}>
                    <strong>{item.title}</strong>
                    <p className={styles.mutedText}>{item.expect}</p>
                    {item.command ? (
                      <code className={styles.debugCommand}>{item.command}</code>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : manualChecklist.length > 0 ? (
              <div className={styles.debugManualChecks}>
                <span className={styles.eyebrow}>Storefront checks</span>
                {manualChecklist.map(item => (
                  <div className={styles.debugManualCheckRow} key={item.id}>
                    <strong>{item.title}</strong>
                    <p className={styles.mutedText}>{item.detail}</p>
                    {item.command ? (
                      <code className={styles.debugCommand}>{item.command}</code>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {Array.isArray(latestResult.details) && latestResult.details.length > 0 ? (
              <div className={styles.detailPills}>
                {latestResult.details.map(detail => (
                  <span className={styles.detailPill} key={detail}>
                    {detail}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default memo(ShippingOperationsPanel);
