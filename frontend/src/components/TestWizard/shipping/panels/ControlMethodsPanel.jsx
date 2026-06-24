import { Button } from '@shopify/polaris';
import styles from '../ShippingStudio.module.css';
import { getShippingTypeOptionDetails } from '../config/shippingWizardBlueprint';

function formatAmount(rate) {
  if (rate?.amount_summary) return rate.amount_summary;
  const value = Number(rate?.amount);
  if (!Number.isFinite(value)) return 'Current Shopify rate';
  const currency = String(rate?.currency || 'USD').toUpperCase();
  return `${currency} ${value.toFixed(2)}`;
}

function getMethodId(method) {
  return String(
    method?.method_definition_id || method?.id || method?.rate_provider_id || ''
  ).trim();
}

function mergeMethodRows(methods) {
  const grouped = new Map();
  methods
    .filter(method => String(method?.name || '').trim())
    .forEach(method => {
      const name = String(method?.name || '').trim();
      const key = name.toLowerCase();
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          ...method,
          name,
          sources: [method],
        });
        return;
      }
      existing.sources.push(method);
      existing.countries = Array.from(
        new Set([
          ...(Array.isArray(existing.countries) ? existing.countries : []),
          ...(Array.isArray(method?.countries) ? method.countries : []),
        ])
      );
      if (!existing.profile_name && method?.profile_name)
        existing.profile_name = method.profile_name;
      if (!existing.zone_name && method?.zone_name) existing.zone_name = method.zone_name;
      if (!existing.method_definition_id && method?.method_definition_id) {
        existing.method_definition_id = method.method_definition_id;
      }
      if (!existing.id && method?.id) existing.id = method.id;
    });

  return Array.from(grouped.values()).map(method => {
    const sources = Array.isArray(method.sources) ? method.sources : [method];
    const amounts = Array.from(
      new Set(
        sources
          .map(source => {
            const value = Number(source?.amount);
            if (!Number.isFinite(value)) return '';
            return `${String(source?.currency || 'USD').toUpperCase()} ${value.toFixed(2)}`;
          })
          .filter(Boolean)
      )
    );
    return {
      ...method,
      amount_summary:
        amounts.length === 0 ? '' : amounts.length === 1 ? amounts[0] : `${amounts.length} rates`,
      duplicate_count: sources.length,
      source_ids: sources.map(getMethodId).filter(Boolean),
    };
  });
}

export default function ControlMethodsPanel({
  methods = [],
  selectedMethodNames = [],
  selectedMethodIds = [],
  selectedCategory = '',
  loading = false,
  error = '',
  embedded = false,
  onToggleMethod,
  onSelectAll,
  onClear,
}) {
  const selected = new Set(selectedMethodNames.map(name => String(name || '').toLowerCase()));
  const selectedIds = new Set(selectedMethodIds.map(id => String(id || '').trim()).filter(Boolean));
  const mergedMethods = mergeMethodRows(methods);
  const visibleMethods = mergedMethods;
  const getMethodDetailText = method =>
    [
      formatAmount(method),
      method?.profile_name,
      method?.zone_name,
      Array.isArray(method?.countries) && method.countries.length > 0
        ? method.countries.slice(0, 5).join(', ')
        : '',
      method?.source === 'manual'
        ? 'Manual rate'
        : method?.carrier_service_name
          ? `Carrier/app: ${method.carrier_service_name}`
          : 'Calculated or provider-backed',
    ]
      .filter(Boolean)
      .join(' · ');
  const selectedCount = new Set(
    selectedMethodNames
      .map(name =>
        String(name || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  ).size;
  const selectedType = getShippingTypeOptionDetails(selectedCategory);
  const methodsRequired = Boolean(selectedType.requiresMethodSelection);
  const isIncentiveType = selectedType.group === 'incentives';
  const stepTitle = methodsRequired
    ? isIncentiveType
      ? 'Select Shopify methods to target.'
      : 'Select Shopify methods for this variant.'
    : 'Hide control methods (optional).';
  const stepSummary = methodsRequired
    ? selectedCount
      ? `${selectedCount} method${selectedCount === 1 ? '' : 's'} selected${
          isIncentiveType ? ' for this incentive.' : '.'
        }`
      : selectedType.methodSelectionHint
    : selectedCount
      ? `${selectedCount} method${selectedCount === 1 ? '' : 's'} selected to hide for this variant.`
      : 'No methods hidden. Existing Shopify methods remain visible beside your new variant rate.';
  const embeddedEyebrow = isIncentiveType
    ? 'Methods to target'
    : methodsRequired
      ? 'Methods to select'
      : 'Control methods to hide';

  return (
    <section
      className={embedded ? styles.offerAttributeMethodsShell : styles.panel}
      aria-label="Variant shipping methods"
    >
      {!embedded ? (
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Step 2</span>
            <strong>{stepTitle}</strong>
            <p className={styles.mutedText}>{stepSummary}</p>
          </div>
        </div>
      ) : (
        <div className={styles.offerAttributeMethodsHeader}>
          <span className={styles.eyebrow}>{embeddedEyebrow}</span>
          <strong>{stepTitle}</strong>
          <p className={styles.mutedText}>{stepSummary}</p>
        </div>
      )}

      <div className={styles.methodCommandCard}>
        <div className={styles.methodCommandActions}>
          <Button onClick={onSelectAll} disabled={visibleMethods.length === 0} size="slim">
            Select all
          </Button>
          <Button onClick={onClear} disabled={selected.size === 0} size="slim">
            Clear
          </Button>
          <span className={styles.detailPill}>{selectedCount} selected</span>
        </div>
      </div>

      {error ? <p className={styles.mutedText}>Could not load current setup: {error}</p> : null}
      {loading && visibleMethods.length === 0 ? (
        <p className={styles.mutedText}>Reading current Shopify rates...</p>
      ) : null}
      {!loading && visibleMethods.length === 0 ? (
        <p className={styles.mutedText}>
          No active Shopify rates detected yet. Carrier/app-calculated rates can still be targeted
          by name in advanced mode.
        </p>
      ) : null}

      {visibleMethods.length > 0 ? (
        <div className={styles.methodList}>
          {visibleMethods.map((method, index) => {
            const name = String(method?.name || '').trim();
            const methodId = getMethodId(method);
            const checked =
              selected.has(name.toLowerCase()) ||
              selectedIds.has(methodId) ||
              (Array.isArray(method.source_ids) &&
                method.source_ids.some(id => selectedIds.has(id)));
            const duplicateCount = Number(method?.duplicate_count || 1);
            return (
              <label
                className={`${styles.methodRow} ${checked ? styles.methodRowSelected : ''}`}
                key={`${name}-${methodId || index}`}
                title={getMethodDetailText(method)}
              >
                <span>
                  <span className={styles.methodNameRow}>
                    <span className={styles.methodName}>{name}</span>
                    {checked ? <span className={styles.selectedBadge}>Selected</span> : null}
                  </span>
                  <span className={styles.methodMeta}>
                    {formatAmount(method)}
                    {duplicateCount > 1 ? ` · ${duplicateCount} Shopify entries grouped` : ''}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleMethod?.(name, method)}
                />
              </label>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
