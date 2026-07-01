import {
  getConfigureFormKind,
  getShippingTypeOptionDetails,
} from '../config/shippingWizardBlueprint';

export default function ShippingConfigureStepPanel({
  stepStyles,
  selectedShippingCategory,
  shippingUiAdvancedOpen,
  renderFlatRateStep,
  renderPrimaryFields,
  renderBaselineField,
  renderTargetingFields,
}) {
  const formKind = getConfigureFormKind(selectedShippingCategory);
  const selectedType = getShippingTypeOptionDetails(selectedShippingCategory);

  if (formKind === 'hide_only') {
    return <div className={stepStyles.shippingInlineNote}>{selectedType.configureHint}</div>;
  }

  return (
    <>
      <div className={stepStyles.shippingInlineNote}>{selectedType.configureHint}</div>
      {formKind === 'flat_rate' ? renderFlatRateStep() : renderPrimaryFields()}
      {renderBaselineField()}
      {(formKind === 'carrier_quote' || shippingUiAdvancedOpen) && renderTargetingFields()}
    </>
  );
}
