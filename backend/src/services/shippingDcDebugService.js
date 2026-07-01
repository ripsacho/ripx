const fs = require('fs');
const path = require('path');
const vm = require('vm');
const shopifyService = require('./shopifyService');
const { enrichVariantShippingHideTargets } = require('./shippingHideTargetResolver');
const { buildShippingCurrentSetupReport } = require('./shippingCurrentSetupService');
const { buildShippingExecutionPlan } = require('./shippingExecutionPlanner');
const { buildShippingCapabilityReport } = require('./shippingCapabilityPlanner');
const {
  buildShippingDeliveryCustomizationConfig,
  buildShippingDeliveryCustomizationTitle,
} = require('./shippingAutoExecutionService');

let deliveryCustomizationRunModule = null;

function loadDeliveryCustomizationRunModule() {
  if (deliveryCustomizationRunModule) {
    return deliveryCustomizationRunModule;
  }
  const extensionRoot = path.join(__dirname, '../../../extensions/ripx-delivery-customization/src');
  const runSource = fs.readFileSync(path.join(extensionRoot, 'run.js'), 'utf8');
  const explainSource = fs.readFileSync(path.join(extensionRoot, 'runExplain.js'), 'utf8');
  const transformed = runSource
    .replace(
      'export function cartDeliveryOptionsTransformRun(',
      'function cartDeliveryOptionsTransformRun('
    )
    .concat(
      '\n',
      explainSource,
      '\nmodule.exports = { cartDeliveryOptionsTransformRun, explainDeliveryCustomizationHide };'
    );

  const sandbox = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(transformed, sandbox, {
    filename: 'run.js',
  });
  deliveryCustomizationRunModule = sandbox.module.exports;
  return deliveryCustomizationRunModule;
}

async function buildExpectedDeliveryCustomizationConfig({
  test,
  variant,
  shopDomain,
  accessToken,
}) {
  let enrichedVariant = variant;
  try {
    enrichedVariant = await enrichVariantShippingHideTargets(shopDomain, accessToken, variant);
  } catch (_error) {
    enrichedVariant = variant;
  }
  return buildShippingDeliveryCustomizationConfig(test, enrichedVariant);
}

function pickTreatmentVariant(test = {}, variantIndex = null) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  if (variantIndex !== null && variantIndex !== undefined && variants[variantIndex]) {
    return { variant: variants[variantIndex], index: variantIndex };
  }
  const index = variants.findIndex((variant, idx) => {
    if (idx === 0) {
      return false;
    }
    const strategy = String(variant?.config?.strategy || '')
      .trim()
      .toLowerCase();
    return strategy && strategy !== 'control';
  });
  if (index >= 0) {
    return { variant: variants[index], index };
  }
  return { variant: variants[1] || variants[0] || null, index: variants[1] ? 1 : 0 };
}

async function fetchDeliveryCustomizationsWithMetafield(shopDomain, accessToken) {
  const query = `
    query RipxShippingDeliveryCustomizationsWithConfig {
      deliveryCustomizations(first: 100) {
        edges {
          node {
            id
            title
            enabled
            metafield(namespace: "delivery-customization", key: "function-configuration") {
              jsonValue
            }
          }
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, query);
  const edges = response?.data?.deliveryCustomizations?.edges || [];
  return edges.map(edge => edge?.node).filter(Boolean);
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function summarizeVariantRule(rule = {}) {
  if (!rule || typeof rule !== 'object') {
    return null;
  }
  return {
    variant_id: rule.variant_id || null,
    variant_name: rule.variant_name || null,
    action: rule.action || null,
    method_names: rule.method_names || [],
    method_codes: rule.method_codes || [],
    native_hide_targets: rule.native_hide_targets || [],
    native_hide_scoped_codes: rule.native_hide_scoped_codes || [],
    native_hide_by_id_only: rule.native_hide_by_id_only ?? null,
    rate_hide_bindings: rule.rate_hide_bindings || [],
    protected_method_codes: rule.protected_method_codes || [],
    protected_rate_titles: rule.protected_rate_titles || [],
    skip_replacement_presence_gate: rule.skip_replacement_presence_gate ?? null,
  };
}

function compareDeliveryCustomizationConfigs(expected = {}, live = {}) {
  const expectedRule = Array.isArray(expected?.variant_rules) ? expected.variant_rules[0] : null;
  const liveRule = Array.isArray(live?.variant_rules) ? live.variant_rules[0] : null;
  const mismatches = [];

  const compareField = (field, left, right) => {
    const leftJson = stableJson(left);
    const rightJson = stableJson(right);
    if (leftJson !== rightJson) {
      mismatches.push({
        field,
        expected: left,
        live: right,
      });
    }
  };

  compareField('test_id', expected?.test_id || null, live?.test_id || null);
  compareField(
    'variant_rule.summary',
    summarizeVariantRule(expectedRule),
    summarizeVariantRule(liveRule)
  );

  const liveCodes = (liveRule?.method_codes || []).map(code => String(code).toLowerCase());
  const legacySlugCodes = ['standard', 'express', 'economy', 'priority'];
  const liveHasLegacySlugs = liveCodes.some(code => legacySlugCodes.includes(code));
  const expectedHasBindings = Array.isArray(expectedRule?.rate_hide_bindings)
    ? expectedRule.rate_hide_bindings.length > 0
    : false;
  if (liveHasLegacySlugs && expectedRule?.native_hide_by_id_only) {
    mismatches.push({
      field: 'legacy_slug_codes_on_live_metafield',
      expected: 'id-scoped codes only',
      live: liveRule?.method_codes || [],
      severity: 'high',
      fix: 'Re-Apply shipping after deploying the latest backend and delivery customization extension.',
    });
  }
  if (expectedHasBindings && !(liveRule?.rate_hide_bindings || []).length) {
    mismatches.push({
      field: 'missing_rate_hide_bindings_on_live',
      expected: expectedRule.rate_hide_bindings,
      live: liveRule?.rate_hide_bindings || [],
      severity: 'high',
      fix: 'Re-Apply shipping so the live metafield includes rate_hide_bindings.',
    });
  }

  return {
    in_sync: mismatches.length === 0,
    mismatch_count: mismatches.length,
    mismatches,
    expected_rule: summarizeVariantRule(expectedRule),
    live_rule: summarizeVariantRule(liveRule),
  };
}

async function buildDeliveryCustomizationConfigCompareReport({
  test,
  shopDomain,
  accessToken,
  variantIndex = null,
}) {
  const { variant, index } = pickTreatmentVariant(test, variantIndex);
  if (!variant) {
    throw new Error('No treatment variant found on this shipping test.');
  }

  const planVariant = buildShippingExecutionPlan(
    test,
    await buildShippingCapabilityReport(shopDomain, accessToken)
  ).variants.find(entry => entry.index === index);
  const variantForApply = planVariant || { ...variant, index };

  const expectedConfig = await buildExpectedDeliveryCustomizationConfig({
    test,
    variant: variantForApply,
    shopDomain,
    accessToken,
  });
  const customizationTitle = buildShippingDeliveryCustomizationTitle(test, variantForApply);
  const liveCustomizations = await fetchDeliveryCustomizationsWithMetafield(
    shopDomain,
    accessToken
  );
  const liveMatch =
    liveCustomizations.find(
      item =>
        String(item?.title || '')
          .trim()
          .toLowerCase() === customizationTitle.toLowerCase()
    ) || null;
  const liveConfig = liveMatch?.metafield?.jsonValue || null;
  const comparison = compareDeliveryCustomizationConfigs(expectedConfig, liveConfig || {});

  return {
    generated_at: new Date().toISOString(),
    test_id: test?.id || null,
    variant_index: index,
    variant_name: variant?.name || null,
    customization_title: customizationTitle,
    live_customization: liveMatch
      ? {
          id: liveMatch.id || null,
          title: liveMatch.title || null,
          enabled: liveMatch.enabled !== false,
          has_metafield: Boolean(liveConfig),
        }
      : null,
    expected_config: expectedConfig,
    live_config: liveConfig,
    comparison,
    recommendations: comparison.in_sync
      ? ['Live delivery customization metafield matches the expected apply output.']
      : [
          'Deploy backend + delivery customization extension if you have not since the latest hide fixes.',
          'Run Apply shipping (apply=true) for this variant.',
          'Use POST /shipping/simulate-hide with checkout option samples to validate hide decisions.',
          ...(comparison.mismatches || []).map(item => item.fix).filter(Boolean),
        ],
  };
}

function extractNumericHandle(rawId) {
  const raw = String(rawId || '').trim();
  if (!raw) {
    return '';
  }
  const tail = raw.split('/').pop();
  if (tail && /^\d{8,}$/.test(tail)) {
    return tail;
  }
  const numeric = raw.match(/(\d{8,})\s*$/);
  return numeric ? numeric[1] : tail;
}

function slugSimulationCode(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildAutoSimulationDeliveryOptions({ variant = {}, currentSetup = {} }) {
  const cfg = variant?.config || variant || {};
  const setupRates = Array.isArray(currentSetup?.rates) ? currentSetup.rates : [];
  const options = [];
  const seenHandles = new Set();

  const pushOption = option => {
    const [normalized] = normalizeSimulationOptions([option]);
    if (!normalized || seenHandles.has(normalized.handle)) {
      return;
    }
    seenHandles.add(normalized.handle);
    options.push(normalized);
  };

  (Array.isArray(cfg.native_hide_targets) ? cfg.native_hide_targets : []).forEach(target => {
    const name = String(target?.name || '').trim();
    const numeric = extractNumericHandle(target?.method_definition_id);
    const setupRate = setupRates.find(
      rate =>
        String(rate?.name || '')
          .trim()
          .toLowerCase() === name.toLowerCase()
    );
    pushOption({
      handle: setupRate?.id || numeric || slugSimulationCode(name) || 'native-rate',
      title: name || setupRate?.name || 'Native rate',
      code: setupRate?.code || numeric || slugSimulationCode(name) || 'native-rate',
      cost: {
        amount: setupRate?.amount ?? setupRate?.price ?? '5.00',
        currencyCode: setupRate?.currency || setupRate?.currencyCode || 'USD',
      },
    });
  });

  const configuredRates = Array.isArray(cfg.rates) ? cfg.rates : [];
  configuredRates.forEach((rate, index) => {
    const title = String(rate?.name || rate?.display_name || `RipX rate ${index + 1}`).trim();
    const code = String(
      rate?.service_code || rate?.serviceCode || rate?.code || `ripx_rate_${index + 1}`
    ).trim();
    pushOption({
      handle: String(rate?.handle || `ripx-${slugSimulationCode(title)}-${index}`).trim(),
      title,
      code,
      cost: {
        amount: rate?.amount ?? rate?.price ?? '12.00',
        currencyCode: rate?.currency || rate?.currencyCode || 'USD',
      },
    });
  });

  return options;
}

function normalizeSimulationOptions(options = []) {
  return (Array.isArray(options) ? options : [])
    .map(option => ({
      handle: String(option?.handle || '').trim(),
      title: String(option?.title || '').trim(),
      code: option?.code === undefined || option?.code === null ? '' : String(option.code).trim(),
      description:
        option?.description === undefined || option?.description === null
          ? ''
          : String(option.description).trim(),
      deliveryMethodType:
        option?.deliveryMethodType ||
        option?.delivery_method_type ||
        option?.delivery_methodType ||
        null,
      cost:
        option?.cost && typeof option.cost === 'object'
          ? {
              amount: option.cost.amount ?? option.cost.value ?? null,
              currencyCode: option.cost.currencyCode || option.cost.currency || null,
            }
          : option?.cost_amount !== undefined
            ? { amount: option.cost_amount, currencyCode: option.cost_currency || null }
            : null,
    }))
    .filter(option => option.handle);
}

function buildSimulationCartInput({ config, deliveryOptions = [], testId, variantId }) {
  return {
    deliveryCustomization: {
      metafield: {
        jsonValue: config,
      },
    },
    cart: {
      ripxTest: { value: testId || config?.test_id || '' },
      ripxVariant: { value: variantId || '' },
      deliveryGroups: [
        {
          cartLines: [
            {
              ripxTest: { value: testId || config?.test_id || '' },
              ripxVariant: { value: variantId || '' },
            },
          ],
          deliveryOptions: normalizeSimulationOptions(deliveryOptions),
        },
      ],
    },
  };
}

async function simulateDeliveryCustomizationHide({
  test,
  shopDomain,
  accessToken,
  variantIndex = null,
  deliveryOptions = [],
  configOverride = null,
  testId = null,
  variantId = null,
}) {
  const { variant, index } = pickTreatmentVariant(test, variantIndex);
  if (!variant) {
    throw new Error('No treatment variant found on this shipping test.');
  }
  const planVariant = buildShippingExecutionPlan(
    test,
    await buildShippingCapabilityReport(shopDomain, accessToken)
  ).variants.find(entry => entry.index === index);
  const variantForApply = planVariant || { ...variant, index };

  let resolvedDeliveryOptions = normalizeSimulationOptions(deliveryOptions);
  if (resolvedDeliveryOptions.length === 0) {
    let currentSetup = { rates: [] };
    try {
      currentSetup = await buildShippingCurrentSetupReport(shopDomain, accessToken);
    } catch (_error) {
      currentSetup = { rates: [] };
    }
    resolvedDeliveryOptions = buildAutoSimulationDeliveryOptions({
      variant: variantForApply,
      currentSetup,
    });
  }
  if (resolvedDeliveryOptions.length === 0) {
    throw new Error(
      'No delivery options to simulate. Provide delivery_options or configure hide targets and RipX rates first.'
    );
  }

  const config =
    configOverride ||
    (await buildExpectedDeliveryCustomizationConfig({
      test,
      variant: variantForApply,
      shopDomain,
      accessToken,
    }));

  const resolvedTestId = String(testId || test?.id || config?.test_id || '').trim();
  const resolvedVariantId = String(
    variantId || variant?.name || variant?.id || config?.variant_rules?.[0]?.variant_name || ''
  ).trim();

  const input = buildSimulationCartInput({
    config,
    deliveryOptions: resolvedDeliveryOptions,
    testId: resolvedTestId,
    variantId: resolvedVariantId,
  });

  const { explainDeliveryCustomizationHide, cartDeliveryOptionsTransformRun } =
    loadDeliveryCustomizationRunModule();
  const explained =
    typeof explainDeliveryCustomizationHide === 'function'
      ? explainDeliveryCustomizationHide(input)
      : {
          ...cartDeliveryOptionsTransformRun(input),
          option_decisions: [],
        };

  return {
    generated_at: new Date().toISOString(),
    test_id: test?.id || null,
    variant_index: index,
    variant_name: variant?.name || null,
    assignment: explained.assignment || null,
    matched_rule: explained.matched_rule || summarizeVariantRule(config?.variant_rules?.[0]),
    operations: explained.operations || [],
    option_decisions: explained.option_decisions || [],
    gate: explained.gate || null,
    input_summary: {
      delivery_option_count: resolvedDeliveryOptions.length,
      auto_built_options: normalizeSimulationOptions(deliveryOptions).length === 0,
      config_variant_rules: Array.isArray(config?.variant_rules) ? config.variant_rules.length : 0,
    },
    simulated_delivery_options: resolvedDeliveryOptions,
  };
}

module.exports = {
  buildDeliveryCustomizationConfigCompareReport,
  simulateDeliveryCustomizationHide,
  buildExpectedDeliveryCustomizationConfig,
  fetchDeliveryCustomizationsWithMetafield,
  compareDeliveryCustomizationConfigs,
  loadDeliveryCustomizationRunModule,
  buildAutoSimulationDeliveryOptions,
};
