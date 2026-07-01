import { memo, useMemo } from 'react';
import {
  normalizeShippingWizardStepKey,
  SHIPPING_WIZARD_STEP_KEYS,
} from '../config/shippingWizardBlueprint';
import useRenderDebugCounter from '../hooks/useRenderDebugCounter';
import ControlShippingBaselinePanel from './ControlShippingBaselinePanel';
import ShippingConfigureStepPanel from './ShippingConfigureStepPanel';
import ShippingHideMethodsStepPanel from './ShippingHideMethodsStepPanel';
import ShippingReviewStepPanel from './ShippingReviewStepPanel';
import VariationBuilderPanel from './VariationBuilderPanel';

function ShippingVariantEditorPanel({
  stepStyles,
  isActiveControlLike,
  shippingCurrentRates,
  shippingCurrentSetupLoading,
  shippingCurrentSetupError,
  onRefreshControlBaseline,
  shippingStudioEnhancementsEnabled,
  selectedStrategyChoice,
  shippingStrategyGroups,
  shippingStrategyChoices,
  isStrategyChoiceActive,
  handleShippingStrategyChoice,
  renderGuidedShippingProgress,
  activeShippingGuidedStep,
  selectedShippingCategory,
  activeDeliveryMethodNames,
  activeSelectedMethodIds,
  activeConfiguredRates,
  toggleActiveDeliveryMethodName,
  selectAllActiveDeliveryMethods,
  clearActiveDeliveryMethods,
  addReplacementRateForMethod,
  removeReplacementRateForMethod,
  renderShippingOfferStep,
  renderShippingPrimaryFields,
  renderShippingBaselineField,
  shippingUiAdvancedOpen,
  renderShippingTargetingFields,
  renderGuidedShippingFooter,
  handleShippingCategorySelect,
  reviewPanelProps,
}) {
  const resolvedStep = normalizeShippingWizardStepKey(activeShippingGuidedStep);
  useRenderDebugCounter('ShippingVariantEditorPanel', () => ({
    isControlLike: isActiveControlLike,
    step: resolvedStep,
    category: selectedShippingCategory,
  }));
  const legacyStrategyGroups = useMemo(
    () =>
      shippingStrategyGroups
        .filter(group => group.key !== 'baseline')
        .map(group => ({
          ...group,
          choices: shippingStrategyChoices.filter(
            choice => choice.group === group.key && choice.value !== 'control'
          ),
        }))
        .filter(group => group.choices.length > 0),
    [shippingStrategyGroups, shippingStrategyChoices]
  );

  return (
    <div className={stepStyles.shippingVariantFormCard}>
      {isActiveControlLike ? (
        <ControlShippingBaselinePanel
          methods={shippingCurrentRates}
          loading={shippingCurrentSetupLoading}
          error={shippingCurrentSetupError}
          onRefresh={onRefreshControlBaseline}
        />
      ) : (
        <div
          className={`${stepStyles.shippingStrategyEditor} ${
            shippingStudioEnhancementsEnabled ? stepStyles.shippingStrategyEditorSingle : ''
          }`}
        >
          {!shippingStudioEnhancementsEnabled && (
            <fieldset className={stepStyles.shippingStrategySidebar}>
              <legend>Shipping strategy</legend>
              <div className={stepStyles.shippingStrategyHelp} aria-live="polite">
                <span>{selectedStrategyChoice?.label || 'Shipping strategy'}</span>
                <small>
                  {selectedStrategyChoice?.description ||
                    'Choose how this variant should modify checkout shipping.'}
                </small>
              </div>
              {legacyStrategyGroups.map(group => (
                <div className={stepStyles.shippingStrategyGroup} key={group.key}>
                  <span className={stepStyles.shippingStrategyGroupLabel}>{group.label}</span>
                  {group.choices.map(choice => {
                    const active = isStrategyChoiceActive(choice);
                    return (
                      <button
                        key={choice.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        title={choice.description}
                        className={`${stepStyles.shippingStrategyOption} ${
                          active ? stepStyles.shippingStrategyOptionActive : ''
                        }`}
                        onClick={() => handleShippingStrategyChoice(choice.value)}
                      >
                        <span className={stepStyles.shippingStrategyRadio} aria-hidden />
                        <span className={stepStyles.shippingStrategyOptionCopy}>
                          <strong>{choice.label}</strong>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </fieldset>
          )}
          <div className={stepStyles.shippingSmartForm}>
            {shippingStudioEnhancementsEnabled ? (
              <>
                {renderGuidedShippingProgress()}
                <div className={stepStyles.shippingGuidedSlide}>
                  {resolvedStep === SHIPPING_WIZARD_STEP_KEYS[0] && (
                    <VariationBuilderPanel
                      selectedCategory={selectedShippingCategory}
                      disabled={false}
                      onCategorySelect={handleShippingCategorySelect}
                    />
                  )}
                  {resolvedStep === SHIPPING_WIZARD_STEP_KEYS[1] && (
                    <ShippingHideMethodsStepPanel
                      stepStyles={stepStyles}
                      methods={shippingCurrentRates}
                      selectedMethodNames={activeDeliveryMethodNames}
                      selectedMethodIds={activeSelectedMethodIds}
                      selectedCategory={selectedShippingCategory}
                      replacementRates={activeConfiguredRates}
                      loading={shippingCurrentSetupLoading}
                      error={shippingCurrentSetupError}
                      onToggleMethod={toggleActiveDeliveryMethodName}
                      onSelectAll={selectAllActiveDeliveryMethods}
                      onClear={clearActiveDeliveryMethods}
                      onAddReplacementRate={addReplacementRateForMethod}
                      onRemoveReplacementRate={removeReplacementRateForMethod}
                    />
                  )}
                  {resolvedStep === SHIPPING_WIZARD_STEP_KEYS[2] && (
                    <ShippingConfigureStepPanel
                      stepStyles={stepStyles}
                      selectedShippingCategory={selectedShippingCategory}
                      shippingUiAdvancedOpen={shippingUiAdvancedOpen}
                      renderFlatRateStep={renderShippingOfferStep}
                      renderPrimaryFields={renderShippingPrimaryFields}
                      renderBaselineField={renderShippingBaselineField}
                      renderTargetingFields={renderShippingTargetingFields}
                    />
                  )}
                  {resolvedStep === SHIPPING_WIZARD_STEP_KEYS[3] && reviewPanelProps ? (
                    <ShippingReviewStepPanel {...reviewPanelProps} />
                  ) : null}
                </div>
                {renderGuidedShippingFooter()}
              </>
            ) : (
              <>
                {renderShippingPrimaryFields()}
                {renderShippingBaselineField()}
                {renderShippingTargetingFields()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ShippingVariantEditorPanel);
