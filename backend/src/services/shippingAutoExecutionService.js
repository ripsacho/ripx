const shopifyService = require('./shopifyService');
const { buildShippingCapabilityReport } = require('./shippingCapabilityPlanner');
const { buildShippingCurrentSetupReport } = require('./shippingCurrentSetupService');
const { buildShippingExecutionPlan } = require('./shippingExecutionPlanner');
const { resolveVariantProviderConfig } = require('./shippingQuoteProviderService');
const {
  isActionableShippingConfig,
  summarizeShippingConfigNormalization,
} = require('./shippingTestConfigService');
const { normalizeCheckoutDisplayConfig } = require('./shippingCarrierRateFormatter');
const { getTestsByShop } = require('../models/test');
const logger = require('../utils/logger');

const DEFAULT_SHIPPING_DISCOUNT_TITLE_PREFIX = 'RipX Shipping Test';
const DEFAULT_SHIPPING_CARRIER_TITLE_PREFIX = 'RipX Shipping';
const DEFAULT_SHIPPING_DELIVERY_TITLE_PREFIX = 'RipX Shipping Delivery';

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return Boolean(fallback);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return Boolean(fallback);
  }
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function shouldReplaceExistingRates(config = {}) {
  const displayMode = normalizeLower(
    config.shipping_display_mode || config.shippingDisplayMode || config.display_mode
  );
  if (displayMode === 'replace_existing_methods') {
    return true;
  }
  if (displayMode === 'add_preview_method') {
    return false;
  }
  return normalizeBoolean(config.replace_existing_rates ?? config.replaceExistingRates, false);
}

function toSafeVariantTitle(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }
  return raw.replace(/\s+/g, ' ').slice(0, 40);
}

function normalizeLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isShopifyAdminUnavailableError(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 404 || status === 504) {
    return true;
  }
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('shopify admin graphql failed (404)') ||
    message.includes('shopify admin rest failed (404)') ||
    message.includes('graph ql client: not found') ||
    message.includes('temporarily unavailable') ||
    message.includes('timed out')
  );
}

function toStringArray(input) {
  if (Array.isArray(input)) {
    return input
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return String(input || '')
    .split(/\n|,/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function buildShippingDiscountTitle(test, variant) {
  const testId =
    String(test?.id || '')
      .trim()
      .slice(0, 8) || 'test';
  const variantLabel = toSafeVariantTitle(variant?.name, 'Variant');
  const joined = `${DEFAULT_SHIPPING_DISCOUNT_TITLE_PREFIX} ${testId} ${variantLabel}`.trim();
  return joined.slice(0, 255);
}

function getShippingConfigRevision(test = {}, variant = {}) {
  const config = variant?.config && typeof variant.config === 'object' ? variant.config : {};
  const metadata = config.metadata && typeof config.metadata === 'object' ? config.metadata : {};
  return String(
    metadata.shipping_config_revision ||
      metadata.shippingConfigRevision ||
      test?.updated_at ||
      test?.updatedAt ||
      ''
  ).trim();
}

function shortShippingConfigRevision(test = {}, variant = {}) {
  const revision = getShippingConfigRevision(test, variant);
  if (!revision) {
    return '';
  }
  return revision.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
}

function buildShippingCarrierServiceName(test, variant = {}) {
  const testId =
    String(test?.id || '')
      .trim()
      .slice(0, 8) || 'test';
  const revision = shortShippingConfigRevision(test, variant);
  const joined = `${DEFAULT_SHIPPING_CARRIER_TITLE_PREFIX} Rate - ${testId}${
    revision ? ` r${revision}` : ''
  }`.trim();
  return joined.slice(0, 255);
}

function buildShippingDeliveryCustomizationTitle(test, variant) {
  const testId =
    String(test?.id || '')
      .trim()
      .slice(0, 8) || 'test';
  const variantLabel = toSafeVariantTitle(variant?.name, 'Variant');
  const joined = `${DEFAULT_SHIPPING_DELIVERY_TITLE_PREFIX} ${testId} ${variantLabel}`.trim();
  return joined.slice(0, 255);
}

function getReplacementRequiredMethodNames(test = {}, variant = {}) {
  const cfg = variant?.config && typeof variant.config === 'object' ? variant.config : {};
  const rateNames = Array.isArray(cfg.rates)
    ? cfg.rates
        .map(rate => String(rate?.name || rate?.service_name || rate?.serviceName || '').trim())
        .filter(Boolean)
    : [];
  const uniqueRateNames = Array.from(new Set(rateNames));
  if (uniqueRateNames.length > 0) {
    return uniqueRateNames.slice(0, 10);
  }
  return [buildShippingCarrierServiceName(test, variant)];
}

function getReplacementRequiredMethodCodes(variant = {}) {
  const cfg = variant?.config && typeof variant.config === 'object' ? variant.config : {};
  const rateCodes = Array.isArray(cfg.rates)
    ? cfg.rates
        .map(rate => String(rate?.service_code || rate?.serviceCode || rate?.code || '').trim())
        .filter(Boolean)
    : [];
  return Array.from(new Set(rateCodes)).slice(0, 10);
}

function buildShippingDeliveryCustomizationConfig(test = {}, variant = {}) {
  const cfg = variant?.config && typeof variant.config === 'object' ? variant.config : {};
  const methodNames = toStringArray(
    cfg.delivery_method_names || cfg.deliveryMethodNames || cfg.method_names || cfg.methodNames
  );
  if (methodNames.length === 0) {
    throw new Error(
      'Delivery customization requires delivery_method_names/method_names because it can only hide, rename, or reorder existing checkout delivery methods.'
    );
  }
  const action = normalizeLower(cfg.delivery_action || cfg.deliveryAction || cfg.action || 'hide');
  const renameTo = String(
    cfg.delivery_rename_to || cfg.deliveryRenameTo || cfg.rename_to || ''
  ).trim();
  if (action === 'rename' && !renameTo) {
    throw new Error('Delivery customization rename action requires delivery_rename_to.');
  }
  const variantId = String(variant?.id || variant?.name || 'variant').trim();
  const replacementMode = shouldReplaceExistingRates(cfg);
  const carrierServiceName = buildShippingCarrierServiceName(test, variant);
  const replacementCodes = replacementMode ? getReplacementRequiredMethodCodes(variant) : [];
  const replacementNames =
    replacementMode && replacementCodes.length === 0
      ? getReplacementRequiredMethodNames(test, variant)
      : [];
  return {
    phase: 'delivery_method',
    test_id: String(test?.id || '').trim() || null,
    test_name: String(test?.name || '').trim() || null,
    assignment_keys: {
      test: '_ripx_price_test',
      variant: '_ripx_variant',
    },
    variant_rules: [
      {
        variant_id: variantId,
        variant_name: String(variant?.name || variantId || 'Variant').trim(),
        action: ['hide', 'rename', 'reorder'].includes(action) ? action : 'hide',
        method_names: methodNames,
        require_present_method_names: replacementNames,
        require_present_method_codes: replacementCodes,
        protected_method_codes: replacementCodes,
        hide_when_unassigned_method_names:
          replacementMode && replacementCodes.length === 0 ? [carrierServiceName] : [],
        hide_when_unassigned_method_codes: replacementCodes,
        rename_to: renameTo,
      },
    ],
  };
}

function toFiniteNumber(value) {
  const n = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(n) ? n : null;
}

function resolveShippingCarrierCallbackBaseUrl() {
  const explicit = String(process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL || '').trim();
  if (explicit) {
    return explicit;
  }
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!appUrl) {
    return '';
  }
  return `${appUrl}/api/track/shipping-carrier-rates`;
}

function buildShippingCarrierCallbackUrl(baseUrl, test, variant) {
  if (!baseUrl) {
    return '';
  }
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return '';
  }
  const config = variant?.config || {};
  const strategy = String(variant?.strategy || config.strategy || 'flat_rate')
    .trim()
    .toLowerCase();
  const configuredRates = Array.isArray(config.rates)
    ? config.rates
        .map((rate, index) => {
          const raw = rate && typeof rate === 'object' ? rate : {};
          const amount = toFiniteNumber(raw.amount ?? raw.price ?? raw.rate);
          const priority = Number.parseInt(String(raw.priority ?? index + 1), 10);
          const sortOrder = Number.parseInt(
            String(raw.sort_order ?? raw.sortOrder ?? raw.priority ?? index + 1),
            10
          );
          return {
            name: String(raw.name || raw.service_name || '').trim() || null,
            description: String(raw.description || '').trim() || null,
            delivery_promise: raw.delivery_promise || raw.deliveryPromise || null,
            min_delivery_date:
              String(
                raw.min_delivery_date ||
                  raw.minDeliveryDate ||
                  raw.delivery_promise?.min_delivery_date ||
                  raw.deliveryPromise?.minDeliveryDate ||
                  ''
              ).trim() || null,
            max_delivery_date:
              String(
                raw.max_delivery_date ||
                  raw.maxDeliveryDate ||
                  raw.delivery_promise?.max_delivery_date ||
                  raw.deliveryPromise?.maxDeliveryDate ||
                  ''
              ).trim() || null,
            amount: amount !== null && amount >= 0 ? amount : null,
            currency: String(raw.currency || config.currency || 'USD')
              .trim()
              .toUpperCase(),
            service_code: String(raw.service_code || raw.serviceCode || '').trim() || null,
            priority: Number.isFinite(priority) ? priority : index + 1,
            sort_order: Number.isFinite(sortOrder) ? sortOrder : index + 1,
          };
        })
        .filter(rate => rate.amount !== null)
        .sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          if (a.sort_order !== b.sort_order) {
            return a.sort_order - b.sort_order;
          }
          return String(a.name || '').localeCompare(String(b.name || ''));
        })
    : [];
  const amountFromConfig =
    config.amount !== undefined && config.amount !== null && String(config.amount).trim() !== ''
      ? toFiniteNumber(config.amount)
      : null;
  const amount =
    amountFromConfig !== null ? amountFromConfig : (configuredRates[0]?.amount ?? null);
  const shippingDisplayMode = String(
    config.shipping_display_mode || config.shippingDisplayMode || config.display_mode || ''
  )
    .trim()
    .toLowerCase();
  const previewLabelPrefix = String(
    config.preview_label_prefix || config.previewLabelPrefix || ''
  ).trim();
  const checkoutDisplay = normalizeCheckoutDisplayConfig(
    config.checkout_display || config.checkoutDisplay || config
  );
  const profileId =
    config.profile_id !== undefined && config.profile_id !== null
      ? String(config.profile_id).trim()
      : '';
  const methodHandles = Array.isArray(config.method_handles)
    ? config.method_handles
        .map(handle => String(handle || '').trim())
        .filter(Boolean)
        .join(',')
    : '';
  const providerConfig = resolveVariantProviderConfig(variant);

  if (test?.id) {
    url.searchParams.set('test_id', String(test.id));
  }
  const callbackRevision = getShippingConfigRevision(test, variant);
  if (callbackRevision) {
    url.searchParams.set('cfg_rev', callbackRevision);
  }
  const shopDomain = String(test?.shop_domain || test?.shopDomain || '').trim();
  if (shopDomain) {
    url.searchParams.set('shop_domain', shopDomain);
  }
  if (variant?.index !== undefined && variant?.index !== null) {
    url.searchParams.set('variant_index', String(variant.index));
  }
  if (variant?.id) {
    url.searchParams.set('variant_id', String(variant.id));
  }
  if (variant?.name) {
    url.searchParams.set('variant_name', String(variant.name));
  }
  url.searchParams.set('strategy', strategy || 'flat_rate');
  if (amount !== null) {
    url.searchParams.set('amount', amount.toFixed(2));
  }
  if (shippingDisplayMode) {
    url.searchParams.set('shipping_display_mode', shippingDisplayMode);
  }
  if (previewLabelPrefix) {
    url.searchParams.set('preview_label_prefix', previewLabelPrefix);
  }
  if (configuredRates.length > 0) {
    url.searchParams.set('rates_count', String(configuredRates.length));
    url.searchParams.set(
      'rates_json',
      JSON.stringify(
        configuredRates.slice(0, 5).map(rate => ({
          name: rate.name,
          description: rate.description,
          delivery_promise: rate.delivery_promise,
          min_delivery_date: rate.min_delivery_date,
          max_delivery_date: rate.max_delivery_date,
          amount: rate.amount,
          currency: rate.currency,
          service_code: rate.service_code,
          priority: rate.priority,
          sort_order: rate.sort_order,
        }))
      )
    );
  }
  if (checkoutDisplay.default_description || checkoutDisplay.delivery_promise?.mode !== 'none') {
    url.searchParams.set('checkout_display_json', JSON.stringify(checkoutDisplay));
  }
  if (profileId) {
    url.searchParams.set('profile_id', profileId);
  }
  if (methodHandles) {
    url.searchParams.set('method_handles', methodHandles);
  }
  if (providerConfig.provider) {
    url.searchParams.set('quote_provider', providerConfig.provider);
  }
  return url.toString();
}

function readShippingCarrierCallbackIdentity(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    const testId = String(parsed.searchParams.get('test_id') || '').trim();
    const variantIndex = String(parsed.searchParams.get('variant_index') || '').trim();
    const configRevision = String(parsed.searchParams.get('cfg_rev') || '').trim();
    if (!testId || !variantIndex) {
      return null;
    }
    return { testId, variantIndex, configRevision };
  } catch {
    return null;
  }
}

function isLegacyShippingCarrierServiceNameMatch(serviceName, test, variant) {
  const normalizedServiceName = normalizeLower(serviceName);
  if (!normalizedServiceName.startsWith('ripx shipping carrier')) {
    return false;
  }
  const testId = normalizeLower(
    String(test?.id || '')
      .trim()
      .slice(0, 8)
  );
  const variantLabel = normalizeLower(toSafeVariantTitle(variant?.name, 'Variant'));
  if (!testId || !variantLabel) {
    return false;
  }
  return normalizedServiceName.includes(testId) && normalizedServiceName.includes(variantLabel);
}

function toDeliveryCarrierServiceGid(service = {}) {
  const raw = String(service?.admin_graphql_api_id || service?.id || '').trim();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('gid://shopify/DeliveryCarrierService/')) {
    return raw;
  }
  if (/^\d+$/.test(raw)) {
    return `gid://shopify/DeliveryCarrierService/${raw}`;
  }
  return raw;
}

function getShippingScopeConfig(config = {}) {
  const scope =
    config.shipping_scope && typeof config.shipping_scope === 'object' ? config.shipping_scope : {};
  return {
    profile_id: String(scope.profile_id || config.profile_id || '').trim(),
    profile_name: String(scope.profile_name || '').trim(),
    location_group_id: String(scope.location_group_id || '').trim(),
    zone_id: String(scope.zone_id || '').trim(),
    zone_name: String(scope.zone_name || '').trim(),
  };
}

function getCarrierParticipantServiceNames(config = {}) {
  const names = Array.isArray(config.rates)
    ? config.rates
        .map(rate => String(rate?.name || rate?.service_name || '').trim())
        .filter(Boolean)
    : [];
  return names.length > 0 ? Array.from(new Set(names)).slice(0, 10) : ['RipX Shipping'];
}

function currentSetupAlreadyHasCarrierBinding({
  currentSetup,
  serviceName,
  callbackUrl,
  profileId,
  locationGroupId,
  zoneId,
}) {
  const rates = Array.isArray(currentSetup?.rates) ? currentSetup.rates : [];
  const normalizedServiceName = normalizeLower(serviceName);
  const normalizedCallbackUrl = normalizeLower(callbackUrl);
  return rates.some(rate => {
    const sameCarrier =
      (normalizedServiceName &&
        normalizeLower(rate?.carrier_service_name) === normalizedServiceName) ||
      (normalizedCallbackUrl &&
        normalizeLower(rate?.carrier_service_callback_url) === normalizedCallbackUrl);
    if (!sameCarrier) {
      return false;
    }
    if (profileId && String(rate?.profile_id || '') !== profileId) {
      return false;
    }
    if (locationGroupId && String(rate?.profile_location_group_id || '') !== locationGroupId) {
      return false;
    }
    if (zoneId && String(rate?.zone_id || '') !== zoneId) {
      return false;
    }
    return true;
  });
}

function carrierServiceStatusWithProfileBinding(baseStatus, profileBinding = null) {
  if (profileBinding && profileBinding.ok === false) {
    return `${baseStatus}_profile_binding_failed`;
  }
  return baseStatus;
}

function carrierServiceMessageWithProfileBinding(baseMessage, profileBinding = null) {
  if (profileBinding && profileBinding.ok === false) {
    return `${baseMessage} Profile/zone binding still needs attention: ${profileBinding.message}`;
  }
  if (profileBinding?.status === 'bound' || profileBinding?.status === 'already_bound') {
    return `${baseMessage} Carrier rate is attached to the selected profile/zone.`;
  }
  return baseMessage;
}

async function ensureShippingProfileCarrierBinding({
  shopDomain,
  accessToken,
  test,
  variant,
  service,
  callbackUrl,
  apply = false,
}) {
  const config = variant?.config && typeof variant.config === 'object' ? variant.config : {};
  const scope = getShippingScopeConfig(config);
  const hasFullScope = Boolean(scope.profile_id && scope.location_group_id && scope.zone_id);
  if (!hasFullScope) {
    return {
      ok: true,
      status: 'not_configured',
      message:
        'No complete Shopify profile/location-group/zone scope was selected, so RipX created the CarrierService only.',
      dry_run: !apply,
    };
  }

  const carrierServiceId = toDeliveryCarrierServiceGid(service);
  if (!carrierServiceId && !apply) {
    return {
      ok: true,
      status: 'dry_run_ready',
      message:
        'RipX will create the CarrierService, then attach it to the selected Shopify profile and zone.',
      scope,
      carrier_service_id: null,
      participant_services: getCarrierParticipantServiceNames(config),
      dry_run: true,
    };
  }
  if (!carrierServiceId) {
    return {
      ok: false,
      status: 'missing_carrier_service_id',
      message:
        'CarrierService was created, but Shopify did not return an ID to bind to the profile.',
      scope,
      dry_run: !apply,
    };
  }

  const serviceName = buildShippingCarrierServiceName(test, variant);
  const participantServiceNames = getCarrierParticipantServiceNames(config);
  let currentSetup = null;
  try {
    currentSetup = await buildShippingCurrentSetupReport(shopDomain, accessToken);
  } catch (error) {
    currentSetup = {
      warnings: [`Could not verify existing profile bindings: ${error.message || 'unknown error'}`],
    };
  }

  if (
    currentSetupAlreadyHasCarrierBinding({
      currentSetup,
      serviceName,
      callbackUrl,
      profileId: scope.profile_id,
      locationGroupId: scope.location_group_id,
      zoneId: scope.zone_id,
    })
  ) {
    return {
      ok: true,
      status: 'already_bound',
      message: 'Carrier service is already attached to the selected Shopify profile and zone.',
      scope,
      carrier_service_id: carrierServiceId,
      participant_services: participantServiceNames,
      dry_run: !apply,
    };
  }

  const methodDefinition = {
    name: participantServiceNames[0] || 'RipX Shipping',
    active: true,
    participant: {
      carrierServiceId,
      adaptToNewServices: true,
      participantServices: participantServiceNames.map(name => ({
        name,
        active: true,
      })),
    },
  };

  const mutationInput = {
    locationGroupsToUpdate: [
      {
        id: scope.location_group_id,
        zonesToUpdate: [
          {
            id: scope.zone_id,
            methodDefinitionsToCreate: [methodDefinition],
          },
        ],
      },
    ],
  };

  if (!apply) {
    return {
      ok: true,
      status: 'dry_run_ready',
      message:
        'RipX will attach the CarrierService to the selected Shopify profile and zone when applied.',
      scope,
      carrier_service_id: carrierServiceId,
      participant_services: participantServiceNames,
      mutation_input: mutationInput,
      dry_run: true,
    };
  }

  const mutation = `
    mutation RipxAttachCarrierRateToDeliveryProfile($id: ID!, $profile: DeliveryProfileInput!) {
      deliveryProfileUpdate(id: $id, profile: $profile) {
        profile {
          id
          name
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    mutation,
    {
      id: scope.profile_id,
      profile: mutationInput,
    },
    { apiVersion: '2025-04' }
  );
  const payload = response?.data?.deliveryProfileUpdate || {};
  const userErrors = Array.isArray(payload.userErrors) ? payload.userErrors : [];
  if (userErrors.length > 0) {
    return {
      ok: false,
      status: 'failed',
      message: userErrors
        .map(error => error.message)
        .filter(Boolean)
        .join('; '),
      scope,
      carrier_service_id: carrierServiceId,
      participant_services: participantServiceNames,
      user_errors: userErrors,
      mutation_input: mutationInput,
      dry_run: false,
    };
  }

  return {
    ok: true,
    status: 'bound',
    message: 'Carrier service attached to the selected Shopify profile and zone.',
    scope,
    carrier_service_id: carrierServiceId,
    participant_services: participantServiceNames,
    profile: payload.profile || null,
    mutation_input: mutationInput,
    warnings: currentSetup?.warnings || [],
    dry_run: false,
  };
}

async function fetchCarrierServicesViaAdmin(shopDomain, accessToken) {
  try {
    const response = await shopifyService.requestAdminRest(shopDomain, accessToken, {
      method: 'GET',
      path: 'carrier_services.json',
    });
    return Array.isArray(response?.carrier_services) ? response.carrier_services : [];
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 0);
    // Some shops/tokens cannot read carrier services via REST; continue with create/update path.
    if (status === 403 || status === 404) {
      return [];
    }
    throw error;
  }
}

function isDuplicateCarrierServiceCreateError(error, serviceName) {
  const message = String(error?.message || '').toLowerCase();
  const payload = error?.payload && typeof error.payload === 'object' ? error.payload : {};
  const payloadText = JSON.stringify(payload).toLowerCase();
  const normalizedName = String(serviceName || '')
    .trim()
    .toLowerCase();
  return (
    (error?.status === 422 || error?.statusCode === 422) &&
    message.includes('already configured') &&
    (!normalizedName ||
      message.includes(normalizedName) ||
      payloadText.includes(normalizedName) ||
      message.includes('ripx shipping rate') ||
      payloadText.includes('ripx shipping rate'))
  );
}

function extractDuplicateCarrierServiceName(error) {
  const payload = error?.payload && typeof error.payload === 'object' ? error.payload : {};
  const candidates = [
    error?.message,
    ...(Array.isArray(payload?.errors?.base) ? payload.errors.base : []),
    payload?.error,
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);
  for (const candidate of candidates) {
    const match = candidate.match(/(RipX Shipping Rate\s*-\s*.+?)\s+is already configured/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function findMatchingCarrierService(
  services = [],
  {
    serviceName,
    duplicateServiceName = '',
    callbackIdentity,
    test,
    variant,
    allowFuzzyTestName = false,
  }
) {
  const normalizedServiceName = String(serviceName || '')
    .trim()
    .toLowerCase();
  const normalizedDuplicateServiceName = String(duplicateServiceName || '')
    .trim()
    .toLowerCase();
  const byName = services.find(
    service =>
      String(service?.name || '')
        .trim()
        .toLowerCase() === normalizedServiceName
  );
  if (byName) {
    return byName;
  }
  if (normalizedDuplicateServiceName) {
    const byDuplicateName = services.find(service => {
      const normalizedName = String(service?.name || '')
        .trim()
        .toLowerCase();
      return (
        normalizedName === normalizedDuplicateServiceName ||
        normalizedName.startsWith(`${normalizedDuplicateServiceName} `) ||
        normalizedServiceName.startsWith(`${normalizedDuplicateServiceName} `)
      );
    });
    if (byDuplicateName) {
      return byDuplicateName;
    }
  }
  if (callbackIdentity) {
    const byCallbackIdentity = services.find(service => {
      const serviceIdentity = readShippingCarrierCallbackIdentity(service?.callback_url);
      return (
        serviceIdentity &&
        serviceIdentity.testId === callbackIdentity.testId &&
        serviceIdentity.variantIndex === callbackIdentity.variantIndex &&
        (!callbackIdentity.configRevision ||
          serviceIdentity.configRevision === callbackIdentity.configRevision)
      );
    });
    if (byCallbackIdentity) {
      return byCallbackIdentity;
    }
  }
  if (allowFuzzyTestName) {
    const testId = String(test?.id || '')
      .trim()
      .slice(0, 8)
      .toLowerCase();
    const byTestRateName = testId
      ? services.find(service => {
          const normalizedName = String(service?.name || '')
            .trim()
            .toLowerCase();
          return normalizedName.startsWith('ripx shipping rate') && normalizedName.includes(testId);
        })
      : null;
    if (byTestRateName) {
      return byTestRateName;
    }
  }
  return services.find(service =>
    isLegacyShippingCarrierServiceNameMatch(service?.name, test, variant)
  );
}

function collectStaleCarrierServices(services = [], { callbackIdentity, activeService } = {}) {
  if (!callbackIdentity?.testId || callbackIdentity?.variantIndex === undefined) {
    return [];
  }
  const activeId = String(activeService?.id || '').trim();
  const currentRevision = String(callbackIdentity.configRevision || '').trim();
  return (Array.isArray(services) ? services : []).filter(service => {
    if (!service?.id || (activeId && String(service.id) === activeId)) {
      return false;
    }
    const serviceIdentity = readShippingCarrierCallbackIdentity(service?.callback_url);
    if (!serviceIdentity) {
      return false;
    }
    return (
      serviceIdentity.testId === callbackIdentity.testId &&
      serviceIdentity.variantIndex === callbackIdentity.variantIndex &&
      (!currentRevision || serviceIdentity.configRevision !== currentRevision)
    );
  });
}

async function cleanupStaleCarrierServices(shopDomain, accessToken, staleServices = []) {
  const cleanup = [];
  for (const staleService of staleServices) {
    if (!staleService?.id) {
      continue;
    }
    try {
      cleanup.push(
        await deleteManagedShippingResource(shopDomain, accessToken, {
          resource_type: 'carrier_service',
          id: staleService.id,
          title: staleService.name || null,
        })
      );
    } catch (error) {
      cleanup.push({
        ok: false,
        status: 'delete_failed',
        resource: { resource_type: 'carrier_service', id: staleService.id },
        message: error?.message || 'delete_failed',
      });
    }
  }
  return cleanup;
}

async function ensureShippingCarrierService({
  shopDomain,
  accessToken,
  test,
  variant,
  apply = false,
}) {
  const strategy = String(variant?.strategy || variant?.config?.strategy || 'flat_rate')
    .trim()
    .toLowerCase();
  const providerConfig = resolveVariantProviderConfig(variant);
  if (strategy === 'carrier_quote' && !providerConfig.provider) {
    return {
      ok: false,
      status: 'manual_required',
      message:
        'carrier_quote requires a configured quote provider before RipX can auto-provision this adapter.',
      created: false,
      updated: false,
      existing: false,
      service: null,
      callback_url: null,
      provider: providerConfig.provider || null,
      dry_run: !apply,
    };
  }

  const callbackBaseUrl = resolveShippingCarrierCallbackBaseUrl();
  if (!callbackBaseUrl) {
    return {
      ok: false,
      status: 'manual_required',
      message:
        'Carrier callback URL is not configured. Set RIPX_SHIPPING_CARRIER_CALLBACK_URL or APP_URL.',
      created: false,
      updated: false,
      existing: false,
      service: null,
      callback_url: null,
      dry_run: !apply,
    };
  }

  const callbackUrl = buildShippingCarrierCallbackUrl(
    callbackBaseUrl,
    { ...test, shop_domain: test?.shop_domain || shopDomain },
    variant
  );
  if (!callbackUrl) {
    return {
      ok: false,
      status: 'manual_required',
      message:
        'Carrier callback URL is invalid. Set RIPX_SHIPPING_CARRIER_CALLBACK_URL (absolute https URL).',
      created: false,
      updated: false,
      existing: false,
      service: null,
      callback_url: null,
      dry_run: !apply,
    };
  }

  const serviceName = buildShippingCarrierServiceName(test, variant);
  const existingServices = await fetchCarrierServicesViaAdmin(shopDomain, accessToken);
  const callbackIdentity = readShippingCarrierCallbackIdentity(callbackUrl);
  const staleRevisionServices = callbackIdentity?.configRevision
    ? collectStaleCarrierServices(existingServices, { callbackIdentity })
    : [];
  const existing = findMatchingCarrierService(existingServices, {
    serviceName,
    callbackIdentity,
    test,
    variant,
  });
  const callbackMatches =
    existing &&
    String(existing.callback_url || '')
      .trim()
      .toLowerCase() === callbackUrl.trim().toLowerCase();
  const nameMatches =
    existing &&
    String(existing?.name || '')
      .trim()
      .toLowerCase() === serviceName.toLowerCase();

  if (existing?.id && callbackMatches && nameMatches) {
    const profileBinding = await ensureShippingProfileCarrierBinding({
      shopDomain,
      accessToken,
      test,
      variant,
      service: existing,
      callbackUrl,
      apply,
    });
    const staleRevisionCleanup = apply
      ? await cleanupStaleCarrierServices(
          shopDomain,
          accessToken,
          collectStaleCarrierServices(existingServices, {
            callbackIdentity,
            activeService: existing,
          })
        )
      : [];
    return {
      ok: true,
      status: carrierServiceStatusWithProfileBinding('already_exists', profileBinding),
      message: carrierServiceMessageWithProfileBinding(
        'Carrier service already exists with matching callback.',
        profileBinding
      ),
      created: false,
      updated: false,
      existing: true,
      service: existing,
      callback_url: callbackUrl,
      profile_binding: profileBinding,
      stale_revision_cleanup: staleRevisionCleanup,
      provider: providerConfig.provider || null,
      dry_run: !apply,
    };
  }

  if (!apply) {
    const profileBinding = await ensureShippingProfileCarrierBinding({
      shopDomain,
      accessToken,
      test,
      variant,
      service: existing || null,
      callbackUrl,
      apply: false,
    });
    return {
      ok: true,
      status: 'dry_run_ready',
      message: existing?.id
        ? 'Carrier service would be updated with latest callback parameters.'
        : 'Carrier service would be created.',
      created: false,
      updated: false,
      existing: Boolean(existing?.id),
      service: existing || null,
      callback_url: callbackUrl,
      profile_binding: profileBinding,
      provider: providerConfig.provider || null,
      dry_run: true,
    };
  }

  if (existing?.id) {
    const updateResponse = await shopifyService.requestAdminRest(shopDomain, accessToken, {
      method: 'PUT',
      path: `carrier_services/${existing.id}.json`,
      body: {
        carrier_service: {
          id: existing.id,
          name: serviceName,
          callback_url: callbackUrl,
          service_discovery: true,
        },
      },
    });
    const updatedService = updateResponse?.carrier_service || existing;
    const profileBinding = await ensureShippingProfileCarrierBinding({
      shopDomain,
      accessToken,
      test,
      variant,
      service: updatedService,
      callbackUrl,
      apply: true,
    });
    const staleRevisionCleanup = await cleanupStaleCarrierServices(
      shopDomain,
      accessToken,
      collectStaleCarrierServices(existingServices, {
        callbackIdentity,
        activeService: updatedService,
      })
    );
    return {
      ok: true,
      status: carrierServiceStatusWithProfileBinding('updated', profileBinding),
      message: carrierServiceMessageWithProfileBinding('Carrier service updated.', profileBinding),
      created: false,
      updated: true,
      existing: true,
      service: updatedService,
      callback_url: callbackUrl,
      profile_binding: profileBinding,
      stale_revision_cleanup: staleRevisionCleanup,
      provider: providerConfig.provider || null,
      dry_run: false,
    };
  }

  let createResponse;
  try {
    createResponse = await shopifyService.requestAdminRest(shopDomain, accessToken, {
      method: 'POST',
      path: 'carrier_services.json',
      body: {
        carrier_service: {
          name: serviceName,
          callback_url: callbackUrl,
          service_discovery: true,
        },
      },
    });
  } catch (error) {
    if (!isDuplicateCarrierServiceCreateError(error, serviceName)) {
      throw error;
    }
    const duplicateServiceName = extractDuplicateCarrierServiceName(error);
    const refreshedServices = await fetchCarrierServicesViaAdmin(shopDomain, accessToken);
    const duplicateService = findMatchingCarrierService(refreshedServices, {
      serviceName,
      duplicateServiceName,
      callbackIdentity,
      test,
      variant,
      allowFuzzyTestName: true,
    });
    if (!duplicateService?.id) {
      return {
        ok: false,
        status: 'duplicate_create_unresolved',
        message:
          error?.message ||
          'Shopify says this CarrierService is already configured, but RipX could not find it to update.',
        created: false,
        updated: false,
        existing: false,
        service: null,
        callback_url: callbackUrl,
        provider: providerConfig.provider || null,
        dry_run: false,
      };
    }
    const updateResponse = await shopifyService.requestAdminRest(shopDomain, accessToken, {
      method: 'PUT',
      path: `carrier_services/${duplicateService.id}.json`,
      body: {
        carrier_service: {
          id: duplicateService.id,
          name: serviceName,
          callback_url: callbackUrl,
          service_discovery: true,
        },
      },
    });
    const updatedService = updateResponse?.carrier_service || duplicateService;
    const profileBinding = await ensureShippingProfileCarrierBinding({
      shopDomain,
      accessToken,
      test,
      variant,
      service: updatedService,
      callbackUrl,
      apply: true,
    });
    const staleRevisionCleanup = await cleanupStaleCarrierServices(
      shopDomain,
      accessToken,
      collectStaleCarrierServices(refreshedServices, {
        callbackIdentity,
        activeService: updatedService,
      })
    );
    return {
      ok: true,
      status: carrierServiceStatusWithProfileBinding('updated', profileBinding),
      message: carrierServiceMessageWithProfileBinding(
        'Carrier service already existed in Shopify and was updated.',
        profileBinding
      ),
      created: false,
      updated: true,
      existing: true,
      recovered_duplicate: true,
      service: updatedService,
      callback_url: callbackUrl,
      profile_binding: profileBinding,
      stale_revision_cleanup: staleRevisionCleanup,
      provider: providerConfig.provider || null,
      dry_run: false,
    };
  }
  const created = createResponse?.carrier_service || null;
  if (!created?.id) {
    return {
      ok: false,
      status: 'create_failed',
      message: 'Failed to create carrier service.',
      created: false,
      updated: false,
      existing: false,
      service: created,
      callback_url: callbackUrl,
      provider: providerConfig.provider || null,
      dry_run: false,
    };
  }
  const profileBinding = await ensureShippingProfileCarrierBinding({
    shopDomain,
    accessToken,
    test,
    variant,
    service: created,
    callbackUrl,
    apply: true,
  });
  const staleRevisionCleanup = await cleanupStaleCarrierServices(
    shopDomain,
    accessToken,
    collectStaleCarrierServices(staleRevisionServices, {
      callbackIdentity,
      activeService: created,
    })
  );
  return {
    ok: true,
    status: carrierServiceStatusWithProfileBinding('created', profileBinding),
    message: carrierServiceMessageWithProfileBinding('Carrier service created.', profileBinding),
    created: true,
    updated: false,
    existing: false,
    service: created,
    callback_url: callbackUrl,
    profile_binding: profileBinding,
    stale_revision_cleanup: staleRevisionCleanup,
    provider: providerConfig.provider || null,
    dry_run: false,
  };
}

function pickDeliveryCustomizationFunction(functionsList = []) {
  const list = Array.isArray(functionsList) ? functionsList.filter(Boolean) : [];
  const deliveryFns = list.filter(node => {
    const apiType = String(node?.apiType || '')
      .trim()
      .toLowerCase();
    return apiType.includes('delivery') && apiType.includes('customization');
  });
  const shippingSpecific = deliveryFns.find(node => {
    const title = String(node?.title || '')
      .trim()
      .toLowerCase();
    return title.includes('shipping');
  });
  if (shippingSpecific) {
    return shippingSpecific;
  }
  const ripxFn = deliveryFns.find(node => {
    const title = String(node?.title || '')
      .trim()
      .toLowerCase();
    return title.includes('ripx');
  });
  if (ripxFn) {
    return ripxFn;
  }
  return deliveryFns[0] || null;
}

async function fetchDeliveryCustomizationsViaAdmin(shopDomain, accessToken) {
  const query = `
    query ripxShippingDeliveryCustomizations {
      deliveryCustomizations(first: 100) {
        edges {
          node {
            id
            title
            enabled
          }
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, query);
  const edges = response?.data?.deliveryCustomizations?.edges || [];
  return edges.map(edge => edge?.node).filter(Boolean);
}

async function ensureShippingDeliveryCustomization({
  shopDomain,
  accessToken,
  test,
  variant,
  apply = false,
}) {
  const strategy = String(variant?.strategy || variant?.config?.strategy || 'control')
    .trim()
    .toLowerCase();
  if (strategy !== 'carrier_quote' && strategy !== 'flat_rate') {
    return {
      ok: false,
      status: 'manual_required',
      message:
        'delivery_customization auto-apply supports carrier_quote variants and flat_rate replacement variants.',
      created: false,
      existing: false,
      customization: null,
      function: null,
      dry_run: !apply,
    };
  }

  let functionConfig;
  try {
    functionConfig = buildShippingDeliveryCustomizationConfig(test, variant);
  } catch (error) {
    return {
      ok: false,
      status: 'manual_required',
      message: error?.message || 'Delivery customization requires delivery method targets.',
      created: false,
      existing: false,
      customization: null,
      function: null,
      config: null,
      dry_run: !apply,
    };
  }

  const functionNodes = await fetchShopifyFunctions(shopDomain, accessToken);
  const chosenFunction = pickDeliveryCustomizationFunction(functionNodes);
  if (!chosenFunction?.id) {
    return {
      ok: false,
      status: 'manual_required',
      message:
        'No delivery customization function is available on this shop. Deploy/enable the function first.',
      created: false,
      existing: false,
      customization: null,
      function: null,
      config: functionConfig,
      dry_run: !apply,
    };
  }

  const customizationTitle = buildShippingDeliveryCustomizationTitle(test, variant);
  const existingCustomizations = await fetchDeliveryCustomizationsViaAdmin(shopDomain, accessToken);
  const existing = existingCustomizations.find(
    item =>
      String(item?.title || '')
        .trim()
        .toLowerCase() === customizationTitle.toLowerCase()
  );
  if (existing?.id) {
    if (apply) {
      const metafieldResult = await setShippingDeliveryCustomizationMetafield(
        shopDomain,
        accessToken,
        existing.id,
        functionConfig
      );
      if (metafieldResult.user_errors.length > 0) {
        return {
          ok: false,
          status: 'configure_failed',
          message:
            metafieldResult.user_errors[0]?.message ||
            'Delivery customization exists, but config metafield could not be saved.',
          created: false,
          existing: true,
          customization: existing,
          function: {
            id: chosenFunction.id,
            title: chosenFunction.title || null,
            apiType: chosenFunction.apiType || null,
          },
          config: functionConfig,
          metafields: metafieldResult.metafields,
          user_errors: metafieldResult.user_errors,
          title: customizationTitle,
          dry_run: false,
        };
      }
    }
    return {
      ok: true,
      status: apply ? 'configured' : 'already_exists',
      message: apply
        ? 'Delivery customization already exists and was configured.'
        : 'Delivery customization already exists.',
      created: false,
      existing: true,
      customization: existing,
      function: {
        id: chosenFunction.id,
        title: chosenFunction.title || null,
        apiType: chosenFunction.apiType || null,
      },
      config: functionConfig,
      title: customizationTitle,
      dry_run: !apply,
    };
  }

  if (!apply) {
    return {
      ok: true,
      status: 'dry_run_ready',
      message: 'Delivery customization would be created.',
      created: false,
      existing: false,
      customization: null,
      function: {
        id: chosenFunction.id,
        title: chosenFunction.title || null,
        apiType: chosenFunction.apiType || null,
      },
      config: functionConfig,
      title: customizationTitle,
      dry_run: true,
    };
  }

  const createMutation = `
    mutation ripxCreateShippingDeliveryCustomization($deliveryCustomization: DeliveryCustomizationInput!) {
      deliveryCustomizationCreate(deliveryCustomization: $deliveryCustomization) {
        deliveryCustomization {
          id
          title
          enabled
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  const createVariables = {
    deliveryCustomization: {
      title: customizationTitle,
      functionId: chosenFunction.id,
      enabled: true,
    },
  };
  const createResponse = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    createMutation,
    createVariables
  );
  const createPayload = createResponse?.data?.deliveryCustomizationCreate;
  const userErrors = toGraphqlUserErrors(createPayload?.userErrors);
  if (userErrors.length > 0 || !createPayload?.deliveryCustomization?.id) {
    return {
      ok: false,
      status: 'create_failed',
      message: userErrors[0]?.message || 'Failed to create delivery customization.',
      created: false,
      existing: false,
      customization: null,
      function: {
        id: chosenFunction.id,
        title: chosenFunction.title || null,
        apiType: chosenFunction.apiType || null,
      },
      config: functionConfig,
      user_errors: userErrors,
      title: customizationTitle,
      dry_run: false,
    };
  }

  const metafieldResult = await setShippingDeliveryCustomizationMetafield(
    shopDomain,
    accessToken,
    createPayload.deliveryCustomization.id,
    functionConfig
  );
  if (metafieldResult.user_errors.length > 0) {
    return {
      ok: false,
      status: 'configure_failed',
      message:
        metafieldResult.user_errors[0]?.message ||
        'Delivery customization was created, but config metafield could not be saved.',
      created: true,
      existing: false,
      customization: createPayload.deliveryCustomization,
      function: {
        id: chosenFunction.id,
        title: chosenFunction.title || null,
        apiType: chosenFunction.apiType || null,
      },
      config: functionConfig,
      metafields: metafieldResult.metafields,
      user_errors: metafieldResult.user_errors,
      title: customizationTitle,
      dry_run: false,
    };
  }

  return {
    ok: true,
    status: 'created',
    message: 'Delivery customization created.',
    created: true,
    existing: false,
    customization: createPayload.deliveryCustomization,
    function: {
      id: chosenFunction.id,
      title: chosenFunction.title || null,
      apiType: chosenFunction.apiType || null,
    },
    config: functionConfig,
    metafields: metafieldResult.metafields,
    title: customizationTitle,
    dry_run: false,
  };
}

function pickShippingDiscountFunction(functionsList = []) {
  const list = Array.isArray(functionsList) ? functionsList.filter(Boolean) : [];
  const discountFns = list.filter(node =>
    String(node?.apiType || '')
      .trim()
      .toLowerCase()
      .includes('discount')
  );
  const shippingSpecific = discountFns.find(node => {
    const title = String(node?.title || '')
      .trim()
      .toLowerCase();
    return title.includes('shipping');
  });
  if (shippingSpecific) {
    return shippingSpecific;
  }
  const ripxFn = discountFns.find(node => {
    const title = String(node?.title || '')
      .trim()
      .toLowerCase();
    return title.includes('ripx');
  });
  if (ripxFn) {
    return ripxFn;
  }
  return discountFns[0] || null;
}

async function fetchShopifyFunctions(shopDomain, accessToken) {
  const fnQuery = `
    query ripxShippingAutoFunctions {
      shopifyFunctions(first: 50) {
        nodes {
          id
          title
          apiType
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, fnQuery);
  return response?.data?.shopifyFunctions?.nodes || [];
}

async function fetchAutomaticAppDiscountsViaAdmin(shopDomain, accessToken) {
  const existingQuery = `
    query ripxShippingAutoDiscounts {
      discountNodes(first: 100) {
        nodes {
          discount {
            ... on DiscountAutomaticApp {
              discountId
              title
              status
              discountClasses
              appDiscountType {
                appKey
                functionId
              }
            }
          }
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, existingQuery);
  const nodes = response?.data?.discountNodes?.nodes || [];
  return nodes.map(node => node?.discount).filter(Boolean);
}

function toGraphqlUserErrors(userErrors = []) {
  return (Array.isArray(userErrors) ? userErrors : []).map(err => ({
    field: Array.isArray(err?.field) ? err.field.join('.') : err?.field || null,
    message: err?.message || null,
    code: err?.code || null,
  }));
}

async function setShippingDeliveryCustomizationMetafield(
  shopDomain,
  accessToken,
  customizationId,
  config
) {
  const mutation = `
    mutation ripxSetShippingDeliveryCustomizationMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  const variables = {
    metafields: [
      {
        ownerId: customizationId,
        namespace: 'delivery-customization',
        key: 'function-configuration',
        type: 'json',
        value: JSON.stringify(config),
      },
    ],
  };
  const response = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    mutation,
    variables
  );
  const payload = response?.data?.metafieldsSet || {};
  return {
    metafields: payload.metafields || [],
    user_errors: toGraphqlUserErrors(payload.userErrors),
  };
}

async function ensureShippingAutomaticDiscount({
  shopDomain,
  accessToken,
  test,
  variant,
  apply = false,
}) {
  const functionNodes = await fetchShopifyFunctions(shopDomain, accessToken);
  const chosenFunction = pickShippingDiscountFunction(functionNodes);
  if (!chosenFunction?.id) {
    return {
      ok: false,
      status: 'missing_function',
      message: 'No Shopify discount function is available on this shop for shipping execution.',
      created: false,
      existing: false,
      function: null,
      discount: null,
    };
  }

  const discountTitle = buildShippingDiscountTitle(test, variant);
  const existingDiscounts = await fetchAutomaticAppDiscountsViaAdmin(shopDomain, accessToken);
  const existing = existingDiscounts.find(
    discount =>
      String(discount?.title || '')
        .trim()
        .toLowerCase() === discountTitle.toLowerCase()
  );
  if (existing?.discountId) {
    return {
      ok: true,
      status: 'already_exists',
      message: 'Shipping automatic discount already exists.',
      created: false,
      existing: true,
      function: {
        id: chosenFunction.id,
        title: chosenFunction.title || null,
        apiType: chosenFunction.apiType || null,
      },
      discount: existing,
      title: discountTitle,
      dry_run: !apply,
    };
  }

  if (!apply) {
    return {
      ok: true,
      status: 'dry_run_ready',
      message: 'Shipping automatic discount would be created.',
      created: false,
      existing: false,
      function: {
        id: chosenFunction.id,
        title: chosenFunction.title || null,
        apiType: chosenFunction.apiType || null,
      },
      discount: null,
      title: discountTitle,
      dry_run: true,
    };
  }

  const createMutation = `
    mutation ripxCreateShippingAutomaticDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount {
          discountId
          title
          status
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  const createVariables = {
    automaticAppDiscount: {
      title: discountTitle,
      functionId: chosenFunction.id,
      discountClasses: ['SHIPPING'],
      startsAt: new Date().toISOString(),
    },
  };
  const createResponse = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    createMutation,
    createVariables
  );
  const createPayload = createResponse?.data?.discountAutomaticAppCreate;
  const userErrors = toGraphqlUserErrors(createPayload?.userErrors);
  if (userErrors.length > 0 || !createPayload?.automaticAppDiscount?.discountId) {
    return {
      ok: false,
      status: 'create_failed',
      message: userErrors[0]?.message || 'Failed to create shipping automatic discount.',
      created: false,
      existing: false,
      function: {
        id: chosenFunction.id,
        title: chosenFunction.title || null,
        apiType: chosenFunction.apiType || null,
      },
      discount: null,
      user_errors: userErrors,
      title: discountTitle,
      dry_run: false,
    };
  }

  return {
    ok: true,
    status: 'created',
    message: 'Shipping automatic discount created.',
    created: true,
    existing: false,
    function: {
      id: chosenFunction.id,
      title: chosenFunction.title || null,
      apiType: chosenFunction.apiType || null,
    },
    discount: createPayload.automaticAppDiscount,
    title: discountTitle,
    dry_run: false,
  };
}

function toActionOutcome({ planEntry, apply, reason, details = null }) {
  return {
    variant_index: planEntry.index,
    variant_id: planEntry.id || null,
    variant_name: planEntry.name,
    strategy: planEntry.strategy,
    execution_adapter: planEntry.execution_adapter,
    apply_mode: apply ? 'apply' : 'dry_run',
    status: reason,
    details,
  };
}

function getVariantShippingResourceRefs(variant = {}) {
  const metadata =
    variant?.config?.metadata && typeof variant.config.metadata === 'object'
      ? variant.config.metadata
      : {};
  const resources = Array.isArray(metadata.shipping_resources) ? metadata.shipping_resources : [];
  return resources.filter(resource => resource && typeof resource === 'object');
}

function buildManagedResourceRef(action = {}) {
  const adapter = String(action?.execution_adapter || '').trim();
  const details = action?.details || {};
  if (
    !adapter ||
    (!['created', 'updated', 'already_exists', 'configured'].includes(
      String(action?.status || '').trim()
    ) &&
      !String(action?.status || '')
        .trim()
        .endsWith('_profile_binding_failed'))
  ) {
    return null;
  }
  if (adapter === 'carrier_service') {
    const id = details?.service?.id;
    if (id === undefined || id === null || String(id).trim() === '') {
      return null;
    }
    return {
      adapter,
      resource_type: 'carrier_service',
      id: String(id),
      title: details?.service?.name || details?.title || null,
      callback_url: details?.callback_url || null,
      provider: details?.provider || null,
      profile_binding:
        details?.profile_binding && typeof details.profile_binding === 'object'
          ? {
              status: details.profile_binding.status || null,
              scope: details.profile_binding.scope || null,
              carrier_service_id: details.profile_binding.carrier_service_id || null,
              participant_services: details.profile_binding.participant_services || [],
            }
          : null,
      managed_by: 'ripx',
      active: true,
    };
  }
  if (adapter === 'delivery_customization') {
    const id = details?.customization?.id;
    if (!id) {
      return null;
    }
    return {
      adapter,
      resource_type: 'delivery_customization',
      id: String(id),
      title: details?.customization?.title || details?.title || null,
      managed_by: 'ripx',
      active: true,
    };
  }
  if (adapter === 'discount_function') {
    const id = details?.discount?.discountId;
    if (!id) {
      return null;
    }
    return {
      adapter,
      resource_type: 'automatic_discount',
      id: String(id),
      title: details?.discount?.title || details?.title || null,
      managed_by: 'ripx',
      active: true,
    };
  }
  return null;
}

function upsertShippingResourceRefs(existingRefs = [], nextRef = null) {
  const list = Array.isArray(existingRefs) ? [...existingRefs] : [];
  if (!nextRef) {
    return list;
  }
  const nextKey = `${nextRef.resource_type}:${nextRef.id}`;
  const filtered = list.filter(item => `${item?.resource_type}:${item?.id}` !== nextKey);
  filtered.push(nextRef);
  return filtered;
}

function buildPersistedShippingVariants(test, actions = [], cleanup = []) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  const actionMap = new Map();
  actions.forEach(action => {
    if (action && Number.isInteger(action.variant_index)) {
      const list = actionMap.get(action.variant_index) || [];
      list.push(action);
      actionMap.set(action.variant_index, list);
    }
  });
  const cleanupMap = new Map();
  cleanup.forEach(entry => {
    if (entry && Number.isInteger(entry.variant_index)) {
      cleanupMap.set(entry.variant_index, entry);
    }
  });

  return variants.map((variant, index) => {
    const nextVariant = { ...(variant || {}) };
    const config =
      nextVariant.config && typeof nextVariant.config === 'object' ? { ...nextVariant.config } : {};
    const metadata =
      config.metadata && typeof config.metadata === 'object' ? { ...config.metadata } : {};
    let resources = getVariantShippingResourceRefs({ config: { metadata } });

    const variantActions = actionMap.get(index) || [];
    const action = variantActions[variantActions.length - 1] || null;
    const cleanupEntry = cleanupMap.get(index);
    variantActions.forEach(item => {
      const managedRef = buildManagedResourceRef(item);
      if (managedRef) {
        resources = upsertShippingResourceRefs(resources, managedRef);
      }
    });
    if (cleanupEntry?.cleared_all === true) {
      resources = [];
    }

    metadata.shipping_resources = resources;
    metadata.shipping_last_execution = action
      ? {
          status: action.status,
          adapter: action.execution_adapter || null,
          strategy: action.strategy || null,
          executed_at: new Date().toISOString(),
        }
      : metadata.shipping_last_execution || null;
    if (cleanupEntry) {
      metadata.shipping_last_cleanup = {
        cleaned_count: Number(cleanupEntry.cleaned_count || 0),
        cleaned_at: new Date().toISOString(),
      };
    }
    config.metadata = metadata;
    nextVariant.config = config;
    return nextVariant;
  });
}

async function deleteManagedShippingResource(shopDomain, accessToken, resource = {}) {
  const resourceType = String(resource?.resource_type || '').trim();
  const resourceId = String(resource?.id || '').trim();
  if (!resourceType || !resourceId) {
    return { ok: false, status: 'missing_resource_ref', resource };
  }

  if (resourceType === 'carrier_service') {
    await shopifyService.requestAdminRest(shopDomain, accessToken, {
      method: 'DELETE',
      path: `carrier_services/${resourceId}.json`,
    });
    return { ok: true, status: 'deleted', resource };
  }

  if (resourceType === 'delivery_customization') {
    const mutation = `
      mutation ripxDeleteDeliveryCustomization($id: ID!) {
        deliveryCustomizationDelete(id: $id) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `;
    const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, mutation, {
      id: resourceId,
    });
    const payload = response?.data?.deliveryCustomizationDelete;
    const errors = toGraphqlUserErrors(payload?.userErrors);
    if (errors.length > 0) {
      return { ok: false, status: 'delete_failed', resource, user_errors: errors };
    }
    return { ok: true, status: 'deleted', resource };
  }

  if (resourceType === 'automatic_discount') {
    const mutation = `
      mutation ripxDeleteAutomaticDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
          userErrors {
            field
            message
          }
        }
      }
    `;
    const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, mutation, {
      id: resourceId,
    });
    const payload = response?.data?.discountAutomaticDelete;
    const errors = toGraphqlUserErrors(payload?.userErrors);
    if (errors.length > 0) {
      return { ok: false, status: 'delete_failed', resource, user_errors: errors };
    }
    return { ok: true, status: 'deleted', resource };
  }

  return { ok: false, status: 'unsupported_resource_type', resource };
}

async function cleanupManagedShippingResources({
  test,
  shopDomain,
  accessToken,
  keepVariantIndexes = [],
}) {
  const keepSet = new Set(
    (Array.isArray(keepVariantIndexes) ? keepVariantIndexes : []).filter(
      index => Number.isInteger(index) && index >= 0
    )
  );
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  const results = [];
  for (let index = 0; index < variants.length; index += 1) {
    if (keepSet.has(index)) {
      continue;
    }
    const resources = getVariantShippingResourceRefs(variants[index]);
    if (resources.length === 0) {
      continue;
    }
    let cleanedCount = 0;
    const resourceResults = [];
    for (const resource of resources) {
      try {
        const result = await deleteManagedShippingResource(shopDomain, accessToken, resource);
        resourceResults.push(result);
        if (result.ok) {
          cleanedCount += 1;
        }
      } catch (error) {
        resourceResults.push({
          ok: false,
          status: 'delete_failed',
          resource,
          message: error?.message || 'delete_failed',
        });
      }
    }
    results.push({
      variant_index: index,
      cleared_all: cleanedCount === resources.length,
      cleaned_count: cleanedCount,
      attempted_count: resources.length,
      resources: resourceResults,
    });
  }
  return results;
}

async function rollbackCreatedShippingResources({ shopDomain, accessToken, actions = [] }) {
  const results = [];
  for (const action of Array.isArray(actions) ? actions : []) {
    if (!action || !['created'].includes(String(action.status || '').trim())) {
      continue;
    }
    const resource = buildManagedResourceRef(action);
    if (!resource) {
      continue;
    }
    try {
      results.push(await deleteManagedShippingResource(shopDomain, accessToken, resource));
    } catch (error) {
      results.push({
        ok: false,
        status: 'rollback_failed',
        resource,
        message: error?.message || 'rollback_failed',
      });
    }
  }
  return results;
}

function getActionableShippingVariantIndexes(test = {}) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  const indexes = [];
  variants.forEach((variant, index) => {
    if (isActionableShippingConfig(variant?.config || {})) {
      indexes.push(index);
    }
  });
  return indexes;
}

function hasActiveManagedShippingResources(test = {}) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  return variants.some(variant => getVariantShippingResourceRefs(variant).length > 0);
}

async function detectShippingExecutionConflicts(shopDomain, currentTestId) {
  const runningTests = await getTestsByShop(shopDomain, 'running');
  const list = Array.isArray(runningTests) ? runningTests : [];
  return list
    .filter(
      test =>
        String(test?.id || '').trim() &&
        String(test.id).trim() !== String(currentTestId || '').trim()
    )
    .filter(
      test =>
        String(test?.type || '')
          .trim()
          .toLowerCase() === 'shipping'
    )
    .filter(test => hasActiveManagedShippingResources(test))
    .map(test => ({
      test_id: String(test.id),
      test_name: test.name || null,
    }));
}

async function executeShippingTestPlan({
  test,
  shopDomain,
  accessToken,
  apply = false,
  variantIndex = null,
}) {
  const capabilityReport = await buildShippingCapabilityReport(shopDomain, accessToken);
  const executionPlan = buildShippingExecutionPlan(test, capabilityReport);
  const normalizedApply = normalizeBoolean(apply, false);
  const normalizationSummary = summarizeShippingConfigNormalization(test?.variants || []);

  const selectedEntries = Array.isArray(executionPlan.variants)
    ? executionPlan.variants.filter(entry =>
        variantIndex === null || variantIndex === undefined ? true : entry.index === variantIndex
      )
    : [];

  const conflicts = normalizedApply
    ? await detectShippingExecutionConflicts(shopDomain, test?.id)
    : [];
  if (normalizedApply && conflicts.length > 0) {
    const actions = selectedEntries.map(entry =>
      toActionOutcome({
        planEntry: entry,
        apply: normalizedApply,
        reason: 'manual_required',
        details: {
          message:
            'Another running shipping test already has managed Shopify resources on this shop. Stop or clean up the other test first.',
        },
      })
    );
    return {
      test_id: test?.id || null,
      test_name: test?.name || null,
      capability_report: capabilityReport,
      execution_plan: executionPlan,
      execution_result: {
        summary: {
          action_count: actions.length,
          success_count: 0,
          manual_required_count: actions.length,
          failed_count: 0,
          apply_mode: 'apply',
          conflict_count: conflicts.length,
        },
        actions,
        conflicts,
        generated_at: new Date().toISOString(),
      },
      persisted_variants: buildPersistedShippingVariants(test, actions, []),
      cleanup_result: [],
    };
  }

  const actions = [];
  for (const entry of selectedEntries) {
    if (!entry.actionable || entry.status === 'control') {
      actions.push(
        toActionOutcome({
          planEntry: entry,
          apply: normalizedApply,
          reason: 'skipped_control',
          details: { message: 'Control or non-actionable variant. No adapter action needed.' },
        })
      );
      continue;
    }

    if (entry.status === 'manual_required') {
      actions.push(
        toActionOutcome({
          planEntry: entry,
          apply: normalizedApply,
          reason: 'manual_required',
          details: { message: 'Adapter is unavailable for this shop capability profile.' },
        })
      );
      continue;
    }

    if (
      entry.execution_adapter === 'carrier_service' &&
      ['flat_rate', 'carrier_quote'].includes(entry.strategy)
    ) {
      const replaceExistingRates =
        entry.strategy === 'flat_rate' && shouldReplaceExistingRates(entry.config || {});
      let result;
      try {
        result = await ensureShippingCarrierService({
          shopDomain,
          accessToken,
          test,
          variant: entry,
          apply: normalizedApply,
        });
      } catch (error) {
        if (!isShopifyAdminUnavailableError(error)) {
          throw error;
        }
        result = {
          ok: false,
          status: 'manual_required',
          message:
            'Shopify Admin API is currently unavailable for this store (404/timeout). Re-open RipX from Shopify Admin, then retry.',
          upstream_error: error?.message || 'shopify_admin_unavailable',
        };
      }
      actions.push(
        toActionOutcome({
          planEntry: entry,
          apply: normalizedApply,
          reason: result.ok
            ? result.status
            : result.status === 'manual_required'
              ? 'manual_required'
              : 'failed',
          details: result,
        })
      );
      if (replaceExistingRates) {
        const deliveryPlanEntry = {
          ...entry,
          execution_adapter: 'delivery_customization',
        };
        if (!result.ok) {
          actions.push(
            toActionOutcome({
              planEntry: deliveryPlanEntry,
              apply: normalizedApply,
              reason: 'manual_required',
              details: {
                status: 'skipped_dependency',
                message:
                  'Skipped hiding existing delivery methods because the replacement carrier rate was not ready.',
                dependency_status: result.status,
              },
            })
          );
        } else {
          let deliveryResult;
          try {
            deliveryResult = await ensureShippingDeliveryCustomization({
              shopDomain,
              accessToken,
              test,
              variant: {
                ...deliveryPlanEntry,
                config: {
                  ...(entry.config || {}),
                  delivery_action: 'hide',
                },
              },
              apply: normalizedApply,
            });
          } catch (error) {
            if (!isShopifyAdminUnavailableError(error)) {
              throw error;
            }
            deliveryResult = {
              ok: false,
              status: 'manual_required',
              message:
                'Shopify Admin API is currently unavailable for delivery customization checks (404/timeout).',
              upstream_error: error?.message || 'shopify_admin_unavailable',
            };
          }
          actions.push(
            toActionOutcome({
              planEntry: deliveryPlanEntry,
              apply: normalizedApply,
              reason: deliveryResult.ok
                ? deliveryResult.status
                : deliveryResult.status === 'manual_required'
                  ? 'manual_required'
                  : 'failed',
              details: deliveryResult,
            })
          );
          if (normalizedApply && !deliveryResult.ok) {
            const rollbackResult = await rollbackCreatedShippingResources({
              shopDomain,
              accessToken,
              actions: actions.filter(action => action.variant_index === entry.index),
            });
            const lastAction = actions[actions.length - 1];
            if (lastAction?.details) {
              lastAction.details.rollback_result = rollbackResult;
            }
          }
        }
      }
      continue;
    }

    if (entry.execution_adapter === 'delivery_customization') {
      let result;
      try {
        result = await ensureShippingDeliveryCustomization({
          shopDomain,
          accessToken,
          test,
          variant: entry,
          apply: normalizedApply,
        });
      } catch (error) {
        if (!isShopifyAdminUnavailableError(error)) {
          throw error;
        }
        result = {
          ok: false,
          status: 'manual_required',
          message:
            'Shopify Admin API is currently unavailable for delivery customization checks (404/timeout).',
          upstream_error: error?.message || 'shopify_admin_unavailable',
        };
      }
      actions.push(
        toActionOutcome({
          planEntry: entry,
          apply: normalizedApply,
          reason: result.ok
            ? result.status
            : result.status === 'manual_required'
              ? 'manual_required'
              : 'failed',
          details: result,
        })
      );
      continue;
    }

    if (
      entry.execution_adapter === 'discount_function' &&
      [
        'threshold_free_shipping',
        'discount_percentage',
        'discount_fixed',
        'free_shipping',
      ].includes(entry.strategy)
    ) {
      let result;
      try {
        result = await ensureShippingAutomaticDiscount({
          shopDomain,
          accessToken,
          test,
          variant: entry,
          apply: normalizedApply,
        });
      } catch (error) {
        if (!isShopifyAdminUnavailableError(error)) {
          throw error;
        }
        result = {
          ok: false,
          status: 'manual_required',
          message:
            'Shopify Admin API is currently unavailable for discount function checks (404/timeout).',
          upstream_error: error?.message || 'shopify_admin_unavailable',
        };
      }
      actions.push(
        toActionOutcome({
          planEntry: entry,
          apply: normalizedApply,
          reason: result.ok ? result.status : 'failed',
          details: result,
        })
      );
      continue;
    }

    actions.push(
      toActionOutcome({
        planEntry: entry,
        apply: normalizedApply,
        reason: 'manual_required',
        details: {
          message:
            'Auto-apply is not available yet for this strategy. Configure carrier/delivery adapter manually.',
        },
      })
    );
  }

  const profileBindingFailedCount = actions.filter(action =>
    String(action?.status || '').endsWith('_profile_binding_failed')
  ).length;
  const summary = {
    action_count: actions.length,
    success_count: actions.filter(action =>
      [
        'created',
        'updated',
        'configured',
        'already_exists',
        'dry_run_ready',
        'skipped_control',
      ].includes(action.status)
    ).length,
    manual_required_count: actions.filter(action => action.status === 'manual_required').length,
    failed_count:
      actions.filter(action => action.status === 'failed').length + profileBindingFailedCount,
    profile_binding_failed_count: profileBindingFailedCount,
    apply_mode: normalizedApply ? 'apply' : 'dry_run',
    conflict_count: conflicts.length,
    normalization_summary: normalizationSummary,
  };

  const cleanupResult = normalizedApply
    ? await cleanupManagedShippingResources({
        test,
        shopDomain,
        accessToken,
        keepVariantIndexes: Array.from(
          new Set([
            ...selectedEntries.map(entry => entry.index),
            ...getActionableShippingVariantIndexes(test),
          ])
        ),
      })
    : [];
  const persistedVariants = buildPersistedShippingVariants(test, actions, cleanupResult);

  logger.info('Shipping execution plan completed', {
    testId: test?.id || null,
    shopDomain,
    apply: normalizedApply,
    selectedVariantIndex: variantIndex,
    actionCount: actions.length,
    successCount: summary.success_count,
    manualRequiredCount: summary.manual_required_count,
    failedCount: summary.failed_count,
    normalizationSummary,
  });

  return {
    test_id: test?.id || null,
    test_name: test?.name || null,
    capability_report: capabilityReport,
    execution_plan: executionPlan,
    persisted_variants: persistedVariants,
    cleanup_result: cleanupResult,
    execution_result: {
      summary,
      actions,
      conflicts,
      generated_at: new Date().toISOString(),
    },
  };
}

function compareShippingCarrierCallbackUrls(expected, live) {
  const expectedRaw = String(expected || '').trim();
  const liveRaw = String(live || '').trim();
  if (!expectedRaw || !liveRaw) {
    return null;
  }
  if (expectedRaw.toLowerCase() === liveRaw.toLowerCase()) {
    return true;
  }
  try {
    const expectedUrl = new URL(expectedRaw);
    const liveUrl = new URL(liveRaw);
    const normalizePath = value =>
      String(value || '')
        .trim()
        .replace(/\/+$/, '');
    if (normalizePath(expectedUrl.pathname) !== normalizePath(liveUrl.pathname)) {
      return false;
    }
    const expectedIdentity = readShippingCarrierCallbackIdentity(expectedRaw);
    const liveIdentity = readShippingCarrierCallbackIdentity(liveRaw);
    if (
      expectedIdentity &&
      liveIdentity &&
      expectedIdentity.testId === liveIdentity.testId &&
      expectedIdentity.variantIndex === liveIdentity.variantIndex
    ) {
      return expectedUrl.origin.toLowerCase() === liveUrl.origin.toLowerCase();
    }
  } catch {
    return false;
  }
  return false;
}

module.exports = {
  executeShippingTestPlan,
  cleanupManagedShippingResources,
  buildPersistedShippingVariants,
  ensureShippingAutomaticDiscount,
  ensureShippingCarrierService,
  ensureShippingProfileCarrierBinding,
  ensureShippingDeliveryCustomization,
  pickShippingDiscountFunction,
  pickDeliveryCustomizationFunction,
  buildShippingDiscountTitle,
  buildShippingCarrierServiceName,
  buildShippingDeliveryCustomizationTitle,
  buildShippingCarrierCallbackUrl,
  compareShippingCarrierCallbackUrls,
  fetchCarrierServicesViaAdmin,
};
