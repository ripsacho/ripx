import { Button } from '@shopify/polaris';
import styles from '../ShippingStudio.module.css';

export default function ShippingOperationsPanel({
  canRun = false,
  canApply = false,
  disabledReason = '',
  applyDisabledReason = '',
  loadingAction = '',
  latestResult = null,
  activeVariantLabel = '',
  onRunDiagnostics,
  onDryRun,
  onApply,
}) {
  const disabled = !canRun || Boolean(loadingAction);
  const applyDisabled = !canApply || Boolean(loadingAction);

  return (
    <section className={styles.panel} aria-label="Shipping operations">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Verify preview</span>
          <strong>Save, diagnose, then apply.</strong>
          <p className={styles.mutedText}>
            Diagnostics confirms Shopify can receive the draft setup. Apply only after the saved
            preview matches what you expect.
          </p>
          {activeVariantLabel ? (
            <p className={styles.mutedText}>Target variant: {activeVariantLabel}.</p>
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
          {loadingAction === 'diagnostics' ? 'Running...' : 'Run diagnostics'}
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
          {loadingAction === 'apply' ? 'Applying...' : 'Apply shipping'}
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
