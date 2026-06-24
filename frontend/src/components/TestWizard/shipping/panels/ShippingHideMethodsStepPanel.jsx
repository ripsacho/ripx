import ControlMethodsPanel from './ControlMethodsPanel';
import { isIncentiveShippingCategory } from '../config/shippingWizardBlueprint';

export default function ShippingHideMethodsStepPanel({
  stepStyles,
  methods,
  selectedMethodNames,
  selectedMethodIds,
  selectedCategory,
  replacementRates,
  loading,
  error,
  onToggleMethod,
  onSelectAll,
  onClear,
  onAddReplacementRate,
  onRemoveReplacementRate,
}) {
  const stepLabel = isIncentiveShippingCategory(selectedCategory)
    ? 'Target shipping methods'
    : 'Shipping methods';

  return (
    <section aria-label={stepLabel}>
      <ControlMethodsPanel
        methods={methods}
        selectedMethodNames={selectedMethodNames}
        selectedMethodIds={selectedMethodIds}
        selectedCategory={selectedCategory}
        replacementRates={replacementRates}
        loading={loading}
        error={error}
        onToggleMethod={onToggleMethod}
        onSelectAll={onSelectAll}
        onClear={onClear}
        onAddReplacementRate={onAddReplacementRate}
        onRemoveReplacementRate={onRemoveReplacementRate}
      />
    </section>
  );
}
