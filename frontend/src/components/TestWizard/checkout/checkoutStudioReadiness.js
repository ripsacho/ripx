import {
  getActionableCheckoutSections,
  getNormalizedCheckoutExperienceConfig,
  normalizeCheckoutListInput,
  normalizeCheckoutPhase,
  normalizeCheckoutProductItems,
  normalizeCheckoutProductSourceMode,
} from '../../../utils/checkoutSections';

export function getCheckoutStudioReadiness({
  variant = {},
  variantIndex = 0,
  checkoutPhase = 'experience',
} = {}) {
  const phase = normalizeCheckoutPhase(checkoutPhase);
  const cfg = variant?.config && typeof variant.config === 'object' ? variant.config : {};
  const isControlLike = variantIndex === 0 || /control/i.test(String(variant?.name || ''));
  const normalizedExperience = getNormalizedCheckoutExperienceConfig(cfg);
  const sections = normalizedExperience.checkout_sections;
  const actionableSections = getActionableCheckoutSections(cfg);
  const productSections = sections.filter(section => section?.type === 'product_list');
  const paymentMethodCount = normalizeCheckoutListInput(cfg.payment_method_names).length;
  const deliveryMethodCount = normalizeCheckoutListInput(cfg.delivery_method_names).length;
  const issues = [];

  const addIssue = issue => {
    issues.push({
      severity: 'info',
      scope: 'variant',
      message: '',
      nextAction: '',
      ...issue,
    });
  };

  if (!isControlLike) {
    if (phase === 'experience' && actionableSections.length === 0) {
      addIssue({
        severity: 'blocker',
        scope: 'surface',
        message: 'This treatment has no renderable checkout sections.',
        nextAction: 'Add or enable at least one checkout section.',
      });
    }
    if (phase === 'payment_method' && paymentMethodCount === 0) {
      addIssue({
        severity: 'blocker',
        scope: 'surface',
        message: 'This treatment has no targeted payment methods.',
        nextAction: 'Add the payment method names customers see in checkout.',
      });
    }
    if (phase === 'delivery_method' && deliveryMethodCount === 0) {
      addIssue({
        severity: 'blocker',
        scope: 'surface',
        message: 'This treatment has no targeted delivery methods.',
        nextAction: 'Add the delivery method names customers see in checkout.',
      });
    }
  }

  productSections.forEach((section, sectionIndex) => {
    const props = section?.props || {};
    const sourceMode = normalizeCheckoutProductSourceMode(props.product_source_mode);
    const productAction = String(props.product_action || 'display_only')
      .trim()
      .toLowerCase();
    const products = normalizeCheckoutProductItems(props.product_items);
    if (sourceMode === 'manual' && productAction === 'add_to_cart') {
      const hasMerchandiseId = products.some(item => item.merchandise_id || item.variant_gid);
      if (!hasMerchandiseId) {
        addIssue({
          severity: 'blocker',
          scope: 'product',
          sectionIndex,
          message: `Product list ${sectionIndex + 1} needs a merchandise or variant GID for add-to-cart.`,
          nextAction: 'Add Shopify merchandise IDs to at least one manual product card.',
        });
      }
    }
    if (sourceMode === 'collection') {
      addIssue({
        severity: 'warning',
        scope: 'runtime',
        sectionIndex,
        message: `Product list ${sectionIndex + 1} depends on collection hydration at assignment time.`,
        nextAction: 'Verify checkout readiness can resolve selected collection products.',
      });
    }
    if (sourceMode === 'cart_related') {
      addIssue({
        severity: 'info',
        scope: 'runtime',
        sectionIndex,
        message: `Product list ${sectionIndex + 1} depends on the shopper cart at runtime.`,
        nextAction: 'Preview with a cart that contains products before launch.',
      });
    }
  });

  const blockerCount = issues.filter(issue => issue.severity === 'blocker').length;
  const warningCount = issues.filter(issue => issue.severity === 'warning').length;
  const status = blockerCount > 0 ? 'blocked' : warningCount > 0 ? 'needs_attention' : 'ready';
  const firstActionableIssue =
    issues.find(issue => issue.severity === 'blocker') ||
    issues.find(issue => issue.severity === 'warning') ||
    issues[0] ||
    null;

  return {
    status,
    issues,
    blockerCount,
    warningCount,
    infoCount: issues.filter(issue => issue.severity === 'info').length,
    nextAction: firstActionableIssue?.nextAction || 'Ready for Shopify checkout verification.',
    sections,
    actionableSections,
    productSections,
    paymentMethodCount,
    deliveryMethodCount,
    isControlLike,
  };
}

export function getCheckoutStudioModeIssueCounts(readiness = {}, checkoutPhase = 'experience') {
  const phase = normalizeCheckoutPhase(checkoutPhase);
  const issues = Array.isArray(readiness?.issues) ? readiness.issues : [];
  return {
    overview: 0,
    surface: 0,
    experience:
      phase === 'experience'
        ? issues.filter(issue => ['surface', 'section'].includes(issue.scope)).length
        : 0,
    products: issues.filter(issue => ['product', 'runtime'].includes(issue.scope)).length,
    payment:
      phase === 'payment_method' ? issues.filter(issue => issue.scope === 'surface').length : 0,
    delivery:
      phase === 'delivery_method' ? issues.filter(issue => issue.scope === 'surface').length : 0,
    preview: issues.length,
  };
}

export function getCheckoutStudioStepForMode(mode = 'overview') {
  if (mode === 'preview') return 'verify';
  if (['experience', 'products', 'payment', 'delivery'].includes(mode)) return 'build';
  return 'plan';
}

export function getCheckoutStudioStepIssueCounts(readiness = {}, checkoutPhase = 'experience') {
  const modeCounts = getCheckoutStudioModeIssueCounts(readiness, checkoutPhase);
  return {
    plan: modeCounts.overview + modeCounts.surface,
    build: modeCounts.experience + modeCounts.products + modeCounts.payment + modeCounts.delivery,
    verify: modeCounts.preview,
  };
}

function withCheckoutStudioStep(action) {
  return {
    ...action,
    step: getCheckoutStudioStepForMode(action.mode),
    substep: action.mode,
  };
}

export function getCheckoutStudioNextAction(summary = {}, checkoutPhase = 'experience') {
  const phase = normalizeCheckoutPhase(checkoutPhase);
  if (summary.manualAddNeedsIds) {
    return withCheckoutStudioStep({
      label: 'Fix product IDs',
      shortLabel: 'Fix IDs',
      mode: 'products',
      scope: 'product',
      sectionIndex: summary.manualAddNeedsIdsSectionIndex,
      field: 'product_items',
      reason: 'Manual add-to-cart product lists need merchandise or variant GIDs.',
    });
  }
  if (phase === 'payment_method' && Number(summary.paymentMethodCount || 0) === 0) {
    return withCheckoutStudioStep({
      label: 'Add payment targets',
      shortLabel: 'Add targets',
      mode: 'payment',
      scope: 'surface',
      reason: 'Payment-method tests need at least one target method.',
    });
  }
  if (phase === 'delivery_method' && Number(summary.deliveryMethodCount || 0) === 0) {
    return withCheckoutStudioStep({
      label: 'Add delivery targets',
      shortLabel: 'Add targets',
      mode: 'delivery',
      scope: 'surface',
      reason: 'Delivery-method tests need at least one target method.',
    });
  }
  if (summary.readiness?.status === 'blocked') {
    return withCheckoutStudioStep({
      label: 'Review blockers',
      shortLabel: 'Fix setup',
      mode: 'preview',
      scope: 'readiness',
      reason: summary.readiness?.nextAction || 'Resolve the top readiness blocker.',
    });
  }
  if (summary.readiness?.status === 'needs_attention') {
    return withCheckoutStudioStep({
      label: 'Review warnings',
      shortLabel: 'Review',
      mode: 'preview',
      scope: 'runtime',
      reason: summary.readiness?.nextAction || 'Review runtime warnings before launch.',
    });
  }
  return withCheckoutStudioStep({
    label: 'Verify launch',
    shortLabel: 'Verify launch',
    mode: 'preview',
    scope: 'verification',
    reason: 'Open the final preview and verify in Shopify checkout.',
  });
}

export function getCheckoutStudioCommandAction(summaries = [], checkoutPhase = 'experience') {
  const treatmentSummaries = summaries.filter(summary => !summary?.isControlLike);
  const ordered = treatmentSummaries.length > 0 ? treatmentSummaries : summaries;
  const blocked = ordered.find(summary => summary?.readiness?.status === 'blocked');
  const warning = ordered.find(summary => summary?.readiness?.status === 'needs_attention');
  const target = blocked || warning || ordered[0] || null;
  if (!target) {
    return withCheckoutStudioStep({
      label: 'Add checkout variant',
      shortLabel: 'Add variant',
      mode: 'overview',
      variantIndex: 0,
      status: 'empty',
      reason: 'No checkout variants are available yet.',
    });
  }
  return {
    ...getCheckoutStudioNextAction(target, checkoutPhase),
    variantIndex: target.index,
    status: target.readiness?.status || 'ready',
  };
}
