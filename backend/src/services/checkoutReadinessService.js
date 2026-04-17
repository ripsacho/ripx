const fs = require('fs');
const path = require('path');
const {
  buildCheckoutPriceDiagnostics,
  extensionConfigInputFromReadResult,
  readRipxCheckoutExtensionConfigFile,
} = require('./priceCheckoutDiagnostics');
const { getCheckoutMethodCapabilitiesForDomain } = require('./priceTestCheckoutResolve');
const { buildShippingCapabilityReport } = require('./shippingCapabilityPlanner');
const { buildShippingExecutionPlan } = require('./shippingExecutionPlanner');
const { isShippingTestPayload } = require('./shippingTestConfigService');
const {
  buildCustomizationTitle,
  fetchExistingCustomizations,
  pickCustomizationFunction,
} = require('./checkoutCustomizationDeploymentService');
const shopifyService = require('./shopifyService');
const { inferTemplateKey } = require('../utils/testType');

const CHECKOUT_UI_CONFIG_RELATIVE_PATH = 'extensions/ripx-checkout-ui/src/ripxConfig.js';
const SUPPORTED_TEMPLATE_KEYS = new Set(['pricing', 'offer', 'checkout', 'shipping']);

function normalizeLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeTemplateKey(test = {}) {
  const inferred = inferTemplateKey(test?.variants || [], test?.type || '');
  const normalized = normalizeLower(inferred || test?.type);
  if (normalized === 'price') {
    return 'pricing';
  }
  return normalized;
}

function supportsCheckoutReadiness(test = {}) {
  if (isShippingTestPayload(test)) {
    return true;
  }
  return SUPPORTED_TEMPLATE_KEYS.has(normalizeTemplateKey(test));
}

function buildCheck(id, ok, severity, message) {
  return {
    id,
    ok: Boolean(ok),
    severity,
    message: String(message || '').trim(),
  };
}

function summarizeChecks(checklist = [], typeLabel = 'test') {
  const failed = checklist.filter(item => item && item.ok === false);
  const errors = failed.filter(item => item.severity === 'error');
  const warnings = failed.filter(item => item.severity !== 'error');
  const status = errors.length > 0 ? 'blocked' : warnings.length > 0 ? 'needs_attention' : 'ready';
  const headline =
    status === 'ready'
      ? `Checkout readiness looks good for this ${typeLabel}.`
      : status === 'blocked'
        ? `Checkout readiness is blocked for this ${typeLabel}.`
        : `Checkout readiness needs attention for this ${typeLabel}.`;
  const nextAction = failed[0]?.message || null;

  return {
    status,
    headline,
    next_action: nextAction,
    checks_passed: checklist.filter(item => item?.ok).length,
    checks_total: checklist.length,
    blockers: errors.length,
    warnings: warnings.length,
  };
}

function parseExportedStringConstant(contents, name) {
  const source = String(contents || '');
  if (!source) {
    return '';
  }
  const pattern = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`);
  const match = source.match(pattern);
  return match ? match[2] : '';
}

function deriveCheckoutUiUrlsFromEnv() {
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const assignmentUrl =
    String(process.env.RIPX_CHECKOUT_ASSIGNMENT_URL || '').trim() ||
    (appUrl ? `${appUrl}/api/track/checkout-assignment` : '');
  const conversionUrl =
    String(process.env.RIPX_CHECKOUT_CONVERSION_URL || '').trim() ||
    (appUrl ? `${appUrl}/api/track/checkout-conversion` : '');
  const secret = String(process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim();
  return {
    assignmentUrl,
    conversionUrl,
    secret,
  };
}

function readCheckoutUiExtensionConfigFile() {
  const absolutePath = path.resolve(__dirname, '../../../', CHECKOUT_UI_CONFIG_RELATIVE_PATH);
  try {
    const contents = fs.readFileSync(absolutePath, 'utf8');
    return {
      source: 'present',
      contents,
      absolutePath,
      relativePath: CHECKOUT_UI_CONFIG_RELATIVE_PATH,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        source: 'missing',
        contents: '',
        absolutePath,
        relativePath: CHECKOUT_UI_CONFIG_RELATIVE_PATH,
      };
    }
    return {
      source: 'error',
      contents: '',
      error: error?.message || 'read_failed',
      absolutePath,
      relativePath: CHECKOUT_UI_CONFIG_RELATIVE_PATH,
    };
  }
}

function buildCheckoutUiExtensionDiagnostics({
  test,
  shopDomain,
  checkoutUiConfig,
  includeBindingChecks = true,
}) {
  const envConfig = deriveCheckoutUiUrlsFromEnv();
  const source = checkoutUiConfig?.source || 'missing';
  const contents = checkoutUiConfig?.contents || '';
  const configuredTestId = parseExportedStringConstant(contents, 'RIPX_CHECKOUT_UI_TEST_ID');
  const configuredShopDomain = parseExportedStringConstant(
    contents,
    'RIPX_CHECKOUT_UI_SHOP_DOMAIN'
  );
  const configuredAssignmentUrl = parseExportedStringConstant(
    contents,
    'RIPX_CHECKOUT_ASSIGNMENT_URL'
  );
  const configuredConversionUrl = parseExportedStringConstant(
    contents,
    'RIPX_CHECKOUT_CONVERSION_URL'
  );
  const configuredSecret = parseExportedStringConstant(contents, 'RIPX_CHECKOUT_PRICE_SECRET');

  const checklist = [
    buildCheck(
      'checkout_ui_assignment_url_configured',
      Boolean(envConfig.assignmentUrl),
      'error',
      envConfig.assignmentUrl
        ? 'Checkout assignment URL is configured for the checkout UI extension.'
        : 'Set APP_URL or RIPX_CHECKOUT_ASSIGNMENT_URL so the checkout UI extension can fetch assignments.'
    ),
    buildCheck(
      'checkout_ui_conversion_url_configured',
      Boolean(envConfig.conversionUrl),
      'warning',
      envConfig.conversionUrl
        ? 'Checkout conversion URL is configured for the checkout UI extension.'
        : 'Set APP_URL or RIPX_CHECKOUT_CONVERSION_URL so the checkout UI extension can post impression/click events.'
    ),
    buildCheck(
      'checkout_ui_config_file_present',
      source === 'present',
      source === 'error' ? 'warning' : 'error',
      source === 'present'
        ? 'Checkout UI extension config file is readable.'
        : source === 'error'
          ? `Checkout UI extension config could not be read (${checkoutUiConfig?.error || 'read_failed'}).`
          : `Checkout UI extension config file is missing (${CHECKOUT_UI_CONFIG_RELATIVE_PATH}).`
    ),
  ];

  if (source === 'present') {
    checklist.push(
      buildCheck(
        'checkout_ui_assignment_url_synced',
        configuredAssignmentUrl === envConfig.assignmentUrl,
        'warning',
        configuredAssignmentUrl === envConfig.assignmentUrl
          ? 'Checkout UI assignment URL is in sync with the server config.'
          : 'Checkout UI assignment URL does not match server config. Run npm run shopify:checkout-ui:sync-config before building/deploying the extension.'
      )
    );
    checklist.push(
      buildCheck(
        'checkout_ui_conversion_url_synced',
        configuredConversionUrl === envConfig.conversionUrl,
        'warning',
        configuredConversionUrl === envConfig.conversionUrl
          ? 'Checkout UI conversion URL is in sync with the server config.'
          : 'Checkout UI conversion URL does not match server config. Run npm run shopify:checkout-ui:sync-config before building/deploying the extension.'
      )
    );
    checklist.push(
      buildCheck(
        'checkout_ui_secret_synced',
        configuredSecret === envConfig.secret,
        envConfig.secret ? 'warning' : 'ok',
        configuredSecret === envConfig.secret
          ? 'Checkout UI secret matches the server config.'
          : envConfig.secret
            ? 'Checkout UI secret does not match the server config. Sync the extension before using secured checkout endpoints.'
            : 'Checkout UI secret is unset in both the server and extension config.'
      )
    );
  }

  if (includeBindingChecks && configuredTestId) {
    checklist.push(
      buildCheck(
        'checkout_ui_default_test_matches',
        String(test?.id || '').trim() === configuredTestId,
        'warning',
        String(test?.id || '').trim() === configuredTestId
          ? 'Checkout UI default test ID matches this test.'
          : 'Checkout UI default test ID points to a different test. Fine for shared builds, but update it if this extension build should default to the current test.'
      )
    );
  }

  if (includeBindingChecks && configuredShopDomain) {
    checklist.push(
      buildCheck(
        'checkout_ui_default_shop_matches',
        normalizeDomain(shopDomain) === normalizeDomain(configuredShopDomain),
        'warning',
        normalizeDomain(shopDomain) === normalizeDomain(configuredShopDomain)
          ? 'Checkout UI default shop domain matches the current shop.'
          : 'Checkout UI default shop domain points to a different shop. Fine for shared builds, but update it if this extension build should default to the current shop.'
      )
    );
  }

  const failed = checklist.filter(item => item.ok === false);
  const errors = failed.filter(item => item.severity === 'error');
  const level = errors.length > 0 ? 'blocked' : failed.length > 0 ? 'needs_attention' : 'ready';

  return {
    checklist,
    support: {
      level,
      summary:
        level === 'ready'
          ? 'Checkout UI extension config is aligned with the current server settings.'
          : level === 'blocked'
            ? 'Checkout UI extension is missing required configuration and cannot be relied on yet.'
            : 'Checkout UI extension config is partially ready, but some values should be synced before launch.',
    },
    infrastructure: {
      assignment_url: envConfig.assignmentUrl || null,
      conversion_url: envConfig.conversionUrl || null,
      extension_config_source: source,
      extension_assignment_url: configuredAssignmentUrl || null,
      extension_conversion_url: configuredConversionUrl || null,
      extension_default_test_id: configuredTestId || null,
      extension_default_shop_domain: configuredShopDomain || null,
    },
  };
}

function buildCheckoutExperienceStoreDiagnostics({ shopDomain, checkoutUiConfig } = {}) {
  const uiDiagnostics = buildCheckoutUiExtensionDiagnostics({
    test: null,
    shopDomain,
    checkoutUiConfig: checkoutUiConfig || readCheckoutUiExtensionConfigFile(),
    includeBindingChecks: false,
  });
  const checklist = Array.isArray(uiDiagnostics?.checklist) ? uiDiagnostics.checklist : [];
  return {
    success: true,
    generated_at: new Date().toISOString(),
    shop_domain: shopDomain || null,
    summary: summarizeChecks(checklist, 'checkout experience'),
    support: {
      checkout_ui_extension: uiDiagnostics.support,
    },
    checklist,
    infrastructure: uiDiagnostics.infrastructure,
    next_steps: [
      'Run npm run shopify:checkout-ui:sync-config before building or deploying the checkout UI extension.',
      'Redeploy the checkout UI extension after config changes so assignment and conversion endpoints stay aligned.',
      'Use a saved checkout test in Test Detail to verify per-test checkout readiness after store-level setup is green.',
    ],
  };
}

async function fetchShopifyFunctions(shopDomain, accessToken) {
  const queryText = `
    query ripxShopifyFunctions {
      shopifyFunctions(first: 50) {
        nodes {
          id
          title
          apiType
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, queryText);
  return response?.data?.shopifyFunctions?.nodes || [];
}

async function fetchCartTransformsViaAdmin(shopDomain, accessToken) {
  const queryText = `
    query ripxExistingCartTransforms {
      cartTransforms(first: 20) {
        nodes {
          id
          functionId
          blockOnFailure
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, queryText);
  return response?.data?.cartTransforms?.nodes || [];
}

function isReadCartTransformsScopeError(error) {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();
  return (
    message.includes('read_cart_transforms') || message.includes('access denied for carttransforms')
  );
}

async function collectShopifyFunctionState({
  shopDomain,
  accessToken,
  shopifyFunctions,
  shopifyCartTransforms,
  cartTransformsLookupStatus,
}) {
  if (Array.isArray(shopifyFunctions)) {
    return {
      shopifyFunctions,
      shopifyCartTransforms: Array.isArray(shopifyCartTransforms) ? shopifyCartTransforms : null,
      cartTransformsLookupStatus:
        cartTransformsLookupStatus || (Array.isArray(shopifyCartTransforms) ? 'ok' : 'not_checked'),
    };
  }

  if (!accessToken) {
    return {
      shopifyFunctions: [],
      shopifyCartTransforms: null,
      cartTransformsLookupStatus: 'not_checked',
    };
  }

  let functionsList = [];
  let transformsList = null;
  let lookupStatus = 'error';

  try {
    functionsList = await fetchShopifyFunctions(shopDomain, accessToken);
  } catch {
    functionsList = [];
  }

  try {
    transformsList = await fetchCartTransformsViaAdmin(shopDomain, accessToken);
    lookupStatus = 'ok';
  } catch (error) {
    transformsList = null;
    lookupStatus = isReadCartTransformsScopeError(error) ? 'scope_missing' : 'error';
  }

  return {
    shopifyFunctions: functionsList,
    shopifyCartTransforms: transformsList,
    cartTransformsLookupStatus: lookupStatus,
  };
}

function getTypeLabel(templateKey) {
  switch (templateKey) {
    case 'pricing':
      return 'price test';
    case 'offer':
      return 'offer test';
    case 'checkout':
      return 'checkout test';
    case 'shipping':
      return 'shipping test';
    default:
      return 'test';
  }
}

function normalizeCheckoutPhase(test = {}) {
  const value = String(test?.goal?.checkout_phase || 'experience')
    .trim()
    .toLowerCase();
  return ['experience', 'payment_method', 'delivery_method'].includes(value) ? value : 'experience';
}

function collectCheckoutPhaseTargets(test = {}, key) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  return variants.reduce((count, variant, index) => {
    const isControl = index === 0 || /control/i.test(String(variant?.name || ''));
    if (isControl) {
      return count;
    }
    const cfg = variant?.config && typeof variant.config === 'object' ? variant.config : {};
    const value = cfg[key];
    const items = Array.isArray(value)
      ? value.filter(Boolean)
      : String(value || '')
          .split(/\n|,/)
          .map(item => item.trim())
          .filter(Boolean);
    return count + (items.length > 0 ? 1 : 0);
  }, 0);
}

async function buildPricingOrOfferReadiness({
  test,
  templateKey,
  shopDomain,
  accessToken,
  shopifyFunctions,
  shopifyCartTransforms,
  cartTransformsLookupStatus,
  extensionConfig,
  checkoutMethodCapabilities,
}) {
  const functionState = await collectShopifyFunctionState({
    shopDomain,
    accessToken,
    shopifyFunctions,
    shopifyCartTransforms,
    cartTransformsLookupStatus,
  });
  const priceDiagnostics = buildCheckoutPriceDiagnostics({
    shopDomain,
    runningPriceTests:
      templateKey === 'pricing' && normalizeLower(test?.status) === 'running' ? 1 : null,
    extensionConfig:
      extensionConfig || extensionConfigInputFromReadResult(readRipxCheckoutExtensionConfigFile()),
    shopifyFunctions: functionState.shopifyFunctions,
    shopifyCartTransforms: functionState.shopifyCartTransforms,
    cartTransformsLookupStatus: functionState.cartTransformsLookupStatus,
  });
  const methodCapabilities =
    checkoutMethodCapabilities || (await getCheckoutMethodCapabilitiesForDomain(shopDomain));
  const checklist = [...(priceDiagnostics.checklist || [])];

  if (templateKey === 'pricing') {
    const directPriceReady = methodCapabilities?.directPriceOverrideAvailable === true;
    checklist.push(
      buildCheck(
        'pricing_direct_price_override_ready',
        directPriceReady,
        'error',
        directPriceReady
          ? 'Direct Price Override is available for this shop.'
          : 'Direct Price Override is not ready for this shop yet. Deploy/install the RipX cart transform on a supported Plus/dev store path.'
      )
    );
  }

  checklist.push(
    buildCheck(
      'shopify_access_token_present',
      Boolean(accessToken),
      'warning',
      accessToken
        ? 'Shopify access token is available for live checkout diagnostics.'
        : 'Shopify access token is missing, so live function inventory checks may be incomplete until RipX is opened from Shopify Admin.'
    )
  );

  return {
    summary: summarizeChecks(checklist, getTypeLabel(templateKey)),
    checks: checklist,
    capabilities: {
      checkout_alignment: priceDiagnostics?.support?.checkout_alignment || null,
      direct_price_override:
        templateKey === 'pricing'
          ? {
              level:
                methodCapabilities?.directPriceOverrideAvailable === true
                  ? 'ready'
                  : methodCapabilities?.cartTransformFunctionAvailable
                    ? 'needs_attention'
                    : 'blocked',
              summary:
                methodCapabilities?.directPriceOverrideAvailable === true
                  ? 'Cart transform capability is available for direct price override.'
                  : methodCapabilities?.cartTransformFunctionAvailable
                    ? 'Cart transform exists, but install state or store eligibility still needs attention.'
                    : 'Cart transform capability is not ready on this shop.',
            }
          : null,
    },
    sources: {
      price_diagnostics: priceDiagnostics,
      checkout_methods: methodCapabilities,
    },
  };
}

async function buildCheckoutExperienceReadiness({
  test,
  shopDomain,
  checkoutUiConfig,
  accessToken,
  shopifyFunctions,
}) {
  const phase = normalizeCheckoutPhase(test);
  if (phase === 'experience') {
    const uiDiagnostics = buildCheckoutUiExtensionDiagnostics({
      test,
      shopDomain,
      checkoutUiConfig: checkoutUiConfig || readCheckoutUiExtensionConfigFile(),
    });
    return {
      summary: summarizeChecks(uiDiagnostics.checklist || [], getTypeLabel('checkout')),
      checks: uiDiagnostics.checklist || [],
      capabilities: {
        checkout_ui_extension: uiDiagnostics.support,
        checkout_phase: {
          level: 'ready',
          summary: 'Experience block phase is selected for this checkout test.',
        },
      },
      sources: {
        checkout_ui: uiDiagnostics.infrastructure,
        checkout_phase: phase,
      },
    };
  }

  const functionsList =
    Array.isArray(shopifyFunctions) && shopifyFunctions.length > 0
      ? shopifyFunctions
      : accessToken
        ? await fetchShopifyFunctions(shopDomain, accessToken).catch(() => [])
        : [];
  const targetKey = phase === 'payment_method' ? 'payment_method_names' : 'delivery_method_names';
  const configuredVariantCount = collectCheckoutPhaseTargets(test, targetKey);
  const matchingFunction = pickCustomizationFunction(functionsList, phase);
  const expectedCustomizationTitle = buildCustomizationTitle(test, phase);
  const existingCustomizations =
    accessToken && test?.id
      ? await fetchExistingCustomizations(shopDomain, accessToken, phase).catch(() => [])
      : [];
  const matchingCustomization = existingCustomizations.find(
    item => normalizeLower(item?.title) === normalizeLower(expectedCustomizationTitle)
  );
  const checklist = [
    buildCheck(
      `${phase}_variant_targets_configured`,
      configuredVariantCount > 0,
      'error',
      configuredVariantCount > 0
        ? `At least ${configuredVariantCount} non-control variant(s) target ${phase === 'payment_method' ? 'payment methods' : 'delivery methods'}.`
        : `Add target ${phase === 'payment_method' ? 'payment methods' : 'delivery methods'} to at least one non-control variant.`
    ),
    buildCheck(
      `${phase}_shopify_access_token_present`,
      Boolean(accessToken),
      'warning',
      accessToken
        ? 'Shopify access token is available for live checkout method inventory checks.'
        : 'Open RipX from Shopify Admin to refresh the shop token before relying on method customization readiness.'
    ),
    buildCheck(
      `${phase}_function_detected`,
      Boolean(matchingFunction?.id),
      'error',
      matchingFunction?.id
        ? `${phase === 'payment_method' ? 'Payment' : 'Delivery'} customization function is visible in Shopify function inventory.`
        : `No ${phase === 'payment_method' ? 'payment' : 'delivery'} customization function is detected yet. Deploy the RipX ${phase === 'payment_method' ? 'payment' : 'delivery'} customization extension before launch.`
    ),
    buildCheck(
      `${phase}_customization_applied`,
      !test?.id || Boolean(matchingCustomization?.id),
      test?.id ? 'error' : 'warning',
      test?.id
        ? matchingCustomization?.id
          ? `${phase === 'payment_method' ? 'Payment' : 'Delivery'} customization is created for this saved test.`
          : `Apply the ${phase === 'payment_method' ? 'payment' : 'delivery'} customization for this test before launch.`
        : 'Save this checkout test before checking whether the Shopify customization has been applied.'
    ),
  ];

  return {
    summary: summarizeChecks(
      checklist,
      phase === 'payment_method' ? 'payment method checkout test' : 'delivery method checkout test'
    ),
    checks: checklist,
    capabilities: {
      [phase === 'payment_method' ? 'payment_customization' : 'delivery_customization']: {
        level:
          matchingFunction?.id && (!test?.id || matchingCustomization?.id)
            ? 'ready'
            : matchingFunction?.id
              ? 'needs_attention'
              : 'blocked',
        summary: !matchingFunction?.id
          ? `${phase === 'payment_method' ? 'Payment' : 'Delivery'} customization function is not deployed for this shop yet.`
          : test?.id && !matchingCustomization?.id
            ? `${phase === 'payment_method' ? 'Payment' : 'Delivery'} customization function is present, but this test has not been applied to Shopify yet.`
            : `${phase === 'payment_method' ? 'Payment' : 'Delivery'} customization function is present for this shop.`,
      },
    },
    sources: {
      checkout_phase: phase,
      configured_variant_targets: configuredVariantCount,
      matching_function: matchingFunction
        ? {
            id: matchingFunction.id || null,
            title: matchingFunction.title || null,
            apiType: matchingFunction.apiType || null,
          }
        : null,
      matching_customization: matchingCustomization
        ? {
            id: matchingCustomization.id || null,
            title: matchingCustomization.title || null,
            enabled: matchingCustomization.enabled !== false,
            functionId: matchingCustomization.functionId || null,
          }
        : null,
    },
  };
}

async function buildShippingReadiness({
  test,
  shopDomain,
  accessToken,
  shippingCapabilityReport,
  shippingExecutionPlan,
}) {
  const urls = {
    shipping_resolve_batch_url:
      String(process.env.RIPX_SHIPPING_RESOLVE_BATCH_URL || '').trim() ||
      (process.env.APP_URL
        ? `${String(process.env.APP_URL).trim().replace(/\/+$/, '')}/api/track/shipping-resolve-batch`
        : ''),
    carrier_callback_url:
      String(process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL || '').trim() ||
      (process.env.APP_URL
        ? `${String(process.env.APP_URL).trim().replace(/\/+$/, '')}/api/track/shipping-carrier-rates`
        : ''),
  };

  const capabilityReport =
    shippingCapabilityReport ||
    (accessToken ? await buildShippingCapabilityReport(shopDomain, accessToken) : null);
  const executionPlan =
    shippingExecutionPlan ||
    (capabilityReport ? buildShippingExecutionPlan(test, capabilityReport) : null);
  const actionableVariants = Array.isArray(executionPlan?.variants)
    ? executionPlan.variants.filter(item => item?.actionable)
    : [];
  const automaticVariants = actionableVariants.filter(item => item?.execution_mode === 'automatic');
  const discountOnlyVariants = actionableVariants.filter(
    item => item?.execution_mode === 'discount_only'
  );
  const manualVariants = actionableVariants.filter(item => item?.execution_mode === 'manual');
  const carrierServiceRequired = actionableVariants.some(item => {
    const adapter = normalizeLower(item?.execution_adapter);
    return adapter === 'carrier_service' || adapter === 'delivery_customization';
  });

  const checklist = [
    buildCheck(
      'shopify_access_token_present',
      Boolean(accessToken),
      'error',
      accessToken
        ? 'Shopify access token is available for shipping capability checks.'
        : 'Open RipX from Shopify Admin to refresh the shop token before relying on shipping checkout readiness.'
    ),
    buildCheck(
      'shipping_resolve_batch_url_configured',
      Boolean(urls.shipping_resolve_batch_url),
      'error',
      urls.shipping_resolve_batch_url
        ? 'Shipping checkout resolve URL is configured.'
        : 'Set APP_URL or RIPX_SHIPPING_RESOLVE_BATCH_URL so checkout shipping resolution can call RipX.'
    ),
    buildCheck(
      'shipping_carrier_callback_configured',
      !carrierServiceRequired || Boolean(urls.carrier_callback_url),
      carrierServiceRequired ? 'warning' : 'ok',
      !carrierServiceRequired
        ? 'Carrier callback URL is optional for the current execution plan.'
        : urls.carrier_callback_url
          ? 'Carrier callback URL is configured for carrier-service execution paths.'
          : 'Carrier callback URL is not configured, so carrier-service shipping paths may need manual setup.'
    ),
    buildCheck(
      'shipping_execution_plan_ready',
      executionPlan?.plan_status === 'ready',
      'error',
      executionPlan?.plan_status === 'ready'
        ? 'Shipping execution plan is ready for actionable variants.'
        : accessToken
          ? 'Shipping execution plan still has blocked or manual-only variants.'
          : 'Shipping execution plan could not be generated yet because shop capabilities are unavailable.'
    ),
  ];

  return {
    summary: summarizeChecks(checklist, getTypeLabel('shipping')),
    checks: checklist,
    capabilities: {
      shipping_execution: {
        level:
          executionPlan?.plan_status === 'ready'
            ? 'ready'
            : executionPlan
              ? 'needs_attention'
              : 'blocked',
        summary:
          executionPlan?.plan_status === 'ready'
            ? 'Shipping execution paths are ready for checkout rollout.'
            : executionPlan
              ? 'Some shipping variants still need manual follow-up or a supported execution path.'
              : 'Shipping execution readiness could not be fully evaluated yet.',
        execution_mix: {
          automatic: automaticVariants.length,
          discount_only: discountOnlyVariants.length,
          manual: manualVariants.length,
        },
        execution_mix_summary:
          actionableVariants.length === 0
            ? 'No actionable shipping variants are configured yet.'
            : [
                automaticVariants.length > 0 ? `${automaticVariants.length} automatic` : null,
                discountOnlyVariants.length > 0
                  ? `${discountOnlyVariants.length} discount-only`
                  : null,
                manualVariants.length > 0 ? `${manualVariants.length} manual` : null,
              ]
                .filter(Boolean)
                .join(' | '),
      },
    },
    sources: {
      shipping: {
        urls,
        capability_report: capabilityReport,
        execution_plan: executionPlan,
        actionable_variant_count: actionableVariants.length,
      },
    },
  };
}

async function buildTestCheckoutReadiness({
  test,
  shopDomain,
  accessToken = '',
  shopifyFunctions,
  shopifyCartTransforms,
  cartTransformsLookupStatus,
  extensionConfig,
  checkoutUiConfig,
  shippingCapabilityReport,
  shippingExecutionPlan,
  checkoutMethodCapabilities,
} = {}) {
  if (!test || typeof test !== 'object') {
    throw new Error('test is required');
  }

  const templateKey = isShippingTestPayload(test) ? 'shipping' : normalizeTemplateKey(test);
  if (!supportsCheckoutReadiness(test)) {
    throw new Error(
      'Checkout readiness is only available for pricing, offer, checkout, or shipping tests.'
    );
  }

  let report;
  if (templateKey === 'shipping') {
    report = await buildShippingReadiness({
      test,
      shopDomain,
      accessToken,
      shippingCapabilityReport,
      shippingExecutionPlan,
    });
  } else if (templateKey === 'checkout') {
    report = await buildCheckoutExperienceReadiness({
      test,
      shopDomain,
      checkoutUiConfig,
      accessToken,
      shopifyFunctions,
    });
  } else {
    report = await buildPricingOrOfferReadiness({
      test,
      templateKey,
      shopDomain,
      accessToken,
      shopifyFunctions,
      shopifyCartTransforms,
      cartTransformsLookupStatus,
      extensionConfig,
      checkoutMethodCapabilities,
    });
  }

  return {
    success: true,
    test_id: test.id || null,
    test_name: test.name || null,
    test_type: normalizeLower(test.type) || null,
    template_key: templateKey,
    generated_at: new Date().toISOString(),
    ...report,
  };
}

module.exports = {
  CHECKOUT_UI_CONFIG_RELATIVE_PATH,
  supportsCheckoutReadiness,
  readCheckoutUiExtensionConfigFile,
  buildCheckoutUiExtensionDiagnostics,
  buildCheckoutExperienceStoreDiagnostics,
  buildTestCheckoutReadiness,
};
