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
function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}
function getConfiguration(input) {
  const raw = input?.deliveryCustomization?.metafield?.jsonValue;
  return raw && typeof raw === "object" ? raw : {};
}
function resolveAssignment(deliveryGroups = []) {
  let chosen = null;
  for (const group of Array.isArray(deliveryGroups) ? deliveryGroups : []) {
    for (const line of Array.isArray(group?.cartLines) ? group.cartLines : []) {
      const testId = String(line?.ripxTest?.value || "").trim();
      const variantId = String(line?.ripxVariant?.value || "").trim();
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
  return rules.find((rule) => {
    if (!rule || typeof rule !== "object") {
      return false;
    }
    if (config?.test_id && assignment?.testId && String(config.test_id) !== String(assignment.testId)) {
      return false;
    }
    return String(rule.variant_id || "") === String(assignment?.variantId || "");
  });
}
function matchesOptionTitle(title, wantedNames = []) {
  const normalizedTitle = normalizeText(title);
  return wantedNames.some((item) => normalizeText(item) === normalizedTitle);
}
function buildHideOperations(deliveryGroups = [], wantedNames = []) {
  const operations = [];
  for (const group of deliveryGroups) {
    for (const option of Array.isArray(group?.deliveryOptions) ? group.deliveryOptions : []) {
      if (!option?.handle || !matchesOptionTitle(option?.title, wantedNames)) {
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
  const assignment = resolveAssignment(deliveryGroups);
  if (!assignment) {
    return NO_CHANGES;
  }
  const matchedRule = getMatchedRule(config, assignment);
  if (!matchedRule) {
    return NO_CHANGES;
  }
  const methodNames = Array.isArray(matchedRule?.method_names) ? matchedRule.method_names : [];
  if (methodNames.length === 0 || deliveryGroups.length === 0) {
    return NO_CHANGES;
  }
  const action = normalizeText(matchedRule?.action || "hide");
  const operations = action === "rename" ? buildRenameOperations(deliveryGroups, methodNames, matchedRule?.rename_to) : action === "reorder" ? buildMoveOperations(deliveryGroups, methodNames) : buildHideOperations(deliveryGroups, methodNames);
  return operations.length > 0 ? { operations } : NO_CHANGES;
}

// <stdin>
function cartDeliveryOptionsTransformRun2() {
  return run_default(cartDeliveryOptionsTransformRun);
}
export {
  cartDeliveryOptionsTransformRun2 as cartDeliveryOptionsTransformRun
};
