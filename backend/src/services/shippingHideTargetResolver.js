const { buildShippingCurrentSetupReport } = require('./shippingCurrentSetupService');

function toStringArray(input) {
  if (Array.isArray(input)) {
    return input.map(item => String(item || '').trim()).filter(Boolean);
  }
  return String(input || '')
    .split(/\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeNameKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function extractScopedTokensFromId(rawId) {
  const raw = String(rawId || '').trim();
  if (!raw) {
    return [];
  }
  const tokens = new Set([raw, raw.toLowerCase()]);
  const tail = raw.split('/').pop();
  if (tail) {
    tokens.add(tail);
    tokens.add(tail.toLowerCase());
  }
  const numeric = raw.match(/(\d{8,})\s*$/);
  if (numeric) {
    tokens.add(numeric[1]);
  }
  return Array.from(tokens).filter(Boolean);
}

function isScopedNativeToken(code) {
  const raw = String(code || '').trim();
  if (!raw) {
    return false;
  }
  if (/^\d{8,}$/.test(raw)) {
    return true;
  }
  return raw.toLowerCase().includes('deliverymethoddefinition');
}

function mergeHideTargetMethodNames(cfg = {}) {
  const explicitNames = toStringArray(
    cfg.delivery_method_names || cfg.deliveryMethodNames || cfg.method_names || cfg.methodNames
  );
  if (explicitNames.length > 0) {
    return explicitNames.slice(0, 50);
  }
  const scope =
    cfg.shipping_scope && typeof cfg.shipping_scope === 'object' ? cfg.shipping_scope : {};
  return toStringArray(scope.selected_rate_names || scope.selectedRateNames).slice(0, 50);
}

function findCurrentSetupRatesForName(rates = [], methodName = '') {
  const wanted = normalizeNameKey(methodName);
  if (!wanted) {
    return [];
  }
  return (Array.isArray(rates) ? rates : []).filter(
    rate => normalizeNameKey(rate?.name) === wanted
  );
}

function buildSlugCodesFromName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return [];
  }
  const lower = trimmed.toLowerCase();
  const slug = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const dashed = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return Array.from(new Set([trimmed, lower, slug, dashed].filter(Boolean)));
}

function buildNativeHideTargets(methodNames = [], scope = {}, currentRates = []) {
  const selectedDefinitionIds = toStringArray(
    scope.selected_method_definition_ids || scope.selectedMethodDefinitionIds
  );
  const selectedRateIds = toStringArray(scope.selected_rate_ids || scope.selectedRateIds);

  return methodNames.slice(0, 50).map(name => {
    const matches = findCurrentSetupRatesForName(currentRates, name);
    const matchedByScope = matches.filter(rate => {
      const definitionId = String(rate?.method_definition_id || rate?.id || '').trim();
      const rateId = String(rate?.id || '').trim();
      return (
        (definitionId && selectedDefinitionIds.includes(definitionId)) ||
        (rateId && selectedRateIds.includes(rateId))
      );
    });
    const chosen = matchedByScope[0] || matches[0] || null;
    const methodDefinitionId = String(
      chosen?.method_definition_id || chosen?.id || matchedByScope[0]?.method_definition_id || ''
    ).trim();
    const rateId = String(chosen?.id || '').trim();
    const baselineAmount = chosen?.amount;
    const parsedBaseline = Number.parseFloat(String(baselineAmount ?? '').trim());
    return {
      name: String(name || '').trim(),
      method_definition_id: methodDefinitionId || null,
      rate_id: rateId || null,
      baseline_cost: Number.isFinite(parsedBaseline) ? parsedBaseline : null,
      baseline_currency: chosen?.currency || null,
      slug_codes: buildSlugCodesFromName(name),
    };
  });
}

function buildScopedCodesFromHideTargets(targets = []) {
  const codes = new Set();
  (Array.isArray(targets) ? targets : []).forEach(target => {
    extractScopedTokensFromId(target?.method_definition_id).forEach(token => codes.add(token));
    extractScopedTokensFromId(target?.rate_id).forEach(token => codes.add(token));
  });
  return Array.from(codes).filter(isScopedNativeToken).slice(0, 50);
}

async function enrichVariantShippingHideTargets(shopDomain, accessToken, variant = {}) {
  const cfg = variant?.config && typeof variant.config === 'object' ? variant.config : {};
  const methodNames = mergeHideTargetMethodNames(cfg);
  if (methodNames.length === 0) {
    return variant;
  }

  const scope =
    cfg.shipping_scope && typeof cfg.shipping_scope === 'object' ? cfg.shipping_scope : {};
  let currentRates = [];
  try {
    const currentSetup = await buildShippingCurrentSetupReport(shopDomain, accessToken);
    currentRates = Array.isArray(currentSetup?.rates) ? currentSetup.rates : [];
  } catch (_error) {
    currentRates = [];
  }

  let selectedDefinitionIds = toStringArray(
    scope.selected_method_definition_ids || scope.selectedMethodDefinitionIds
  );
  let selectedRateIds = toStringArray(scope.selected_rate_ids || scope.selectedRateIds);
  let selectedRateNames = toStringArray(scope.selected_rate_names || scope.selectedRateNames);

  if (selectedDefinitionIds.length === 0 && currentRates.length > 0) {
    const resolvedDefinitionIds = new Set();
    const resolvedRateIds = new Set();
    methodNames.forEach(name => {
      findCurrentSetupRatesForName(currentRates, name).forEach(rate => {
        const definitionId = String(rate?.method_definition_id || rate?.id || '').trim();
        const rateId = String(rate?.id || '').trim();
        if (definitionId) {
          resolvedDefinitionIds.add(definitionId);
        }
        if (rateId) {
          resolvedRateIds.add(rateId);
        }
      });
    });
    selectedDefinitionIds = Array.from(resolvedDefinitionIds);
    selectedRateIds = Array.from(resolvedRateIds);
  }

  selectedRateNames = Array.from(new Set([...selectedRateNames, ...methodNames])).slice(0, 50);
  const nativeHideTargets = buildNativeHideTargets(
    methodNames,
    {
      ...scope,
      selected_method_definition_ids: selectedDefinitionIds,
      selected_rate_ids: selectedRateIds,
      selected_rate_names: selectedRateNames,
    },
    currentRates
  );
  const nativeHideScopedCodes = buildScopedCodesFromHideTargets(nativeHideTargets);

  return {
    ...variant,
    config: {
      ...cfg,
      delivery_method_names: methodNames,
      delivery_method_codes: nativeHideScopedCodes.length > 0 ? nativeHideScopedCodes : [],
      native_hide_targets: nativeHideTargets,
      native_hide_scoped_codes: nativeHideScopedCodes,
      native_hide_by_id_only: nativeHideScopedCodes.length > 0,
      shipping_scope: {
        ...scope,
        selected_method_definition_ids: selectedDefinitionIds,
        selected_rate_ids: selectedRateIds,
        selected_rate_names: selectedRateNames,
      },
    },
  };
}

module.exports = {
  buildNativeHideTargets,
  buildScopedCodesFromHideTargets,
  buildSlugCodesFromName,
  enrichVariantShippingHideTargets,
  extractScopedTokensFromId,
  findCurrentSetupRatesForName,
  isScopedNativeToken,
  mergeHideTargetMethodNames,
};
