import {
  SHIPPING_WIZARD_STEP_KEYS,
  SHIPPING_WIZARD_STEP1_TYPE_KEYS,
  buildMethodTargetingPatch,
  buildShippingCategoryConfigPatch,
  buildShippingCategoryTransitionResetPatch,
  getConfigureFormKind,
  getGuidedShippingStepBlockedReason,
  getGuidedShippingStepStatusLabel,
  getGuidedShippingSteps,
  getShippingCategoryLabel,
  getShippingTestTypeByKey,
  getShippingTypeOptionDetails,
  getShippingTypeGroups,
  getShippingWizardStep1Types,
  isIncentiveShippingCategory,
  normalizeShippingWizardStepKey,
  shouldManageReplacementRatesForCategory,
  shouldShowMethodSelectionStep,
} from '../shippingWizardBlueprint';

describe('shippingWizardBlueprint', () => {
  it('exposes canonical 4-step wizard keys', () => {
    expect(SHIPPING_WIZARD_STEP_KEYS).toEqual(['type', 'hide', 'configure', 'review']);
    expect(getGuidedShippingSteps().map(step => step.key)).toEqual(SHIPPING_WIZARD_STEP_KEYS);
  });

  it('normalizes legacy step keys to canonical keys', () => {
    expect(normalizeShippingWizardStepKey('category')).toBe('type');
    expect(normalizeShippingWizardStepKey('methods')).toBe('hide');
    expect(normalizeShippingWizardStepKey('details')).toBe('configure');
    expect(normalizeShippingWizardStepKey('review')).toBe('review');
    expect(normalizeShippingWizardStepKey('TYPE')).toBe('type');
  });

  it('maps method-selection requirements per test type', () => {
    expect(shouldShowMethodSelectionStep('replace_rate')).toBe(true);
    expect(shouldShowMethodSelectionStep('hide_method')).toBe(true);
    expect(shouldShowMethodSelectionStep('rename_method')).toBe(true);
    expect(shouldShowMethodSelectionStep('add_rate')).toBe(false);
    expect(shouldShowMethodSelectionStep('free_shipping')).toBe(true);
    expect(shouldShowMethodSelectionStep('threshold_free_shipping')).toBe(true);
    expect(shouldShowMethodSelectionStep('discount_percentage')).toBe(true);
    expect(shouldShowMethodSelectionStep('discount_fixed')).toBe(true);
    expect(shouldShowMethodSelectionStep('carrier_quote')).toBe(false);
  });

  it('builds backend-safe category config patches', () => {
    expect(buildShippingCategoryConfigPatch('replace_rate', { metadata: { foo: 'bar' } })).toEqual({
      strategy: 'flat_rate',
      execution_hint: 'auto',
      shipping_display_mode: 'replace_existing_methods',
      replace_existing_rates: true,
      delivery_action: 'hide',
      metadata: {
        foo: 'bar',
        shipping_wizard_path: 'unified',
        shipping_test_type: 'replace_rate',
      },
    });

    expect(buildShippingCategoryConfigPatch('hide_method')).toMatchObject({
      strategy: 'carrier_quote',
      execution_hint: 'delivery_customization',
      delivery_action: 'hide',
      rates: [],
      metadata: {
        shipping_wizard_path: 'unified',
        shipping_test_type: 'hide_method',
      },
    });

    expect(buildShippingCategoryConfigPatch('free_shipping')).toMatchObject({
      strategy: 'free_shipping',
      shipping_display_mode: 'add_preview_method',
      metadata: {
        shipping_test_type: 'free_shipping',
      },
    });
  });

  it('routes configure forms by selected type', () => {
    expect(getConfigureFormKind('replace_rate')).toBe('flat_rate');
    expect(getConfigureFormKind('add_rate')).toBe('flat_rate');
    expect(getConfigureFormKind('free_shipping')).toBe('primary_fields');
    expect(getConfigureFormKind('threshold_free_shipping')).toBe('primary_fields');
    expect(getConfigureFormKind('discount_percentage')).toBe('primary_fields');
    expect(getConfigureFormKind('discount_fixed')).toBe('primary_fields');
  });

  it('builds method targeting patches without replace mode for incentives or add_rate', () => {
    expect(buildMethodTargetingPatch('add_rate', [])).toEqual({
      delivery_method_names: [],
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
    });
    expect(buildMethodTargetingPatch('add_rate', ['Standard Shipping'])).toEqual({
      delivery_method_names: ['Standard Shipping'],
      delivery_action: 'hide',
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
    });
    expect(buildMethodTargetingPatch('threshold_free_shipping', ['Express Shipping'])).toEqual({
      delivery_method_names: ['Express Shipping'],
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
    });
    expect(buildMethodTargetingPatch('replace_rate', ['Standard Shipping'])).toEqual({
      delivery_method_names: ['Standard Shipping'],
      delivery_action: 'hide',
      shipping_display_mode: 'replace_existing_methods',
      replace_existing_rates: true,
    });
  });

  it('resets stale config when switching step-1 categories', () => {
    expect(buildShippingCategoryTransitionResetPatch('add_rate', 'free_shipping')).toEqual({
      delivery_method_names: [],
      delivery_method_codes: [],
      rates: [],
      amount: null,
      threshold_amount: null,
      percent_off: null,
      checkout_offer: null,
      checkout_display: null,
      label: null,
      delivery_rename_to: null,
    });
    expect(buildShippingCategoryTransitionResetPatch('add_rate', 'add_rate')).toEqual({});
  });

  it('exposes step-1 wizard options for flat rate and incentives', () => {
    expect(SHIPPING_WIZARD_STEP1_TYPE_KEYS).toEqual([
      'add_rate',
      'threshold_free_shipping',
      'discount_percentage',
      'discount_fixed',
      'free_shipping',
    ]);
    expect(getShippingWizardStep1Types().map(type => type.shortTitle)).toEqual([
      'Flat rate',
      'Free over threshold',
      'Percent off',
      'Fixed discount',
      'Free shipping',
    ]);
  });

  it('identifies incentive categories and replacement-rate flows', () => {
    expect(isIncentiveShippingCategory('discount_percentage')).toBe(true);
    expect(isIncentiveShippingCategory('add_rate')).toBe(false);
    expect(shouldManageReplacementRatesForCategory('replace_rate')).toBe(true);
    expect(shouldManageReplacementRatesForCategory('add_rate')).toBe(false);
    expect(shouldManageReplacementRatesForCategory('free_shipping')).toBe(false);
  });

  it('provides step guidance hints for each shipping type option', () => {
    const thresholdDetails = getShippingTypeOptionDetails('threshold_free_shipping');
    expect(thresholdDetails.methodSelectionHint).toMatch(/incentive should apply/i);
    expect(thresholdDetails.configureHint).toMatch(/cart value/i);

    const replaceDetails = getShippingTypeOptionDetails('replace_rate');
    expect(replaceDetails.methodSelectionHint).toMatch(/at least one Shopify method/i);
  });

  it('blocks configure and review when required methods are missing', () => {
    expect(
      getGuidedShippingStepBlockedReason({
        stepKey: 'configure',
        methodsMissing: true,
        detailsMissing: false,
      })
    ).toBe('Complete method selection first.');
    expect(
      getGuidedShippingStepBlockedReason({
        stepKey: 'configure',
        methodsMissing: false,
        detailsMissing: true,
        blockerMessage: 'Set threshold amount.',
      })
    ).toBe('');
  });

  it('blocks review when setup details are missing but allows configure', () => {
    expect(
      getGuidedShippingStepBlockedReason({
        stepKey: 'review',
        methodsMissing: false,
        detailsMissing: true,
        blockerMessage: 'Set threshold amount.',
      })
    ).toBe('Set threshold amount.');
  });

  it('does not hide targeted methods for incentive method selection', () => {
    expect(buildMethodTargetingPatch('discount_percentage', ['Standard Shipping'])).toEqual({
      delivery_method_names: ['Standard Shipping'],
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
    });
  });

  it('derives progress labels from step completion instead of index alone', () => {
    expect(
      getGuidedShippingStepStatusLabel({
        stepKey: 'hide',
        stepIndex: 1,
        activeStepIndex: 2,
        selectedCategory: 'add_rate',
        methodsMissing: false,
        methodsRecommended: true,
        detailsMissing: false,
      })
    ).toBe('Skipped');
    expect(
      getGuidedShippingStepStatusLabel({
        stepKey: 'configure',
        stepIndex: 2,
        activeStepIndex: 3,
        selectedCategory: 'threshold_free_shipping',
        methodsMissing: false,
        methodsRecommended: false,
        detailsMissing: true,
        blockerMessage: 'Set threshold amount.',
      })
    ).toBe('Review');
  });

  it('groups test types for the flat step-1 picker', () => {
    const groups = getShippingTypeGroups();
    expect(groups.map(group => group.key)).toEqual(['core', 'incentives', 'advanced']);
  });

  it('resolves category labels from blueprint metadata', () => {
    expect(getShippingCategoryLabel('replace_rate')).toBe('Replace rate');
    expect(getShippingTestTypeByKey('discount_percentage')?.strategy).toBe('discount_percentage');
  });
});
