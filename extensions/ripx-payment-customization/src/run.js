const NO_CHANGES = { operations: [] };

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function resolveAssignment(lines = []) {
  let chosen = null;
  for (const line of Array.isArray(lines) ? lines : []) {
    const testId = String(line?.ripxTest?.value || '').trim();
    const variantId = String(line?.ripxVariant?.value || '').trim();
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
  return chosen;
}

function getConfiguration(input) {
  const raw = input?.paymentCustomization?.metafield?.jsonValue;
  return raw && typeof raw === 'object' ? raw : {};
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
    return String(rule.variant_id || '') === String(assignment?.variantId || '');
  });
}

function matchesMethodName(methodName, wantedNames = []) {
  const normalizedMethodName = normalizeText(methodName);
  return wantedNames.some(item => normalizeText(item) === normalizedMethodName);
}

function buildHideOperations(paymentMethods = [], wantedNames = []) {
  return paymentMethods
    .filter(method => matchesMethodName(method?.name, wantedNames))
    .map(method => ({
      paymentMethodHide: {
        paymentMethodId: method.id,
      },
    }));
}

function buildRenameOperations(paymentMethods = [], wantedNames = [], renameTo = '') {
  if (!String(renameTo || '').trim()) {
    return [];
  }
  return paymentMethods
    .filter(method => matchesMethodName(method?.name, wantedNames))
    .map(method => ({
      paymentMethodRename: {
        paymentMethodId: method.id,
        newName: String(renameTo).trim(),
      },
    }));
}

function buildMoveOperations(paymentMethods = [], wantedNames = []) {
  const byName = new Map(
    paymentMethods
      .map(method => [normalizeText(method?.name), method])
      .filter(([, method]) => method?.id)
  );
  return wantedNames.reduce((operations, wantedName, index) => {
    const method = byName.get(normalizeText(wantedName));
    if (!method?.id) {
      return operations;
    }
    operations.push({
      paymentMethodMove: {
        paymentMethodId: method.id,
        index,
      },
    });
    return operations;
  }, []);
}

/**
 * @param {import("../generated/api").RunInput} input
 * @returns {import("../generated/api").FunctionRunResult}
 */
export function cartPaymentMethodsTransformRun(input) {
  const config = getConfiguration(input);
  const assignment = resolveAssignment(input?.cart?.lines || []);
  if (!assignment) {
    return NO_CHANGES;
  }
  const matchedRule = getMatchedRule(config, assignment);
  if (!matchedRule) {
    return NO_CHANGES;
  }

  const paymentMethods = Array.isArray(input?.paymentMethods) ? input.paymentMethods : [];
  const methodNames = Array.isArray(matchedRule?.method_names) ? matchedRule.method_names : [];
  if (methodNames.length === 0 || paymentMethods.length === 0) {
    return NO_CHANGES;
  }

  const action = normalizeText(matchedRule?.action || 'hide');
  const operations =
    action === 'rename'
      ? buildRenameOperations(paymentMethods, methodNames, matchedRule?.rename_to)
      : action === 'reorder'
        ? buildMoveOperations(paymentMethods, methodNames)
        : buildHideOperations(paymentMethods, methodNames);

  return operations.length > 0 ? { operations } : NO_CHANGES;
}
