/**
 * Test Routes
 *
 * API endpoints for managing AB tests
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const validators = require('../utils/validators');
const abTestEngine = require('../services/abTestEngine');

/** Validate :id param is a valid UUID */
const validateTestId = (req, res, next) => {
  const id = req.params?.id;
  if (!id || !validators.isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID format' });
  }
  next();
};
const testHealthService = require('../services/testHealthService');
const {
  createTest,
  getTestById,
  getTestsByShop,
  updateTest,
  deleteTest,
} = require('../models/test');
const { sendSuccess, sendValidationError, sendNotFound } = require('../utils/response');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../constants');
const { normalizeSegments } = require('../utils/segments');
const { enrichGoalWithTemplateKey } = require('../utils/testType');
const { getGlobalHoldoutPercent } = require('../services/experimentationPolicyService');
const notificationService = require('../services/notificationService');
const outboundWebhookService = require('../services/outboundWebhookService');
const { scheduleTestJobs } = require('../jobs/scheduledTestsProcessor');
const auditLogService = require('../services/auditLogService');
const conflictDetectionService = require('../services/conflictDetectionService');
const personalizationService = require('../services/personalizationService');
const {
  parseActivationStartOptions,
  applyActivationStartOptionsToTest,
  runActivationPreflight,
} = require('../services/testActivationService');
const {
  normalizeShippingTestPayload,
  normalizeShippingVariantConfig,
  isShippingTestPayload,
  summarizeShippingConfigNormalization,
} = require('../services/shippingTestConfigService');
const {
  normalizeCheckoutExperienceTestPayload,
} = require('../services/checkoutExperienceConfigService');
const { buildShippingCapabilityReport } = require('../services/shippingCapabilityPlanner');
const { buildShippingCurrentSetupReport } = require('../services/shippingCurrentSetupService');
const { buildShippingExecutionPlan } = require('../services/shippingExecutionPlanner');
const {
  getShippingCarrierCallbackTrace,
} = require('../services/shippingCarrierCallbackTraceService');
const { buildShippingPreviewDebugChecklist } = require('../services/shippingPreviewDebugService');
const { buildShippingLiveDebugReport } = require('../services/shippingLiveDebugService');
const {
  executeShippingTestPlan,
  cleanupManagedShippingResources,
  compareShippingCarrierCallbackUrls,
  fetchCarrierServicesViaAdmin,
  syncLiveCarrierCallbacksForTest,
} = require('../services/shippingAutoExecutionService');
const {
  buildTestCheckoutReadiness,
  supportsCheckoutReadiness,
} = require('../services/checkoutReadinessService');
const {
  ensureCheckoutCustomizationDeployment,
  isCheckoutCustomizationPhase,
} = require('../services/checkoutCustomizationDeploymentService');
const { getTestAnalytics, getBatchVariantMetrics } = require('../models/analytics');
const { normalizeDomain } = require('../models/tenant');
const { getShopSession } = require('../models/shopSession');
const shopifyService = require('../services/shopifyService');
const { shouldRequireSignedAssignment } = require('../utils/priceAssignmentSignature');
const logger = require('../utils/logger');
const {
  resolveTemplateKeyFromPayload,
  getResolvedTestTypeRule,
} = require('../services/testTypeControlService');
const experimentPlannerService = require('../services/experimentPlannerService');

async function ensureTemplateTypeEnabledOrThrow(payload, shopDomain) {
  const templateKey = resolveTemplateKeyFromPayload(payload);
  if (!templateKey) {
    return null;
  }
  const resolvedType = await getResolvedTestTypeRule(templateKey, { domain: shopDomain });
  if (!resolvedType || resolvedType.effective.enabled) {
    return templateKey;
  }
  const fallbackLabel = templateKey === 'pricing' ? 'Pricing' : templateKey;
  const message =
    resolvedType.effective.message ||
    `${resolvedType.label || fallbackLabel} test type is currently unavailable.`;
  const err = new Error(message);
  err.statusCode = HTTP_STATUS.BAD_REQUEST;
  err.isValidation = true;
  throw err;
}

function isPriceTestPayload(payload) {
  const type = String(payload?.type || '')
    .trim()
    .toLowerCase();
  if (type === 'price' || type === 'pricing') {
    return true;
  }
  const templateKey = String(
    payload?.goal?.template_key || resolveTemplateKeyFromPayload(payload) || ''
  )
    .trim()
    .toLowerCase();
  return templateKey === 'price' || templateKey === 'pricing';
}

function forceDirectPriceConfig(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }
  const next = { ...config, priceApplicationMethod: 'direct_price_override' };
  if (next.byProduct && typeof next.byProduct === 'object') {
    next.byProduct = Object.fromEntries(
      Object.entries(next.byProduct).map(([productId, productConfig]) => [
        productId,
        forceDirectPriceConfig(productConfig),
      ])
    );
  }
  if (next.byVariant && typeof next.byVariant === 'object') {
    next.byVariant = Object.fromEntries(
      Object.entries(next.byVariant).map(([variantId, variantConfig]) => [
        variantId,
        forceDirectPriceConfig(variantConfig),
      ])
    );
  }
  return next;
}

function normalizePriceTestDirectOverride(payload) {
  if (!isPriceTestPayload(payload) || !Array.isArray(payload?.variants)) {
    return payload;
  }
  return {
    ...payload,
    variants: payload.variants.map(variant => {
      if (!variant || typeof variant !== 'object') {
        return variant;
      }
      return {
        ...variant,
        config: forceDirectPriceConfig(variant.config || {}),
      };
    }),
  };
}

function normalizeHoldout(value) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return { error: 'Holdout percent must be a number' };
  }
  return { value: parsed };
}

const DRAFT_TEST_TYPES = new Set([
  'price',
  'pricing',
  'content',
  'shipping',
  'offer',
  'theme',
  'checkout',
  'combination',
  'template',
  'split-url',
  'onsite-edit',
]);
const MAX_TEST_VARIANTS = 10;

function normalizeDraftTestType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return { type: 'content' };
  }
  if (!DRAFT_TEST_TYPES.has(normalized)) {
    return { error: `Unsupported draft test type: ${normalized}` };
  }
  return { type: normalized };
}

function getDraftTypeLabel(type) {
  const normalized = normalizeDraftTestType(type).type || 'content';
  if (normalized === 'onsite-edit') {
    return 'onsite edit';
  }
  if (normalized === 'split-url') {
    return 'split URL';
  }
  if (normalized === 'pricing') {
    return 'price';
  }
  return normalized || 'experiment';
}

function getDefaultDraftVariants(type) {
  const normalizedType = normalizeDraftTestType(type).type || 'content';
  if (normalizedType === 'shipping') {
    return [
      { name: 'Control', allocation: 50, config: { strategy: 'control' } },
      { name: 'Variant A', allocation: 50, config: {} },
    ];
  }
  return [
    { name: 'Control', allocation: 50, config: {} },
    { name: 'Variant A', allocation: 50, config: {} },
  ];
}

function normalizeDraftVariants(input, type) {
  const source = Array.isArray(input) && input.length > 0 ? input : getDefaultDraftVariants(type);
  return source.filter(Boolean).map((variant, index) => {
    const name =
      String(variant?.name || '').trim() ||
      (index === 0 ? 'Control' : `Variant ${String.fromCharCode(64 + Math.min(index, 26))}`);
    const config =
      variant?.config && typeof variant.config === 'object' && !Array.isArray(variant.config)
        ? variant.config
        : {};
    return {
      ...variant,
      name,
      allocation: Number(variant?.allocation) || 0,
      config,
    };
  });
}

function mergeIncomingDraftVariants(existingTest, incomingVariants) {
  if (!existingTest || !Array.isArray(existingTest.variants) || !Array.isArray(incomingVariants)) {
    return incomingVariants;
  }

  const consumedExistingIndices = new Set();
  return incomingVariants.map((incomingVariant, incomingIndex) => {
    const matchIndex = existingTest.variants.findIndex((existingVariant, existingIndex) => {
      if (consumedExistingIndices.has(existingIndex)) {
        return false;
      }
      if (
        incomingVariant?.id &&
        existingVariant?.id &&
        String(incomingVariant.id) === String(existingVariant.id)
      ) {
        return true;
      }
      if (
        incomingVariant?.name &&
        existingVariant?.name &&
        String(incomingVariant.name) === String(existingVariant.name)
      ) {
        return true;
      }
      return existingIndex === incomingIndex;
    });

    const existingVariant = matchIndex >= 0 ? existingTest.variants[matchIndex] : null;
    if (matchIndex >= 0) {
      consumedExistingIndices.add(matchIndex);
    }

    const hasCodeProp = Object.prototype.hasOwnProperty.call(incomingVariant || {}, 'code');
    const nextCode = hasCodeProp
      ? incomingVariant.code
      : existingVariant
        ? existingVariant.code
        : undefined;
    const nextConfig = incomingVariant?.config
      ? { ...(existingVariant?.config || {}), ...incomingVariant.config }
      : existingVariant?.config || {};

    return {
      ...(existingVariant || {}),
      ...(incomingVariant || {}),
      ...(nextCode !== undefined ? { code: nextCode } : {}),
      ...(Object.keys(nextConfig).length > 0 ? { config: nextConfig } : {}),
    };
  });
}

function normalizeDraftTestPayload(rawPayload, shopDomain, existingTest = null) {
  const raw = rawPayload && typeof rawPayload === 'object' ? { ...rawPayload } : {};
  const typeResult = normalizeDraftTestType(raw.type || existingTest?.type);
  if (typeResult.error) {
    return { errors: [typeResult.error] };
  }
  const type = typeResult.type;
  if (Array.isArray(raw.variants) && raw.variants.length > MAX_TEST_VARIANTS) {
    return { errors: [`A test can include at most ${MAX_TEST_VARIANTS} variants`] };
  }
  const name = String(raw.name || '').trim() || `Untitled ${getDraftTypeLabel(type)} test`;
  const description =
    raw.description === null || raw.description === undefined
      ? null
      : String(raw.description).trim() || null;

  const draft = {
    ...raw,
    shop_domain: shopDomain,
    status: 'draft',
    name,
    description,
    type,
    goal:
      raw.goal && typeof raw.goal === 'object'
        ? { type: 'conversion', metric: 'revenue', secondary: [], ...raw.goal }
        : { type: 'conversion', metric: 'revenue', secondary: [] },
    variants: normalizeDraftVariants(raw.variants, type),
  };

  if (existingTest) {
    draft.variants = mergeIncomingDraftVariants(existingTest, draft.variants);
  }

  if (draft.segments !== undefined) {
    draft.segments = normalizeSegments(draft.segments);
  }

  if (draft.holdout_percent !== undefined) {
    const holdoutResult = normalizeHoldout(draft.holdout_percent);
    if (holdoutResult.error) {
      return { errors: [holdoutResult.error] };
    }
    draft.holdout_percent = holdoutResult.value;
  }

  if (draft.scheduled_start_at === '') {
    draft.scheduled_start_at = null;
  }
  if (draft.scheduled_stop_at === '') {
    draft.scheduled_stop_at = null;
  }
  draft.auto_start = draft.auto_start === true;
  draft.auto_stop = draft.auto_stop === true;

  let normalized = normalizeCheckoutExperienceTestPayload(normalizeShippingTestPayload(draft));
  normalized = enrichGoalWithTemplateKey(normalized);
  normalized = normalizePriceTestDirectOverride(normalized);

  return { draft: normalized, errors: [] };
}

function getExperimentGroupKey(test) {
  if (!test || typeof test !== 'object') {
    return '';
  }
  const raw = test.segments?.experiment_group ?? test.goal?.experiment_group ?? '';
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function extractVisualQaMetadata(test) {
  const goalVisualQa =
    test?.goal?.visual_qa && typeof test.goal.visual_qa === 'object' ? test.goal.visual_qa : {};
  const baselineId =
    String(goalVisualQa.baseline_id || goalVisualQa.baselineId || '').trim() || null;
  const checkedAt = String(goalVisualQa.checked_at || goalVisualQa.checkedAt || '').trim() || null;
  const required =
    goalVisualQa.required === true ||
    goalVisualQa.enabled === true ||
    test?.segments?.visual_qa_required === true;
  return {
    required: Boolean(required),
    baseline_id: baselineId,
    checked_at: checkedAt,
  };
}

function hasManagedShippingResources(test) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  return variants.some(variant => {
    const metadata =
      variant?.config?.metadata && typeof variant.config.metadata === 'object'
        ? variant.config.metadata
        : {};
    return Array.isArray(metadata.shipping_resources) && metadata.shipping_resources.length > 0;
  });
}

function resolveShippingDiagnosticsUrls() {
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const checkoutResolveUrl =
    String(process.env.RIPX_SHIPPING_RESOLVE_BATCH_URL || '').trim() ||
    (appUrl ? `${appUrl}/api/track/shipping-resolve-batch` : '');
  const carrierCallbackUrl =
    String(process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL || '').trim() ||
    (appUrl ? `${appUrl}/api/track/shipping-carrier-rates` : '');
  return {
    app_url: appUrl || null,
    shipping_resolve_batch_url: checkoutResolveUrl || null,
    carrier_callback_url: carrierCallbackUrl || null,
  };
}

function resolveUrlHost(url) {
  try {
    return new URL(String(url || '').trim()).host;
  } catch {
    return null;
  }
}

function pruneStaleStoredCarrierCallbacks(test = {}, expectedHost = null) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  const staleHosts = new Set();
  let cleanedCount = 0;

  const nextVariants = variants.map(variant => {
    const nextVariant = { ...(variant || {}) };
    const config =
      nextVariant.config && typeof nextVariant.config === 'object' ? { ...nextVariant.config } : {};
    const metadata =
      config.metadata && typeof config.metadata === 'object' ? { ...config.metadata } : {};
    const resources = Array.isArray(metadata.shipping_resources) ? metadata.shipping_resources : [];

    const filteredResources = resources.filter(resource => {
      if (!resource || typeof resource !== 'object') {
        return false;
      }
      if (String(resource.resource_type || '').trim() !== 'carrier_service') {
        return true;
      }
      const host = resolveUrlHost(resource.callback_url);
      if (!host || !expectedHost || host === expectedHost) {
        return true;
      }
      staleHosts.add(host);
      cleanedCount += 1;
      return false;
    });

    metadata.shipping_resources = filteredResources;
    config.metadata = metadata;
    nextVariant.config = config;
    return nextVariant;
  });

  return {
    variants: nextVariants,
    cleaned_count: cleanedCount,
    stale_hosts: Array.from(staleHosts),
  };
}

function createTimingTracker() {
  const startedAt = Date.now();
  const steps = [];
  return {
    async step(name, fn) {
      const label = String(name || 'unknown_step').trim() || 'unknown_step';
      const stepStartedAt = Date.now();
      try {
        const result = await fn();
        steps.push({ step: label, status: 'ok', duration_ms: Date.now() - stepStartedAt });
        return result;
      } catch (error) {
        steps.push({
          step: label,
          status: 'error',
          duration_ms: Date.now() - stepStartedAt,
          error: error?.message || 'unknown_error',
        });
        throw error;
      }
    },
    snapshot(extra = {}) {
      return {
        total_duration_ms: Date.now() - startedAt,
        steps,
        ...extra,
      };
    },
  };
}

function buildShippingLiveResourceChecks(actions = []) {
  return (Array.isArray(actions) ? actions : [])
    .filter(action => action && action.status !== 'skipped_control')
    .map(action => {
      const details = action.details && typeof action.details === 'object' ? action.details : {};
      const service =
        details.service && typeof details.service === 'object' ? details.service : null;
      const customization =
        details.customization && typeof details.customization === 'object'
          ? details.customization
          : null;
      const expectedCallback = String(details.callback_url || '').trim() || null;
      const liveCallback = String(service?.callback_url || '').trim() || null;
      const callbackMatches =
        expectedCallback && liveCallback
          ? compareShippingCarrierCallbackUrls(expectedCallback, liveCallback)
          : null;
      return {
        variant_index: action.variant_index,
        variant_name: action.variant_name || null,
        adapter: action.execution_adapter || null,
        status: action.status || null,
        message: details.message || null,
        live_resource: service
          ? {
              type: 'carrier_service',
              id: service.id ? String(service.id) : null,
              name: service.name || null,
              callback_url: liveCallback,
              expected_callback_url: expectedCallback,
              callback_matches: callbackMatches,
              service_discovery: service.service_discovery !== false,
            }
          : action.execution_adapter === 'carrier_service'
            ? {
                type: 'carrier_service_pending',
                expected_callback_url: expectedCallback,
                expected_profile_binding: details.profile_binding || null,
              }
            : customization
              ? {
                  type: 'delivery_customization',
                  id: customization.id || null,
                  title: customization.title || details.title || null,
                  enabled: customization.enabled !== false,
                  expected_config: details.config || null,
                  function: details.function || null,
                }
              : {
                  type: action.execution_adapter || 'unknown',
                  expected_callback_url: expectedCallback,
                },
      };
    });
}

async function hydrateShippingLiveResourceChecks(shopDomain, accessToken, checks = []) {
  const list = Array.isArray(checks) ? checks : [];
  const carrierChecks = list.filter(
    item => item?.live_resource?.type === 'carrier_service' && item?.live_resource?.id
  );
  if (carrierChecks.length === 0) {
    return list;
  }

  let services = [];
  try {
    services = await fetchCarrierServicesViaAdmin(shopDomain, accessToken);
  } catch (error) {
    logger.warn('Could not refresh carrier services for shipping diagnostics', {
      shopDomain,
      error: error?.message || String(error),
    });
    return list;
  }

  const servicesById = new Map(
    (Array.isArray(services) ? services : []).map(service => [String(service?.id || ''), service])
  );

  return list.map(check => {
    if (check?.live_resource?.type !== 'carrier_service') {
      return check;
    }
    const serviceId = String(check.live_resource.id || '').trim();
    const freshService = servicesById.get(serviceId);
    if (!freshService?.callback_url) {
      return check;
    }
    const expectedCallback = check.live_resource.expected_callback_url;
    const liveCallback = String(freshService.callback_url || '').trim();
    return {
      ...check,
      live_resource: {
        ...check.live_resource,
        callback_url: liveCallback,
        callback_matches: compareShippingCarrierCallbackUrls(expectedCallback, liveCallback),
      },
    };
  });
}

function buildShippingProfileBindingChecks(liveResourceChecks = [], currentSetup = null) {
  const rates = Array.isArray(currentSetup?.rates) ? currentSetup.rates : [];
  return liveResourceChecks
    .filter(item => item?.live_resource?.type === 'carrier_service' && item?.live_resource?.id)
    .map(item => {
      const resource = item.live_resource || {};
      const serviceName = String(resource.name || '')
        .trim()
        .toLowerCase();
      const callbackUrl = String(resource.callback_url || '')
        .trim()
        .toLowerCase();
      const matchingRates = rates.filter(rate => {
        const carrierName = String(rate?.carrier_service_name || '')
          .trim()
          .toLowerCase();
        const carrierCallback = String(rate?.carrier_service_callback_url || '')
          .trim()
          .toLowerCase();
        return (
          (serviceName && carrierName && serviceName === carrierName) ||
          (callbackUrl && carrierCallback && callbackUrl === carrierCallback)
        );
      });
      return {
        variant_index: item.variant_index,
        variant_name: item.variant_name || null,
        carrier_service_name: resource.name || null,
        carrier_service_callback_url: resource.callback_url || null,
        bound_to_profile_zone: matchingRates.length > 0,
        matching_rate_count: matchingRates.length,
        matches: matchingRates.slice(0, 5).map(rate => ({
          profile_id: rate.profile_id || null,
          profile_name: rate.profile_name || null,
          location_group_id: rate.profile_location_group_id || null,
          zone_id: rate.zone_id || null,
          zone_name: rate.zone_name || null,
          method_definition_id: rate.method_definition_id || null,
          rate_name: rate.name || null,
        })),
        message:
          matchingRates.length > 0
            ? 'RipX carrier service appears in at least one Shopify delivery profile/zone.'
            : 'CarrierService exists, but no matching app/carrier rate was found in Shopify delivery profiles. Shopify checkout may not call this callback until the carrier rate is attached to the selected profile/zone.',
      };
    });
}

function buildShippingVariantDisplaySummary(test = {}) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  const byVariant = variants
    .map((variant, index) => {
      const normalized = normalizeShippingVariantConfig(variant?.config || {});
      const strategy = String(normalized.strategy || 'control').toLowerCase();
      const actionable = strategy !== 'control';
      const displayMode = String(normalized.shipping_display_mode || '')
        .trim()
        .toLowerCase();
      const mode =
        displayMode === 'replace_existing_methods'
          ? 'replace_existing_methods'
          : 'add_preview_method';
      return {
        variant_index: index,
        variant_name: variant?.name || `Variant ${index + 1}`,
        strategy,
        actionable,
        display_mode: mode,
        preview_label_prefix: normalized.preview_label_prefix || null,
        configured_rate_count: Array.isArray(normalized.rates) ? normalized.rates.length : 0,
        configured_rates: (Array.isArray(normalized.rates) ? normalized.rates : [])
          .slice(0, 5)
          .map((rate, rateIndex) => ({
            name: rate?.name || null,
            description: rate?.description || '',
            delivery_promise: rate?.delivery_promise || null,
            amount: rate?.amount ?? null,
            currency: rate?.currency || null,
            priority: rate?.priority ?? rateIndex + 1,
            sort_order: rate?.sort_order ?? rate?.priority ?? rateIndex + 1,
          })),
      };
    })
    .filter(item => item.actionable);
  return {
    actionable_variants: byVariant.length,
    replace_mode_variants: byVariant.filter(
      item => item.display_mode === 'replace_existing_methods'
    ).length,
    additive_mode_variants: byVariant.filter(item => item.display_mode === 'add_preview_method')
      .length,
    multi_rate_variants: byVariant.filter(item => item.configured_rate_count > 1).length,
    variants: byVariant,
  };
}

function getShippingConfigRevisionSet(test = {}) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  const revisions = new Set();
  variants.forEach(variant => {
    const config = variant?.config && typeof variant.config === 'object' ? variant.config : {};
    const metadata = config?.metadata && typeof config.metadata === 'object' ? config.metadata : {};
    const revision = String(
      metadata.shipping_config_revision || metadata.shippingConfigRevision || ''
    ).trim();
    if (revision) {
      revisions.add(revision);
    }
  });
  return revisions;
}

function buildShippingRateNameCollisionWarnings(variantDisplaySummary = {}, currentSetup = {}) {
  const nativeNames = new Set(
    (Array.isArray(currentSetup?.rates) ? currentSetup.rates : [])
      .filter(rate => rate?.rate_provider_type !== 'DeliveryParticipant')
      .map(rate =>
        String(rate?.name || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
  if (nativeNames.size === 0 || !Array.isArray(variantDisplaySummary?.variants)) {
    return [];
  }
  const warnings = [];
  variantDisplaySummary.variants.forEach(variant => {
    (variant.configured_rates || []).forEach(rate => {
      const rawName = String(rate?.name || '').trim();
      if (!rawName) {
        return;
      }
      const visibleName =
        variant.display_mode === 'replace_existing_methods'
          ? rawName
          : `${variant.preview_label_prefix || 'RipX Preview'}: ${rawName}`;
      if (nativeNames.has(visibleName.toLowerCase())) {
        warnings.push(
          `${variant.variant_name || 'Variant'} returns "${visibleName}", which matches an existing native Shopify rate name. Rename the RipX rate or native rate to avoid partial checkout rendering.`
        );
      }
    });
  });
  return warnings.slice(0, 5);
}

function stampShippingConfigRevisionOnVariants(variants = [], revision = new Date().toISOString()) {
  if (!Array.isArray(variants)) {
    return variants;
  }
  return variants.map((variant, index) => {
    const current = variant && typeof variant === 'object' ? variant : {};
    const config = current.config && typeof current.config === 'object' ? current.config : {};
    const strategy = String(config.strategy || '')
      .trim()
      .toLowerCase();
    const isControlLike =
      index === 0 ||
      /^control(\s|$)/i.test(String(current.name || '').trim()) ||
      strategy === 'control';
    if (isControlLike) {
      return current;
    }
    return {
      ...current,
      config: {
        ...config,
        metadata: {
          ...(config.metadata && typeof config.metadata === 'object' ? config.metadata : {}),
          shipping_config_revision: revision,
        },
      },
    };
  });
}

function applyExperimentGroupToSegments(payload) {
  if (!payload || typeof payload !== 'object') {
    return;
  }
  if (payload.experiment_group === undefined) {
    return;
  }
  const raw = payload.experiment_group;
  const normalized = raw === null || raw === undefined ? '' : String(raw).trim().toLowerCase();
  const nextSegments =
    payload.segments && typeof payload.segments === 'object' ? payload.segments : {};
  if (!normalized) {
    delete nextSegments.experiment_group;
  } else {
    nextSegments.experiment_group = normalized;
  }
  payload.segments = nextSegments;
  delete payload.experiment_group;
}

function buildTestReportMarkdown(report) {
  const test = report?.test || {};
  const summary = report?.analytics?.summary || {};
  const significance = report?.analytics?.significance || {};
  const quality = report?.quality || {};
  const decision = report?.decision || {};
  const riskSignals = quality?.riskSignals || {};
  const visualQa = report?.policy?.visual_qa || {};
  const variants = Array.isArray(report?.analytics?.variants) ? report.analytics.variants : [];
  const lines = [
    `# ${test.name || 'A/B Test Report'}`,
    '',
    `- Test ID: ${test.id || ''}`,
    `- Type: ${test.type || ''}`,
    `- Status: ${test.status || ''}`,
    `- Generated at: ${report.generated_at || ''}`,
    '',
    '## Summary',
    '',
    `- Visitors: ${summary.totalVisitors ?? 0}`,
    `- Conversions: ${summary.totalConversions ?? 0}`,
    `- Revenue: ${summary.totalRevenue ?? 0}`,
    '',
    '## Quality',
    '',
    `- Score: ${quality.score ?? 0}/100`,
    `- Level: ${quality.level || 'unknown'}`,
    '',
    '## Significance',
    '',
    `- Significant: ${significance.significant ? 'Yes' : 'No'}`,
    `- Confidence: ${significance.confidence ?? 0}`,
    `- Message: ${significance.message || ''}`,
    '',
    '## Risk and rollout',
    '',
    `- Risk level: ${riskSignals.level || 'unknown'}`,
    `- Rollout action: ${decision.action || quality?.rolloutRecommendation?.action || 'n/a'}`,
    `- Guidance: ${decision.message || quality?.rolloutRecommendation?.message || ''}`,
    '',
    '## Visual QA',
    '',
    `- Required: ${visualQa.required ? 'Yes' : 'No'}`,
    `- Baseline ID: ${visualQa.baseline_id || 'n/a'}`,
    `- Checked at: ${visualQa.checked_at || 'n/a'}`,
    '',
    '## Variants',
    '',
  ];
  variants.forEach(variant => {
    lines.push(
      `- ${variant.name || variant.id || 'Variant'}: ${variant.conversions || 0} conversions / ${variant.visitors || 0} visitors (${variant.conversionRate || 0}%)`
    );
  });
  if (Array.isArray(quality.recommendations) && quality.recommendations.length > 0) {
    lines.push('', '## Recommendations', '');
    quality.recommendations.forEach(item => {
      lines.push(`- ${item}`);
    });
  }
  return lines.join('\n') + '\n';
}

function isPriceLikeTestType(type) {
  const t = String(type || '')
    .trim()
    .toLowerCase();
  return t === 'price' || t === 'pricing';
}

function parseTargetIds(targetIds, targetId) {
  let ids = targetIds;
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = null;
    }
  }
  if (Array.isArray(ids)) {
    return ids.filter(Boolean).map(v => String(v));
  }
  if (targetId !== undefined && targetId !== null && String(targetId).trim() !== '') {
    return [String(targetId)];
  }
  return [];
}

function parseBooleanFlag(value) {
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'y';
}

function normalizePriceMode(config) {
  const mode = String(config?.priceMode || '')
    .trim()
    .toLowerCase();
  if (mode) {
    return mode;
  }
  if (config?.price !== undefined && config?.price !== null && String(config.price).trim() !== '') {
    return 'fixed';
  }
  if (
    config?.priceDelta !== undefined &&
    config?.priceDelta !== null &&
    String(config.priceDelta).trim() !== ''
  ) {
    return 'amount';
  }
  if (
    config?.pricePercent !== undefined &&
    config?.pricePercent !== null &&
    String(config.pricePercent).trim() !== ''
  ) {
    return 'percent';
  }
  return 'control';
}

function hasAnyPriceSignal(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }
  const mode = normalizePriceMode(config);
  if (mode === 'control') {
    return false;
  }
  if (mode === 'fixed') {
    return (
      config.price !== undefined && config.price !== null && String(config.price).trim() !== ''
    );
  }
  if (mode === 'amount') {
    return (
      config.priceDelta !== undefined &&
      config.priceDelta !== null &&
      String(config.priceDelta).trim() !== ''
    );
  }
  if (mode === 'percent') {
    return (
      config.pricePercent !== undefined &&
      config.pricePercent !== null &&
      String(config.pricePercent).trim() !== ''
    );
  }
  return false;
}

function findWinnerVariant(test, analytics) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  if (variants.length === 0) {
    return null;
  }
  const winnerIdentity = analytics?.significance?.winner;
  if (winnerIdentity !== undefined && winnerIdentity !== null) {
    const winnerKey = String(winnerIdentity).trim();
    const matched = variants.find(v => {
      if (!v) {
        return false;
      }
      const id = v.id !== undefined && v.id !== null ? String(v.id).trim() : '';
      const name = v.name !== undefined && v.name !== null ? String(v.name).trim() : '';
      return winnerKey === id || winnerKey === name;
    });
    if (matched) {
      return matched;
    }
  }

  const analyticsRows = Array.isArray(analytics?.variants) ? analytics.variants : [];
  if (analyticsRows.length > 0) {
    const best = analyticsRows
      .map(a => ({
        id: a?.id !== undefined && a?.id !== null ? String(a.id).trim() : '',
        name: a?.name !== undefined && a?.name !== null ? String(a.name).trim() : '',
        conversions: Number(a?.conversions || 0),
      }))
      .sort((a, b) => b.conversions - a.conversions)[0];
    if (best) {
      const fromAnalytics = variants.find(v => {
        const id = v?.id !== undefined && v?.id !== null ? String(v.id).trim() : '';
        const name = v?.name !== undefined && v?.name !== null ? String(v.name).trim() : '';
        return (best.id && id === best.id) || (best.name && name === best.name);
      });
      if (fromAnalytics) {
        return fromAnalytics;
      }
    }
  }

  const priced = variants.find(v => hasAnyPriceSignal(v?.config || {}));
  if (priced) {
    return priced;
  }
  return variants[0] || null;
}

async function resolveWinnerVariantForPublish(test, shopDomain, selectedVariantIndex) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  if (!variants.length) {
    return null;
  }
  if (selectedVariantIndex !== undefined && selectedVariantIndex !== null) {
    if (
      !Number.isInteger(selectedVariantIndex) ||
      selectedVariantIndex < 0 ||
      selectedVariantIndex >= variants.length
    ) {
      throw new Error('Invalid variant index');
    }
    return variants[selectedVariantIndex];
  }
  const winnerVariantId =
    test?.winner_variant_id !== undefined && test?.winner_variant_id !== null
      ? String(test.winner_variant_id)
      : '';
  if (winnerVariantId) {
    const byId = variants.find(
      v => v?.id !== undefined && v?.id !== null && String(v.id) === winnerVariantId
    );
    if (byId) {
      return byId;
    }
  }
  const winnerIndex = Number(test?.winner_variant_index);
  if (Number.isInteger(winnerIndex) && winnerIndex >= 0 && winnerIndex < variants.length) {
    return variants[winnerIndex];
  }
  let analytics = null;
  try {
    analytics = await getTestAnalytics(test.id, shopDomain);
  } catch (_err) {
    analytics = null;
  }
  return findWinnerVariant(test, analytics);
}

function csvEscape(value) {
  if (value === undefined || value === null) {
    return '';
  }
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildRolloutRows(test, winnerVariant) {
  const config =
    winnerVariant && winnerVariant.config && typeof winnerVariant.config === 'object'
      ? winnerVariant.config
      : {};
  const targetIds = parseTargetIds(test.target_ids, test.target_id);
  const globalConfig = { ...config };
  delete globalConfig.byProduct;
  delete globalConfig.byVariant;

  const common = {
    test_id: test.id,
    test_name: test.name,
    winner_variant_id:
      winnerVariant?.id !== undefined && winnerVariant?.id !== null ? String(winnerVariant.id) : '',
    winner_variant_name: winnerVariant?.name ? String(winnerVariant.name) : '',
    target_type: test.target_type || '',
    target_ids: targetIds.join('|'),
  };

  const toRow = (scope, cfg, productId = '', variantId = '') => ({
    ...common,
    scope,
    product_id: productId,
    variant_id: variantId,
    price_mode: normalizePriceMode(cfg),
    price: cfg?.price ?? '',
    price_delta: cfg?.priceDelta ?? '',
    price_percent: cfg?.pricePercent ?? '',
    price_base: cfg?.priceBase ?? '',
    round_to: cfg?.roundTo ?? '',
    price_application_method: cfg?.priceApplicationMethod ?? '',
    native_variant_id: cfg?.nativeVariantId ?? '',
  });

  const rows = [];
  if (hasAnyPriceSignal(globalConfig) || Object.keys(globalConfig).length > 0) {
    rows.push(toRow('global', globalConfig));
  }

  const byProduct =
    config.byProduct && typeof config.byProduct === 'object' ? config.byProduct : {};
  Object.entries(byProduct).forEach(([productId, productCfgRaw]) => {
    const productCfg =
      productCfgRaw && typeof productCfgRaw === 'object' ? { ...productCfgRaw } : productCfgRaw;
    if (!productCfg || typeof productCfg !== 'object') {
      return;
    }
    const byVariant =
      productCfg.byVariant && typeof productCfg.byVariant === 'object' ? productCfg.byVariant : {};
    delete productCfg.byVariant;
    const mergedProductCfg = { ...globalConfig, ...productCfg };
    rows.push(toRow('product', mergedProductCfg, productId, ''));

    Object.entries(byVariant).forEach(([variantId, variantCfgRaw]) => {
      if (!variantCfgRaw || typeof variantCfgRaw !== 'object') {
        return;
      }
      const mergedVariantCfg = { ...mergedProductCfg, ...variantCfgRaw };
      rows.push(toRow('product_variant', mergedVariantCfg, productId, variantId));
    });
  });

  const rootByVariant =
    config.byVariant && typeof config.byVariant === 'object' ? config.byVariant : {};
  Object.entries(rootByVariant).forEach(([variantId, variantCfgRaw]) => {
    if (!variantCfgRaw || typeof variantCfgRaw !== 'object') {
      return;
    }
    rows.push(toRow('variant', { ...globalConfig, ...variantCfgRaw }, '', variantId));
  });

  return rows;
}

const MAX_DIRECT_SHOPIFY_PUBLISH_PRODUCTS = 500;
const SHOPIFY_PUBLISH_SAMPLE_LIMIT = 40;

function normalizeTargetType(targetType) {
  const raw = String(targetType || '')
    .trim()
    .toLowerCase();
  if (raw === 'all_products' || raw === 'all-products') {
    return 'all-products';
  }
  return raw;
}

function toNumericProductId(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  const s = String(value).trim();
  const m = s.match(/Product\/(\d+)/i);
  if (m) {
    return m[1];
  }
  return s.replace(/\D/g, '') || s;
}

function toProductGid(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  const raw = String(value).trim();
  if (/^gid:\/\/shopify\/Product\/\d+$/i.test(raw)) {
    return raw;
  }
  const numeric = toNumericProductId(raw);
  if (numeric && /^\d+$/.test(numeric)) {
    return `gid://shopify/Product/${numeric}`;
  }
  return raw;
}

function toVariantIdKey(variantId) {
  if (variantId === undefined || variantId === null || variantId === '') {
    return null;
  }
  const s = String(variantId).trim();
  const m = s.match(/ProductVariant\/(\d+)/i) || s.match(/\b(\d{8,})\b/);
  if (m) {
    return m[1];
  }
  return s;
}

function parseRoundTo(roundTo) {
  if (roundTo === undefined || roundTo === null) {
    return 0;
  }
  const n = typeof roundTo === 'number' ? roundTo : parseFloat(String(roundTo).trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function applyRoundToUnitPrice(unitPrice, roundToVal) {
  let n = Math.max(0, Math.round(unitPrice * 100) / 100);
  if (roundToVal > 0) {
    n = Math.round(n / roundToVal) * roundToVal;
    n = Math.max(0, Math.round(n * 100) / 100);
  }
  return n;
}

function hasModeValue(cfg, mode) {
  if (!cfg || typeof cfg !== 'object') {
    return false;
  }
  const m = String(mode || '').toLowerCase();
  if (m === 'fixed') {
    return cfg.price !== null && cfg.price !== undefined && String(cfg.price).trim() !== '';
  }
  if (m === 'amount') {
    return (
      cfg.priceDelta !== null &&
      cfg.priceDelta !== undefined &&
      String(cfg.priceDelta).trim() !== ''
    );
  }
  if (m === 'percent') {
    return (
      cfg.pricePercent !== null &&
      cfg.pricePercent !== undefined &&
      String(cfg.pricePercent).trim() !== ''
    );
  }
  if (m === 'control') {
    return true;
  }
  return false;
}

function normalizeMergedPriceConfig(baseCfg, mergedCfg) {
  const base = baseCfg && typeof baseCfg === 'object' ? baseCfg : {};
  const merged = mergedCfg && typeof mergedCfg === 'object' ? { ...mergedCfg } : { ...base };
  const mergedMode = String(merged.priceMode || 'fixed').toLowerCase();
  if (hasModeValue(merged, mergedMode)) {
    return merged;
  }
  const baseMode = String(base.priceMode || 'fixed').toLowerCase();
  if (!hasModeValue(base, baseMode)) {
    return merged;
  }
  merged.priceMode = baseMode;
  if (baseMode === 'fixed') {
    merged.price = base.price;
  }
  if (baseMode === 'amount') {
    merged.priceDelta = base.priceDelta;
    merged.priceBase = base.priceBase || merged.priceBase;
  }
  if (baseMode === 'percent') {
    merged.pricePercent = base.pricePercent;
    merged.priceBase = base.priceBase || merged.priceBase;
  }
  if (
    base.roundTo !== undefined &&
    base.roundTo !== null &&
    (merged.roundTo === undefined || merged.roundTo === null)
  ) {
    merged.roundTo = base.roundTo;
  }
  return merged;
}

function getEffectivePriceConfigForPublish(cfg, productId, currentVariantId) {
  if (!cfg || typeof cfg !== 'object') {
    return cfg;
  }
  const merged = {};
  for (const k of Object.keys(cfg)) {
    if (k !== 'byProduct' && k !== 'byVariant') {
      merged[k] = cfg[k];
    }
  }

  const rootByVariant = cfg.byVariant;
  if (rootByVariant && typeof rootByVariant === 'object') {
    const vkey = toVariantIdKey(currentVariantId);
    const rootVariantOverride = vkey
      ? rootByVariant[vkey] ||
        rootByVariant[currentVariantId] ||
        rootByVariant[`gid://shopify/ProductVariant/${vkey}`]
      : null;
    if (rootVariantOverride && typeof rootVariantOverride === 'object') {
      for (const key of Object.keys(rootVariantOverride)) {
        merged[key] = rootVariantOverride[key];
      }
    }
  }

  const byProduct = cfg.byProduct;
  if (!byProduct || typeof byProduct !== 'object') {
    return normalizeMergedPriceConfig(cfg, merged);
  }
  const pid = toNumericProductId(productId);
  const gid = pid ? `gid://shopify/Product/${pid}` : '';
  const override = byProduct[productId] || byProduct[pid] || (gid ? byProduct[gid] : null);
  if (!override || typeof override !== 'object') {
    return normalizeMergedPriceConfig(cfg, merged);
  }
  for (const key of Object.keys(override)) {
    if (key !== 'byVariant') {
      merged[key] = override[key];
    }
  }
  const byVariant = override.byVariant;
  if (
    currentVariantId !== undefined &&
    currentVariantId !== null &&
    currentVariantId !== '' &&
    byVariant &&
    typeof byVariant === 'object'
  ) {
    const vkey = toVariantIdKey(currentVariantId);
    const variantOverride = vkey
      ? byVariant[vkey] ||
        byVariant[currentVariantId] ||
        byVariant[`gid://shopify/ProductVariant/${vkey}`]
      : null;
    if (variantOverride && typeof variantOverride === 'object') {
      for (const v of Object.keys(variantOverride)) {
        merged[v] = variantOverride[v];
      }
    }
  }
  return normalizeMergedPriceConfig(cfg, merged);
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = parseFloat(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function computeTargetPriceForPublish(cfg, currentPriceRaw, compareAtPriceRaw) {
  if (!cfg || typeof cfg !== 'object') {
    return { apply: false, reason: 'missing_config' };
  }
  const currentPrice = parseMoney(currentPriceRaw);
  if (!Number.isFinite(currentPrice) || currentPrice < 0) {
    return { apply: false, reason: 'invalid_current_price' };
  }

  const mode = normalizePriceMode(cfg);
  if (mode === 'control') {
    return { apply: false, reason: 'control_variant' };
  }

  const compareAt = parseMoney(compareAtPriceRaw);
  const hasCompareAt = Number.isFinite(compareAt) && compareAt > 0;
  const priceBase = String(cfg.priceBase || 'price')
    .trim()
    .toLowerCase();
  const useCompareAtBase = (mode === 'amount' || mode === 'percent') && priceBase === 'compare_at';
  if (useCompareAtBase && !hasCompareAt) {
    return { apply: false, reason: 'compare_at_unavailable' };
  }

  const basis = useCompareAtBase ? compareAt : currentPrice;
  let target = null;
  if (mode === 'fixed') {
    const fixed = parseMoney(cfg.price);
    if (!Number.isFinite(fixed)) {
      return { apply: false, reason: 'invalid_fixed_price' };
    }
    target = fixed;
  } else if (mode === 'amount') {
    const delta = parseMoney(cfg.priceDelta);
    if (!Number.isFinite(delta)) {
      return { apply: false, reason: 'invalid_price_delta' };
    }
    target = Math.max(0, basis + delta);
  } else if (mode === 'percent') {
    const pct = parseMoney(cfg.pricePercent);
    if (!Number.isFinite(pct)) {
      return { apply: false, reason: 'invalid_price_percent' };
    }
    target = Math.max(0, basis * (1 - pct / 100));
  } else {
    return { apply: false, reason: 'unknown_price_mode' };
  }

  target = applyRoundToUnitPrice(target, parseRoundTo(cfg.roundTo));
  if (!Number.isFinite(target) || target < 0) {
    return { apply: false, reason: 'invalid_target_price' };
  }
  const targetRounded = Math.round(target * 100) / 100;
  const currentRounded = Math.round(currentPrice * 100) / 100;
  if (Math.abs(targetRounded - currentRounded) < 0.001) {
    return { apply: false, reason: 'already_synced' };
  }
  return { apply: true, targetPrice: targetRounded };
}

function normalizeExcludedProductIds(segments) {
  const raw = segments?.excluded_product_ids;
  let ids = raw;
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = [];
    }
  }
  if (!Array.isArray(ids)) {
    return new Set();
  }
  const out = new Set();
  ids.forEach(item => {
    if (item === undefined || item === null || String(item).trim() === '') {
      return;
    }
    const rawId = String(item).trim();
    const numeric = toNumericProductId(rawId);
    out.add(rawId);
    if (numeric) {
      out.add(numeric);
      out.add(`gid://shopify/Product/${numeric}`);
    }
  });
  return out;
}

function isExcludedProduct(productId, excludedSet) {
  if (!excludedSet || excludedSet.size === 0) {
    return false;
  }
  const raw = String(productId || '').trim();
  const numeric = toNumericProductId(raw);
  return (
    excludedSet.has(raw) ||
    (numeric && excludedSet.has(numeric)) ||
    (numeric && excludedSet.has(`gid://shopify/Product/${numeric}`))
  );
}

function pushLimited(list, value, limit = SHOPIFY_PUBLISH_SAMPLE_LIMIT) {
  if (!Array.isArray(list)) {
    return;
  }
  if (list.length < limit) {
    list.push(value);
  }
}

async function fetchTargetProductsForPublish(test, shopDomain, accessToken) {
  const targetType = normalizeTargetType(test?.target_type);
  let productIds = [];

  if (targetType === 'product') {
    const ids = parseTargetIds(test?.target_ids, test?.target_id);
    productIds = Array.from(new Set(ids.map(toProductGid).filter(Boolean)));
    if (productIds.length === 0) {
      throw new Error('No targeted products found on this test.');
    }
  } else if (targetType === 'all-products') {
    let after = null;
    let hasNextPage = true;
    while (hasNextPage) {
      const page = await shopifyService.listProducts(shopDomain, accessToken, '', 100, after);
      const ids = Array.isArray(page?.list) ? page.list.map(p => p?.id).filter(Boolean) : [];
      productIds.push(...ids);
      if (productIds.length > MAX_DIRECT_SHOPIFY_PUBLISH_PRODUCTS) {
        throw new Error(
          `This store has more than ${MAX_DIRECT_SHOPIFY_PUBLISH_PRODUCTS} products. Use Rollout CSV for bulk catalog updates.`
        );
      }
      hasNextPage = Boolean(page?.pageInfo?.hasNextPage);
      after = page?.pageInfo?.endCursor || null;
      if (!after) {
        hasNextPage = false;
      }
    }
    productIds = Array.from(new Set(productIds.map(toProductGid).filter(Boolean)));
  } else {
    throw new Error(
      'Direct Shopify apply currently supports product-targeted or all-products price tests.'
    );
  }

  const products = [];
  const chunkSize = 8;
  for (let i = 0; i < productIds.length; i += chunkSize) {
    const batch = productIds.slice(i, i + chunkSize);
    const resolved = await Promise.all(
      batch.map(async productId => {
        const product = await shopifyService.getProductWithVariants(
          shopDomain,
          accessToken,
          productId,
          250
        );
        return product;
      })
    );
    resolved.forEach(product => {
      if (product && Array.isArray(product.variants) && product.variants.length > 0) {
        products.push(product);
      }
    });
  }
  return products;
}

async function publishWinnerPricesToShopify({
  test,
  winnerVariant,
  shopDomain,
  accessToken,
  preloadedProducts = null,
  dryRun = false,
}) {
  const winnerConfig =
    winnerVariant?.config && typeof winnerVariant.config === 'object' ? winnerVariant.config : {};
  const excludedProducts = normalizeExcludedProductIds(test?.segments);
  const products = Array.isArray(preloadedProducts)
    ? preloadedProducts
    : await fetchTargetProductsForPublish(test, shopDomain, accessToken);
  const summary = {
    products_scanned: products.length,
    products_skipped_excluded: 0,
    variants_scanned: 0,
    variants_attempted: 0,
    updated_count: 0,
    would_update_count: 0,
    skipped_count: 0,
    error_count: 0,
  };
  const samples = {
    updated: [],
    would_update: [],
    skipped: [],
    errors: [],
  };

  for (const product of products) {
    if (isExcludedProduct(product?.id, excludedProducts)) {
      summary.products_skipped_excluded += 1;
      continue;
    }
    const variants = Array.isArray(product?.variants) ? product.variants : [];
    for (const variant of variants) {
      summary.variants_scanned += 1;
      const effectiveCfg = getEffectivePriceConfigForPublish(winnerConfig, product.id, variant.id);
      const decision = computeTargetPriceForPublish(
        effectiveCfg,
        variant?.price,
        variant?.compareAtPrice
      );
      if (!decision.apply) {
        summary.skipped_count += 1;
        pushLimited(samples.skipped, {
          product_id: product.id,
          variant_id: variant?.id || null,
          reason: decision.reason,
        });
        continue;
      }
      summary.variants_attempted += 1;
      if (dryRun) {
        summary.would_update_count += 1;
        pushLimited(samples.would_update, {
          product_id: product.id,
          variant_id: variant.id,
          current_price: variant?.price ?? null,
          target_price: decision.targetPrice,
        });
        continue;
      }
      try {
        await shopifyService.updateProductPrice(
          shopDomain,
          accessToken,
          product.id,
          variant.id,
          decision.targetPrice
        );
        summary.updated_count += 1;
        pushLimited(samples.updated, {
          product_id: product.id,
          variant_id: variant.id,
          previous_price: variant?.price ?? null,
          new_price: decision.targetPrice,
        });
      } catch (error) {
        summary.error_count += 1;
        pushLimited(samples.errors, {
          product_id: product.id,
          variant_id: variant?.id || null,
          error: error?.message || 'Failed to update variant price',
        });
      }
    }
  }

  return {
    dry_run: Boolean(dryRun),
    winner_variant_id:
      winnerVariant?.id !== undefined && winnerVariant?.id !== null ? String(winnerVariant.id) : '',
    winner_variant_name: winnerVariant?.name ? String(winnerVariant.name) : '',
    summary,
    samples,
  };
}

function buildCsv(headers, rows) {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map(row => headers.map(h => csvEscape(row[h])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

function safeFileName(value) {
  const raw = String(value || 'price-test')
    .trim()
    .toLowerCase();
  const cleaned = raw
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'price-test';
}

/** Ensure test has variant_count for consistent frontend display */
function ensureVariantCount(test) {
  if (!test) {
    return test;
  }
  const variants = test.variants || [];
  test.variant_count = Array.isArray(variants)
    ? variants.filter(v => v !== null && v !== undefined).length
    : 0;
  return test;
}

/**
 * POST /api/tests
 * Create a new AB test
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    let testData = {
      ...req.body,
      shop_domain: shopDomain,
    };

    if (testData.scheduled_start_at === '') {
      testData.scheduled_start_at = null;
    }
    if (testData.scheduled_stop_at === '') {
      testData.scheduled_stop_at = null;
    }

    if (testData.description !== undefined && testData.description !== null) {
      if (typeof testData.description !== 'string') {
        return sendValidationError(res, ['Description must be a string']);
      }
      const trimmedDescription = testData.description.trim();
      testData.description = trimmedDescription.length > 0 ? trimmedDescription : null;
    }

    applyExperimentGroupToSegments(testData);

    if (testData.segments !== undefined) {
      testData.segments = normalizeSegments(testData.segments);
    }

    if (testData.holdout_percent !== undefined) {
      const holdoutResult = normalizeHoldout(testData.holdout_percent);
      if (holdoutResult.error) {
        return sendValidationError(res, [holdoutResult.error]);
      }
      testData.holdout_percent = holdoutResult.value;
    }

    testData = enrichGoalWithTemplateKey(
      normalizeCheckoutExperienceTestPayload(normalizeShippingTestPayload(testData))
    );
    testData = normalizePriceTestDirectOverride(testData);
    try {
      await ensureTemplateTypeEnabledOrThrow(testData, shopDomain);
    } catch (error) {
      if (error?.isValidation) {
        return sendValidationError(res, [error.message]);
      }
      throw error;
    }

    logger.info('Creating test', {
      shopDomain,
      type: testData.type,
      name: testData.name,
      hasVariants: !!testData.variants,
      variantCount: testData.variants?.length || 0,
    });

    // Validate test configuration
    const validation = abTestEngine.validateTest(testData);

    if (!validation.isValid) {
      logger.warn('Test validation failed', {
        errors: validation.errors,
        testData: { name: testData.name, type: testData.type },
      });
      return sendValidationError(res, validation.errors);
    }

    const conflicts = await conflictDetectionService.findConflicts(shopDomain, null, testData);
    if (conflicts.length > 0) {
      logger.warn('Potential test conflict', {
        newTest: testData.name,
        conflicting: conflicts.map(c => c.name),
      });
    }

    // Create test
    const test = await createTest(testData);
    ensureVariantCount(test);

    scheduleTestJobs(test);
    auditLogService.log(shopDomain, { entityType: 'test', entityId: test.id, action: 'create' });

    logger.info('Test created', { testId: test.id, shopDomain, type: test.type });

    const payload = { test };
    if (conflicts.length > 0) {
      payload.conflicts = conflicts.map(c => ({ id: c.id, name: c.name }));
      payload.warning = 'Overlapping tests may affect results';
    }
    return sendSuccess(res, HTTP_STATUS.CREATED, payload, SUCCESS_MESSAGES.TEST_CREATED);
  })
);

/**
 * POST /api/tests/drafts
 * Persist an incomplete test draft without launch-level validation.
 */
router.post(
  '/drafts',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    const { draft, errors } = normalizeDraftTestPayload(req.body || {}, shopDomain);
    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    try {
      await ensureTemplateTypeEnabledOrThrow(draft, shopDomain);
    } catch (error) {
      if (error?.isValidation) {
        return sendValidationError(res, [error.message]);
      }
      throw error;
    }

    const test = await createTest(draft);
    ensureVariantCount(test);
    auditLogService.log(shopDomain, {
      entityType: 'test',
      entityId: test.id,
      action: 'draft_create',
    });

    logger.info('Draft test created', { testId: test.id, shopDomain, type: test.type });
    return sendSuccess(res, HTTP_STATUS.CREATED, { test }, 'Draft saved successfully');
  })
);

/**
 * POST /api/tests/plan
 * Authenticated AI-planner contract. Returns a validated draft only; it never saves or launches.
 */
router.post(
  '/plan',
  asyncHandler(async (req, res) => {
    const result = experimentPlannerService.createPlannerDraft(req.body || {});
    await auditLogService.log(req.shopDomain || '__auth__', {
      entityType: 'ai_planner',
      entityId: result.draft?.type || 'draft',
      action: 'draft_created',
      userId: req.user?.id || req.userId || req.shopDomain || null,
      changes: {
        persisted: false,
        launchable: false,
        validationErrors: result.validation?.errors?.length || 0,
      },
      actorType: 'user',
      actorId: req.user?.id || req.userId || req.shopDomain || 'unknown',
      ipAddress: req.ip || req.connection?.remoteAddress,
    });
    return res.status(200).json({ success: true, ...result });
  })
);

/**
 * GET /api/tests/shipping/current-setup
 * Read the shop's configured shipping rates for draft shopper previews.
 */
router.get(
  '/shipping/current-setup',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendValidationError(res, [
        'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.',
      ]);
    }

    const currentSetup = await buildShippingCurrentSetupReport(shopDomain, accessToken);
    return sendSuccess(res, HTTP_STATUS.OK, {
      current_setup: currentSetup,
    });
  })
);

/**
 * GET /api/tests/:id/price-rollout-csv
 * Export winning price configuration as CSV for rollout/import workflows.
 */
router.get(
  '/:id/price-rollout-csv',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isPriceLikeTestType(test.type)) {
      return sendValidationError(res, ['Rollout CSV is available only for price tests.']);
    }

    let analytics = null;
    try {
      const analyticsService = require('../services/analytics');
      analytics = await analyticsService.getTestAnalytics(id, shopDomain);
    } catch (_err) {
      analytics = null;
    }

    const winnerVariant = findWinnerVariant(test, analytics);
    if (!winnerVariant) {
      return sendValidationError(res, [
        'Could not determine a winner variant to build rollout CSV.',
      ]);
    }

    const rows = buildRolloutRows(test, winnerVariant);
    if (!rows.length) {
      return sendValidationError(res, [
        'No price configuration found on the winner variant for CSV export.',
      ]);
    }

    const headers = [
      'test_id',
      'test_name',
      'winner_variant_id',
      'winner_variant_name',
      'target_type',
      'target_ids',
      'scope',
      'product_id',
      'variant_id',
      'price_mode',
      'price',
      'price_delta',
      'price_percent',
      'price_base',
      'round_to',
      'price_application_method',
      'native_variant_id',
    ];
    const csv = buildCsv(headers, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeFileName(test.name)}-rollout-${stamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csv);
  })
);

/**
 * GET /api/tests
 * Get all tests for a shop
 */
function mergeVariantMetrics(variants, analytics) {
  if (!Array.isArray(analytics) || analytics.length === 0) {
    return variants.map(v => ({ ...v, visitors: 0, conversions: 0, revenue: 0 }));
  }
  const byId = new Map();
  const byName = new Map();
  analytics.forEach(a => {
    const id = a.variant_id !== null && a.variant_id !== undefined ? String(a.variant_id) : null;
    const name =
      a.variant_name !== null && a.variant_name !== undefined ? String(a.variant_name) : null;
    if (id) {
      byId.set(id, a);
    }
    if (name) {
      byName.set(name, a);
    }
  });
  return variants.map(v => {
    const vId =
      (v?.id ?? v?.variant_id) !== null && (v?.id ?? v?.variant_id) !== undefined
        ? String(v.id ?? v.variant_id)
        : null;
    const vName = v?.name !== null && v?.name !== undefined ? String(v.name) : null;
    const a =
      (vId && byId.get(vId)) ||
      (vName && byName.get(vName)) ||
      (vId && byName.get(vId)) ||
      (vName && byId.get(vId));
    return a
      ? {
          ...v,
          visitors: a.visitors || 0,
          conversions: a.conversions || 0,
          revenue: a.revenue || 0,
        }
      : { ...v, visitors: 0, conversions: 0, revenue: 0 };
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Normalize shop domain for consistent matching (DB stores lowercase, e.g. makripon.myshopify.com)
    const rawShop = req.shopDomain;
    const shopDomain = normalizeDomain(rawShop) || rawShop;
    const status = req.query.status || null;

    let tests = await getTestsByShop(shopDomain, status);
    // Fallback: if normalized domain returns no tests, try raw (handles legacy/custom formats)
    if (tests.length === 0 && shopDomain !== rawShop) {
      tests = await getTestsByShop(rawShop, status);
    }

    // Batch fetch variant metrics (visitors, conversions, revenue) for all tests in 2 queries
    const testIds = tests.map(t => t.id);
    const analyticsShop =
      (tests[0] && (normalizeDomain(tests[0].shop_domain) || tests[0].shop_domain)) || shopDomain;
    let batchMetrics = new Map();
    try {
      batchMetrics = await getBatchVariantMetrics(testIds, analyticsShop);
      if (batchMetrics.size === 0 && tests.length > 0 && tests[0].shop_domain !== analyticsShop) {
        batchMetrics = await getBatchVariantMetrics(
          testIds,
          (tests[0] && tests[0].shop_domain) || shopDomain
        );
      }
    } catch (batchErr) {
      logger.debug('Batch analytics skipped', { error: batchErr.message });
    }

    const testsWithAnalytics = await Promise.all(
      tests.map(async test => {
        const enriched = enrichGoalWithTemplateKey(test);
        const variants = enriched.variants || [];
        let analytics = batchMetrics.get(test.id);
        if (!analytics || analytics.length === 0) {
          const testShop = normalizeDomain(test.shop_domain) || test.shop_domain || shopDomain;
          try {
            analytics = await getTestAnalytics(test.id, testShop);
            if (!Array.isArray(analytics) || analytics.length === 0) {
              analytics = await getTestAnalytics(test.id, shopDomain);
            }
          } catch {
            analytics = null;
          }
        }
        const variantsWithMetrics = mergeVariantMetrics(variants, analytics);
        const health = testHealthService.calculateHealthScore({
          ...enriched,
          variants: variantsWithMetrics,
        });
        const variantCount = variantsWithMetrics.filter(v => v !== null && v !== undefined).length;
        const result = {
          ...enriched,
          variants: variantsWithMetrics,
          health,
          quality_score: health.score,
          variant_count: variantCount,
        };
        if (test.personalization_mode === 'rollout') {
          result.effective_rollout_percent =
            personalizationService.getEffectiveRolloutPercent(test);
        }
        return result;
      })
    );

    return sendSuccess(res, HTTP_STATUS.OK, {
      tests: testsWithAnalytics,
      count: testsWithAnalytics.length,
    });
  })
);

/**
 * GET /api/tests/:id/report?format=json|markdown
 * Generate a concise performance + quality report for sharing.
 */
router.get(
  '/:id/report',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const format = String(req.query?.format || 'json')
      .trim()
      .toLowerCase();

    if (!['json', 'markdown', 'md'].includes(format)) {
      return res.status(400).json({ success: false, error: 'format must be json or markdown' });
    }

    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!Array.isArray(test.variants)) {
      test.variants = [];
    }
    if (!test.goal || typeof test.goal !== 'object') {
      test.goal = {};
    }
    ensureVariantCount(test);

    let analytics = null;
    try {
      const analyticsService = require('../services/analytics');
      analytics = await analyticsService.getTestAnalytics(id, shopDomain);
    } catch {
      analytics = null;
    }
    const variantsWithMetrics = mergeVariantMetrics(test.variants, analytics);
    const health = testHealthService.calculateHealthScore({
      ...test,
      variants: variantsWithMetrics,
      significance: analytics?.significance || null,
    });

    const report = {
      generated_at: new Date().toISOString(),
      test: {
        id: test.id,
        name: test.name,
        type: test.type,
        status: test.status,
        target_type: test.target_type || null,
        target_id: test.target_id || null,
        target_ids: Array.isArray(test.target_ids) ? test.target_ids : [],
        started_at: test.started_at || null,
        stopped_at: test.stopped_at || null,
        created_at: test.created_at || null,
      },
      policy: {
        experiment_group: getExperimentGroupKey(test) || null,
        global_holdout_percent: await getGlobalHoldoutPercent(shopDomain),
        test_holdout_percent: Number(test.holdout_percent || 0),
        visual_qa: extractVisualQaMetadata(test),
      },
      quality: {
        score: health.score,
        level: health.healthLevel,
        color: health.healthColor,
        issues: health.issues || [],
        recommendations: health.recommendations || [],
        srm: health.srm || null,
        riskSignals: health.riskSignals || null,
        rolloutRecommendation: health.rolloutRecommendation || null,
      },
      decision: {
        action: health?.rolloutRecommendation?.action || null,
        risk_level: health?.riskSignals?.level || null,
        message: health?.rolloutRecommendation?.message || null,
        suggested_initial_percent: health?.rolloutRecommendation?.suggestedInitialPercent ?? null,
        suggested_duration_days: health?.rolloutRecommendation?.suggestedDurationDays ?? null,
      },
      analytics: {
        summary: analytics?.summary || {
          totalVisitors: 0,
          totalConversions: 0,
          totalRevenue: 0,
        },
        significance: analytics?.significance || {
          significant: false,
          pValue: 1,
          confidence: 0,
          message: 'Insufficient data',
        },
        revenueImpact: analytics?.revenueImpact || null,
        srm: analytics?.srm || null,
        variants: variantsWithMetrics || [],
      },
    };

    if (format === 'markdown' || format === 'md') {
      const markdown = buildTestReportMarkdown(report);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      return res.status(200).send(markdown);
    }
    return sendSuccess(res, HTTP_STATUS.OK, { report });
  })
);

/**
 * GET /api/tests/:id
 * Get a specific test
 */
router.get(
  '/:id',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const test = await getTestById(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    // Ensure variants and goal are properly formatted
    if (!test.variants || !Array.isArray(test.variants)) {
      test.variants = [];
    }
    if (!test.goal || typeof test.goal !== 'object') {
      test.goal = {};
    }

    // Enrich goal with template_key for display (backfill for legacy tests)
    const enriched = enrichGoalWithTemplateKey(test);
    if (enriched.goal && enriched.goal.template_key) {
      test.goal = enriched.goal;
    }

    ensureVariantCount(test);

    let variantMetrics = null;
    try {
      variantMetrics = await getTestAnalytics(id, shopDomain);
    } catch {
      variantMetrics = null;
    }
    const variantsWithMetrics = mergeVariantMetrics(
      Array.isArray(test.variants) ? test.variants : [],
      Array.isArray(variantMetrics) ? variantMetrics : []
    );
    test.variants = variantsWithMetrics;

    let analyticsReport = null;
    try {
      const analyticsService = require('../services/analytics');
      analyticsReport = await analyticsService.getTestAnalytics(id, shopDomain);
    } catch {
      analyticsReport = null;
    }

    // Calculate health score for the test
    const health = testHealthService.calculateHealthScore({
      ...test,
      variants: variantsWithMetrics,
      significance: analyticsReport?.significance || null,
    });
    test.health = health;
    test.quality_score = health.score;
    test.analytics_meta = {
      significance: analyticsReport?.significance || null,
      srm: analyticsReport?.srm || health?.srm || null,
      summary: analyticsReport?.summary || null,
    };
    if (isShippingTestPayload(test)) {
      const variants = Array.isArray(test.variants) ? test.variants : [];
      const strategy_counts = variants.reduce((acc, variant) => {
        const strategy =
          String(variant?.config?.strategy || 'control')
            .trim()
            .toLowerCase() || 'control';
        acc[strategy] = (acc[strategy] || 0) + 1;
        return acc;
      }, {});
      const profile_scoped_variants = variants.filter(variant =>
        String(variant?.config?.profile_id || '').trim()
      ).length;
      const zone_scoped_variants = variants.filter(
        variant =>
          Array.isArray(variant?.config?.zone_countries) && variant.config.zone_countries.length > 0
      ).length;
      const provider_backed_variants = variants.filter(variant => {
        const metadata =
          variant?.config?.metadata && typeof variant.config.metadata === 'object'
            ? variant.config.metadata
            : {};
        return Boolean(String(metadata.quote_provider || '').trim());
      }).length;
      test.shipping_meta = {
        strategy_counts,
        profile_scoped_variants,
        zone_scoped_variants,
        provider_backed_variants,
      };
    }

    // Add effective rollout percent for rollout tests (computed from schedule)
    if (test.personalization_mode === 'rollout') {
      test.effective_rollout_percent = personalizationService.getEffectiveRolloutPercent(test);
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    return sendSuccess(res, HTTP_STATUS.OK, { test });
  })
);

/**
 * GET /api/tests/:id/checkout/readiness
 * Resolve launch readiness for pricing, offer, checkout, or shipping tests.
 */
router.get(
  '/:id/checkout/readiness',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!supportsCheckoutReadiness(test)) {
      return sendValidationError(res, [
        'Checkout readiness is available only for pricing, offer, checkout, or shipping tests.',
      ]);
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    const readiness = await buildTestCheckoutReadiness({
      test,
      shopDomain,
      accessToken,
    });

    res.set('Cache-Control', 'no-store');
    return sendSuccess(res, HTTP_STATUS.OK, readiness);
  })
);

router.post(
  '/:id/checkout/customization/ensure',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (
      String(test?.type || '')
        .trim()
        .toLowerCase() !== 'checkout' ||
      !isCheckoutCustomizationPhase(test)
    ) {
      return sendValidationError(res, [
        'Checkout customization deployment is available only for payment-method or delivery-method checkout tests.',
      ]);
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendValidationError(res, [
        'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.',
      ]);
    }

    const applyMode =
      req.body?.apply === true || req.body?.dry_run === false || req.body?.dryRun === false;
    try {
      const result = await ensureCheckoutCustomizationDeployment({
        test,
        shopDomain,
        accessToken,
        apply: applyMode,
      });
      return sendSuccess(
        res,
        HTTP_STATUS.OK,
        {
          test_id: id,
          apply_mode: applyMode ? 'apply' : 'dry_run',
          ...result,
        },
        result.message
      );
    } catch (error) {
      return sendValidationError(res, [
        error.message || 'Could not ensure checkout customization.',
      ]);
    }
  })
);

router.get(
  '/:id/shipping/capabilities',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isShippingTestPayload(test)) {
      return sendValidationError(res, [
        'Shipping capabilities are available only for shipping tests.',
      ]);
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendValidationError(res, [
        'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.',
      ]);
    }

    const capabilityReport = await buildShippingCapabilityReport(shopDomain, accessToken);
    return sendSuccess(res, HTTP_STATUS.OK, {
      test_id: id,
      capability_report: capabilityReport,
    });
  })
);

/**
 * GET /api/tests/:id/shipping/execution-plan
 * Build per-variant execution readiness based on strategy + shop capabilities.
 */
router.get(
  '/:id/shipping/execution-plan',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isShippingTestPayload(test)) {
      return sendValidationError(res, [
        'Shipping execution plan is available only for shipping tests.',
      ]);
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendValidationError(res, [
        'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.',
      ]);
    }

    const capabilityReport = await buildShippingCapabilityReport(shopDomain, accessToken);
    const executionPlan = buildShippingExecutionPlan(test, capabilityReport);
    return sendSuccess(res, HTTP_STATUS.OK, {
      test_id: id,
      capability_report: capabilityReport,
      execution_plan: executionPlan,
    });
  })
);

/**
 * GET /api/tests/:id/shipping/diagnostics
 * Shipping rollout readiness, conflicts, and operator diagnostics.
 */
router.get(
  '/:id/shipping/diagnostics',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isShippingTestPayload(test)) {
      return sendValidationError(res, [
        'Shipping diagnostics are available only for shipping tests.',
      ]);
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendValidationError(res, [
        'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.',
      ]);
    }

    const timing = createTimingTracker();
    const capabilityReport = await timing.step('build_capability_report', () =>
      buildShippingCapabilityReport(shopDomain, accessToken)
    );
    const executionPlan = await timing.step('build_execution_plan', () =>
      Promise.resolve(buildShippingExecutionPlan(test, capabilityReport))
    );
    const urls = resolveShippingDiagnosticsUrls();
    const runningTests = await timing.step('fetch_running_tests', () =>
      getTestsByShop(shopDomain, 'running')
    );
    const conflicts = (Array.isArray(runningTests) ? runningTests : [])
      .filter(item => String(item?.id || '').trim() && String(item.id) !== String(id))
      .filter(
        item =>
          String(item?.type || '')
            .trim()
            .toLowerCase() === 'shipping'
      )
      .filter(hasManagedShippingResources)
      .map(item => ({
        test_id: item.id,
        test_name: item.name || null,
      }));
    const actionableVariants = Array.isArray(executionPlan?.variants)
      ? executionPlan.variants.filter(entry => entry?.actionable)
      : [];
    const dryRunResult = await timing.step('execute_dry_run_plan', () =>
      executeShippingTestPlan({
        test,
        shopDomain,
        accessToken,
        apply: false,
      })
    );
    const currentSetup = await timing.step('fetch_current_shipping_setup', () =>
      buildShippingCurrentSetupReport(shopDomain, accessToken).catch(error => ({
        source: 'unavailable',
        profiles: [],
        rates: [],
        summary: { total_rates: 0, manual_rate_count: 0, calculated_rate_count: 0 },
        warnings: [
          `Could not read Shopify shipping profiles/zones: ${error.message || 'unknown error'}`,
        ],
        generated_at: new Date().toISOString(),
      }))
    );
    const dryRunActions = dryRunResult?.execution_result?.actions || [];
    const liveResourceChecks = await timing.step('hydrate_live_resource_checks', () =>
      hydrateShippingLiveResourceChecks(
        shopDomain,
        accessToken,
        buildShippingLiveResourceChecks(dryRunActions)
      )
    );
    const profileBindingChecks = buildShippingProfileBindingChecks(
      liveResourceChecks,
      currentSetup
    );
    const carrierChecks = liveResourceChecks.filter(
      item => item?.live_resource?.type === 'carrier_service'
    );
    const pendingCarrierChecks = liveResourceChecks.filter(
      item => item?.live_resource?.type === 'carrier_service_pending'
    );
    const deliveryCustomizationChecks = liveResourceChecks.filter(
      item => item?.live_resource?.type === 'delivery_customization'
    );
    const staleCarrierCallbacks = carrierChecks.filter(
      item => item?.live_resource?.callback_matches === false
    );
    const revisionSet = getShippingConfigRevisionSet(test);
    const rawCarrierCallbackTrace = getShippingCarrierCallbackTrace({ testId: id, limit: 20 });
    const carrierCallbackTrace = rawCarrierCallbackTrace
      .filter(entry => {
        if (revisionSet.size === 0) {
          return true;
        }
        const entryRevision = String(entry?.config_revision || '').trim();
        return entryRevision && revisionSet.has(entryRevision);
      })
      .slice(0, 10);
    const latestCarrierCallback = carrierCallbackTrace[0] || null;
    const variantDisplaySummary = buildShippingVariantDisplaySummary(test);
    const normalizationSummary = summarizeShippingConfigNormalization(test.variants || []);
    const rateNameCollisionWarnings = buildShippingRateNameCollisionWarnings(
      variantDisplaySummary,
      currentSetup
    );
    const debugChecklist = buildShippingPreviewDebugChecklist({
      testId: id,
      testStatus: test?.status || null,
      urls,
      storedShippingResources: (Array.isArray(test?.variants) ? test.variants : []).flatMap(
        variant => {
          const resources = variant?.config?.metadata?.shipping_resources;
          return Array.isArray(resources) ? resources : [];
        }
      ),
      readiness: {
        carrier_callback_configured: Boolean(urls.carrier_callback_url),
        shipping_checkout_resolve_configured: Boolean(urls.shipping_resolve_batch_url),
        assignment_signature_required: shouldRequireSignedAssignment(),
        running_shipping_conflicts: conflicts.length,
        live_carrier_services_found: carrierChecks.filter(item => item.live_resource?.id).length,
        pending_carrier_services: pendingCarrierChecks.length,
        live_delivery_customizations_found: deliveryCustomizationChecks.filter(
          item => item.live_resource?.id
        ).length,
        stale_carrier_callbacks: staleCarrierCallbacks.length,
        carrier_profile_bindings_found: profileBindingChecks.filter(
          item => item.bound_to_profile_zone
        ).length,
        missing_carrier_profile_bindings: profileBindingChecks.filter(
          item => !item.bound_to_profile_zone
        ).length,
        latest_carrier_callback_seen: Boolean(latestCarrierCallback),
        latest_carrier_callback_at: latestCarrierCallback?.at || null,
        latest_carrier_callback_rates_count: latestCarrierCallback?.rates_count ?? null,
        latest_carrier_callback_rates: latestCarrierCallback?.rates || [],
        rate_name_collision_warnings: rateNameCollisionWarnings.length,
        replace_mode_variants: variantDisplaySummary.replace_mode_variants,
        additive_mode_variants: variantDisplaySummary.additive_mode_variants,
        multi_rate_variants: variantDisplaySummary.multi_rate_variants,
      },
      liveResourceChecks,
      carrierCallbackTrace,
    });

    const timingSnapshot = timing.snapshot({
      test_id: id,
      action_count: Array.isArray(dryRunActions) ? dryRunActions.length : 0,
      conflict_count: conflicts.length,
    });
    logger.info('Shipping diagnostics timing', {
      testId: id,
      shopDomain,
      timing: timingSnapshot,
      normalizationSummary,
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      test_id: id,
      capability_report: capabilityReport,
      execution_plan: executionPlan,
      diagnostics: {
        generated_at: new Date().toISOString(),
        timing: timingSnapshot,
        readiness: {
          carrier_callback_configured: Boolean(urls.carrier_callback_url),
          shipping_checkout_resolve_configured: Boolean(urls.shipping_resolve_batch_url),
          assignment_signature_required: shouldRequireSignedAssignment(),
          running_shipping_conflicts: conflicts.length,
          live_carrier_services_found: carrierChecks.filter(item => item.live_resource?.id).length,
          pending_carrier_services: pendingCarrierChecks.length,
          live_delivery_customizations_found: deliveryCustomizationChecks.filter(
            item => item.live_resource?.id
          ).length,
          stale_carrier_callbacks: staleCarrierCallbacks.length,
          carrier_profile_bindings_found: profileBindingChecks.filter(
            item => item.bound_to_profile_zone
          ).length,
          missing_carrier_profile_bindings: profileBindingChecks.filter(
            item => !item.bound_to_profile_zone
          ).length,
          latest_carrier_callback_seen: Boolean(latestCarrierCallback),
          latest_carrier_callback_at: latestCarrierCallback?.at || null,
          latest_carrier_callback_rates_count: latestCarrierCallback?.rates_count ?? null,
          latest_carrier_callback_rates: latestCarrierCallback?.rates || [],
          rate_name_collision_warnings: rateNameCollisionWarnings.length,
          replace_mode_variants: variantDisplaySummary.replace_mode_variants,
          additive_mode_variants: variantDisplaySummary.additive_mode_variants,
          multi_rate_variants: variantDisplaySummary.multi_rate_variants,
        },
        urls,
        current_setup: {
          source: currentSetup.source,
          summary: currentSetup.summary,
          warnings: [...(currentSetup.warnings || []), ...rateNameCollisionWarnings],
          profile_count: Array.isArray(currentSetup.profiles) ? currentSetup.profiles.length : 0,
          rate_count: Array.isArray(currentSetup.rates) ? currentSetup.rates.length : 0,
        },
        live_resource_checks: liveResourceChecks,
        profile_binding_checks: profileBindingChecks,
        variant_display_summary: variantDisplaySummary,
        normalization_summary: normalizationSummary,
        carrier_callback_trace: carrierCallbackTrace,
        debug_checklist: debugChecklist,
        dry_run_summary: dryRunResult?.execution_result?.summary || null,
        assignment_visibility: {
          required_line_attributes: [
            '_ripx_price_test',
            '_ripx_variant',
            '_ripx_shop',
            '_ripx_assignment_sig',
            '_ripx_assignment_ts',
            '_ripx_assignment_user',
          ],
          note: 'Shipping checkout discount resolution reads the same signed cart-line assignment markers used by price checkout.',
        },
        actionable_variant_count: actionableVariants.length,
        conflicts,
      },
    });
  })
);

/**
 * POST /api/tests/:id/shipping/cleanup-stale-callbacks
 * Remove stale callback host refs from saved shipping metadata.
 */
router.post(
  '/:id/shipping/cleanup-stale-callbacks',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isShippingTestPayload(test)) {
      return sendValidationError(res, ['Shipping cleanup is available only for shipping tests.']);
    }

    const urls = resolveShippingDiagnosticsUrls();
    const currentHost = resolveUrlHost(urls.carrier_callback_url || urls.app_url);
    if (!currentHost) {
      return sendValidationError(res, [
        'Could not resolve current callback host from RIPX_SHIPPING_CARRIER_CALLBACK_URL or APP_URL.',
      ]);
    }

    const dryRun = parseBooleanFlag(req.body?.dry_run ?? req.body?.dryRun);
    const syncLive =
      req.body?.sync_live === undefined ? true : parseBooleanFlag(req.body?.sync_live);
    const rawVariantIndex = req.body?.variantIndex ?? req.body?.variant_index;
    let variantIndex = null;
    if (
      rawVariantIndex !== undefined &&
      rawVariantIndex !== null &&
      String(rawVariantIndex).trim()
    ) {
      const parsedIndex = Number(rawVariantIndex);
      if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
        return sendValidationError(res, [
          'variantIndex must be a non-negative integer when provided.',
        ]);
      }
      variantIndex = parsedIndex;
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    let liveSync = null;
    if (!dryRun && syncLive && accessToken) {
      liveSync = await syncLiveCarrierCallbacksForTest({
        test,
        shopDomain,
        accessToken,
        variantIndex,
        apply: true,
      });
    }

    const cleanup = pruneStaleStoredCarrierCallbacks(test, currentHost);
    let persistedVariants = cleanup.variants;
    if (!dryRun && accessToken && (liveSync?.synced_count > 0 || cleanup.cleaned_count > 0)) {
      const executeResult = await executeShippingTestPlan({
        test: { ...test, variants: cleanup.variants },
        shopDomain,
        accessToken,
        apply: true,
        variantIndex,
      });
      persistedVariants = executeResult?.persisted_variants || cleanup.variants;
      await updateTest(id, shopDomain, { variants: persistedVariants });
    }

    const responseData = {
      test_id: id,
      dry_run: dryRun,
      current_callback_host: currentHost,
      cleaned_count: cleanup.cleaned_count,
      stale_hosts: cleanup.stale_hosts,
      live_sync: liveSync,
    };

    const message =
      dryRun && cleanup.cleaned_count > 0
        ? `Dry run complete. ${cleanup.cleaned_count} stale callback reference(s) would be removed.`
        : liveSync?.synced_count > 0 && cleanup.cleaned_count > 0
          ? `Synced ${liveSync.synced_count} live carrier callback(s) and removed ${cleanup.cleaned_count} stale metadata reference(s).`
          : liveSync?.synced_count > 0
            ? `Synced ${liveSync.synced_count} live carrier callback(s) to ${currentHost}.`
            : cleanup.cleaned_count > 0
              ? `Removed ${cleanup.cleaned_count} stale callback reference(s) from saved shipping metadata.`
              : 'No stale callback references found in saved shipping metadata.';

    return sendSuccess(res, HTTP_STATUS.OK, responseData, message);
  })
);

/**
 * GET /api/tests/:id/shipping/live-debug
 * Deep shipping checkout debug report with live Shopify carrier state and callback probe.
 */
router.get(
  '/:id/shipping/live-debug',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isShippingTestPayload(test)) {
      return sendValidationError(res, [
        'Shipping live debug is available only for shipping tests.',
      ]);
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendValidationError(res, [
        'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.',
      ]);
    }

    const capabilityReport = await buildShippingCapabilityReport(shopDomain, accessToken);
    const executionPlan = buildShippingExecutionPlan(test, capabilityReport);
    const dryRunResult = await executeShippingTestPlan({
      test,
      shopDomain,
      accessToken,
      apply: false,
    });
    const dryRunActions = dryRunResult?.execution_result?.actions || [];
    const liveResourceChecks = await hydrateShippingLiveResourceChecks(
      shopDomain,
      accessToken,
      buildShippingLiveResourceChecks(dryRunActions)
    );
    const carrierChecks = liveResourceChecks.filter(
      item => item?.live_resource?.type === 'carrier_service'
    );
    const staleCarrierCallbacks = carrierChecks.filter(
      item => item?.live_resource?.callback_matches === false
    );
    const carrierCallbackTrace = getShippingCarrierCallbackTrace({ testId: id, limit: 10 });
    const latestCarrierCallback = carrierCallbackTrace[0] || null;

    const report = await buildShippingLiveDebugReport({
      test,
      shopDomain,
      accessToken,
      liveResourceChecks,
      carrierCallbackTrace,
      readiness: {
        live_carrier_services_found: carrierChecks.filter(item => item.live_resource?.id).length,
        stale_carrier_callbacks: staleCarrierCallbacks.length,
        latest_carrier_callback_seen: Boolean(latestCarrierCallback),
        latest_carrier_callback_at: latestCarrierCallback?.at || null,
        latest_carrier_callback_rates_count: latestCarrierCallback?.rates_count ?? null,
      },
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      test_id: id,
      execution_plan: executionPlan,
      live_debug: report,
    });
  })
);

/**
 * POST /api/tests/:id/shipping/execute
 * Execute shipping adapter actions in dry-run or apply mode.
 */
router.post(
  '/:id/shipping/execute',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isShippingTestPayload(test)) {
      return sendValidationError(res, ['Shipping execution is available only for shipping tests.']);
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendValidationError(res, [
        'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.',
      ]);
    }

    const explicitDryRun = req.body?.dry_run ?? req.body?.dryRun;
    const explicitApply = req.body?.apply;
    let applyMode = parseBooleanFlag(explicitApply);
    if (explicitDryRun !== undefined && explicitDryRun !== null && explicitDryRun !== '') {
      const dryRun = parseBooleanFlag(explicitDryRun);
      applyMode = !dryRun;
    }

    const rawVariantIndex = req.body?.variantIndex ?? req.body?.variant_index;
    let variantIndex = null;
    if (
      rawVariantIndex !== undefined &&
      rawVariantIndex !== null &&
      String(rawVariantIndex).trim()
    ) {
      const parsedIndex = Number(rawVariantIndex);
      if (!Number.isInteger(parsedIndex) || parsedIndex < 0) {
        return sendValidationError(res, [
          'variantIndex must be a non-negative integer when provided.',
        ]);
      }
      variantIndex = parsedIndex;
    }

    const timing = createTimingTracker();
    const result = await timing.step('execute_shipping_test_plan', () =>
      executeShippingTestPlan({
        test,
        shopDomain,
        accessToken,
        apply: applyMode,
        variantIndex,
      })
    );
    if (applyMode && Array.isArray(result?.persisted_variants)) {
      await timing.step('persist_shipping_variants', () =>
        updateTest(id, shopDomain, { variants: result.persisted_variants })
      );
    }

    const failedCount = Number(result?.execution_result?.summary?.failed_count || 0);
    const manualRequiredCount = Number(
      result?.execution_result?.summary?.manual_required_count || 0
    );
    const responseMessage =
      failedCount > 0
        ? 'Shipping execution completed with some failures. Review action details.'
        : manualRequiredCount > 0
          ? 'Shipping execution completed with manual steps required. Review action details.'
          : applyMode
            ? 'Shipping execution applied successfully.'
            : 'Shipping dry-run completed successfully.';
    const timingSnapshot = timing.snapshot({
      test_id: id,
      apply_mode: applyMode ? 'apply' : 'dry_run',
      variant_index: Number.isInteger(variantIndex) ? variantIndex : null,
      failed_count: failedCount,
      manual_required_count: manualRequiredCount,
    });
    logger.info('Shipping execute timing', {
      testId: id,
      shopDomain,
      timing: timingSnapshot,
    });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      {
        test_id: id,
        apply_mode: applyMode ? 'apply' : 'dry_run',
        has_failures: failedCount > 0,
        timing: timingSnapshot,
        ...result,
      },
      responseMessage
    );
  })
);

/**
 * PUT /api/tests/:id/variants/codes
 * Update variant codes only (no validation of name/type/etc)
 */
router.put(
  '/:id/variants/codes',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variants } = req.body;

    if (!variants || !Array.isArray(variants)) {
      return sendValidationError(res, ['Variants array is required']);
    }

    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }

    const hasCode = variants.some(v => v.code && String(v.code).trim().length > 0);
    logger.info('Saving variant codes', {
      testId: id,
      shopDomain,
      variantCount: variants.length,
      hasCode,
    });

    const updatedVariants = existingTest.variants.map((existingVariant, index) => {
      const update = variants.find((v, updateIndex) => {
        if (v.id && existingVariant.id) {
          return v.id === existingVariant.id;
        }
        if (v.name && existingVariant.name) {
          return v.name === existingVariant.name;
        }
        return updateIndex === index;
      });

      if (
        update &&
        ('code' in update ||
          'customCss' in update ||
          'customJs' in update ||
          'visual_editor_rules' in update)
      ) {
        const codeValue =
          update.code !== undefined && update.code !== null
            ? String(update.code)
            : existingVariant.config && existingVariant.config.code !== undefined
              ? existingVariant.config.code
              : '';
        const customCss =
          update.customCss !== undefined && update.customCss !== null
            ? String(update.customCss)
            : existingVariant.config && existingVariant.config.customCss !== undefined
              ? existingVariant.config.customCss
              : '';
        const customJs =
          update.customJs !== undefined && update.customJs !== null
            ? String(update.customJs)
            : existingVariant.config && existingVariant.config.customJs !== undefined
              ? existingVariant.config.customJs
              : '';
        const nextConfig = {
          ...(existingVariant.config && typeof existingVariant.config === 'object'
            ? existingVariant.config
            : {}),
          code: codeValue,
          customCss: customCss || undefined,
          customJs: customJs || undefined,
        };
        if (Array.isArray(update.visual_editor_rules)) {
          nextConfig.visual_editor_rules = update.visual_editor_rules
            .slice(0, 5)
            .map(rule => (rule && typeof rule === 'object' ? rule : {}));
        }
        if (!nextConfig.customCss) {
          delete nextConfig.customCss;
        }
        if (!nextConfig.customJs) {
          delete nextConfig.customJs;
        }
        return {
          ...existingVariant,
          code: codeValue,
          config: nextConfig,
        };
      }
      return existingVariant;
    });

    let test = await updateTest(id, shopDomain, { variants: updatedVariants });
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    test = enrichGoalWithTemplateKey(test);
    ensureVariantCount(test);

    logger.info('Variant codes updated', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Variant codes updated successfully');
  })
);

/**
 * PUT /api/tests/:id/variants/allocation
 * Update traffic allocation for variants
 */
router.put(
  '/:id/variants/allocation',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variants } = req.body;

    if (!variants || !Array.isArray(variants)) {
      return sendValidationError(res, ['Variants array is required']);
    }

    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }

    const updatedVariants = existingTest.variants.map((existingVariant, index) => {
      const update = variants.find((v, updateIndex) => {
        if (v.id && existingVariant.id) {
          return v.id === existingVariant.id;
        }
        if (v.name && existingVariant.name) {
          return v.name === existingVariant.name;
        }
        return updateIndex === index;
      });

      if (update && update.allocation !== undefined) {
        return {
          ...existingVariant,
          allocation: update.allocation,
        };
      }
      return existingVariant;
    });

    const totalAllocation = updatedVariants.reduce((sum, v) => sum + (v.allocation || 0), 0);
    if (Math.abs(totalAllocation - 100) > 0.01) {
      return sendValidationError(res, [
        `Total traffic allocation must equal 100%. Current: ${totalAllocation}%`,
      ]);
    }

    let test = await updateTest(id, shopDomain, { variants: updatedVariants });
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    test = enrichGoalWithTemplateKey(test);
    ensureVariantCount(test);

    logger.info('Traffic allocation updated', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Traffic allocation updated successfully');
  })
);

/**
 * PUT /api/tests/:id/draft
 * Update an existing incomplete draft without launch-level validation.
 */
router.put(
  '/:id/draft',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }
    if (existingTest.status !== 'draft') {
      return sendValidationError(res, ['Only draft tests can be saved as drafts']);
    }

    const { draft, errors } = normalizeDraftTestPayload(req.body || {}, shopDomain, existingTest);
    if (errors.length > 0) {
      return sendValidationError(res, errors);
    }

    try {
      await ensureTemplateTypeEnabledOrThrow(draft, shopDomain);
    } catch (error) {
      if (error?.isValidation) {
        return sendValidationError(res, [error.message]);
      }
      throw error;
    }

    let test = await updateTest(id, shopDomain, draft);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    test = enrichGoalWithTemplateKey(test);
    ensureVariantCount(test);

    auditLogService.log(shopDomain, {
      entityType: 'test',
      entityId: id,
      action: 'draft_update',
    });
    logger.info('Draft test updated', { testId: id, shopDomain, type: test.type });
    return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Draft saved successfully');
  })
);

/**
 * PUT /api/tests/:id
 * Update a test
 */
router.put(
  '/:id',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const updates = req.body && typeof req.body === 'object' ? req.body : {};

    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      return sendValidationError(res, [
        'Status changes must use the dedicated start, stop, rollout, or personalization endpoints',
      ]);
    }

    if (updates.scheduled_start_at === '') {
      updates.scheduled_start_at = null;
    }
    if (updates.scheduled_stop_at === '') {
      updates.scheduled_stop_at = null;
    }

    if (updates.description !== undefined) {
      if (updates.description !== null && typeof updates.description !== 'string') {
        return sendValidationError(res, ['Description must be a string']);
      }
      if (typeof updates.description === 'string') {
        const trimmedDescription = updates.description.trim();
        updates.description = trimmedDescription.length > 0 ? trimmedDescription : null;
      }
    }

    applyExperimentGroupToSegments(updates);

    if (updates.segments !== undefined) {
      updates.segments = normalizeSegments(updates.segments);
    }

    if (updates.holdout_percent !== undefined) {
      const holdoutResult = normalizeHoldout(updates.holdout_percent);
      if (holdoutResult.error) {
        return sendValidationError(res, [holdoutResult.error]);
      }
      updates.holdout_percent = holdoutResult.value;
    }

    // If updating test config, validate it and preserve existing code
    if (updates.variants || updates.goal || updates.type) {
      const existingTest = await getTestById(id, shopDomain);
      if (!existingTest) {
        return sendNotFound(res, 'Test');
      }

      if (updates.variants && Array.isArray(updates.variants)) {
        // Incoming variants are source of truth for edit saves. Match each incoming item to an
        // existing variant to preserve server-only fields, but do not keep unmatched existing rows.
        const consumedExistingIndices = new Set();
        const mergedVariants = updates.variants.map((incomingVariant, incomingIndex) => {
          const matchIndex = existingTest.variants.findIndex((existingVariant, existingIndex) => {
            if (consumedExistingIndices.has(existingIndex)) {
              return false;
            }
            if (
              incomingVariant?.id &&
              existingVariant?.id &&
              incomingVariant.id === existingVariant.id
            ) {
              return true;
            }
            if (
              incomingVariant?.name &&
              existingVariant?.name &&
              incomingVariant.name === existingVariant.name
            ) {
              return true;
            }
            return existingIndex === incomingIndex;
          });

          const existingVariant = matchIndex >= 0 ? existingTest.variants[matchIndex] : null;
          if (matchIndex >= 0) {
            consumedExistingIndices.add(matchIndex);
          }

          const hasCodeProp = Object.prototype.hasOwnProperty.call(incomingVariant || {}, 'code');
          const nextCode = hasCodeProp
            ? incomingVariant.code
            : existingVariant
              ? existingVariant.code
              : undefined;
          const nextConfig = incomingVariant?.config
            ? { ...(existingVariant?.config || {}), ...incomingVariant.config }
            : existingVariant?.config || {};

          return {
            ...(existingVariant || {}),
            ...(incomingVariant || {}),
            ...(nextCode !== undefined ? { code: nextCode } : {}),
            ...(Object.keys(nextConfig).length > 0 ? { config: nextConfig } : {}),
          };
        });

        // Ensure allocations are numbers (JSON may send strings)
        updates.variants = mergedVariants.map(v => ({
          ...v,
          allocation: Number(v.allocation) || 0,
        }));
      }

      if (updates.segments && typeof updates.segments === 'object') {
        const hasIncomingPriceSurfaceMappings = Object.prototype.hasOwnProperty.call(
          updates.segments,
          'price_surface_mappings'
        );
        if (!hasIncomingPriceSurfaceMappings) {
          const existingPriceSurfaceMappings = Array.isArray(
            existingTest?.segments?.price_surface_mappings
          )
            ? existingTest.segments.price_surface_mappings
            : null;
          if (existingPriceSurfaceMappings) {
            updates.segments.price_surface_mappings = existingPriceSurfaceMappings;
          }
        }
      }

      let testData = normalizeCheckoutExperienceTestPayload(
        normalizeShippingTestPayload({ ...existingTest, ...updates })
      );
      if (updates.variants && isShippingTestPayload(testData) && Array.isArray(testData.variants)) {
        testData = {
          ...testData,
          variants: stampShippingConfigRevisionOnVariants(testData.variants),
        };
      }
      testData = enrichGoalWithTemplateKey(testData);
      testData = normalizePriceTestDirectOverride(testData);
      if (Array.isArray(testData.variants)) {
        updates.variants = testData.variants;
      }
      if (testData.goal) {
        updates.goal = testData.goal;
      }
      if (testData.type && updates.type !== undefined) {
        updates.type = testData.type;
      }
      try {
        await ensureTemplateTypeEnabledOrThrow(testData, shopDomain);
      } catch (error) {
        if (error?.isValidation) {
          return sendValidationError(res, [error.message]);
        }
        throw error;
      }
      const validation = abTestEngine.validateTest(testData);

      if (!validation.isValid) {
        return sendValidationError(res, validation.errors);
      }
    }

    let test = await updateTest(id, shopDomain, updates);

    if (!test) {
      return sendNotFound(res, 'Test');
    }
    test = enrichGoalWithTemplateKey(test);
    ensureVariantCount(test);

    if (
      updates.scheduled_start_at !== undefined ||
      updates.scheduled_stop_at !== undefined ||
      updates.auto_start !== undefined ||
      updates.auto_stop !== undefined
    ) {
      scheduleTestJobs(test);
    }
    auditLogService.log(shopDomain, {
      entityType: 'test',
      entityId: id,
      action: 'update',
      changes: Object.keys(updates),
    });

    logger.info('Test updated', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, SUCCESS_MESSAGES.TEST_UPDATED);
  })
);

/**
 * DELETE /api/tests/:id
 * Delete a test
 */
router.delete(
  '/:id',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const deleted = await deleteTest(id, shopDomain);

    if (!deleted) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Test deleted', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, {}, SUCCESS_MESSAGES.TEST_DELETED);
  })
);

/**
 * GET /api/tests/:id/preflight
 * Run pre-activation checks (compatibility, conflicts, canary, guardrails)
 */
router.get(
  '/:id/preflight',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    const preflight = await runActivationPreflight(test, shopDomain);
    return sendSuccess(res, HTTP_STATUS.OK, {
      test_id: id,
      preflight,
    });
  })
);

/**
 * POST /api/tests/:id/start
 * Start a test
 */
router.post(
  '/:id/start',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }

    const startOptions = parseActivationStartOptions(req.body || {});
    if (startOptions.errors.length > 0) {
      return sendValidationError(res, startOptions.errors);
    }

    const candidateTest = applyActivationStartOptionsToTest(existingTest, startOptions);
    const preflight = await runActivationPreflight(candidateTest, shopDomain);
    if (!preflight.ok && !startOptions.force) {
      return res.status(400).json({
        success: false,
        error: 'Activation preflight failed. Resolve issues or retry with force=true.',
        preflight,
      });
    }

    const activationUpdatePayload = {};
    if (startOptions.hasCanaryOverrides && candidateTest?.segments) {
      activationUpdatePayload.segments = candidateTest.segments;
    }
    if (startOptions?.visualQa?.hasOverrides && candidateTest?.goal) {
      activationUpdatePayload.goal = candidateTest.goal;
    }
    if (Object.keys(activationUpdatePayload).length > 0) {
      await updateTest(id, shopDomain, activationUpdatePayload);
    }

    const test = await abTestEngine.startTest(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    const forceApplied = Boolean(startOptions.force && !preflight.ok);
    const canaryPercent =
      startOptions.rampPercent !== null && startOptions.rampPercent !== undefined
        ? startOptions.rampPercent
        : (candidateTest?.segments?.traffic_ramp_percent ?? null);
    const canaryDays =
      startOptions.rampDays !== null && startOptions.rampDays !== undefined
        ? startOptions.rampDays
        : (candidateTest?.segments?.traffic_ramp_days ?? null);
    auditLogService.log(shopDomain, {
      entityType: 'test',
      entityId: id,
      action: 'start',
      changes: {
        forceApplied,
        forceReason: startOptions.forceReason || null,
        preflight: {
          ok: Boolean(preflight.ok),
          errors: Array.isArray(preflight.errors) ? preflight.errors.length : 0,
          warnings: Array.isArray(preflight.warnings) ? preflight.warnings.length : 0,
        },
        canary: {
          percent: canaryPercent,
          days: canaryDays,
        },
        visualQa: startOptions?.visualQa?.hasOverrides
          ? {
              baselineId: startOptions.visualQa.baselineId || null,
              checkedAtIso: startOptions.visualQa.checkedAtIso || null,
              required:
                startOptions.visualQa.required !== null &&
                startOptions.visualQa.required !== undefined
                  ? Boolean(startOptions.visualQa.required)
                  : null,
            }
          : null,
      },
    });
    logger.info('Test started', { testId: id, shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      {
        test,
        preflight,
        activation: {
          force_applied: forceApplied,
          force_reason: startOptions.forceReason || null,
          canary_percent: canaryPercent,
          canary_days: canaryDays,
          visual_qa: {
            baseline_id:
              startOptions?.visualQa?.baselineId ||
              candidateTest?.goal?.visual_qa?.baseline_id ||
              null,
            checked_at:
              startOptions?.visualQa?.checkedAtIso ||
              candidateTest?.goal?.visual_qa?.checked_at ||
              null,
            required:
              startOptions?.visualQa?.required !== null &&
              startOptions?.visualQa?.required !== undefined
                ? Boolean(startOptions.visualQa.required)
                : Boolean(candidateTest?.goal?.visual_qa?.required),
          },
        },
      },
      SUCCESS_MESSAGES.TEST_STARTED
    );
  })
);

/**
 * POST /api/tests/:id/stop
 * Stop a test
 */
router.post(
  '/:id/stop',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const currentTest = await getTestById(id, shopDomain);

    const test = await abTestEngine.stopTest(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    let analytics = null;
    try {
      const analyticsService = require('../services/analytics');
      analytics = await analyticsService.getTestAnalytics(id, shopDomain);
      const winner = analytics?.significance?.winner
        ? analytics?.variants?.find(v => v.id === analytics.significance.winner)?.name
        : null;
      await notificationService.createInAppNotification(shopDomain, {
        type: 'test_complete',
        title: `Test complete: ${test.name}`,
        message: winner
          ? `Winner: ${winner} · Confidence: ${analytics?.significance?.confidence ?? 0}%`
          : 'Test has been stopped.',
        data: { testId: id, testName: test.name },
      });
    } catch (notifErr) {
      logger.warn('Failed to create stop notification', { testId: id, error: notifErr.message });
    }

    try {
      await outboundWebhookService.fireWebhook(shopDomain, 'test_complete', {
        testId: id,
        testName: test.name,
        analytics: analytics?.variants,
        significance: analytics?.significance,
      });
    } catch (whErr) {
      logger.warn('Outbound webhook failed', { testId: id, error: whErr.message });
    }

    if (currentTest && isShippingTestPayload(currentTest)) {
      try {
        const fallbackSession = await getShopSession(shopDomain);
        const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
        if (accessToken) {
          const cleanupResult = await cleanupManagedShippingResources({
            test: currentTest,
            shopDomain,
            accessToken,
            keepVariantIndexes: [],
          });
          if (cleanupResult.length > 0 && Array.isArray(currentTest.variants)) {
            const clearedVariants = currentTest.variants.map(variant => {
              const nextVariant = { ...(variant || {}) };
              const config =
                nextVariant.config && typeof nextVariant.config === 'object'
                  ? { ...nextVariant.config }
                  : {};
              const metadata =
                config.metadata && typeof config.metadata === 'object'
                  ? { ...config.metadata }
                  : {};
              metadata.shipping_resources = [];
              metadata.shipping_last_cleanup = {
                cleaned_at: new Date().toISOString(),
                source: 'stop_test',
              };
              config.metadata = metadata;
              nextVariant.config = config;
              return nextVariant;
            });
            await updateTest(id, shopDomain, { variants: clearedVariants });
          }
        }
      } catch (cleanupError) {
        logger.warn('Failed to clean up shipping resources on stop', {
          testId: id,
          shopDomain,
          error: cleanupError.message,
        });
      }
    }

    auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'stop' });
    logger.info('Test stopped', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, SUCCESS_MESSAGES.TEST_STOPPED);
  })
);

/**
 * POST /api/tests/:id/personalize
 * Apply winning variant to 100% of traffic
 */
router.post(
  '/:id/personalize',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variantIndex } = req.body || {};

    try {
      const test = await personalizationService.applyPersonalization(id, shopDomain, {
        variantIndex:
          variantIndex !== null && variantIndex !== undefined ? Number(variantIndex) : undefined,
      });
      auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'personalize' });
      logger.info('Personalization applied', { testId: id, shopDomain });
      return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Winner applied to 100% of traffic');
    } catch (err) {
      if (err.message?.includes('not found')) {
        return sendNotFound(res, 'Test');
      }
      if (err.message?.includes('stopped') || err.message?.includes('No winner')) {
        return sendValidationError(res, [err.message]);
      }
      throw err;
    }
  })
);

/**
 * POST /api/tests/:id/personalize/publish-shopify-prices
 * Apply winner to traffic and write winner prices to Shopify catalog.
 */
router.post(
  '/:id/personalize/publish-shopify-prices',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variantIndex } = req.body || {};
    const dryRun = parseBooleanFlag(req.body?.dry_run ?? req.body?.dryRun);

    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isPriceLikeTestType(test.type)) {
      return sendValidationError(res, [
        'Direct Shopify price publish is available only for price tests.',
      ]);
    }
    if (!dryRun && test.status !== 'stopped' && test.status !== 'completed') {
      return sendValidationError(res, [
        'Test must be stopped before publishing winner prices to Shopify.',
      ]);
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendValidationError(res, [
        'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.',
      ]);
    }

    let selectedVariantIndex;
    if (variantIndex !== undefined && variantIndex !== null && String(variantIndex).trim() !== '') {
      selectedVariantIndex = Number(variantIndex);
      if (!Number.isInteger(selectedVariantIndex) || selectedVariantIndex < 0) {
        return sendValidationError(res, ['variantIndex must be a non-negative integer']);
      }
    }

    let preloadedProducts;
    try {
      preloadedProducts = await fetchTargetProductsForPublish(test, shopDomain, accessToken);
    } catch (err) {
      if (
        err?.message?.includes('Direct Shopify apply currently supports') ||
        err?.message?.includes('No targeted products found') ||
        err?.message?.includes('Use Rollout CSV')
      ) {
        return sendValidationError(res, [err.message]);
      }
      throw err;
    }

    if (dryRun) {
      let winnerVariant = null;
      try {
        winnerVariant = await resolveWinnerVariantForPublish(
          test,
          shopDomain,
          selectedVariantIndex
        );
      } catch (err) {
        if (err?.message?.includes('Invalid variant index')) {
          return sendValidationError(res, [err.message]);
        }
        throw err;
      }
      if (!winnerVariant) {
        return sendValidationError(res, [
          'Could not determine winner variant for Shopify publish.',
        ]);
      }
      const publish = await publishWinnerPricesToShopify({
        test,
        winnerVariant,
        shopDomain,
        accessToken,
        preloadedProducts,
        dryRun: true,
      });
      return sendSuccess(
        res,
        HTTP_STATUS.OK,
        { dry_run: true, publish },
        'Preview ready. Confirm to publish winner prices to Shopify.'
      );
    }

    let personalizedTest;
    try {
      personalizedTest = await personalizationService.applyPersonalization(id, shopDomain, {
        variantIndex: selectedVariantIndex,
      });
    } catch (err) {
      if (err.message?.includes('not found')) {
        return sendNotFound(res, 'Test');
      }
      if (err.message?.includes('stopped') || err.message?.includes('No winner')) {
        return sendValidationError(res, [err.message]);
      }
      throw err;
    }

    let winnerVariant = null;
    try {
      winnerVariant = await resolveWinnerVariantForPublish(
        personalizedTest,
        shopDomain,
        selectedVariantIndex
      );
    } catch (err) {
      if (err?.message?.includes('Invalid variant index')) {
        return sendValidationError(res, [err.message]);
      }
      throw err;
    }
    if (!winnerVariant) {
      return sendValidationError(res, ['Could not determine winner variant for Shopify publish.']);
    }

    try {
      const publish = await publishWinnerPricesToShopify({
        test: personalizedTest,
        winnerVariant,
        shopDomain,
        accessToken,
        preloadedProducts,
      });
      const refreshed = await getTestById(id, shopDomain);
      ensureVariantCount(refreshed);
      auditLogService.log(shopDomain, {
        entityType: 'test',
        entityId: id,
        action: 'publish_winner_prices_shopify',
      });
      logger.info('Winner prices published to Shopify', {
        testId: id,
        shopDomain,
        updatedCount: publish?.summary?.updated_count ?? 0,
        errorCount: publish?.summary?.error_count ?? 0,
      });
      return sendSuccess(
        res,
        HTTP_STATUS.OK,
        { test: refreshed, publish },
        'Winner applied and Shopify catalog prices updated'
      );
    } catch (err) {
      if (
        err?.message?.includes('Direct Shopify apply currently supports') ||
        err?.message?.includes('No targeted products found') ||
        err?.message?.includes('Use Rollout CSV')
      ) {
        return sendValidationError(res, [err.message]);
      }
      throw err;
    }
  })
);

/**
 * POST /api/tests/:id/rollout
 * Start gradual rollout of winning variant
 */
router.post(
  '/:id/rollout',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variantIndex, initialPercent, schedule } = req.body || {};

    try {
      const test = await personalizationService.startRollout(id, shopDomain, {
        variantIndex:
          variantIndex !== null && variantIndex !== undefined ? Number(variantIndex) : undefined,
        initialPercent:
          initialPercent !== null && initialPercent !== undefined
            ? Number(initialPercent)
            : undefined,
        schedule: Array.isArray(schedule) ? schedule : undefined,
      });
      auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'rollout' });
      logger.info('Rollout started', { testId: id, shopDomain });
      return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Rollout started');
    } catch (err) {
      if (err.message?.includes('not found')) {
        return sendNotFound(res, 'Test');
      }
      if (err.message?.includes('stopped') || err.message?.includes('No winner')) {
        return sendValidationError(res, [err.message]);
      }
      throw err;
    }
  })
);

/**
 * POST /api/tests/:id/personalization/disable
 * Disable personalization/rollout
 */
router.post(
  '/:id/personalization/disable',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    try {
      const test = await personalizationService.disablePersonalization(id, shopDomain);
      auditLogService.log(shopDomain, {
        entityType: 'test',
        entityId: id,
        action: 'disable_personalization',
      });
      logger.info('Personalization disabled', { testId: id, shopDomain });
      return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Personalization disabled');
    } catch (err) {
      if (err.message?.includes('not found')) {
        return sendNotFound(res, 'Test');
      }
      throw err;
    }
  })
);

/**
 * POST /api/tests/:id/clone
 * Clone a test
 */
router.post(
  '/:id/clone',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    // Get original test and enrich goal with template_key
    const originalTest = await getTestById(id, shopDomain);

    if (!originalTest) {
      return sendNotFound(res, 'Test');
    }

    const enrichedOriginal = enrichGoalWithTemplateKey(originalTest);

    // Create cloned test (include segments, holdout, guardrail, scheduling)
    let clonedTestData = {
      shop_domain: shopDomain,
      name: `${originalTest.name} (Copy)`,
      description: originalTest.description || null,
      type: originalTest.type,
      target_type: originalTest.target_type,
      target_id: originalTest.target_id,
      target_ids: originalTest.target_ids || null,
      status: 'draft', // Always start cloned tests as draft
      goal: enrichedOriginal.goal,
      variants: originalTest.variants,
      segments: originalTest.segments || {},
      holdout_percent: originalTest.holdout_percent ?? 0,
      guardrail_config: originalTest.guardrail_config || null,
      scheduled_start_at: null,
      scheduled_stop_at: null,
      auto_start: false,
      auto_stop: false,
      timezone: originalTest.timezone || 'UTC',
    };
    clonedTestData = normalizeCheckoutExperienceTestPayload(
      normalizeShippingTestPayload(clonedTestData)
    );
    clonedTestData = enrichGoalWithTemplateKey(clonedTestData);
    clonedTestData = normalizePriceTestDirectOverride(clonedTestData);

    // Validate cloned test
    const validation = abTestEngine.validateTest(clonedTestData);
    if (!validation.isValid) {
      return sendValidationError(res, validation.errors);
    }

    const clonedTest = await createTest(clonedTestData);
    ensureVariantCount(clonedTest);

    logger.info('Test cloned', {
      originalTestId: id,
      clonedTestId: clonedTest.id,
      shopDomain,
    });

    return sendSuccess(
      res,
      HTTP_STATUS.CREATED,
      { test: clonedTest },
      SUCCESS_MESSAGES.TEST_CLONED
    );
  })
);

module.exports = router;
