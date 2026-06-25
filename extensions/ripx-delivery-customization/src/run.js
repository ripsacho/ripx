const NO_CHANGES = { operations: [] };

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeToken(value) {
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

function variantAssignmentMatches(rule, assignedVariant) {
  const assigned = normalizeToken(assignedVariant);
  if (!assigned) {
    return false;
  }
  const candidates = [
    rule?.variant_id,
    rule?.variant_name,
    rule?.variantId,
    rule?.variantName,
    rule?.variant_index,
    rule?.variantIndex,
  ]
    .filter(value => value !== undefined && value !== null)
    .map(value => normalizeToken(value))
    .filter(Boolean);
  return candidates.includes(assigned);
}

function testAssignmentMatchesConfig(configTestId, assignedTestId) {
  const config = normalizeToken(configTestId);
  const assigned = normalizeToken(assignedTestId);
  if (!config || !assigned) {
    return true;
  }
  if (config === assigned) {
    return true;
  }
  if (assigned.startsWith(config) || config.startsWith(assigned)) {
    return true;
  }
  const configPrefix = config.replace(/[^a-z0-9]/g, '').slice(0, 8);
  const assignedPrefix = assigned.replace(/[^a-z0-9]/g, '').slice(0, 8);
  return Boolean(configPrefix && assignedPrefix && configPrefix === assignedPrefix);
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
      !testAssignmentMatchesConfig(config.test_id, assignment.testId)
    ) {
      return false;
    }
    const assignedVariant = String(assignment?.variantId || '').trim();
    if (!assignedVariant) {
      return false;
    }
    return variantAssignmentMatches(rule, assignedVariant);
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

function normalizeComparableTitle(value) {
  return normalizeText(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[·•|–—-].*$/, '')
    .replace(/\best\.?\b/g, '')
    .replace(/\bshipping\b/g, '')
    .replace(/\bdelivery\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRipXDeliveryOptionCode(code) {
  const normalized = normalizeText(code);
  return normalized.startsWith('ripx_') || normalized.includes('ripx_flat');
}

function matchesOptionTitle(title, wantedNames = []) {
  const normalizedTitle = normalizeComparableTitle(title);
  if (!normalizedTitle) {
    return false;
  }
  return wantedNames.some(item => {
    const wanted = normalizeComparableTitle(item);
    if (!wanted) {
      return false;
    }
    if (normalizedTitle === wanted) {
      return true;
    }
    if (normalizedTitle.includes(wanted) || wanted.includes(normalizedTitle)) {
      return true;
    }
    const titleTokens = normalizedTitle.split(' ').filter(Boolean);
    const wantedTokens = wanted.split(' ').filter(Boolean);
    return wantedTokens.length > 0 && wantedTokens.every(token => titleTokens.includes(token));
  });
}

function matchesOptionTitlePrefix(title, wantedPrefixes = []) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    return false;
  }
  return wantedPrefixes.some(prefix => {
    const normalizedPrefix = normalizeText(prefix);
    if (!normalizedPrefix) {
      return false;
    }
    return (
      normalizedTitle.startsWith(`${normalizedPrefix}:`) ||
      normalizedTitle.startsWith(`${normalizedPrefix} `) ||
      normalizedTitle.startsWith(normalizedPrefix)
    );
  });
}

function matchesOptionCode(code, wantedCodes = []) {
  const normalizedCode = normalizeText(code);
  return wantedCodes.some(item => {
    const wanted = normalizeText(item);
    if (!wanted) {
      return false;
    }
    return (
      normalizedCode === wanted ||
      normalizedCode.includes(wanted) ||
      wanted.includes(normalizedCode)
    );
  });
}

function matchesProtectedOptionCode(code, protectedCodes = []) {
  const normalizedCode = normalizeText(code);
  if (!normalizedCode) {
    return false;
  }
  return protectedCodes.some(item => normalizeText(item) === normalizedCode);
}

function shouldProtectOption(
  option,
  protectedCodes = [],
  protectedNamePrefixes = [],
  protectedNames = [],
  hideNames = [],
  hideCodes = []
) {
  if (isRipXDeliveryOptionCode(option?.code)) {
    return true;
  }
  const hideTitleMatch = matchesOptionTitle(option?.title, hideNames);
  const hideCodeMatch = matchesOptionCode(option?.code, hideCodes);
  if (hideTitleMatch || hideCodeMatch) {
    return false;
  }
  if (matchesProtectedOptionCode(option?.code, protectedCodes)) {
    return true;
  }
  if (matchesOptionTitlePrefix(option?.title, protectedNamePrefixes)) {
    return true;
  }
  if (matchesOptionTitle(option?.title, protectedNames)) {
    return true;
  }
  return false;
}

function hasRequiredVisibleOption(
  deliveryGroups = [],
  wantedNames = [],
  wantedCodes = [],
  wantedPrefixes = []
) {
  const names = Array.isArray(wantedNames) ? wantedNames : [];
  const codes = Array.isArray(wantedCodes) ? wantedCodes : [];
  const prefixes = Array.isArray(wantedPrefixes) ? wantedPrefixes : [];
  if (names.length === 0 && codes.length === 0 && prefixes.length === 0) {
    return true;
  }
  for (const group of deliveryGroups) {
    for (const option of Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []) {
      if (!option?.handle) {
        continue;
      }
      if (matchesOptionCode(option?.code, codes)) {
        return true;
      }
      if (matchesOptionTitle(option?.title, names)) {
        return true;
      }
      if (matchesOptionTitlePrefix(option?.title, prefixes)) {
        return true;
      }
    }
  }
  return false;
}

function shouldSkipReplacementPresenceGate(rule = {}) {
  return Boolean(rule?.skip_replacement_presence_gate);
}

function buildHideOperations(
  deliveryGroups = [],
  wantedNames = [],
  wantedCodes = [],
  protectedCodes = [],
  protectedNamePrefixes = [],
  protectedNames = []
) {
  const operations = [];
  for (const group of deliveryGroups) {
    for (const option of Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []) {
      if (!option?.handle) {
        continue;
      }
      if (
        shouldProtectOption(
          option,
          protectedCodes,
          protectedNamePrefixes,
          protectedNames,
          wantedNames,
          wantedCodes
        )
      ) {
        continue;
      }
      const matchesCode = matchesOptionCode(option?.code, wantedCodes);
      const matchesTitle = matchesOptionTitle(option?.title, wantedNames);
      if (!matchesCode && !matchesTitle) {
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
  const skipReplacementPresenceGate = shouldSkipReplacementPresenceGate(matchedRule);
  if (
    !skipReplacementPresenceGate &&
    !hasRequiredVisibleOption(
      deliveryGroups,
      matchedRule?.require_present_method_names,
      matchedRule?.require_present_method_codes,
      matchedRule?.require_present_method_prefixes
    )
  ) {
    return NO_CHANGES;
  }

  const protectedNamePrefixes = Array.isArray(matchedRule?.protected_method_name_prefixes)
    ? matchedRule.protected_method_name_prefixes
    : [];
  const protectedNames = Array.isArray(matchedRule?.protected_method_names)
    ? matchedRule.protected_method_names
    : [];
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
            matchedRule?.protected_method_codes,
            protectedNamePrefixes,
            protectedNames
          );

  return operations.length > 0 ? { operations } : NO_CHANGES;
}
