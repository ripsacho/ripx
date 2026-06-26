// extensions/ripx-delivery-customization/node_modules/@shopify/shopify_function/run.ts
function run_default(userfunction) {
  try {
    ShopifyFunction;
  } catch (e) {
    throw new Error(
      "ShopifyFunction is not defined. Please rebuild your function using the latest version of Shopify CLI."
    );
  }
  const input_obj = ShopifyFunction.readInput();
  const output_obj = userfunction(input_obj);
  ShopifyFunction.writeOutput(output_obj);
}

// extensions/ripx-delivery-customization/src/run.js
var NO_CHANGES = { operations: [] };
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}
function normalizeToken(value) {
  return String(value || "").trim().toLowerCase();
}
function getConfiguration(input) {
  const raw = input?.deliveryCustomization?.metafield?.jsonValue;
  return raw && typeof raw === "object" ? raw : {};
}
function resolveAssignment(input) {
  const cart = input?.cart;
  const cartTestId = String(cart?.ripxTest?.value || cart?.ripxPublicTest?.value || "").trim();
  const cartVariantId = String(
    cart?.ripxVariant?.value || cart?.ripxPublicVariant?.value || ""
  ).trim();
  if (cartTestId && cartVariantId) {
    return { testId: cartTestId, variantId: cartVariantId };
  }
  const deliveryGroups = Array.isArray(cart?.deliveryGroups) ? cart.deliveryGroups : [];
  let chosen = null;
  for (const group of deliveryGroups) {
    for (const line of Array.isArray(group?.cartLines) ? group.cartLines : []) {
      const testId = String(line?.ripxTest?.value || line?.ripxPublicTest?.value || "").trim();
      const variantId = String(
        line?.ripxVariant?.value || line?.ripxPublicVariant?.value || ""
      ).trim();
      if (testId && variantId) {
        if (!chosen) {
          chosen = { testId, variantId };
          continue;
        }
        if (!testAssignmentMatchesConfig(chosen.testId, testId) || !labelsEqual(chosen.variantId, variantId)) {
          return null;
        }
      }
    }
  }
  return chosen;
}
function normalizeComparableLabel(value) {
  return String(value || "").trim().replace(/\+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function labelsEqual(a, b) {
  const left = String(a ?? "").trim();
  const right = String(b ?? "").trim();
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  const leftIsUuid = UUID_RE.test(left);
  const rightIsUuid = UUID_RE.test(right);
  if (leftIsUuid && rightIsUuid) {
    return left === right;
  }
  if (leftIsUuid || rightIsUuid) {
    return false;
  }
  return normalizeComparableLabel(left) === normalizeComparableLabel(right);
}
function variantAssignmentMatches(rule, assignedVariant) {
  const assigned = String(assignedVariant || "").trim();
  if (!assigned) {
    return false;
  }
  const candidates = [
    rule?.variant_id,
    rule?.variant_name,
    rule?.variantId,
    rule?.variantName,
    rule?.variant_index,
    rule?.variantIndex
  ].filter((value) => value !== void 0 && value !== null).map((value) => String(value).trim()).filter(Boolean);
  return candidates.some(
    (candidate) => labelsEqual(assigned, candidate) || normalizeToken(assigned) === normalizeToken(candidate)
  );
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
  const configPrefix = config.replace(/[^a-z0-9]/g, "").slice(0, 8);
  const assignedPrefix = assigned.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return Boolean(configPrefix && assignedPrefix && configPrefix === assignedPrefix);
}
function getMatchedRule(config, assignment) {
  const rules = Array.isArray(config?.variant_rules) ? config.variant_rules : [];
  return rules.find((rule) => {
    if (!rule || typeof rule !== "object") {
      return false;
    }
    if (config?.test_id && assignment?.testId && !testAssignmentMatchesConfig(config.test_id, assignment.testId)) {
      return false;
    }
    const assignedVariant = String(assignment?.variantId || "").trim();
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
    const values = Array.isArray(rule?.hide_when_unassigned_method_names) ? rule.hide_when_unassigned_method_names : [];
    for (const value of values) {
      const name = String(value || "").trim();
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
    const values = Array.isArray(rule?.hide_when_unassigned_method_codes) ? rule.hide_when_unassigned_method_codes : [];
    for (const value of values) {
      const code = String(value || "").trim();
      if (code && !codes.includes(code)) {
        codes.push(code);
      }
    }
  }
  return codes;
}
function normalizeComparableTitle(value) {
  return normalizeText(value).replace(/\([^)]*\)/g, " ").replace(/[·•|–—-].*$/, "").replace(/\best\.?\b/g, "").replace(/\bshipping\b/g, "").replace(/\bdelivery\b/g, "").replace(/\s+/g, " ").trim();
}
function isRipXDeliveryOptionCode(code) {
  const normalized = normalizeText(code);
  return normalized.startsWith("ripx_") || normalized.includes("ripx_flat");
}
function matchesOptionTitle(title, wantedNames = []) {
  const normalizedTitle = normalizeComparableTitle(title);
  if (!normalizedTitle) {
    return false;
  }
  return wantedNames.some((item) => {
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
    const titleTokens = normalizedTitle.split(" ").filter(Boolean);
    const wantedTokens = wanted.split(" ").filter(Boolean);
    return wantedTokens.length > 0 && wantedTokens.every((token) => titleTokens.includes(token));
  });
}
function matchesOptionTitlePrefix(title, wantedPrefixes = []) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) {
    return false;
  }
  return wantedPrefixes.some((prefix) => {
    const normalizedPrefix = normalizeText(prefix);
    if (!normalizedPrefix) {
      return false;
    }
    return normalizedTitle.startsWith(`${normalizedPrefix}:`) || normalizedTitle.startsWith(`${normalizedPrefix} `) || normalizedTitle.startsWith(normalizedPrefix);
  });
}
function matchesOptionCode(code, wantedCodes = []) {
  const normalizedCode = normalizeText(code);
  if (!normalizedCode) {
    return false;
  }
  return wantedCodes.some((item) => {
    const wanted = normalizeText(item);
    if (!wanted) {
      return false;
    }
    if (normalizedCode === wanted) {
      return true;
    }
    if (wanted.startsWith("gid://") || /^\d{8,}$/.test(wanted)) {
      return normalizedCode === wanted || normalizedCode.endsWith(`/${wanted}`) || normalizedCode.endsWith(wanted);
    }
    if (wanted.length >= 3) {
      return normalizedCode.includes(wanted) || wanted.includes(normalizedCode);
    }
    return false;
  });
}
function matchesOptionHandle(handle, wantedCodes = []) {
  const normalizedHandle = normalizeText(handle);
  if (!normalizedHandle) {
    return false;
  }
  return wantedCodes.some((item) => {
    const wanted = normalizeText(item);
    if (!wanted) {
      return false;
    }
    if (normalizedHandle === wanted) {
      return true;
    }
    if (wanted.length >= 3) {
      return normalizedHandle.includes(wanted) || wanted.includes(normalizedHandle);
    }
    return false;
  });
}
function matchesProtectedOptionCode(code, protectedCodes = []) {
  const normalizedCode = normalizeText(code);
  if (!normalizedCode) {
    return false;
  }
  return protectedCodes.some((item) => normalizeText(item) === normalizedCode);
}
function shouldProtectOption(option, protectedCodes = [], protectedNamePrefixes = [], protectedNames = [], hideNames = [], hideCodes = []) {
  if (isRipXDeliveryOptionCode(option?.code)) {
    return true;
  }
  const hideTitleMatch = matchesOptionTitle(option?.title, hideNames);
  const hideCodeMatch = matchesOptionCode(option?.code, hideCodes) || matchesOptionHandle(option?.handle, hideCodes);
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
function hasRequiredVisibleOption(deliveryGroups = [], wantedNames = [], wantedCodes = [], wantedPrefixes = []) {
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
function countDeliveryOptions(deliveryGroups = []) {
  let total = 0;
  for (const group of deliveryGroups) {
    total += (Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []).filter(
      (option) => option?.handle
    ).length;
  }
  return total;
}
function countHiddenDeliveryOptions(deliveryGroups = [], hideOperations = []) {
  const hiddenHandles = new Set(
    hideOperations.map((operation) => operation?.deliveryOptionHide?.deliveryOptionHandle).filter(Boolean)
  );
  let remaining = 0;
  for (const group of deliveryGroups) {
    for (const option of Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []) {
      if (option?.handle && !hiddenHandles.has(option.handle)) {
        remaining += 1;
      }
    }
  }
  return remaining;
}
function buildHideOperations(deliveryGroups = [], wantedNames = [], wantedCodes = [], protectedCodes = [], protectedNamePrefixes = [], protectedNames = []) {
  const operations = [];
  for (const group of deliveryGroups) {
    for (const option of Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []) {
      if (!option?.handle) {
        continue;
      }
      if (shouldProtectOption(
        option,
        protectedCodes,
        protectedNamePrefixes,
        protectedNames,
        wantedNames,
        wantedCodes
      )) {
        continue;
      }
      const matchesCode = matchesOptionCode(option?.code, wantedCodes) || matchesOptionHandle(option?.handle, wantedCodes);
      const matchesTitle = matchesOptionTitle(option?.title, wantedNames);
      if (!matchesCode && !matchesTitle) {
        continue;
      }
      operations.push({
        deliveryOptionHide: {
          deliveryOptionHandle: option.handle
        }
      });
    }
  }
  return operations;
}
function buildRenameOperations(deliveryGroups = [], wantedNames = [], renameTo = "") {
  if (!String(renameTo || "").trim()) {
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
          title: String(renameTo).trim()
        }
      });
    }
  }
  return operations;
}
function buildMoveOperations(deliveryGroups = [], wantedNames = []) {
  const operations = [];
  for (const group of deliveryGroups) {
    const byTitle = new Map(
      (Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []).map((option) => [normalizeText(option?.title), option]).filter(([, option]) => option?.handle)
    );
    wantedNames.forEach((wantedName, index) => {
      const option = byTitle.get(normalizeText(wantedName));
      if (!option?.handle) {
        return;
      }
      operations.push({
        deliveryOptionMove: {
          deliveryOptionHandle: option.handle,
          index
        }
      });
    });
  }
  return operations;
}
function cartDeliveryOptionsTransformRun(input) {
  const config = getConfiguration(input);
  const deliveryGroups = Array.isArray(input?.cart?.deliveryGroups) ? input.cart.deliveryGroups : [];
  const assignment = resolveAssignment(input);
  const unassignedHideOperations = buildHideOperations(
    deliveryGroups,
    getUnassignedHiddenMethodNames(config),
    getUnassignedHiddenMethodCodes(config)
  );
  if (!assignment) {
    return unassignedHideOperations.length > 0 ? { operations: unassignedHideOperations } : NO_CHANGES;
  }
  const matchedRule = getMatchedRule(config, assignment);
  if (!matchedRule) {
    return unassignedHideOperations.length > 0 ? { operations: unassignedHideOperations } : NO_CHANGES;
  }
  const methodNames = Array.isArray(matchedRule?.method_names) ? matchedRule.method_names : [];
  if (methodNames.length === 0 || deliveryGroups.length === 0) {
    return NO_CHANGES;
  }
  const skipReplacementPresenceGate = shouldSkipReplacementPresenceGate(matchedRule);
  if (!skipReplacementPresenceGate && !hasRequiredVisibleOption(
    deliveryGroups,
    matchedRule?.require_present_method_names,
    matchedRule?.require_present_method_codes,
    matchedRule?.require_present_method_prefixes
  )) {
    return NO_CHANGES;
  }
  const protectedNamePrefixes = Array.isArray(matchedRule?.protected_method_name_prefixes) ? matchedRule.protected_method_name_prefixes : [];
  const protectedNames = Array.isArray(matchedRule?.protected_method_names) ? matchedRule.protected_method_names : [];
  const action = normalizeText(matchedRule?.action || "hide");
  const operations = action === "rename" ? buildRenameOperations(deliveryGroups, methodNames, matchedRule?.rename_to) : action === "reorder" ? buildMoveOperations(deliveryGroups, methodNames) : buildHideOperations(
    deliveryGroups,
    methodNames,
    matchedRule?.method_codes,
    matchedRule?.protected_method_codes,
    protectedNamePrefixes,
    protectedNames
  );
  if (action === "hide" && operations.length > 0) {
    const totalOptions = countDeliveryOptions(deliveryGroups);
    const remainingOptions = countHiddenDeliveryOptions(deliveryGroups, operations);
    if (totalOptions > 0 && remainingOptions === 0) {
      return NO_CHANGES;
    }
  }
  return operations.length > 0 ? { operations } : NO_CHANGES;
}

// <stdin>
function cartDeliveryOptionsTransformRun2() {
  return run_default(cartDeliveryOptionsTransformRun);
}
export {
  cartDeliveryOptionsTransformRun2 as cartDeliveryOptionsTransformRun
};
