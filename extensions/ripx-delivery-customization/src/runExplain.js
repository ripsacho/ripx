// Backend debug helpers only — not bundled into the Shopify WASM function.

function resolveNoChangesReason({
  assignment,
  matchedRule,
  methodNames,
  deliveryGroups,
  skipReplacementPresenceGate,
  hideOnlyRule,
  operations,
}) {
  if (!assignment) {
    return 'missing_assignment';
  }
  if (!matchedRule) {
    return 'variant_rule_not_matched';
  }
  if (!Array.isArray(methodNames) || methodNames.length === 0) {
    return 'empty_method_names';
  }
  if (!Array.isArray(deliveryGroups) || deliveryGroups.length === 0) {
    return 'empty_delivery_groups';
  }
  if (
    !skipReplacementPresenceGate &&
    !hasRequiredVisibleOption(
      deliveryGroups,
      matchedRule?.require_present_method_names,
      matchedRule?.require_present_method_codes,
      matchedRule?.require_present_method_prefixes
    )
  ) {
    return 'replacement_presence_gate';
  }
  if (Array.isArray(operations) && operations.length > 0) {
    const remainingOptions = countHiddenDeliveryOptions(deliveryGroups, operations);
    if (remainingOptions === 0) {
      return 'would_hide_all_options';
    }
    if (
      !hideOnlyRule &&
      !skipReplacementPresenceGate &&
      !hasVisibleRipXAfterHide(deliveryGroups, operations, matchedRule)
    ) {
      return 'no_visible_ripx_after_hide';
    }
    return null;
  }
  if (matchedRule && !shouldAllowAddModeHide(deliveryGroups, matchedRule)) {
    return 'add_mode_gate_blocked';
  }
  return 'no_matching_hide_operations';
}

function summarizeMatchedRuleForExplain(matchedRule = {}) {
  if (!matchedRule || typeof matchedRule !== 'object') {
    return null;
  }
  return {
    variant_id: matchedRule.variant_id || matchedRule.variantId || null,
    variant_name: matchedRule.variant_name || matchedRule.variantName || null,
    action: matchedRule.action || null,
    method_names: matchedRule.method_names || [],
    native_hide_targets: matchedRule.native_hide_targets || [],
    rate_hide_bindings: matchedRule.rate_hide_bindings || [],
    protected_method_codes: matchedRule.protected_method_codes || [],
    skip_replacement_presence_gate: matchedRule.skip_replacement_presence_gate ?? null,
  };
}

function buildExplainGateStatus({
  assignment,
  matchedRule,
  methodNames,
  deliveryGroups,
  skipReplacementPresenceGate,
  hideOnlyRule,
  operations,
}) {
  const noChangesReason = resolveNoChangesReason({
    assignment,
    matchedRule,
    methodNames,
    deliveryGroups,
    skipReplacementPresenceGate,
    hideOnlyRule,
    operations,
  });
  return {
    assignment_present: Boolean(assignment?.testId && assignment?.variantId),
    matched_rule_present: Boolean(matchedRule),
    method_name_count: methodNames.length,
    delivery_group_count: Array.isArray(deliveryGroups) ? deliveryGroups.length : 0,
    skip_replacement_presence_gate: skipReplacementPresenceGate,
    hide_only_rule: hideOnlyRule,
    add_mode_gate_allowed: matchedRule
      ? shouldAllowAddModeHide(deliveryGroups, matchedRule)
      : false,
    operation_count: Array.isArray(operations) ? operations.length : 0,
    no_changes_reason: Array.isArray(operations) && operations.length > 0 ? null : noChangesReason,
  };
}

function explainDeliveryCustomizationHide(input) {
  const config = getConfiguration(input);
  const deliveryGroups = Array.isArray(input?.cart?.deliveryGroups)
    ? input.cart.deliveryGroups
    : [];
  const assignment = resolveAssignment(input);
  const matchedRule = getMatchedRule(config, assignment);
  const methodNames = Array.isArray(matchedRule?.method_names) ? matchedRule.method_names : [];
  const skipReplacementPresenceGate = matchedRule
    ? shouldSkipReplacementPresenceGate(matchedRule)
    : false;
  const hideOnlyRule = matchedRule ? isHideOnlyRule(matchedRule) : false;
  const result = cartDeliveryOptionsTransformRun(input);
  const hiddenHandles = new Set(
    (Array.isArray(result?.operations) ? result.operations : [])
      .map(operation => operation?.deliveryOptionHide?.deliveryOptionHandle)
      .filter(Boolean)
  );
  const options = collectDeliveryOptions(deliveryGroups);
  const optionDecisions = options.map(option => {
    const protectedByRule = matchedRule
      ? shouldNeverHideDeliveryOption(option, matchedRule)
      : false;
    const protectedByBinding = matchedRule
      ? isProtectedByRateHideBinding(option, matchedRule)
      : false;
    const ripxReplacement = matchedRule ? isRipXReplacementOption(option, matchedRule) : false;
    const matchesHideTargets = matchedRule
      ? optionMatchesNativeHideTargets(option, matchedRule, options)
      : false;
    const hidden = hiddenHandles.has(option.handle);
    let reason = 'visible';
    if (hidden) {
      reason = 'hidden';
    } else if (protectedByBinding) {
      reason = 'protected_by_rate_binding';
    } else if (protectedByRule || ripxReplacement) {
      reason = 'protected_ripx';
    } else if (matchesHideTargets) {
      reason = 'matched_hide_target_but_not_hidden';
    }
    return {
      handle: option.handle,
      title: option.title || null,
      code: option.code || null,
      description: option.description || null,
      delivery_method_type: option.deliveryMethodType || null,
      cost_amount: option?.cost?.amount ?? null,
      cost_currency: option?.cost?.currencyCode ?? null,
      hidden,
      reason,
      protected_by_rule: protectedByRule,
      protected_by_binding: protectedByBinding,
      ripx_replacement: ripxReplacement,
      matches_hide_targets: matchesHideTargets,
    };
  });

  return {
    operations: result?.operations || [],
    assignment,
    matched_rule: summarizeMatchedRuleForExplain(matchedRule),
    option_decisions: optionDecisions,
    gate: buildExplainGateStatus({
      assignment,
      matchedRule,
      methodNames,
      deliveryGroups,
      skipReplacementPresenceGate,
      hideOnlyRule,
      operations: result?.operations || [],
    }),
    no_changes_reason:
      Array.isArray(result?.operations) && result.operations.length > 0
        ? null
        : resolveNoChangesReason({
            assignment,
            matchedRule,
            methodNames,
            deliveryGroups,
            skipReplacementPresenceGate,
            hideOnlyRule,
            operations: result?.operations || [],
          }),
  };
}
