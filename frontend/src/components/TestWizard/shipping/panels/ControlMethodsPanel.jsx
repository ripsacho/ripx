import { Button } from '@shopify/polaris';
import styles from '../ShippingStudio.module.css';

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
  selectedCategory = 'replace_rate',
  replacementRates = [],
  loading = false,
  error = '',
  onToggleMethod,
  onSelectAll,
  onClear,
  onAddReplacementRate,
  onRemoveReplacementRate,
}) {
  const selected = new Set(selectedMethodNames.map(name => String(name || '').toLowerCase()));
  const selectedIds = new Set(selectedMethodIds.map(id => String(id || '').trim()).filter(Boolean));
  const normalizedCategory = String(selectedCategory || '').trim();
  const isReplacementFlow = normalizedCategory === 'replace_rate';
  const isRenameFlow = normalizedCategory === 'rename_method';
  const findReplacementRate = methodName => {
    const normalizedMethodName = String(methodName || '')
      .trim()
      .toLowerCase();
    if (!normalizedMethodName) return null;
    return (
      replacementRates.find(rate => {
        const sourceName = String(
          rate?.source_method_name || rate?.sourceMethodName || rate?.source_rate_name || ''
        )
          .trim()
          .toLowerCase();
        const visibleName = String(rate?.name || rate?.service_name || '')
          .trim()
          .toLowerCase();
        return sourceName === normalizedMethodName || visibleName === normalizedMethodName;
      }) || null
    );
  };
  const visibleMethods = mergeMethodRows(methods).slice(0, 12);
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
  const selectedMethodNamesUnique = Array.from(
    new Map(
      selectedMethodNames
        .map(name => String(name || '').trim())
        .filter(Boolean)
        .map(name => [name.toLowerCase(), name])
    ).values()
  );
  const selectedMethods = selectedMethodNamesUnique
    .map(name => {
      const normalizedName = String(name || '').trim();
      if (!normalizedName) return null;
      const source = visibleMethods.find(
        method =>
          selectedIds.has(getMethodId(method)) ||
          (Array.isArray(method.source_ids) && method.source_ids.some(id => selectedIds.has(id))) ||
          String(method?.name || '')
            .trim()
            .toLowerCase() === normalizedName.toLowerCase()
      );
      return {
        name: normalizedName,
        source,
        replacementRate: findReplacementRate(normalizedName),
      };
    })
    .filter(Boolean);
  const selectedCount = selectedMethods.length;
  const stepTitle = isReplacementFlow
    ? 'Choose what to replace.'
    : isRenameFlow
      ? 'Choose what to rename.'
      : 'Choose what to hide.';
  const stepSummary = selectedCount
    ? isReplacementFlow
      ? `${selectedCount} native method${selectedCount === 1 ? '' : 's'} will be hidden and replaced only for this variant.`
      : isRenameFlow
        ? `${selectedCount} method${selectedCount === 1 ? '' : 's'} will be renamed only for this variant.`
        : `${selectedCount} method${selectedCount === 1 ? '' : 's'} will be hidden only for this variant.`
    : 'Select one live Shopify method to continue.';

  return (
    <section className={styles.panel} aria-label="Variant shipping methods">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Step 2</span>
          <strong>{stepTitle}</strong>
          <p className={styles.mutedText}>
            Pick from active Shopify checkout methods. Control stays unchanged; these changes apply
            only to this treatment variant.
          </p>
        </div>
      </div>

      <div className={styles.methodCommandCard}>
        <div>
          <span className={styles.eyebrow}>Selection status</span>
          <strong>{stepSummary}</strong>
          <small>
            {isReplacementFlow
              ? 'Best setup: select the native method, then use the generated linked replacement row in Step 3.'
              : 'Use this when the test should change only the selected delivery options.'}
          </small>
        </div>
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
      {selectedMethods.length > 0 ? (
        <div className={styles.replacementRows}>
          <span className={styles.eyebrow}>
            {isReplacementFlow ? 'Variant replacement map' : 'Selected methods'}
          </span>
          {selectedMethods.map(method => (
            <div className={styles.replacementRow} key={method.name}>
              <div className={styles.replacementFlow}>
                <div className={styles.replacementNode}>
                  <span>Current Shopify method</span>
                  <strong>{method.name}</strong>
                  <small>{method.source ? formatAmount(method.source) : 'Selected by name'}</small>
                </div>
                {isReplacementFlow ? (
                  <>
                    <span className={styles.replacementArrow} aria-hidden>
                      →
                    </span>
                    <div className={styles.replacementNode}>
                      <span>Variant shopper sees</span>
                      <strong>
                        {method.replacementRate?.name ||
                          method.replacementRate?.service_name ||
                          method.name}
                      </strong>
                      <small>
                        {method.replacementRate?.service_code
                          ? `Protected by ${method.replacementRate.service_code}`
                          : 'Replacement row is created automatically'}
                      </small>
                    </div>
                  </>
                ) : (
                  <div className={styles.replacementNode}>
                    <span>Variant action</span>
                    <strong>{isRenameFlow ? 'Rename in Step 3' : 'Hide from checkout'}</strong>
                    <small>
                      {method.source?.method_definition_id ? 'Shopify ID saved' : 'Name target'}
                    </small>
                  </div>
                )}
              </div>
              <div className={styles.replacementActions}>
                <Button onClick={() => onToggleMethod?.(method.name, method.source)} size="slim">
                  Remove
                </Button>
                {isReplacementFlow &&
                  (method.replacementRate ? (
                    <Button onClick={() => onRemoveReplacementRate?.(method.name)} size="slim">
                      Remove new rate
                    </Button>
                  ) : (
                    <Button
                      onClick={() => onAddReplacementRate?.(method.name, method.source)}
                      size="slim"
                    >
                      Add new rate
                    </Button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
