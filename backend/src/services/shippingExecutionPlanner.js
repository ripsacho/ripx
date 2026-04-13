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

function resolveExecutionAdapter(strategy, executionHint = 'auto', capabilityReport = null) {
  const hint = String(executionHint || 'auto')
    .trim()
    .toLowerCase();
  if (hint === 'manual') {
    return 'manual';
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
    if (isAdapterAvailable(capabilityReport, 'delivery_customization')) {
      return 'delivery_customization';
    }
    if (isAdapterAvailable(capabilityReport, 'carrier_service')) {
      return 'carrier_service';
    }
  }
  return requiredAdapterForStrategy(strategy);
}

function buildShippingExecutionPlan(test, capabilityReport) {
  const normalizedTest = normalizeShippingTestPayload(test || {});
  const variants = Array.isArray(normalizedTest?.variants) ? normalizedTest.variants : [];
  const variantPlans = variants.map((variant, index) => {
    const config = normalizeShippingVariantConfig(variant?.config || {});
    const adapter = resolveExecutionAdapter(
      config.strategy,
      config.execution_hint,
      capabilityReport
    );
    const actionable = isActionableShippingConfig(config);
    const adapterAvailable = adapter === 'manual' || isAdapterAvailable(capabilityReport, adapter);
    const status = actionable ? (adapterAvailable ? 'ready' : 'manual_required') : 'control';
    return {
      index,
      id: variant?.id || null,
      name: variant?.name || `Variant ${index + 1}`,
      strategy: config.strategy,
      execution_adapter: adapter,
      actionable,
      status,
      config,
    };
  });

  const readyCount = variantPlans.filter(plan => plan.status === 'ready').length;
  const blockedCount = variantPlans.filter(plan => plan.status === 'manual_required').length;
  const controlCount = variantPlans.filter(plan => plan.status === 'control').length;

  return {
    test_id: normalizedTest?.id || null,
    test_name: normalizedTest?.name || null,
    plan_status: blockedCount > 0 ? 'partial' : 'ready',
    summary: {
      variants_total: variantPlans.length,
      variants_ready: readyCount,
      variants_manual_required: blockedCount,
      variants_control: controlCount,
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
