const {
  normalizeShippingTestPayload,
  normalizeShippingVariantConfig,
  isActionableShippingConfig,
} = require('./shippingTestConfigService');

function requiredAdapterForStrategy(strategy) {
  switch (strategy) {
    case 'flat_rate':
    case 'carrier_quote':
      return 'carrier_service';
    case 'threshold_free_shipping':
    case 'discount_percentage':
    case 'discount_fixed':
    case 'free_shipping':
      return 'discount_function';
    case 'control':
    default:
      return 'manual';
  }
}

function isAdapterAvailable(capabilityReport, adapter) {
  if (!capabilityReport?.capabilities?.adapter_support) {
    return false;
  }
  const support = capabilityReport.capabilities.adapter_support[adapter];
  return Boolean(support?.available);
}

function hasDeliveryCustomizationTargets(config = {}) {
  const candidates = [
    config.delivery_method_names,
    config.deliveryMethodNames,
    config.method_names,
    config.methodNames,
  ];
  return candidates.some(value => {
    if (Array.isArray(value)) {
      return value.some(item => String(item || '').trim());
    }
    return String(value || '')
      .split(/\n|,/)
      .some(item => item.trim());
  });
}

function shouldReplaceExistingRates(config = {}) {
  const displayMode = String(
    config.shipping_display_mode || config.shippingDisplayMode || config.display_mode || ''
  )
    .trim()
    .toLowerCase();
  if (displayMode === 'replace_existing_methods') {
    return true;
  }
  if (displayMode === 'add_preview_method') {
    return false;
  }
  return Boolean(config.replace_existing_rates || config.replaceExistingRates);
}

function resolveExecutionAdapter(
  strategy,
  executionHint = 'auto',
  capabilityReport = null,
  config = {}
) {
  const hint = String(executionHint || 'auto')
    .trim()
    .toLowerCase();
  const hasDeliveryTargets = hasDeliveryCustomizationTargets(config);
  if (hint === 'manual') {
    return 'manual';
  }
  if (strategy === 'flat_rate') {
    return 'carrier_service';
  }
  if (strategy === 'carrier_quote' && hasDeliveryTargets) {
    return isAdapterAvailable(capabilityReport, 'delivery_customization')
      ? 'delivery_customization'
      : 'manual';
  }
  if (hint === 'carrier_service') {
    return 'carrier_service';
  }
  if (hint === 'discount_function') {
    return 'discount_function';
  }
  if (hint === 'delivery_customization') {
    return 'delivery_customization';
  }
  if (hint === 'auto' && strategy === 'carrier_quote') {
    if (isAdapterAvailable(capabilityReport, 'carrier_service')) {
      return 'carrier_service';
    }
    if (
      hasDeliveryCustomizationTargets(config) &&
      isAdapterAvailable(capabilityReport, 'delivery_customization')
    ) {
      return 'delivery_customization';
    }
  }
  return requiredAdapterForStrategy(strategy);
}

function buildShippingExecutionPlan(test, capabilityReport) {
  const normalizedTest = normalizeShippingTestPayload(test || {});
  const variants = Array.isArray(normalizedTest?.variants) ? normalizedTest.variants : [];
  const variantPlans = variants.map((variant, index) => {
    const config = normalizeShippingVariantConfig(variant?.config || {});
    const requiresReplacement =
      config.strategy === 'flat_rate' && shouldReplaceExistingRates(config);
    const hasReplacementRate =
      config.amount !== null || config.rates.some(rate => rate.amount !== null && rate.amount >= 0);
    const actionable =
      isActionableShippingConfig(config) || (requiresReplacement && hasReplacementRate);
    const adapter = resolveExecutionAdapter(
      config.strategy,
      config.execution_hint,
      capabilityReport,
      config
    );
    const adapterAvailable =
      adapter === 'manual' ||
      (requiresReplacement
        ? isAdapterAvailable(capabilityReport, 'carrier_service') &&
          isAdapterAvailable(capabilityReport, 'delivery_customization')
        : isAdapterAvailable(capabilityReport, adapter));
    const adapterConfigured =
      (adapter !== 'delivery_customization' || hasDeliveryCustomizationTargets(config)) &&
      (!requiresReplacement || hasDeliveryCustomizationTargets(config));
    const status = actionable ? (adapterAvailable ? 'ready' : 'manual_required') : 'control';
    const resolvedStatus =
      actionable && status === 'ready' && !adapterConfigured ? 'manual_required' : status;
    const executionMode = !actionable
      ? 'control'
      : resolvedStatus === 'manual_required' || adapter === 'manual'
        ? 'manual'
        : adapter === 'discount_function'
          ? 'discount_only'
          : 'automatic';
    return {
      index,
      id: variant?.id || null,
      name: variant?.name || `Variant ${index + 1}`,
      strategy: config.strategy,
      execution_adapter: adapter,
      execution_adapters: requiresReplacement
        ? ['carrier_service', 'delivery_customization']
        : [adapter],
      replace_existing_rates: requiresReplacement,
      execution_mode: executionMode,
      execution_mode_label:
        executionMode === 'automatic'
          ? 'Automatic'
          : executionMode === 'discount_only'
            ? 'Discount-only'
            : executionMode === 'manual'
              ? 'Manual'
              : 'Control',
      actionable,
      status: resolvedStatus,
      config,
    };
  });

  const readyCount = variantPlans.filter(plan => plan.status === 'ready').length;
  const blockedCount = variantPlans.filter(plan => plan.status === 'manual_required').length;
  const controlCount = variantPlans.filter(plan => plan.status === 'control').length;
  const automaticCount = variantPlans.filter(plan => plan.execution_mode === 'automatic').length;
  const discountOnlyCount = variantPlans.filter(
    plan => plan.execution_mode === 'discount_only'
  ).length;
  const manualCount = variantPlans.filter(plan => plan.execution_mode === 'manual').length;

  return {
    test_id: normalizedTest?.id || null,
    test_name: normalizedTest?.name || null,
    plan_status: blockedCount > 0 ? 'partial' : 'ready',
    summary: {
      variants_total: variantPlans.length,
      variants_ready: readyCount,
      variants_manual_required: blockedCount,
      variants_control: controlCount,
      variants_automatic: automaticCount,
      variants_discount_only: discountOnlyCount,
      variants_manual: manualCount,
    },
    variants: variantPlans,
    recommended_execution_path:
      capabilityReport?.recommended_execution_path ||
      (blockedCount > 0 ? 'manual' : 'discount_function'),
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  buildShippingExecutionPlan,
  requiredAdapterForStrategy,
  resolveExecutionAdapter,
};
