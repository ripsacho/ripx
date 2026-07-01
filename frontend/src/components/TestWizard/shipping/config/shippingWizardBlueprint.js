export const SHIPPING_TEST_TYPES = [
  {
    key: 'replace_rate',
    title: 'Flat Rate (Replace)',
    shortTitle: 'Replace rate',
    description: 'Hide selected Shopify methods and show new RipX rates.',
    strategy: 'flat_rate',
    mode: 'replace',
    group: 'core',
    badge: 'Recommended',
    requiresMethodSelection: true,
    supportsMultiRow: true,
  },
  {
    key: 'add_rate',
    title: 'Flat Rate (Add New)',
    shortTitle: 'Add new rate',
    description: 'Keep Shopify methods and add one or more RipX rates.',
    strategy: 'flat_rate',
    mode: 'add',
    group: 'core',
    badge: 'Compare',
    requiresMethodSelection: false,
    supportsMultiRow: true,
  },
  {
    key: 'free_shipping',
    title: 'Free Shipping',
    shortTitle: 'Free shipping',
    description: 'Force free shipping for the assigned variant.',
    strategy: 'free_shipping',
    group: 'incentives',
    badge: 'Free',
    requiresMethodSelection: true,
    supportsMultiRow: false,
  },
  {
    key: 'threshold_free_shipping',
    title: 'Threshold Free Shipping',
    shortTitle: 'Free over threshold',
    description: 'Apply free shipping when cart value reaches a threshold.',
    strategy: 'threshold_free_shipping',
    group: 'incentives',
    badge: 'Cart value',
    requiresMethodSelection: true,
    supportsMultiRow: false,
  },
  {
    key: 'discount_percentage',
    title: 'Shipping Discount (%)',
    shortTitle: 'Percent off',
    description: 'Apply a percent discount to shipping cost.',
    strategy: 'discount_percentage',
    group: 'incentives',
    badge: 'Discount',
    requiresMethodSelection: true,
    supportsMultiRow: false,
  },
  {
    key: 'discount_fixed',
    title: 'Shipping Discount ($)',
    shortTitle: 'Fixed discount',
    description: 'Apply a fixed discount amount to shipping cost.',
    strategy: 'discount_fixed',
    group: 'incentives',
    badge: 'Discount',
    requiresMethodSelection: true,
    supportsMultiRow: false,
  },
  {
    key: 'hide_method',
    title: 'Hide Existing Method',
    shortTitle: 'Hide method',
    description: 'Hide selected Shopify delivery methods only.',
    strategy: 'carrier_quote',
    mode: 'delivery_customization',
    group: 'advanced',
    badge: 'Variant-only',
    requiresMethodSelection: true,
    supportsMultiRow: false,
  },
  {
    key: 'rename_method',
    title: 'Rename Existing Method',
    shortTitle: 'Rename method',
    description: 'Rename selected Shopify delivery methods.',
    strategy: 'carrier_quote',
    mode: 'delivery_customization',
    group: 'advanced',
    badge: 'Copy test',
    requiresMethodSelection: true,
    supportsMultiRow: false,
  },
  {
    key: 'carrier_quote',
    title: 'Carrier / App Rate',
    shortTitle: 'Carrier/app rate',
    description: 'Return provider-backed shipping rates.',
    strategy: 'carrier_quote',
    mode: 'carrier_quote',
    group: 'advanced',
    badge: 'Advanced',
    requiresMethodSelection: false,
    supportsMultiRow: false,
  },
];

export const SHIPPING_WIZARD_STEP_KEYS = ['type', 'hide', 'configure', 'review'];

export const SHIPPING_WIZARD_STEP1_TYPE_KEYS = [
  'add_rate',
  'threshold_free_shipping',
  'discount_percentage',
  'discount_fixed',
  'free_shipping',
];

export const SHIPPING_WIZARD_STEPS = [
  {
    key: 'type',
    label: 'Step 1: Type',
    description: 'Choose flat rate or incentive strategy.',
  },
  {
    key: 'hide',
    label: 'Step 2: Methods',
    description: 'Target Shopify delivery methods.',
  },
  {
    key: 'configure',
    label: 'Step 3: Configure',
    description: 'Set pricing and behavior.',
  },
  {
    key: 'review',
    label: 'Step 4: Review',
    description: 'Review, diagnose, apply.',
  },
];

export const LEGACY_SHIPPING_STEP_KEYS = {
  category: 'type',
  methods: 'hide',
  details: 'configure',
};

const TYPE_GROUP_LABELS = {
  core: 'Flat rate',
  incentives: 'Discounts & free shipping',
  advanced: 'Advanced',
};

export function getShippingTestTypeByKey(typeKey) {
  const normalized = String(typeKey || '')
    .trim()
    .toLowerCase();
  return SHIPPING_TEST_TYPES.find(type => type.key === normalized) || null;
}

export function shouldShowMethodSelectionStep(typeKey) {
  return Boolean(getShippingTestTypeByKey(typeKey)?.requiresMethodSelection);
}

export function normalizeShippingWizardStepKey(stepKey) {
  const normalized = String(stepKey || '')
    .trim()
    .toLowerCase();
  return LEGACY_SHIPPING_STEP_KEYS[normalized] || normalized;
}

export function getGuidedShippingSteps() {
  return SHIPPING_WIZARD_STEPS;
}

export function getShippingCategoryLabel(typeKey, fallbackLabel = 'Shipping test') {
  const type = getShippingTestTypeByKey(typeKey);
  return type?.shortTitle || type?.title || fallbackLabel;
}

export function getShippingTypeGroups() {
  const groups = [...new Set(SHIPPING_TEST_TYPES.map(type => type.group))];
  return groups.map(group => ({
    key: group,
    label: TYPE_GROUP_LABELS[group] || group,
    types: SHIPPING_TEST_TYPES.filter(type => type.group === group),
  }));
}

export function getShippingWizardStep1Types() {
  return SHIPPING_WIZARD_STEP1_TYPE_KEYS.map(key => {
    const type = getShippingTestTypeByKey(key);
    if (!type) return null;
    if (key === 'add_rate') {
      return {
        ...type,
        shortTitle: 'Flat rate',
        badge: 'Recommended',
      };
    }
    return type;
  }).filter(Boolean);
}

export function isIncentiveShippingCategory(typeKey) {
  return getShippingTestTypeByKey(typeKey)?.group === 'incentives';
}

export function shouldManageReplacementRatesForCategory(typeKey) {
  const type = getShippingTestTypeByKey(typeKey);
  return Boolean(type && type.strategy === 'flat_rate' && type.mode === 'replace');
}

export function buildMethodTargetingPatch(typeKey, methodNames = []) {
  const normalizedNames = Array.isArray(methodNames)
    ? methodNames.map(name => String(name || '').trim()).filter(Boolean)
    : [];
  if (isIncentiveShippingCategory(typeKey)) {
    return {
      delivery_method_names: normalizedNames,
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
    };
  }
  if (shouldManageReplacementRatesForCategory(typeKey)) {
    const useReplaceMode = normalizedNames.length > 0;
    return {
      delivery_method_names: normalizedNames,
      delivery_action: 'hide',
      shipping_display_mode: useReplaceMode ? 'replace_existing_methods' : 'add_preview_method',
      replace_existing_rates: useReplaceMode,
    };
  }
  if (normalizedNames.length > 0) {
    return {
      delivery_method_names: normalizedNames,
      delivery_action: 'hide',
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
    };
  }
  return {
    delivery_method_names: [],
    shipping_display_mode: 'add_preview_method',
    replace_existing_rates: false,
  };
}

export function buildShippingCategoryTransitionResetPatch(previousKey, nextKey) {
  const previous = getShippingTestTypeByKey(previousKey);
  const next = getShippingTestTypeByKey(nextKey);
  if (!next || !previous || previous.key === next.key) {
    return {};
  }
  return {
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
  };
}

export function getConfigureFormKind(typeKey) {
  const normalized = String(typeKey || '')
    .trim()
    .toLowerCase();
  if (normalized === 'replace_rate' || normalized === 'add_rate') {
    return 'flat_rate';
  }
  if (normalized === 'hide_method') {
    return 'hide_only';
  }
  if (normalized === 'rename_method') {
    return 'rename';
  }
  if (normalized === 'carrier_quote') {
    return 'carrier_quote';
  }
  return 'primary_fields';
}

export function getShippingTypeOptionDetails(typeKey) {
  const type = getShippingTestTypeByKey(typeKey);
  const formKind = getConfigureFormKind(typeKey);
  if (!type) {
    return {
      key: '',
      title: 'Shipping test',
      shortTitle: 'Shipping test',
      description: 'Configure how this variant should affect checkout shipping.',
      requiresMethodSelection: false,
      supportsMultiRow: false,
      formKind,
      group: '',
      methodSelectionHint:
        'Optional: pick Shopify methods if you want to narrow this variant to specific rates.',
      configureHint: 'Set the required pricing and display fields for this variant.',
    };
  }

  const methodSelectionHint =
    type.requiresMethodSelection && type.group === 'incentives'
      ? 'Select at least one Shopify method this incentive should apply to.'
      : type.requiresMethodSelection
        ? 'Select at least one Shopify method for this variant.'
        : 'Select methods only if you want to scope or hide control methods.';

  const configureHint =
    formKind === 'flat_rate'
      ? 'Add one or more shipping rate rows.'
      : formKind === 'hide_only'
        ? 'No extra fields required for hide-only mode.'
        : formKind === 'rename'
          ? 'Set the new display label for selected methods.'
          : formKind === 'carrier_quote'
            ? 'Configure carrier/app behavior and scope.'
            : type.key === 'threshold_free_shipping'
              ? 'Set the cart value that unlocks free shipping.'
              : type.key === 'discount_percentage'
                ? 'Set the percent discount applied to targeted shipping methods.'
                : type.key === 'discount_fixed'
                  ? 'Set the fixed discount amount for targeted shipping methods.'
                  : type.key === 'free_shipping'
                    ? 'No amount needed. RipX applies a 100% shipping discount to targeted methods.'
                    : 'Configure shipping value and display settings.';

  return {
    ...type,
    formKind,
    methodSelectionHint,
    configureHint,
  };
}

export function buildShippingCategoryConfigPatch(
  categoryKey,
  { metadata = {}, activeShippingScope = {} } = {}
) {
  const normalized = String(categoryKey || '')
    .trim()
    .toLowerCase();
  const advancedWizardMetadataPatch = {
    shipping_wizard_path: 'unified',
    shipping_test_type: normalized,
  };

  if (normalized === 'replace_rate') {
    return {
      strategy: 'flat_rate',
      execution_hint: 'auto',
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
      delivery_method_names: [],
      delivery_action: 'hide',
      delivery_rename_to: null,
      metadata: {
        ...metadata,
        ...advancedWizardMetadataPatch,
      },
    };
  }

  if (normalized === 'add_rate') {
    return {
      strategy: 'flat_rate',
      execution_hint: 'auto',
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
      delivery_method_names: [],
      shipping_scope: {
        ...activeShippingScope,
        selected_rate_ids: [],
        selected_rate_names: [],
        selected_method_definition_ids: [],
      },
      metadata: {
        ...metadata,
        ...advancedWizardMetadataPatch,
      },
    };
  }

  if (normalized === 'hide_method' || normalized === 'rename_method') {
    return {
      strategy: 'carrier_quote',
      execution_hint: 'delivery_customization',
      delivery_action: normalized === 'rename_method' ? 'rename' : 'hide',
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
      rates: [],
      metadata: {
        ...metadata,
        ...advancedWizardMetadataPatch,
      },
    };
  }

  if (normalized === 'carrier_quote') {
    return {
      strategy: 'carrier_quote',
      execution_hint: 'carrier_quote',
      delivery_method_names: [],
      delivery_action: 'hide',
      shipping_display_mode: 'add_preview_method',
      replace_existing_rates: false,
      metadata: {
        ...metadata,
        ...advancedWizardMetadataPatch,
      },
    };
  }

  return {
    strategy: normalized,
    execution_hint: '',
    delivery_method_names: [],
    shipping_display_mode: 'add_preview_method',
    replace_existing_rates: false,
    metadata: {
      ...metadata,
      ...advancedWizardMetadataPatch,
    },
  };
}

export function shouldUseMultiRowRateEditor(typeKey, cfg = {}) {
  const type = getShippingTypeOptionDetails(typeKey);
  if (type.supportsMultiRow) {
    return true;
  }
  const metadata = cfg.metadata && typeof cfg.metadata === 'object' ? cfg.metadata : {};
  const explicitMode = String(metadata.shipping_offer_mode || metadata.shippingOfferMode || '')
    .trim()
    .toLowerCase();
  if (explicitMode === 'multiple') {
    return true;
  }
  const rates = Array.isArray(cfg?.rates) ? cfg.rates : [];
  return rates.length > 1;
}

export function getGuidedShippingStepBlockedReason({
  stepKey,
  methodsMissing,
  detailsMissing,
  blockerMessage,
  readinessIssue,
}) {
  const normalizedStep = normalizeShippingWizardStepKey(stepKey);
  if ((normalizedStep === 'configure' || normalizedStep === 'review') && methodsMissing) {
    return 'Complete method selection first.';
  }
  if (normalizedStep === 'review' && detailsMissing) {
    return blockerMessage || readinessIssue || 'Complete the setup details first.';
  }
  return '';
}

export function getGuidedShippingStepStatusLabel({
  stepKey,
  stepIndex,
  activeStepIndex,
  selectedCategory,
  methodsMissing,
  methodsRecommended,
  detailsMissing,
  blockerMessage,
  readinessIssue,
}) {
  const blockedReason = getGuidedShippingStepBlockedReason({
    stepKey,
    methodsMissing,
    detailsMissing,
    blockerMessage,
    readinessIssue,
  });
  const isForwardLocked = Boolean(blockedReason) && stepIndex > activeStepIndex;
  if (isForwardLocked) return 'Locked';
  if (stepIndex === activeStepIndex) return 'Current';

  const normalizedStep = normalizeShippingWizardStepKey(stepKey);
  const needsMethods = shouldShowMethodSelectionStep(selectedCategory);
  const isStepComplete = (() => {
    if (normalizedStep === 'type') return Boolean(selectedCategory);
    if (normalizedStep === 'hide') {
      if (needsMethods) return !methodsMissing;
      return true;
    }
    if (normalizedStep === 'configure') return !detailsMissing;
    if (normalizedStep === 'review') return !methodsMissing && !detailsMissing;
    return false;
  })();

  if (stepIndex < activeStepIndex) {
    if (normalizedStep === 'hide' && methodsRecommended && !needsMethods) {
      return 'Skipped';
    }
    return isStepComplete ? 'Done' : 'Review';
  }
  return 'Next';
}
