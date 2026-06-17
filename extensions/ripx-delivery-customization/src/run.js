const NO_CHANGES = { operations: [] };

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getConfiguration(input) {
  const raw = input?.deliveryCustomization?.metafield?.jsonValue;
  return raw && typeof raw === 'object' ? raw : {};
}

function resolveAssignment(deliveryGroups = []) {
  let chosen = null;
  for (const group of Array.isArray(deliveryGroups) ? deliveryGroups : []) {
    for (const line of Array.isArray(group?.cartLines) ? group.cartLines : []) {
      const testId = String(line?.ripxTest?.value || line?.ripxPublicTest?.value || '').trim();
      const variantId = String(
        line?.ripxVariant?.value || line?.ripxPublicVariant?.value || ''
      ).trim();
      if (testId && variantId) {
        if (!chosen) {
          chosen = { testId, variantId };
          continue;
        }
        if (chosen.testId !== testId || chosen.variantId !== variantId) {
          return null;
        }
      }
    }
  }
  return chosen;
}

function getMatchedRule(config, assignment) {
  const rules = Array.isArray(config?.variant_rules) ? config.variant_rules : [];
  return rules.find(rule => {
    if (!rule || typeof rule !== 'object') {
      return false;
    }
    if (
      config?.test_id &&
      assignment?.testId &&
      String(config.test_id) !== String(assignment.testId)
    ) {
      return false;
    }
    const assignedVariant = String(assignment?.variantId || '').trim();
    if (!assignedVariant) {
      return false;
    }
    const variantCandidates = [rule.variant_id, rule.variant_name, rule.variantId, rule.variantName]
      .filter(value => value !== undefined && value !== null)
      .map(value => String(value).trim())
      .filter(Boolean);
    return variantCandidates.includes(assignedVariant);
  });
}

function getUnassignedHiddenMethodNames(config) {
  const rules = Array.isArray(config?.variant_rules) ? config.variant_rules : [];
  const names = [];
  for (const rule of rules) {
    const values = Array.isArray(rule?.hide_when_unassigned_method_names)
      ? rule.hide_when_unassigned_method_names
      : [];
    for (const value of values) {
      const name = String(value || '').trim();
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }
  }
  return names;
}

function getUnassignedHiddenMethodCodes(config) {
  const rules = Array.isArray(config?.variant_rules) ? config.variant_rules : [];
  const codes = [];
  for (const rule of rules) {
    const values = Array.isArray(rule?.hide_when_unassigned_method_codes)
      ? rule.hide_when_unassigned_method_codes
      : [];
    for (const value of values) {
      const code = String(value || '').trim();
      if (code && !codes.includes(code)) {
        codes.push(code);
      }
    }
  }
  return codes;
}

function matchesOptionTitle(title, wantedNames = []) {
  const normalizedTitle = normalizeText(title);
  return wantedNames.some(item => normalizeText(item) === normalizedTitle);
}

function matchesOptionCode(code, wantedCodes = []) {
  const normalizedCode = normalizeText(code);
  return wantedCodes.some(item => normalizeText(item) === normalizedCode);
}

function hasRequiredVisibleOption(deliveryGroups = [], wantedNames = [], wantedCodes = []) {
  const normalizedCodes = Array.isArray(wantedCodes)
    ? wantedCodes.map(item => normalizeText(item)).filter(Boolean)
    : [];
  const normalizedWanted = Array.isArray(wantedNames)
    ? wantedNames.map(item => normalizeText(item)).filter(Boolean)
    : [];
  if (normalizedCodes.length === 0 && normalizedWanted.length === 0) {
    return true;
  }
  for (const group of deliveryGroups) {
    for (const option of Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []) {
      if (
        option?.handle &&
        (normalizedCodes.includes(normalizeText(option?.code)) ||
          (normalizedCodes.length === 0 && normalizedWanted.includes(normalizeText(option?.title))))
      ) {
        return true;
      }
    }
  }
  return false;
}

function buildHideOperations(
  deliveryGroups = [],
  wantedNames = [],
  wantedCodes = [],
  excludedCodes = []
) {
  const operations = [];
  for (const group of deliveryGroups) {
    for (const option of Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []) {
      if (!option?.handle) {
        continue;
      }
      if (matchesOptionCode(option?.code, excludedCodes)) {
        continue;
      }
      if (
        !matchesOptionCode(option?.code, wantedCodes) &&
        !matchesOptionTitle(option?.title, wantedNames)
      ) {
        continue;
      }
      operations.push({
        deliveryOptionHide: {
          deliveryOptionHandle: option.handle,
        },
      });
    }
  }
  return operations;
}

function buildRenameOperations(deliveryGroups = [], wantedNames = [], renameTo = '') {
  if (!String(renameTo || '').trim()) {
    return [];
  }
  const operations = [];
  for (const group of deliveryGroups) {
    for (const option of Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []) {
      if (!option?.handle || !matchesOptionTitle(option?.title, wantedNames)) {
        continue;
      }
      operations.push({
        deliveryOptionRename: {
          deliveryOptionHandle: option.handle,
          title: String(renameTo).trim(),
        },
      });
    }
  }
  return operations;
}

function buildMoveOperations(deliveryGroups = [], wantedNames = []) {
  const operations = [];
  for (const group of deliveryGroups) {
    const byTitle = new Map(
      (Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : [])
        .map(option => [normalizeText(option?.title), option])
        .filter(([, option]) => option?.handle)
    );
    wantedNames.forEach((wantedName, index) => {
      const option = byTitle.get(normalizeText(wantedName));
      if (!option?.handle) {
        return;
      }
      operations.push({
        deliveryOptionMove: {
          deliveryOptionHandle: option.handle,
          index,
        },
      });
    });
  }
  return operations;
}

/**
 * @param {import("../generated/api").RunInput} input
 * @returns {import("../generated/api").FunctionRunResult}
 */
export function cartDeliveryOptionsTransformRun(input) {
  const config = getConfiguration(input);
  const deliveryGroups = Array.isArray(input?.cart?.deliveryGroups)
    ? input.cart.deliveryGroups
    : [];
  const assignment = resolveAssignment(deliveryGroups);
  const unassignedHideOperations = buildHideOperations(
    deliveryGroups,
    getUnassignedHiddenMethodNames(config),
    getUnassignedHiddenMethodCodes(config)
  );
  if (!assignment) {
    return unassignedHideOperations.length > 0
      ? { operations: unassignedHideOperations }
      : NO_CHANGES;
  }
  const matchedRule = getMatchedRule(config, assignment);
  if (!matchedRule) {
    return unassignedHideOperations.length > 0
      ? { operations: unassignedHideOperations }
      : NO_CHANGES;
  }

  const methodNames = Array.isArray(matchedRule?.method_names) ? matchedRule.method_names : [];
  if (methodNames.length === 0 || deliveryGroups.length === 0) {
    return NO_CHANGES;
  }
  if (
    !hasRequiredVisibleOption(
      deliveryGroups,
      matchedRule?.require_present_method_names,
      matchedRule?.require_present_method_codes
    )
  ) {
    return NO_CHANGES;
  }

  const action = normalizeText(matchedRule?.action || 'hide');
  const operations =
    action === 'rename'
      ? buildRenameOperations(deliveryGroups, methodNames, matchedRule?.rename_to)
      : action === 'reorder'
        ? buildMoveOperations(deliveryGroups, methodNames)
        : buildHideOperations(
            deliveryGroups,
            methodNames,
            matchedRule?.method_codes,
            matchedRule?.protected_method_codes
          );

  return operations.length > 0 ? { operations } : NO_CHANGES;
}
