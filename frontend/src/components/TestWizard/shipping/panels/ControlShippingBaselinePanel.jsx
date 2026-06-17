import { Button } from '@shopify/polaris';
import styles from '../ShippingStudio.module.css';

function formatAmount(rate) {
  const value = Number(rate?.amount);
  if (!Number.isFinite(value)) return 'Calculated at checkout';
  const currency = String(rate?.currency || 'USD').toUpperCase();
  return `${currency} ${value.toFixed(2)}`;
}

function formatMethodMeta(rate) {
  const parts = [
    formatAmount(rate),
    rate?.profile_name,
    rate?.zone_name,
    Array.isArray(rate?.countries) && rate.countries.length > 0
      ? rate.countries.slice(0, 3).join(', ')
      : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function ControlShippingBaselinePanel({
  methods = [],
  loading = false,
  error = '',
  onRefresh,
}) {
  const visibleMethods = methods
    .filter(method => method?.active !== false)
    .filter(method => String(method?.name || '').trim())
    .slice(0, 8);

  return (
    <section className={styles.panel} aria-label="Control shipping baseline">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Control baseline</span>
          <strong>Shopify shipping stays unchanged.</strong>
          <p className={styles.mutedText}>
            Control is read-only. It shows the current Shopify methods used for comparison, but RipX
            does not hide, add, rename, discount, or replace shipping for this variant.
          </p>
        </div>
        {onRefresh ? (
          <Button onClick={onRefresh} loading={loading} size="slim">
            Refresh
          </Button>
        ) : null}
      </div>

      {error ? <p className={styles.mutedText}>Could not load current setup: {error}</p> : null}
      {loading && visibleMethods.length === 0 ? (
        <p className={styles.mutedText}>Reading current Shopify methods...</p>
      ) : null}
      {!loading && visibleMethods.length === 0 ? (
        <p className={styles.mutedText}>
          No active Shopify methods were detected. Control still uses whatever Shopify calculates at
          checkout for the customer address and cart.
        </p>
      ) : null}

      {visibleMethods.length > 0 ? (
        <div className={styles.baselineMethodMap}>
          {visibleMethods.map((method, index) => (
            <div className={styles.baselineMethodRow} key={`${method.name}-${method.id || index}`}>
              <div>
                <span className={styles.methodName}>{method.name}</span>
                <span className={styles.methodMeta}>{formatMethodMeta(method)}</span>
              </div>
              <span className={styles.baselineBadge}>Unchanged</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
