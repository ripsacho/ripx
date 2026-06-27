/**
 * Track Routes
 *
 * Public endpoints for tracking conversion events
 * These are called from the storefront
 */

const express = require('express');
const fs = require('fs');
const router = express.Router();
const validators = require('../utils/validators');
const { trackEvent } = require('../models/analytics');
const { getActiveTestsForStorefront, getTestById, getTestsByIds } = require('../models/test');
const { listGoalMetricDefinitions } = require('../models/goalMetricDefinition');
const abTestEngine = require('../services/abTestEngine');
const {
  tenantExists,
  getTenantByDomain,
  normalizeDomain,
  isShopifyDomain,
  setDomainVerifiedAt,
} = require('../models/tenant');
const { insertHeatmapEventsBatch, normalizeHeatmapStoredPageUrl } = require('../models/heatmap');
const {
  SCRIPT_VERSION,
  buildStorefrontRuntimeConfig,
  getStorefrontScriptCacheControl,
  buildEarlyStorefrontAntiFlickerBootstrap,
  mapTestToStorefrontPayload,
} = require('../utils/storefrontScriptRuntime');
const {
  getMaintenanceMode,
  isMaintenanceActiveForDomain,
  getBlockListMessage,
} = require('../utils/maintenanceMode');
const { getShopPriceSurfaceMappings } = require('../services/priceSurfaceRegistryService');
const {
  normalizeCheckoutTrackingMetadata,
  normalizeEventName,
} = require('../utils/checkoutTracking');
const {
  resolveStorefrontPasswordForPreviewRequest,
  getShopifyStorefrontPasswordCookie,
} = require('../utils/storefrontPasswordPreview');
const {
  parseOperatingSystemFromUserAgent,
  inferTrafficSourceFromAttribution,
} = require('../utils/audienceContextInference');
const {
  getStorefrontScriptPath,
  readStorefrontScriptSource,
} = require('../utils/storefrontScriptSource');
const { getCheckoutPhaseFromTest } = require('../utils/checkoutPhases');
const { asyncHandler } = require('../middleware/asyncHandler');
const {
  HEATMAP_EVENTS_BATCH_MAX,
  PRICE_RESOLVE_BATCH_MAX,
  PRICE_BATCH_SLOW_LOG_MS,
  ERROR_MESSAGES,
} = require('../constants');
const {
  resolvePriceTestLineDiscount,
  resolveCheckoutPriceBatchForDomain,
  getCheckoutMethodCapabilitiesForDomain,
} = require('../services/priceTestCheckoutResolve');
const { resolveCheckoutShippingBatchForDomain } = require('../services/shippingCheckoutResolve');
const {
  buildCheckoutPriceDiagnostics,
  readRipxCheckoutExtensionConfigFile,
  extensionConfigInputFromReadResult,
} = require('../services/priceCheckoutDiagnostics');
const {
  resolveVariantProviderConfig,
  resolveCarrierQuoteRates,
} = require('../services/shippingQuoteProviderService');
const {
  normalizeCheckoutExperienceConfig,
} = require('../services/checkoutExperienceConfigService');
const shopifyService = require('../services/shopifyService');
const { getShopSession } = require('../models/shopSession');
const { query } = require('../utils/database');
const {
  batchResolveJsonUtf8Bytes,
  batchResolveResponseTooLarge,
  shapePriceResolveBatchLinesForCheckout,
} = require('../utils/priceResolveBatchResponse');
const { checkoutPriceSecretsMatch } = require('../utils/checkoutPriceSecret');
const {
  signPriceAssignment,
  getPriceAssignmentSigningBlocker,
} = require('../utils/priceAssignmentSignature');
const { findVariantForPreviewQuery, previewLabelEquals } = require('../utils/previewVariantMatch');
const { normalizeShippingVariantConfig } = require('../services/shippingTestConfigService');
const {
  formatCarrierRateForCheckout,
  normalizeCheckoutDisplayConfig,
} = require('../services/shippingCarrierRateFormatter');
const {
  recordShippingCarrierCallbackTrace,
  getShippingCarrierCallbackTrace,
} = require('../services/shippingCarrierCallbackTraceService');
const { evaluateFlag } = require('../services/featureFlagService');
const logger = require('../utils/logger');

function setPublicTrackCorsHeaders(req, res) {
  const origin = String(req.get('origin') || '').trim();
  const allowedOrigin =
    /^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(origin) ||
    /^https:\/\/admin\.shopify\.com$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.ngrok-free\.dev$/i.test(origin) ||
    /^https?:\/\/localhost(?::\d+)?$/i.test(origin) ||
    /^https?:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin)
      ? origin
      : '*';
  res.set('Access-Control-Allow-Origin', allowedOrigin);
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set(
    'Access-Control-Allow-Headers',
    'Content-Type,Accept,X-Requested-With,X-RipX-Debug,X-RipX-Client'
  );
  res.set('Access-Control-Max-Age', '600');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
}

router.use((req, res, next) => {
  setPublicTrackCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

const PRICE_RESOLVE_LINE_ID_MAX = Math.max(
  32,
  Number.parseInt(process.env.RIPX_PRICE_RESOLVE_LINE_ID_MAX || '256', 10) || 256
);
const PRICE_ASSIGNMENT_SIGNING_WARNING_INTERVAL_MS = Math.max(
  10000,
  Number.parseInt(process.env.RIPX_PRICE_ASSIGNMENT_SIGNING_WARNING_INTERVAL_MS || '60000', 10) ||
    60000
);
const priceAssignmentSigningWarningLastAt = new Map();
const HEATMAP_VARIANT_ID_MAX = 255;
const HEATMAP_MAX_VIEWPORT_DIMENSION = 20000;
const HEATMAP_MAX_PAGE_DIMENSION = 200000;

function parseFiniteHeatmapNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampHeatmapNumber(value, min, max) {
  if (value === null || value === undefined) {
    return null;
  }
  return Math.max(min, Math.min(max, value));
}

function normalizePositiveHeatmapInt(value, max) {
  const parsed = parseFiniteHeatmapNumber(value);
  if (parsed === null || parsed <= 0) {
    return null;
  }
  return Math.min(max, Math.max(1, Math.round(parsed)));
}

function normalizeHeatmapBoolean(value) {
  if (value === true || value === false) {
    return value;
  }
  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }
  if (value === 'false' || value === '0' || value === 0) {
    return false;
  }
  return null;
}

function normalizeHeatmapCaptureEvent(raw, domain) {
  const eventType = raw.event_type;
  const viewportWidth = normalizePositiveHeatmapInt(
    raw.viewport_width,
    HEATMAP_MAX_VIEWPORT_DIMENSION
  );
  const viewportHeight = normalizePositiveHeatmapInt(
    raw.viewport_height,
    HEATMAP_MAX_VIEWPORT_DIMENSION
  );
  const pageWidth = normalizePositiveHeatmapInt(raw.page_width, HEATMAP_MAX_PAGE_DIMENSION);
  const pageHeight = normalizePositiveHeatmapInt(raw.page_height, HEATMAP_MAX_PAGE_DIMENSION);
  const x = clampHeatmapNumber(parseFiniteHeatmapNumber(raw.x), 0, 100);
  const y = clampHeatmapNumber(parseFiniteHeatmapNumber(raw.y), 0, 100);
  const scrollDepth = clampHeatmapNumber(parseFiniteHeatmapNumber(raw.scroll_depth), 0, 100);
  const pageX = pageWidth
    ? clampHeatmapNumber(parseFiniteHeatmapNumber(raw.page_x), 0, pageWidth)
    : null;
  const pageY = pageHeight
    ? clampHeatmapNumber(parseFiniteHeatmapNumber(raw.page_y), 0, pageHeight)
    : null;
  const hasFullPageClick = pageX !== null && pageY !== null && pageWidth && pageHeight;
  const hasLegacyClick = x !== null && y !== null && viewportWidth && viewportHeight;

  if (eventType === 'click' && !hasFullPageClick && !hasLegacyClick) {
    return { event: null, reason: 'malformed' };
  }
  if (eventType === 'scroll' && scrollDepth === null) {
    return { event: null, reason: 'malformed' };
  }

  return {
    event: {
      test_id: raw.test_id,
      variant_id: String(raw.variant_id).trim().substring(0, HEATMAP_VARIANT_ID_MAX),
      shop_domain: domain,
      page_url: normalizeHeatmapStoredPageUrl(String(raw.page_url).substring(0, 2048)),
      event_type: eventType,
      x,
      y,
      scroll_depth: eventType === 'scroll' ? scrollDepth : null,
      viewport_width: viewportWidth,
      viewport_height: viewportHeight,
      page_x: hasFullPageClick ? pageX : null,
      page_y: hasFullPageClick ? pageY : null,
      page_width: pageWidth,
      page_height: pageHeight,
      device: raw.device,
      country: raw.country,
      capture_version: raw.capture_version,
      page_height_source: raw.page_height_source,
      scroll_container_detected: normalizeHeatmapBoolean(raw.scroll_container_detected),
    },
    reason: null,
  };
}

function isValidHeatmapVariantId(value) {
  const text = String(value || '').trim();
  return (
    text.length > 0 &&
    text.length <= HEATMAP_VARIANT_ID_MAX &&
    !Array.from(text).some(char => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127;
    })
  );
}

function isHeatmapVariantAllowedForTest(test, variantId) {
  if (!test || !variantId) {
    return false;
  }
  const normalizedVariantId = String(variantId).trim();
  return (test.variants || []).some(variant => {
    const candidates = [variant?.id, variant?.name, variant?.variant_id, variant?.variantId]
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value).trim());
    return candidates.includes(normalizedVariantId);
  });
}

function appendCarrierRequestAttributes(attributes, candidate) {
  if (!candidate) {
    return;
  }
  if (Array.isArray(candidate)) {
    candidate.forEach(entry => {
      if (!entry) {
        return;
      }
      const key = String(entry.name || entry.key || '').trim();
      const value = String(entry.value || '').trim();
      if (key && value) {
        attributes.push({ key, value });
      }
    });
    return;
  }
  if (typeof candidate === 'object') {
    Object.entries(candidate).forEach(([key, value]) => {
      const normalizedKey = String(key || '').trim();
      const normalizedValue = String(value || '').trim();
      if (normalizedKey && normalizedValue) {
        attributes.push({ key: normalizedKey, value: normalizedValue });
      }
    });
  }
}

function collectCarrierRequestAttributes(req) {
  const attributes = [];
  appendCarrierRequestAttributes(attributes, req.body?.attributes);
  appendCarrierRequestAttributes(attributes, req.body?.rate?.attributes);
  appendCarrierRequestAttributes(attributes, req.body?.rate?.cart?.attributes);
  appendCarrierRequestAttributes(attributes, req.body?.cart?.attributes);
  const containers = [
    req.body?.rate?.items,
    req.body?.items,
    req.body?.rate?.line_items,
    req.body?.line_items,
  ];
  for (const container of containers) {
    if (!Array.isArray(container)) {
      continue;
    }
    for (const item of container) {
      const candidates = [
        item?.properties,
        item?.attributes,
        item?.line_item?.properties,
        item?.product_properties,
        item?.property,
      ];
      for (const candidate of candidates) {
        appendCarrierRequestAttributes(attributes, candidate);
      }
    }
  }
  return attributes;
}

function carrierVariantTokensMatch(actual, expected) {
  const left = String(actual ?? '').trim();
  const right = String(expected ?? '').trim();
  if (!left || !right) {
    return false;
  }
  if (left === right || previewLabelEquals(left, right)) {
    return true;
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber === rightNumber;
}

function carrierRequestMatchesAssignment(
  req,
  { testId, variantId, variantIndex, variantName } = {}
) {
  const attributes = collectCarrierRequestAttributes(req);
  if (attributes.length === 0) {
    return false;
  }
  const getValues = (...keys) => {
    const allowedKeys = new Set(keys.map(key => String(key || '').trim()).filter(Boolean));
    return attributes
      .filter(entry => allowedKeys.has(String(entry.key || '').trim()))
      .map(entry => String(entry.value || '').trim())
      .filter(Boolean);
  };
  const testValues = getValues('_ripx_price_test', 'ripx_price_test');
  const variantValues = getValues('_ripx_variant', 'ripx_variant');
  if (testId && !testValues.includes(String(testId))) {
    return false;
  }
  const allowedVariants = [variantId, variantIndex, variantName]
    .filter(value => value !== undefined && value !== null && String(value).trim())
    .map(value => String(value).trim());
  return allowedVariants.length === 0
    ? variantValues.length > 0
    : variantValues.some(value =>
        allowedVariants.some(expected => carrierVariantTokensMatch(value, expected))
      );
}

function summarizeCarrierAssignmentDiagnostics(
  req,
  { testId, variantId, variantIndex, variantName } = {}
) {
  const attributes = collectCarrierRequestAttributes(req);
  const getValues = (...keys) => {
    const allowedKeys = new Set(keys.map(key => String(key || '').trim()).filter(Boolean));
    return attributes
      .filter(entry => allowedKeys.has(String(entry.key || '').trim()))
      .map(entry => String(entry.value || '').trim())
      .filter(Boolean);
  };
  const expectedVariants = [variantId, variantIndex, variantName]
    .filter(value => value !== undefined && value !== null && String(value).trim())
    .map(value => String(value).trim());
  return {
    attributes_count: attributes.length,
    ripx_test_values: Array.from(new Set(getValues('_ripx_price_test', 'ripx_price_test'))).slice(
      0,
      5
    ),
    ripx_variant_values: Array.from(new Set(getValues('_ripx_variant', 'ripx_variant'))).slice(
      0,
      5
    ),
    expected_test_id: testId ? String(testId) : null,
    expected_variant_values: Array.from(new Set(expectedVariants)).slice(0, 5),
  };
}

function normalizeCspOrigin(rawValue, fallback = null) {
  const value = rawValue || fallback;
  if (!value) {
    return null;
  }
  try {
    return new URL(String(value)).origin;
  } catch (_) {
    return null;
  }
}

function buildPreviewDocumentFrameAncestors(req) {
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  const appOrigin = normalizeCspOrigin(process.env.APP_URL, requestOrigin);
  const frontendOrigin = normalizeCspOrigin(process.env.FRONTEND_URL, null);
  const parentOrigin = normalizeCspOrigin(req.query.parent_origin, null);
  const sources = new Set([
    "'self'",
    'https://admin.shopify.com',
    'https://*.myshopify.com',
    appOrigin,
    frontendOrigin,
    parentOrigin,
  ]);
  return Array.from(sources).filter(Boolean).join(' ');
}

/** Middleware: return 403 when domain is on block list (key_value_store key block_list.<domain>) */
async function blockListCheck(req, res, next) {
  const shop = req.query.shop || req.body?.shop_domain || req.body?.shop;
  const site = req.query.site || req.body?.site;
  const raw = (shop || site || '').toString().trim();
  if (!raw) {
    return next();
  }
  const domain = normalizeDomain(raw) || raw.toLowerCase();
  const message = await getBlockListMessage(domain);
  if (message !== null) {
    return res.status(403).json({
      success: false,
      error: message || 'Access blocked.',
    });
  }
  next();
}

/** Middleware: return 503 when maintenance mode is on for this request's domain or global */
async function maintenanceCheck(req, res, next) {
  const maintenanceValue = await getMaintenanceMode();
  if (!maintenanceValue) {
    return next();
  }
  const shop = req.query.shop || req.body?.shop_domain || req.body?.shop;
  const site = req.query.site || req.body?.site;
  const domain = await resolveTenantDomain(shop, site);
  if (isMaintenanceActiveForDomain(domain, maintenanceValue)) {
    return res.status(503).json({
      success: false,
      error: ERROR_MESSAGES.MAINTENANCE,
      maintenance: true,
    });
  }
  next();
}

function _isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

/** Shared secret check for checkout price resolver (GET + POST). Body `secret` supported for JSON callers. */
function requireCheckoutPriceAuth(req, res) {
  const checkoutSecret = (process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim();
  const nodeEnv = String(process.env.NODE_ENV || '').toLowerCase();
  if (!checkoutSecret && nodeEnv === 'production') {
    res.status(503).json({
      success: false,
      error:
        'Checkout price resolver is unavailable: RIPX_CHECKOUT_PRICE_SECRET is required in production.',
    });
    return false;
  }
  if (!checkoutSecret) {
    return true;
  }
  const b = req.body || {};
  const headerSecret = req.get('x-ripx-price-secret');
  const raw =
    (b.secret !== undefined && b.secret !== null && String(b.secret)) ||
    (req.query.secret !== undefined && req.query.secret !== null && String(req.query.secret)) ||
    (headerSecret !== undefined && headerSecret !== null && String(headerSecret)) ||
    '';
  const provided = raw.trim();
  if (!checkoutPriceSecretsMatch(checkoutSecret, provided)) {
    res.status(403).json({ success: false, error: 'Forbidden' });
    return false;
  }
  return true;
}

async function resolveTenantDomain(shop, site) {
  const domain = shop || site;
  if (!domain) {
    return null;
  }
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return null;
  }
  const exists = await tenantExists(normalized);
  return exists ? normalized : null;
}

function setPublicStorefrontScriptHeaders(res, versionLabel, cacheControl) {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Script-Version', versionLabel);
  res.set('Cache-Control', cacheControl);
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
}

/**
 * Derive pathname from current_url for URL targeting.
 * Homepage and path-based url_patterns (e.g. ^/$|^/index) expect a path, not a full URL.
 * Standalone and Shopify send full URL; we normalize to pathname for reliable matching.
 */
function getPathnameFromUrl(currentUrl) {
  if (!currentUrl || typeof currentUrl !== 'string') {
    return '';
  }
  const s = currentUrl.trim();
  if (!s) {
    return '';
  }
  try {
    const url = new URL(s, 'https://standalone.local');
    const pathname = url.pathname || '/';
    return pathname === '' ? '/' : pathname;
  } catch {
    return s.startsWith('/') ? s : `/${s}`;
  }
}

function parsePreviewSessionFlag(value) {
  if (value === true || value === 1) {
    return true;
  }
  if (value === false || value === 0 || value === null || value === undefined) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function normalizeCallbackVariantToken(value) {
  return String(value || '')
    .trim()
    .replace(/\+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findShippingVariantByCallbackQuery(test, queryInput = {}) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  const rawIndex = queryInput?.variant_index ?? queryInput?.variantIndex;
  if (rawIndex !== undefined && rawIndex !== null && String(rawIndex).trim() !== '') {
    const parsedIndex = Number.parseInt(String(rawIndex).trim(), 10);
    if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < variants.length) {
      return { variant: variants[parsedIndex], index: parsedIndex };
    }
  }
  const rawVariantId = normalizeCallbackVariantToken(
    queryInput?.variant_id || queryInput?.variantId || ''
  );
  if (!rawVariantId) {
    return { variant: null, index: -1 };
  }
  const index = variants.findIndex(variant => {
    const id = normalizeCallbackVariantToken(variant?.id);
    const name = normalizeCallbackVariantToken(variant?.name);
    return (id && id === rawVariantId) || (name && name === rawVariantId);
  });
  return {
    variant: index >= 0 ? variants[index] : null,
    index,
  };
}

function normalizeShippingCallbackStrategy(rawStrategy, resolvedConfig = null) {
  const fromConfig = String(resolvedConfig?.strategy || '')
    .trim()
    .toLowerCase();
  if (fromConfig === 'flat_rate' || fromConfig === 'carrier_quote') {
    return fromConfig;
  }
  const raw = String(rawStrategy || '')
    .trim()
    .toLowerCase();
  if (!raw) {
    return 'flat_rate';
  }
  if (raw === 'flat_rate' || raw === 'carrier_quote') {
    return raw;
  }
  if ('flat_rate'.startsWith(raw) || raw.startsWith('flat_rat')) {
    return 'flat_rate';
  }
  if ('carrier_quote'.startsWith(raw) || raw.startsWith('carrier_quot')) {
    return 'carrier_quote';
  }
  return raw;
}

function warnPriceAssignmentSigningOnce(reason, details = {}) {
  const key = [
    String(reason || 'unknown'),
    String(details.shopDomain || ''),
    String(details.testId || ''),
  ].join('|');
  const now = Date.now();
  const lastAt = priceAssignmentSigningWarningLastAt.get(key) || 0;
  if (now - lastAt < PRICE_ASSIGNMENT_SIGNING_WARNING_INTERVAL_MS) {
    return;
  }
  priceAssignmentSigningWarningLastAt.set(key, now);
  logger.warn('price assignment returned unsigned', {
    reason,
    ...details,
  });
}

function withAssignmentSignature(variant, testId, userId, shopDomain) {
  if (!variant || typeof variant !== 'object') {
    return variant;
  }
  const variantId =
    variant.variantId !== null && variant.variantId !== undefined
      ? String(variant.variantId).trim()
      : '';
  const normalizedUserId = String(userId || '').trim();
  const normalizedShop = String(shopDomain || '')
    .trim()
    .toLowerCase();
  const issuedAtMs = Date.now();
  const signingInput = {
    testId,
    variantId,
    userId: normalizedUserId,
    shopDomain: normalizedShop,
    issuedAtMs,
  };
  const signingBlocker = getPriceAssignmentSigningBlocker(signingInput);
  if (signingBlocker) {
    warnPriceAssignmentSigningOnce(signingBlocker, {
      testId: testId ? String(testId) : null,
      hasVariantId: Boolean(variantId),
      hasUserId: Boolean(normalizedUserId),
      shopDomain: normalizedShop || null,
    });
    return variant;
  }
  const signature = signPriceAssignment(signingInput);
  if (!signature) {
    warnPriceAssignmentSigningOnce('signature_generation_failed', {
      testId: testId ? String(testId) : null,
      shopDomain: normalizedShop || null,
      hasVariantId: Boolean(variantId),
      hasUserId: Boolean(normalizedUserId),
    });
    return variant;
  }
  return {
    ...variant,
    assignment_sig: signature,
    assignment_ts: String(issuedAtMs),
    assignment_user: normalizedUserId,
  };
}

async function enrichCheckoutAssignmentCollectionProducts(config = {}, shopDomain = '') {
  const normalizedDomain =
    normalizeDomain(shopDomain) ||
    String(shopDomain || '')
      .trim()
      .toLowerCase();
  const sourceConfig = config && typeof config === 'object' ? config : {};
  const normalizedConfig = normalizeCheckoutExperienceConfig(sourceConfig);
  const withSectionStatus = (status, reason) => ({
    ...sourceConfig,
    checkout_placement: normalizedConfig.checkout_placement,
    checkout_sections: normalizedConfig.checkout_sections.map(section => {
      const props = section?.props || {};
      if (section?.type !== 'product_list' || props.product_source_mode !== 'collection') {
        return section;
      }
      return {
        ...section,
        props: {
          ...props,
          enrichment_status: {
            status,
            reason,
            product_count: Array.isArray(props.product_items) ? props.product_items.length : 0,
          },
        },
      };
    }),
  });
  if (!normalizedDomain) {
    return withSectionStatus('skipped', 'missing_shop_domain');
  }

  const collectionSections = normalizedConfig.checkout_sections.filter(section => {
    const props = section?.props || {};
    return (
      section?.type === 'product_list' &&
      props.product_source_mode === 'collection' &&
      Array.isArray(props.product_source_collections) &&
      props.product_source_collections.length > 0
    );
  });

  if (!collectionSections.length) {
    return {
      ...sourceConfig,
      checkout_placement: normalizedConfig.checkout_placement,
      checkout_sections: normalizedConfig.checkout_sections,
    };
  }

  const session = await getShopSession(normalizedDomain).catch(() => null);
  const accessToken = String(session?.access_token || '').trim();
  if (!accessToken) {
    return withSectionStatus('skipped', 'missing_shop_session_token');
  }

  const checkoutSections = await Promise.all(
    normalizedConfig.checkout_sections.map(async section => {
      const props = section?.props || {};
      if (
        section?.type !== 'product_list' ||
        props.product_source_mode !== 'collection' ||
        !Array.isArray(props.product_source_collections) ||
        props.product_source_collections.length === 0
      ) {
        return section;
      }

      try {
        const productItems = await shopifyService.listCollectionProducts(
          normalizedDomain,
          accessToken,
          props.product_source_collections.map(item => item.id),
          props.product_source_limit
        );
        const sectionProductAction = String(props.product_action || 'display_only')
          .trim()
          .toLowerCase();
        const hydratedProductItems = productItems.map(item => ({
          ...item,
          product_action:
            sectionProductAction === 'add_to_cart' ? item.product_action : 'display_only',
          selection_strategy: props.selection_strategy || item.selection_strategy,
          exclude_cart_items: props.exclude_cart_items !== false,
        }));
        return {
          ...section,
          props: {
            ...props,
            product_items: hydratedProductItems,
            enrichment_status: {
              status: hydratedProductItems.length > 0 ? 'success' : 'empty',
              reason:
                productItems.length > 0 ? 'resolved_collection_products' : 'no_products_returned',
              product_count: hydratedProductItems.length,
            },
          },
        };
      } catch (error) {
        logger.warn('Could not enrich checkout collection products', {
          shopDomain: normalizedDomain,
          sectionId: section?.id || null,
          error: error?.message || String(error),
        });
        return {
          ...section,
          props: {
            ...props,
            enrichment_status: {
              status: 'failed',
              reason: 'collection_product_lookup_failed',
              product_count: Array.isArray(props.product_items) ? props.product_items.length : 0,
            },
          },
        };
      }
    })
  );

  return {
    ...sourceConfig,
    checkout_placement: normalizedConfig.checkout_placement,
    checkout_sections: checkoutSections,
  };
}

function hasModeValue(cfg, mode) {
  if (!cfg || typeof cfg !== 'object') {
    return false;
  }
  if (mode === 'fixed') {
    return cfg.price !== undefined && cfg.price !== null && String(cfg.price).trim() !== '';
  }
  if (mode === 'amount') {
    return (
      cfg.priceDelta !== undefined &&
      cfg.priceDelta !== null &&
      String(cfg.priceDelta).trim() !== ''
    );
  }
  if (mode === 'percent') {
    return (
      cfg.pricePercent !== undefined &&
      cfg.pricePercent !== null &&
      String(cfg.pricePercent).trim() !== ''
    );
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
    base.nativeVariantId !== undefined &&
    base.nativeVariantId !== null &&
    (merged.nativeVariantId === undefined || merged.nativeVariantId === null)
  ) {
    merged.nativeVariantId = base.nativeVariantId;
  }
  if (
    base.priceApplicationMethod !== undefined &&
    base.priceApplicationMethod !== null &&
    (merged.priceApplicationMethod === undefined || merged.priceApplicationMethod === null)
  ) {
    merged.priceApplicationMethod = base.priceApplicationMethod;
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

/** Align API/DB snake_case with storefront + checkout (camelCase). */
function normalizePriceConfigShape(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }
  const c = { ...config };
  if (!c.priceMode && c.price_mode) {
    c.priceMode = c.price_mode;
  }
  if (c.priceDelta === undefined && c.price_delta !== undefined) {
    c.priceDelta = c.price_delta;
  }
  if (c.pricePercent === undefined && c.price_percent !== undefined) {
    c.pricePercent = c.price_percent;
  }
  if (!c.priceBase && c.price_base) {
    c.priceBase = c.price_base;
  }
  if (c.nativeVariantId === undefined && c.native_variant_id !== undefined) {
    c.nativeVariantId = c.native_variant_id;
  }
  if (!c.priceApplicationMethod && c.price_application_method) {
    c.priceApplicationMethod = c.price_application_method;
  }
  if (c.roundTo === undefined && c.round_to !== undefined) {
    c.roundTo = c.round_to;
  }
  if (typeof c.priceMode === 'string') {
    c.priceMode = c.priceMode.toLowerCase();
  }
  return c;
}

function normalizePreviewVariantConfig(config) {
  if (!config || typeof config !== 'object') {
    return {};
  }
  const normalized = normalizePriceConfigShape({ ...config });
  if (normalized.byProduct && typeof normalized.byProduct === 'object') {
    const nextByProduct = {};
    for (const [productId, productCfg] of Object.entries(normalized.byProduct)) {
      if (!productCfg || typeof productCfg !== 'object') {
        continue;
      }
      nextByProduct[productId] = normalizeMergedPriceConfig(normalized, productCfg);
    }
    normalized.byProduct = nextByProduct;
  }
  if (normalized.byVariant && typeof normalized.byVariant === 'object') {
    const nextByVariant = {};
    for (const [variantId, variantCfg] of Object.entries(normalized.byVariant)) {
      if (!variantCfg || typeof variantCfg !== 'object') {
        continue;
      }
      nextByVariant[variantId] = normalizeMergedPriceConfig(normalized, variantCfg);
    }
    normalized.byVariant = nextByVariant;
  }
  return normalized;
}

function resolveEmbeddedPreviewVariantForRuntime(testRow, query = {}) {
  if (!testRow || typeof testRow !== 'object') {
    return null;
  }
  const variants = Array.isArray(testRow.variants) ? testRow.variants : [];
  const variant =
    findVariantForPreviewQuery(variants, {
      variant_id: query.variant_id,
      variant_name: query.variant_name,
    }) ||
    variants.find((item, index) => {
      if (!item) {
        return false;
      }
      if (index === 0) {
        return true;
      }
      const label = String(item.name || '')
        .trim()
        .toLowerCase();
      return label === 'control' || label.startsWith('control ');
    }) ||
    variants[0];
  if (!variant) {
    return null;
  }
  const rawConfig = variant.config && typeof variant.config === 'object' ? variant.config : {};
  const config = normalizePreviewVariantConfig(rawConfig);
  if (variant.code && config.code === undefined) {
    config.code = variant.code;
  }
  return {
    variantId: variant.id,
    variantName: variant.name,
    config,
  };
}

/** Return a safe, low-detail diagnostics payload for unauthenticated public route callers. */
function toPublicCheckoutDiagnosticsPayload(body) {
  const checks = Array.isArray(body?.checklist)
    ? body.checklist.map(item => ({
        id: item?.id || null,
        ok: Boolean(item?.ok),
        severity: item?.severity || null,
      }))
    : [];
  const safeSummary = body?.summary || {};
  const safeShop = body?.shop || null;
  return {
    success: true,
    public_redacted: true,
    summary: {
      overall_status: safeSummary.overall_status || 'warning',
      overall_ok: Boolean(safeSummary.overall_ok),
      checks_passed: Number(safeSummary.checks_passed || 0),
      checks_total: Number(safeSummary.checks_total || checks.length || 0),
      checks_warning: Number(safeSummary.checks_warning || 0),
      checks_error: Number(safeSummary.checks_error || 0),
    },
    checklist: checks,
    shop: safeShop
      ? {
          shop_domain: safeShop.shop_domain || safeShop.domain || null,
          tenant_registered: Boolean(safeShop.tenant_registered),
          running_price_tests:
            safeShop.running_price_tests === null || safeShop.running_price_tests === undefined
              ? null
              : Number(safeShop.running_price_tests),
        }
      : null,
    recommendations: [
      'Use authenticated GET /api/settings/checkout-price-diagnostics in app for full infrastructure details.',
    ],
  };
}

function isTruthyDebugFlag(value) {
  if (value === true || value === 1) {
    return true;
  }
  const v = String(value || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Returns true if tenant is suspended or blocked (admin) */
function isTenantSuspendedOrBlocked(tenant) {
  const s = tenant?.status;
  return s === 'suspended' || s === 'blocked';
}

router.use(blockListCheck);
router.use(maintenanceCheck);

/**
 * GET /api/track/storefront-script-health
 * Ops / debugging: confirms the deployed server is reading `shopify/storefront-script.js` and shows size + feature flags.
 * No shop param required.
 */
router.get(
  '/storefront-script-health',
  asyncHandler((req, res) => {
    const scriptPath = getStorefrontScriptPath();
    let stat = null;
    try {
      stat = fs.statSync(scriptPath);
    } catch (e) {
      return res.status(503).json({
        success: false,
        error: 'storefront_script_missing',
        path: scriptPath,
      });
    }
    let snippet = '';
    try {
      const fd = fs.openSync(scriptPath, 'r');
      const buf = Buffer.alloc(Math.min(65536, stat.size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      snippet = buf.toString('utf8');
    } catch (e2) {
      snippet = '';
    }
    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      scriptVersion: SCRIPT_VERSION,
      scriptPath,
      scriptSizeBytes: stat.size,
      hasDebugStatus: snippet.includes('debugStatus'),
      hasPreviewMergeMeta: snippet.includes('__RIPX_PREVIEW_MERGE__'),
      serverTime: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/track/ping
 * Called by the storefront script when it loads on a page. Sets domain_verified_at for the tenant.
 * Query: shop (Shopify) or site (standalone).
 */
router.get(
  '/ping',
  asyncHandler(async (req, res) => {
    const shop = req.query.shop;
    const site = req.query.site;
    const domain = await resolveTenantDomain(shop, site);
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid shop/site. Use ?shop=xxx.myshopify.com or ?site=example.com',
      });
    }
    const tenant = await getTenantByDomain(domain);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Domain not registered' });
    }
    if (isTenantSuspendedOrBlocked(tenant)) {
      return res.status(403).json({ success: false, error: 'Access suspended' });
    }
    await setDomainVerifiedAt(domain);
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, verified: true });
  })
);

/**
 * GET /api/track/script.js
 * Serve storefront script with runtime configuration
 * Query: shop (Shopify) or site (standalone)
 */
router.get(
  '/script.js',
  asyncHandler(async (req, res) => {
    const shop = req.query.shop;
    const site = req.query.site;
    const cacheControl = getStorefrontScriptCacheControl();
    const versionLabel = req.query.v ? String(req.query.v) : SCRIPT_VERSION;
    setPublicStorefrontScriptHeaders(res, versionLabel, cacheControl);

    const isPreviewTest =
      (shop && String(shop).toLowerCase() === 'preview-test') ||
      (site && String(site).toLowerCase() === 'preview-test');
    let domain;
    let runtimeConfig;

    if (isPreviewTest) {
      domain = 'preview-test';
      const appUrl = process.env.APP_URL || req.protocol + '://' + req.get('host');
      runtimeConfig = {
        apiUrl: appUrl.replace(/\/+$/, '') + '/api',
        scriptHealthUrl: appUrl.replace(/\/+$/, '') + '/api/track/storefront-script-health',
        shopDomain: 'preview-test',
        version: SCRIPT_VERSION,
        runtimeSource: 'preview_document_fallback',
        consentRequired: process.env.RIPX_CONSENT_REQUIRED === 'true',
        activeTests: [],
      };
    } else {
      domain = await resolveTenantDomain(shop, site);
      if (!domain) {
        const normalizedShop = normalizeDomain(shop);
        if (!normalizedShop || !isShopifyDomain(normalizedShop)) {
          return res
            .status(400)
            .send('Invalid shop or site. Use ?shop=xxx.myshopify.com or ?site=example.com');
        }
        // Let valid Shopify storefronts initialize even before the tenant/session row exists.
        // Preview mode can then expose diagnostics instead of failing at script load time.
        domain = normalizedShop;
      }

      const tenant = await getTenantByDomain(domain);
      if (tenant && isTenantSuspendedOrBlocked(tenant)) {
        return res
          .status(403)
          .json({ success: false, error: 'Access suspended. Contact support.' });
      }

      const [tests, goalMetricDefinitions, shopPriceSurfaceMappings] = await Promise.all([
        getActiveTestsForStorefront(domain),
        listGoalMetricDefinitions(domain).catch(() => []),
        getShopPriceSurfaceMappings(domain).catch(() => []),
      ]);
      runtimeConfig = buildStorefrontRuntimeConfig(
        domain,
        tests,
        req,
        goalMetricDefinitions,
        {
          shopMappings: shopPriceSurfaceMappings,
        },
        { runtimeSource: 'direct_track' }
      );
      logger.info('Storefront script test set (direct_track)', {
        domain,
        totalTests: Array.isArray(tests) ? tests.length : 0,
        servedTests: (Array.isArray(tests) ? tests : []).slice(0, 25).map(test => ({
          id: test?.id || null,
          type: test?.type || null,
          status: test?.status || null,
          personalizationMode: test?.personalization_mode || null,
        })),
      });
      const nonRunningShippingTests = (Array.isArray(tests) ? tests : []).filter(test => {
        const type = String(test?.type || '')
          .trim()
          .toLowerCase();
        const status = String(test?.status || '')
          .trim()
          .toLowerCase();
        return type === 'shipping' && status !== 'running';
      });
      if (nonRunningShippingTests.length > 0) {
        logger.warn('Non-running shipping tests served to storefront (direct_track)', {
          domain,
          count: nonRunningShippingTests.length,
          tests: nonRunningShippingTests.slice(0, 25).map(test => ({
            id: test?.id || null,
            type: test?.type || null,
            status: test?.status || null,
            personalizationMode: test?.personalization_mode || null,
          })),
        });
      }
    }

    const scriptPath = getStorefrontScriptPath();
    const scriptContents = readStorefrontScriptSource(scriptPath);
    res.send(
      `window.AB_TEST_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};\n` +
        buildEarlyStorefrontAntiFlickerBootstrap(
          runtimeConfig.activeTests,
          runtimeConfig.priceSurfaceRegistry
        ) +
        scriptContents
    );
  })
);

function buildPreviewFallbackHtml(message = 'Preview unavailable. Check the URL or try again.') {
  const safeMessage = escapeHtmlAttr(message);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview unavailable</title></head><body style="margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f3f4f6;color:#6b7280;"><script>try{var msg={type:"ripx-preview-error",source:"ripx-preview-document",message:${JSON.stringify(message)}};if(window.parent&&window.parent!==window)window.parent.postMessage(msg,"*");if(window.opener&&!window.opener.closed)window.opener.postMessage(msg,"*");}catch(e){}</script><p style="margin:0;font-size:0.9375rem;text-align:center;max-width:460px;line-height:1.5;">${safeMessage}</p></body></html>`;
}

function sendPreviewFallback(res, message) {
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .set(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"
    )
    .send(buildPreviewFallbackHtml(message));
}

/** Reject private/loopback hostnames for preview-document to reduce SSRF risk. In development, localhost is allowed. */
function isPrivateOrUnsafeHost(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return true;
  }
  const h = hostname.toLowerCase().trim();
  if (h === '0.0.0.0' || h === '::1' || h === '::' || h === 'ip6-localhost') {
    return true;
  }
  const isDev = process.env.NODE_ENV !== 'production';
  if (h === 'localhost' || h.endsWith('.localhost') || h === '127.0.0.1') {
    return isDev ? false : true;
  }
  const parts = h.split('.');
  if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    if (a === 10) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 127) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
  }
  return false;
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isLikelyShopifyPasswordPage(html, responseUrl = '') {
  const lowerHtml = String(html || '').toLowerCase();
  const lowerUrl = String(responseUrl || '').toLowerCase();
  return (
    lowerUrl.includes('/password') ||
    lowerHtml.includes('name="form_type" value="storefront_password"') ||
    lowerHtml.includes("name='form_type' value='storefront_password'") ||
    lowerHtml.includes('this store is password protected') ||
    lowerHtml.includes('enter store password') ||
    lowerHtml.includes('/password')
  );
}

/**
 * GET /api/track/preview-launch
 * Client-side redirect that seeds preview context in window.name before navigating to the storefront.
 * This helps password-protected Shopify dev stores where the password page strips preview query params.
 */
router.get(
  '/preview-launch',
  asyncHandler((req, res) => {
    const rawUrl = (req.query.url || '').toString().trim();
    if (!rawUrl) {
      return res.status(400).type('text/plain').send('Missing preview URL');
    }

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).type('text/plain').send('Invalid preview URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).type('text/plain').send('Invalid preview URL');
    }

    const hostname = parsed.hostname || parsed.host || '';
    if (isPrivateOrUnsafeHost(hostname)) {
      logger.warn('Preview launch: rejected private or unsafe host', { hostname });
      return res.status(400).type('text/plain').send('Invalid preview URL');
    }

    // Backward-compatible preview context recovery:
    // if launcher query misses ab_preview_* params, recover them from the target URL itself.
    const targetPreview = parsed.searchParams || new URLSearchParams();
    const previewFlag =
      req.query.ab_preview === '1' ||
      targetPreview.get('ab_preview') === '1' ||
      !!req.query.ab_preview_test;
    const previewTestId = req.query.ab_preview_test || targetPreview.get('ab_preview_test') || null;
    const previewVariantId =
      req.query.ab_preview_variant || targetPreview.get('ab_preview_variant') || null;
    const previewVariantName =
      req.query.ab_preview_variant_name || targetPreview.get('ab_preview_variant_name') || null;
    const previewTestType =
      req.query.ab_preview_test_type || targetPreview.get('ab_preview_test_type') || null;
    const previewTenantDomain =
      req.query.ab_preview_domain || targetPreview.get('ab_preview_domain') || null;

    const previewCtx = {
      preview: previewFlag,
      testId: previewTestId ? String(previewTestId) : null,
      testType: previewTestType ? String(previewTestType) : null,
      variantId: previewVariantId ? String(previewVariantId) : null,
      variantName: previewVariantName ? String(previewVariantName) : null,
      tenantDomain: previewTenantDomain ? String(previewTenantDomain) : null,
      persistedAtMs: Date.now(),
    };

    const targetUrl = parsed.toString();
    const previewLaunchTarget = /\.myshopify\.com$/i.test(parsed.hostname || '')
      ? `https://${parsed.hostname}/apps/ripx/preview-bootstrap-v2?url=${encodeURIComponent(targetUrl)}`
      : targetUrl;
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Launching Preview...</title>
  </head>
  <body>
    <p>Launching preview...</p>
    <noscript>
      <p>JavaScript is required for preview bootstrap. Continue manually:</p>
      <p><a href="${escapeHtmlAttr(previewLaunchTarget)}">Open preview</a></p>
    </noscript>
    <script>
      (function () {
        try {
          window.name = "__ripx_preview_ctx_v1__:" + JSON.stringify(${JSON.stringify(previewCtx)});
        } catch (e) {}
        var target = ${JSON.stringify(previewLaunchTarget)};
        // Deterministic bootstrap: seed window.name first, then redirect.
        setTimeout(function () {
          try {
            window.location.replace(target);
          } catch (_e) {
            window.location.href = target;
          }
        }, 0);
      })();
    </script>
  </body>
</html>`;
    res.set('Cache-Control', 'no-store');
    // This page intentionally uses a tiny inline script to persist preview context in window.name
    // before redirecting. Allow inline script only for this single launcher response.
    res.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
    );
    res.type('html').send(html);
  })
);

/**
 * GET /api/track/preview-document
 * Proxies a store page and injects the RipX storefront script so element selection works in the iframe.
 * On any error we return 200 with fallback HTML so the parent always receives postMessage and can switch to direct URL.
 * Query: url (required, full store page URL), plus any ab_preview* params (passed through in response).
 */
router.get(
  '/preview-document',
  asyncHandler(async (req, res) => {
    const rawUrl = (req.query.url || '').toString().trim();
    if (!rawUrl) {
      sendPreviewFallback(res);
      return;
    }
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      sendPreviewFallback(res);
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      sendPreviewFallback(res);
      return;
    }
    const hostname = parsed.hostname || parsed.host || '';
    if (isPrivateOrUnsafeHost(hostname)) {
      logger.warn('Preview document: rejected private or unsafe host', { hostname });
      sendPreviewFallback(res);
      return;
    }
    const timeoutMs = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const storefrontPassword = resolveStorefrontPasswordForPreviewRequest(
        typeof req.query.storefront_password === 'string' ? req.query.storefront_password : '',
        req.get('host') || ''
      );
      const storefrontPasswordCookie = await getShopifyStorefrontPasswordCookie(
        parsed,
        storefrontPassword,
        controller.signal
      );
      const fetchRes = await fetch(rawUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(storefrontPasswordCookie ? { Cookie: storefrontPasswordCookie } : {}),
        },
      });
      clearTimeout(timeoutId);
      if (!fetchRes.ok) {
        logger.warn('Preview document: upstream not ok', { url: rawUrl, status: fetchRes.status });
        sendPreviewFallback(res);
        return;
      }
      const contentType = (fetchRes.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/html')) {
        sendPreviewFallback(res);
        return;
      }
      let html = await fetchRes.text();
      if (isLikelyShopifyPasswordPage(html, fetchRes.url || rawUrl)) {
        const priceSurfacePick =
          req.query.ab_price_surface_pick === '1' ||
          parsed.searchParams.get('ab_price_surface_pick') === '1';
        const passwordHint = priceSurfacePick ? 'Theme price mapping' : 'the visual editor';
        sendPreviewFallback(
          res,
          storefrontPassword
            ? 'Storefront password was not accepted. Check the password and try again.'
            : `This Shopify store is password protected. Enter the storefront password under ${passwordHint}, then pick or reload preview.`
        );
        return;
      }
      const maxHtmlBytes = 5 * 1024 * 1024; // 5MB cap to avoid DoS from huge responses
      if (Buffer.byteLength(html, 'utf8') > maxHtmlBytes) {
        logger.warn('Preview document: response too large', {
          url: rawUrl,
          bytes: Buffer.byteLength(html, 'utf8'),
        });
        sendPreviewFallback(res);
        return;
      }
      // Use final URL after redirects so base/origin match the actual response (e.g. http→https, non-www→www).
      let origin = `${parsed.protocol}//${parsed.host}`;
      let hostname = parsed.hostname || parsed.host || '';
      if (fetchRes.url) {
        try {
          const finalUrl = new URL(fetchRes.url);
          if (finalUrl.protocol === 'http:' || finalUrl.protocol === 'https:') {
            const finalHost = finalUrl.hostname || hostname;
            if (isPrivateOrUnsafeHost(finalHost)) {
              logger.warn('Preview document: redirect to private or unsafe host', {
                hostname: finalHost,
              });
              sendPreviewFallback(res);
              return;
            }
            origin = finalUrl.origin;
            hostname = finalHost;
          }
        } catch (_) {
          /* keep initial origin/hostname */
        }
      }
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      // Escape origin for safe use in replace (e.g. $ in host would break replacement).
      const originForReplace = origin.replace(/\$/g, '$$');

      // Base URL = store origin root so relative assets (theme.css, assets/...) load from store root.
      // Escape for HTML attribute: & and " so base tag never breaks parsing.
      const baseHref = (origin + '/').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const baseTag = `<base href="${baseHref}">`;
      const referrerMeta = '<meta name="referrer" content="no-referrer">'; // so store CDN doesn't block subresource requests from proxy origin

      // Strip CSP so store CSS/JS can load when document is served from our origin (iframe).
      html = html.replace(
        /<meta\s[^>]*\bhttp-equiv\s*=\s*["']?(?:Content-Security-Policy|Content-Security-Policy-Report-Only)["']?[^>]*>/gi,
        ''
      );

      // Rewrite root-relative URLs (href="/... and src="/...) to absolute so resources load from the store.
      html = html.replace(
        /(\s(?:href|src)\s*=\s*["'])\/(?!\/)/g,
        (_m, prefix) => prefix + originForReplace + '/'
      );
      // Normalize protocol-relative URLs (//cdn.shopify.com/...) to https so they load in any context.
      html = html.replace(/(\s(?:href|src)\s*=\s*["'])\/\//g, '$1https://');

      // Rewrite root-relative and protocol-relative url() in CSS (inline styles and <style> blocks).
      html = html.replace(/url\s*\(\s*["']?\/(?!\/)/g, () => `url(${originForReplace}/`);
      html = html.replace(/url\s*\(\s*["']?\/\//g, () => 'url(https://');

      const pickLauncherParam = value => {
        if (value === null || value === undefined) {
          return '';
        }
        return String(value).trim();
      };
      const previewLauncherParams = {};
      const setLauncherParam = (key, value) => {
        const trimmed = pickLauncherParam(value);
        if (trimmed) {
          previewLauncherParams[key] = trimmed;
        }
      };
      [
        'ab_preview',
        'ab_preview_test',
        'ab_preview_variant',
        'ab_preview_variant_name',
        'ab_preview_domain',
        'ab_preview_session',
        'ab_preview_reset',
        'ab_visual_editor',
        'ab_visual_picker',
        'ab_price_surface_pick',
        'parent_origin',
      ].forEach(key => {
        setLauncherParam(key, req.query[key] || parsed.searchParams.get(key));
      });
      if (storefrontPassword) {
        previewLauncherParams.storefront_password = storefrontPassword;
      }
      const runtimeConfig = {
        apiUrl: `${appUrl.replace(/\/+$/, '')}/api`,
        shopDomain: hostname,
        version: SCRIPT_VERSION,
        consentRequired: process.env.RIPX_CONSENT_REQUIRED === 'true',
        activeTests: [],
        visualEditor: req.query.ab_visual_editor === '1',
        previewTestId: req.query.ab_preview_test || null,
        previewVariantId: req.query.ab_preview_variant || null,
        previewVariantName: req.query.ab_preview_variant_name || null,
        previewTenantDomain: req.query.ab_preview_domain || null,
        previewMode: req.query.ab_preview === '1' || !!req.query.ab_preview_test,
        previewDocumentApiUrl: `${appUrl.replace(/\/+$/, '')}/api/track/preview-document`,
        previewLauncherParams,
        priceSurfaceRegistry: {
          version: 1,
          shopMappings: [],
        },
      };
      const previewTestId =
        typeof req.query.ab_preview_test === 'string' ? req.query.ab_preview_test.trim() : '';
      const previewDomain = await resolveTenantDomain(hostname, hostname);
      if (previewDomain) {
        const [shopPriceSurfaceMappings, previewTestRow] = await Promise.all([
          getShopPriceSurfaceMappings(previewDomain).catch(() => []),
          previewTestId && validators.isValidUUID(previewTestId)
            ? getTestById(previewTestId, previewDomain)
            : Promise.resolve(null),
        ]);
        runtimeConfig.priceSurfaceRegistry.shopMappings = shopPriceSurfaceMappings;
        if (previewTestRow) {
          runtimeConfig.activeTests = [mapTestToStorefrontPayload(previewTestRow)];
          const embeddedPreviewVariant = resolveEmbeddedPreviewVariantForRuntime(previewTestRow, {
            variant_id: req.query.ab_preview_variant || null,
            variant_name: req.query.ab_preview_variant_name || null,
          });
          if (embeddedPreviewVariant) {
            runtimeConfig.previewVariant = embeddedPreviewVariant;
          }
        }
      }
      let scriptContent;
      try {
        scriptContent = readStorefrontScriptSource(getStorefrontScriptPath());
        scriptContent = scriptContent.replace(/<\/script>/gi, '<\\/script>');
      } catch (e) {
        logger.warn('Preview document: could not read storefront script', { error: e.message });
        sendPreviewFallback(res);
        return;
      }
      const forcePickerBoot =
        req.query.ab_visual_picker === '1' || req.query.ab_price_surface_pick === '1';
      const pickerBootScript = forcePickerBoot
        ? '<script>window.__RIPX_FORCE_PICKER__=true;</script>'
        : '';
      const injectScript =
        pickerBootScript +
        `<script>window.AB_TEST_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};</script>` +
        (scriptContent ? `<script>${scriptContent}</script>` : '');

      // Inject base and referrer policy at start of <head> so all relative URLs resolve to the store.
      if (html.includes('<head')) {
        html = html.replace(/(<head\s*[^>]*>)/i, `$1\n${baseTag}\n${referrerMeta}`);
      }
      if (html.includes('</head>')) {
        html = html.replace('</head>', () => `${injectScript}\n</head>`);
      } else if (html.includes('<body')) {
        html = html.replace(/(<body[^>]*>)/i, match => `${match}\n${baseTag}\n${injectScript}\n`);
      } else {
        html = baseTag + '\n' + injectScript + '\n' + html;
      }
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      // Permissive CSP for preview iframe so injected script and store CSS/JS/resources load.
      // The editor often runs inside Shopify Admin, so frame-ancestors must allow the full
      // ancestor chain, not just the app origin.
      res.set(
        'Content-Security-Policy',
        `default-src 'self' https: http:; script-src 'unsafe-inline' 'unsafe-eval' 'self' https: http:; style-src 'unsafe-inline' 'self' https: http:; img-src 'self' data: https: http:; font-src 'self' https: http: data:; connect-src 'self' https: http:; frame-ancestors ${buildPreviewDocumentFrameAncestors(req)}`
      );
      res.send(html);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        logger.warn('Preview document: request timed out', { url: rawUrl });
      } else {
        logger.warn('Preview document fetch failed', { url: rawUrl, error: err.message });
      }
      sendPreviewFallback(res);
    }
  })
);

/**
 * POST /api/track
 * Track a conversion event
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      test_id,
      user_id,
      shop_domain,
      event_type = 'conversion',
      event_name = null,
      event_value = 0,
      metadata = {},
    } = req.body;

    if (!test_id || !user_id || !shop_domain) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: test_id, user_id, shop_domain',
      });
    }

    const tenant = await getTenantByDomain(normalizeDomain(shop_domain) || shop_domain);
    if (tenant && isTenantSuspendedOrBlocked(tenant)) {
      return res.status(403).json({ success: false, error: 'Access suspended. Contact support.' });
    }

    if (!validators.isValidUUID(test_id)) {
      return res.status(400).json({ success: false, error: 'Invalid test_id format' });
    }

    if (String(user_id).length > 512 || String(shop_domain).length > 255) {
      return res
        .status(400)
        .json({ success: false, error: 'user_id or shop_domain exceeds max length' });
    }

    const domain = normalizeDomain(shop_domain);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ success: false, error: 'Site not registered' });
    }

    // Get user's variant assignment
    const previewSession =
      parsePreviewSessionFlag(req.body?.preview_session) ||
      parsePreviewSessionFlag(req.body?.is_preview) ||
      parsePreviewSessionFlag(req.body?.metadata?.preview) ||
      parsePreviewSessionFlag(req.body?.metadata?.preview_session);
    const trackingContext = previewSession ? { preview_session: true } : {};
    const variant = await abTestEngine.getVariant(test_id, user_id, domain, trackingContext);

    if (!variant) {
      return res.status(404).json({
        success: false,
        error: 'Test not found or not running',
      });
    }

    // Track the event (supports custom events via event_name)
    const eventPayload = {
      test_id,
      variant_id: variant.variantId,
      user_id,
      shop_domain: domain,
      event_type,
      event_name: event_name || null,
      event_value,
      metadata,
    };
    await trackEvent(eventPayload);

    // Forward to GA4 when configured (fire-and-forget)
    try {
      const ga4Service = require('../services/ga4Service');
      ga4Service.forwardToGA4(eventPayload, user_id);
    } catch (_) {
      // GA4 forward is best-effort
    }

    res.json({
      success: true,
      message: 'Event tracked successfully',
    });

    if (process.env.LOG_TRACK_EVENTS === 'true') {
      logger.info('AB test track event', {
        test_id,
        variant_id: variant?.variantId,
        user_id,
        shop_domain,
        event_type,
        event_value,
      });
    }
  })
);

/**
 * POST /api/track/heatmap
 * Batch receive heatmap events (clicks, scroll) from storefront
 */
router.post(
  '/heatmap',
  asyncHandler(async (req, res) => {
    const { shop_domain, site, events } = req.body || {};

    const domain = await resolveTenantDomain(shop_domain, site);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ success: false, error: 'Site not registered' });
    }
    const tenantHeatmap = await getTenantByDomain(domain);
    if (tenantHeatmap && isTenantSuspendedOrBlocked(tenantHeatmap)) {
      return res.status(403).json({ success: false, error: 'Access suspended. Contact support.' });
    }
    const heatmapFlag = await evaluateFlag('flag.heatmaps', {
      domain,
      defaultValue: true,
    });
    if (!heatmapFlag.enabled) {
      return res.json({ success: true, inserted: 0, rejected: 0, disabled: true });
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.json({ success: true, inserted: 0 });
    }

    if (events.length > HEATMAP_EVENTS_BATCH_MAX) {
      return res.status(400).json({
        success: false,
        error: `Too many events. Maximum ${HEATMAP_EVENTS_BATCH_MAX} per request.`,
      });
    }

    const rejectedByReason = { malformed: 0, invalid_variant: 0 };
    const valid = [];
    events.forEach(e => {
      if (
        validators.isValidUUID(e.test_id) &&
        isValidHeatmapVariantId(e.variant_id) &&
        e.page_url &&
        (e.event_type === 'click' || e.event_type === 'scroll')
      ) {
        valid.push(e);
      } else {
        rejectedByReason.malformed += 1;
      }
    });

    if (valid.length === 0) {
      return res.json({ success: true, inserted: 0, rejected: events.length, rejectedByReason });
    }

    const testsById = await getTestsByIds(
      valid.map(event => event.test_id),
      domain
    );
    const toInsert = [];
    valid.forEach(e => {
      const test = testsById.get(String(e.test_id));
      if (!test || !isHeatmapVariantAllowedForTest(test, e.variant_id)) {
        rejectedByReason.invalid_variant += 1;
        return;
      }
      const normalized = normalizeHeatmapCaptureEvent(e, domain);
      if (!normalized.event) {
        rejectedByReason[normalized.reason] = (rejectedByReason[normalized.reason] || 0) + 1;
        return;
      }
      toInsert.push(normalized.event);
    });

    if (toInsert.length === 0) {
      return res.json({
        success: true,
        inserted: 0,
        rejected: events.length,
        rejectedByReason,
      });
    }

    const { inserted } = await insertHeatmapEventsBatch(toInsert);

    res.json({
      success: true,
      inserted,
      rejected: events.length - inserted,
      rejectedByReason,
    });
  })
);

/**
 * GET /api/track/variants
 *
 * Live storefront bucketing endpoint. Price tests depend on this route for both assignment and
 * diagnostics: the browser sends page/product/segment context, this route validates the tenant,
 * asks `abTestEngine` for assignments, then signs each variant before returning it.
 *
 * See `PRICE_TEST_FLOW.md` before changing query params or diagnostic fields.
 */
router.get(
  '/variants',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const {
      user_id,
      shop_domain,
      test_ids,
      device,
      customer,
      country,
      operating_system,
      traffic_source,
      current_url,
      session_count,
      referrer,
      utm_source,
      utm_medium,
      js_targeting_results,
      current_product_id,
      current_collection_id,
      preview_session,
      ripx_diag,
    } = req.query;

    if (!user_id || !shop_domain || !test_ids) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters: user_id, shop_domain, test_ids',
      });
    }

    if (String(user_id).length > 512 || String(shop_domain).length > 255) {
      return res
        .status(400)
        .json({ success: false, error: 'user_id or shop_domain exceeds max length' });
    }

    const ids = String(test_ids)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const invalidIds = ids.filter(id => !validators.isValidUUID(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ success: false, error: 'Invalid test_id format in test_ids' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ success: false, error: 'Maximum 50 tests per request' });
    }
    let jsResults = {};
    try {
      if (js_targeting_results) {
        jsResults =
          typeof js_targeting_results === 'string'
            ? JSON.parse(js_targeting_results)
            : js_targeting_results;
      }
    } catch {
      jsResults = {};
    }

    // Keep this context aligned with `shopify/storefront-script.js#getVariantCachePromise`.
    // Missing fields here can make live bucketing behave differently from debugStatus/preview.
    const context = { device, customer, country, operating_system };
    context.user_agent = req.headers['user-agent'] || req.query.user_agent || null;
    context.user_ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      null;
    if (traffic_source) {
      context.traffic_source = traffic_source;
    }
    if (current_url) {
      context.current_url = current_url;
      context.current_pathname = getPathnameFromUrl(current_url);
    }
    if (req.query.current_pathname && typeof req.query.current_pathname === 'string') {
      context.current_pathname =
        (req.query.current_pathname || '').trim() || context.current_pathname;
    }
    if (current_product_id && String(current_product_id).trim()) {
      context.current_product_id = String(current_product_id).trim();
    }
    if (current_collection_id && String(current_collection_id).trim()) {
      context.current_collection_id = String(current_collection_id).trim();
    }
    if (parsePreviewSessionFlag(preview_session)) {
      context.preview_session = true;
    }
    if (session_count !== undefined && session_count !== null && session_count !== '') {
      context.session_count = Number(session_count);
    }
    if (referrer) {
      context.referrer = referrer;
    }
    if (utm_source) {
      context.utm_source = utm_source;
    }
    if (utm_medium) {
      context.utm_medium = utm_medium;
    }

    const domain = normalizeDomain(shop_domain);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ success: false, error: 'Site not registered' });
    }
    const tenantVariants = await getTenantByDomain(domain);
    if (tenantVariants && isTenantSuspendedOrBlocked(tenantVariants)) {
      return res.status(403).json({ success: false, error: 'Access suspended. Contact support.' });
    }

    const contextOverrides = {};
    for (const tid of ids) {
      if (jsResults[tid] !== undefined) {
        contextOverrides[tid] = {
          js_targeting_passed: jsResults[tid] === true || jsResults[tid] === 'true',
        };
      }
    }

    let assignments;
    if (ids.length > 1) {
      assignments = await abTestEngine.getVariantsBatch(
        ids,
        user_id,
        domain,
        context,
        contextOverrides
      );
    } else {
      const tid = ids[0];
      const singleContext = { ...context, ...(contextOverrides[tid] || {}) };
      const v = await abTestEngine.getVariant(tid, user_id, domain, singleContext);
      assignments = v ? { [tid]: v } : {};
    }

    const signedAssignments = {};
    Object.entries(assignments || {}).forEach(([tid, variant]) => {
      signedAssignments[tid] = withAssignmentSignature(variant, tid, user_id, domain);
    });

    const responsePayload = {
      success: true,
      variants: signedAssignments,
    };

    // Only expose lightweight diagnostic metadata for known first-party probes. Full assignment
    // details remain inside the signed variant payload and server logs.
    const diagnosticMode = String(ripx_diag || '')
      .trim()
      .slice(0, 80);
    const includeDiagnostics = ['live_batch', 'debugStatus'].includes(diagnosticMode);
    if (includeDiagnostics) {
      const assignedTestIds = Object.keys(signedAssignments);
      responsePayload.diagnostics = {
        diagnostic: diagnosticMode,
        requestedTestIds: ids,
        assignedTestIds,
        unassignedTestIds: ids.filter(
          id => !Object.prototype.hasOwnProperty.call(signedAssignments, id)
        ),
        assignedCount: assignedTestIds.length,
        previewSession: parsePreviewSessionFlag(preview_session),
        context: {
          current_pathname: context.current_pathname || null,
          current_product_id: context.current_product_id || null,
          current_collection_id: context.current_collection_id || null,
          device: context.device || null,
          customer: context.customer || null,
          country: context.country || null,
          traffic_source: context.traffic_source || null,
          session_count: context.session_count ?? null,
        },
      };
    }

    res.json(responsePayload);
  })
);

/**
 * GET /api/track/variant
 * Get variant for a user (for storefront integration)
 */
router.get(
  '/variant',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const {
      test_id,
      user_id,
      shop_domain,
      device,
      customer,
      country,
      operating_system,
      traffic_source,
      current_url,
      session_count,
      referrer,
      utm_source,
      utm_medium,
      js_targeting_passed,
      force_variant,
      current_product_id,
      current_collection_id,
      preview_session,
    } = req.query;

    if (!test_id || !user_id || !shop_domain) {
      return res.status(400).json({
        success: false,
        error: 'Missing required query parameters',
      });
    }

    if (!validators.isValidUUID(test_id)) {
      return res.status(400).json({ success: false, error: 'Invalid test_id format' });
    }

    if (String(user_id).length > 512 || String(shop_domain).length > 255) {
      return res
        .status(400)
        .json({ success: false, error: 'user_id or shop_domain exceeds max length' });
    }

    const context = { device, customer, country, operating_system };
    context.user_agent = req.headers['user-agent'] || req.query.user_agent || null;
    context.user_ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      null;
    if (traffic_source) {
      context.traffic_source = traffic_source;
    }
    if (js_targeting_passed !== undefined) {
      context.js_targeting_passed = js_targeting_passed === true || js_targeting_passed === 'true';
    }
    if (current_url) {
      context.current_url = current_url;
      context.current_pathname = getPathnameFromUrl(current_url);
    }
    if (req.query.current_pathname && typeof req.query.current_pathname === 'string') {
      context.current_pathname =
        (req.query.current_pathname || '').trim() || context.current_pathname;
    }
    if (current_product_id && String(current_product_id).trim()) {
      context.current_product_id = String(current_product_id).trim();
    }
    if (current_collection_id && String(current_collection_id).trim()) {
      context.current_collection_id = String(current_collection_id).trim();
    }
    const previewSessionEnabled = parsePreviewSessionFlag(preview_session);
    if (previewSessionEnabled) {
      context.preview_session = true;
    }
    if (session_count !== undefined && session_count !== null && session_count !== '') {
      context.session_count = Number(session_count);
    }
    if (referrer) {
      context.referrer = referrer;
    }
    if (utm_source) {
      context.utm_source = utm_source;
    }
    if (utm_medium) {
      context.utm_medium = utm_medium;
    }

    const domain = normalizeDomain(shop_domain);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ success: false, error: 'Site not registered' });
    }

    // Force variation for QA: ?force_variant=control|variant_id|variant_name (Phase 3)
    let variant = null;
    if (force_variant && String(force_variant).trim()) {
      const test = await getTestById(test_id, domain);
      const variants = test && Array.isArray(test.variants) ? test.variants : [];
      const forced = variants.find(v => {
        const idMatch = v?.id && String(v.id) === String(force_variant).trim();
        const nameMatch =
          v?.name &&
          (String(v.name).toLowerCase() === String(force_variant).trim().toLowerCase() ||
            (String(force_variant).trim().toLowerCase() === 'control' &&
              (String(v.name).toLowerCase() === 'control' || v.is_control)));
        return idMatch || nameMatch;
      });
      if (forced) {
        const variantId = forced.id ?? forced.name;
        const variantName = forced.name || String(variantId);
        if (!previewSessionEnabled) {
          const { saveTestAssignment } = require('../models/testAssignment');
          await saveTestAssignment({
            test_id,
            user_id,
            shop_domain: domain,
            variant_id: String(variantId),
            variant_name: variantName,
            assigned_at: new Date(),
            device: context.device || null,
            country: context.country || null,
          }).catch(() => {});
        }
        variant = {
          variantId: String(variantId),
          variantName,
          isNewAssignment: true,
          config: forced.config || {},
        };
      }
    }
    if (!variant) {
      variant = await abTestEngine.getVariant(test_id, user_id, domain, context);
    }

    if (!variant) {
      return res.json({
        success: true,
        variant: null,
      });
    }

    const signedVariant = withAssignmentSignature(variant, test_id, user_id, domain);
    res.json({
      success: true,
      variant: signedVariant,
    });

    if (process.env.LOG_TRACK_EVENTS === 'true') {
      logger.info('Variant assignment returned', {
        test_id,
        user_id,
        shop_domain: domain,
        variant_id: signedVariant?.variantId,
      });
    }
  })
);

/**
 * POST /api/track/checkout-assignment
 * Resolve assignment for Checkout UI extensions using a checkout-scoped user key.
 * Body/query: shop|shop_domain|site, test_id, checkout_id, optional current_url/current_pathname/device/customer/country,
 * traffic_source, operating_system, utm_source, utm_medium, referrer, session_count, assignment_variant.
 * When traffic_source is omitted, it is inferred from utm_* / referrer / current_url query string (parity with storefront).
 * When operating_system is omitted, it is derived from the request User-Agent when possible.
 * Requires checkout secret when RIPX_CHECKOUT_PRICE_SECRET is configured.
 */
router.post(
  '/checkout-assignment',
  asyncHandler(async (req, res) => {
    if (!requireCheckoutPriceAuth(req, res)) {
      return;
    }

    const body = req.body || {};
    const testIdRaw = body.test_id ?? req.query.test_id;
    const shopRaw = body.shop ?? body.shop_domain ?? req.query.shop ?? req.query.shop_domain;
    const siteRaw = body.site ?? req.query.site;
    const checkoutIdRaw = body.checkout_id ?? req.query.checkout_id;
    const assignmentVariantRaw =
      body.assignment_variant ??
      body.variant_id ??
      req.query.assignment_variant ??
      req.query.variant_id;

    const testId = String(testIdRaw || '').trim();
    const checkoutId = String(checkoutIdRaw || '').trim();
    const assignmentVariant = String(assignmentVariantRaw || '').trim();
    if (!validators.isValidUUID(testId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing test_id' });
    }
    if (!checkoutId) {
      return res.status(400).json({ success: false, error: 'Missing checkout_id' });
    }

    const domain = await resolveTenantDomain(shopRaw, siteRaw);
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Invalid shop or site' });
    }
    const tenant = await getTenantByDomain(domain);
    if (tenant && isTenantSuspendedOrBlocked(tenant)) {
      return res.status(403).json({ success: false, error: 'Access suspended' });
    }

    const userId = `checkout:${checkoutId}`;
    const context = {
      device: body.device ?? req.query.device ?? null,
      customer: body.customer ?? req.query.customer ?? null,
      country: body.country ?? req.query.country ?? null,
      user_agent: req.headers['user-agent'] || null,
    };
    const bodyTraffic = body.traffic_source ?? req.query.traffic_source;
    if (bodyTraffic !== null && bodyTraffic !== undefined && String(bodyTraffic).trim()) {
      context.traffic_source = String(bodyTraffic).trim().toLowerCase();
    }
    const bodyOs = body.operating_system ?? req.query.operating_system;
    if (bodyOs !== null && bodyOs !== undefined && String(bodyOs).trim()) {
      context.operating_system = String(bodyOs).trim().toLowerCase();
    }
    const utmSourceRaw = body.utm_source ?? req.query.utm_source;
    const utmMediumRaw = body.utm_medium ?? req.query.utm_medium;
    const referrerRaw = body.referrer ?? req.query.referrer;
    if (utmSourceRaw !== null && utmSourceRaw !== undefined && String(utmSourceRaw).trim()) {
      context.utm_source = String(utmSourceRaw).trim();
    }
    if (utmMediumRaw !== null && utmMediumRaw !== undefined && String(utmMediumRaw).trim()) {
      context.utm_medium = String(utmMediumRaw).trim();
    }
    if (referrerRaw !== null && referrerRaw !== undefined && String(referrerRaw).trim()) {
      context.referrer = String(referrerRaw).trim();
    }
    const sessionCountRaw = body.session_count ?? req.query.session_count;
    if (sessionCountRaw !== undefined && sessionCountRaw !== null && sessionCountRaw !== '') {
      const n = Number(sessionCountRaw);
      if (!Number.isNaN(n)) {
        context.session_count = n;
      }
    }
    const currentUrl = body.current_url ?? req.query.current_url;
    const currentPathname = body.current_pathname ?? req.query.current_pathname;
    if (currentUrl && String(currentUrl).trim()) {
      context.current_url = String(currentUrl).trim();
      context.current_pathname = getPathnameFromUrl(context.current_url);
    }
    if (currentPathname && String(currentPathname).trim()) {
      context.current_pathname = String(currentPathname).trim();
    }
    let utmSource = context.utm_source || '';
    let utmMedium = context.utm_medium || '';
    const referrer = context.referrer || '';
    if ((!utmSource || !utmMedium) && context.current_url) {
      try {
        const u = new URL(context.current_url);
        if (!utmSource) {
          utmSource = u.searchParams.get('utm_source') || '';
        }
        if (!utmMedium) {
          utmMedium = u.searchParams.get('utm_medium') || '';
        }
      } catch {
        // ignore
      }
    }
    if (!context.traffic_source) {
      const inferred = inferTrafficSourceFromAttribution({
        utm_source: utmSource,
        utm_medium: utmMedium,
        referrer,
      });
      if (inferred) {
        context.traffic_source = inferred;
      }
    }
    if (!context.operating_system && context.user_agent) {
      const derivedOs = parseOperatingSystemFromUserAgent(context.user_agent);
      if (derivedOs) {
        context.operating_system = derivedOs;
      }
    }
    const previewSession =
      parsePreviewSessionFlag(body.preview_session ?? req.query.preview_session) ||
      parsePreviewSessionFlag(body.is_preview ?? req.query.is_preview);
    if (previewSession) {
      context.preview_session = true;
    }

    let variant = null;
    let test = null;
    let assignmentSource = 'bucket';
    if (assignmentVariant) {
      test = await getTestById(testId, domain);
      const variants = Array.isArray(test?.variants) ? test.variants : [];
      const forced = findVariantForPreviewQuery(variants, {
        variant_id: assignmentVariant,
        variant_name: assignmentVariant,
      });
      if (forced) {
        const forcedVariantId =
          forced.id !== undefined && forced.id !== null ? String(forced.id).trim() : '';
        const forcedVariantName =
          forced.name !== undefined && forced.name !== null ? String(forced.name).trim() : '';
        const resolvedVariantId = forcedVariantId || forcedVariantName || assignmentVariant;
        variant = {
          variantId: resolvedVariantId,
          variantName: forcedVariantName || resolvedVariantId,
          isNewAssignment: false,
          config: forced.config && typeof forced.config === 'object' ? forced.config : {},
        };
        assignmentSource = 'cart_line';
      }
    }
    if (!variant) {
      variant = await abTestEngine.getVariant(testId, userId, domain, context);
    }
    if (!variant) {
      return res.json({ success: true, assignment: null });
    }
    if (!test) {
      test = await getTestById(testId, domain).catch(() => null);
    }
    const checkoutPhase = getCheckoutPhaseFromTest(test);
    variant = {
      ...variant,
      config: await enrichCheckoutAssignmentCollectionProducts(variant.config || {}, domain),
    };
    const signedVariant = withAssignmentSignature(variant, testId, userId, domain);
    return res.json({
      success: true,
      assignment: {
        test_id: testId,
        user_id: userId,
        variant_id: signedVariant.variantId,
        variant_name: signedVariant.variantName || null,
        checkout_phase: checkoutPhase,
        assignment_source: assignmentSource,
        config: signedVariant.config || {},
        assignment_sig: signedVariant.assignment_sig || null,
        assignment_ts: signedVariant.assignment_ts || null,
        assignment_user: signedVariant.assignment_user || null,
      },
    });
  })
);

/**
 * POST /api/track/checkout-conversion
 * Track a checkout UI extension engagement signal for a checkout-scoped user key.
 * Body/query: shop|shop_domain|site, test_id, checkout_id, optional event_name/event_value/metadata.
 * Requires checkout secret when RIPX_CHECKOUT_PRICE_SECRET is configured.
 */
router.post(
  '/checkout-conversion',
  asyncHandler(async (req, res) => {
    if (!requireCheckoutPriceAuth(req, res)) {
      return;
    }

    const body = req.body || {};
    const testIdRaw = body.test_id ?? req.query.test_id;
    const shopRaw = body.shop ?? body.shop_domain ?? req.query.shop ?? req.query.shop_domain;
    const siteRaw = body.site ?? req.query.site;
    const checkoutIdRaw = body.checkout_id ?? req.query.checkout_id;

    const testId = String(testIdRaw || '').trim();
    const checkoutId = String(checkoutIdRaw || '').trim();
    if (!validators.isValidUUID(testId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing test_id' });
    }
    if (!checkoutId) {
      return res.status(400).json({ success: false, error: 'Missing checkout_id' });
    }

    const domain = await resolveTenantDomain(shopRaw, siteRaw);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ success: false, error: 'Site not registered' });
    }
    const tenant = await getTenantByDomain(domain);
    if (tenant && isTenantSuspendedOrBlocked(tenant)) {
      return res.status(403).json({ success: false, error: 'Access suspended' });
    }

    const userId = `checkout:${checkoutId}`;
    const context = {
      device: body.device ?? req.query.device ?? null,
      customer: body.customer ?? req.query.customer ?? null,
      country: body.country ?? req.query.country ?? null,
      user_agent: req.headers['user-agent'] || null,
    };
    const currentUrl = body.current_url ?? req.query.current_url;
    if (currentUrl && String(currentUrl).trim()) {
      context.current_url = String(currentUrl).trim();
      context.current_pathname = getPathnameFromUrl(context.current_url);
    }
    const previewSession =
      parsePreviewSessionFlag(body.preview_session ?? req.query.preview_session) ||
      parsePreviewSessionFlag(body.is_preview ?? req.query.is_preview);
    if (previewSession) {
      context.preview_session = true;
    }
    const variant = await abTestEngine.getVariant(testId, userId, domain, context);
    if (!variant) {
      return res.json({
        success: true,
        tracked: false,
        reason: 'no_assignment',
        assignment: null,
      });
    }
    const test = await getTestById(testId, domain).catch(() => null);
    const checkoutPhase = getCheckoutPhaseFromTest(test);

    const eventNameRaw = body.event_name ?? req.query.event_name;
    const eventName = normalizeEventName(eventNameRaw, 'checkout_phase_conversion');
    const eventValueRaw = body.event_value ?? req.query.event_value;
    const eventValue =
      eventValueRaw === undefined || eventValueRaw === null || eventValueRaw === ''
        ? 0
        : Number(eventValueRaw);
    const metadata = normalizeCheckoutTrackingMetadata(
      body.metadata && typeof body.metadata === 'object' ? body.metadata : {}
    );

    const eventPayload = {
      test_id: testId,
      variant_id: variant.variantId,
      user_id: userId,
      shop_domain: domain,
      event_type: 'custom',
      event_name: eventName || null,
      event_value: Number.isFinite(eventValue) ? eventValue : 0,
      metadata: {
        ...metadata,
        source: 'checkout_ui_extension',
        checkout_id: checkoutId,
        checkout_phase: checkoutPhase,
      },
    };
    await trackEvent(eventPayload);
    try {
      const ga4Service = require('../services/ga4Service');
      ga4Service.forwardToGA4(eventPayload, userId);
    } catch (_) {
      // best-effort
    }

    return res.json({
      success: true,
      tracked: true,
      variant_id: variant.variantId,
      checkout_phase: checkoutPhase,
      event_name: eventName,
    });
  })
);

/**
 * GET /api/track/preview
 * Return a specific variant config for preview links.
 */
router.get(
  '/preview',
  asyncHandler(async (req, res) => {
    const { test_id, variant_id, variant_name, shop_domain, site, user_id } = req.query;
    const domain = await resolveTenantDomain(shop_domain, site);

    if (!test_id || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: test_id and shop_domain or site',
      });
    }
    const tenantPreview = await getTenantByDomain(domain);
    if (tenantPreview && isTenantSuspendedOrBlocked(tenantPreview)) {
      return res.status(403).json({ success: false, error: 'Access suspended. Contact support.' });
    }

    if (!validators.isValidUUID(test_id)) {
      return res.status(400).json({ success: false, error: 'Invalid test_id format' });
    }

    const test = await getTestById(test_id, domain);
    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    const variants = Array.isArray(test.variants) ? test.variants : [];
    const variantFromQuery = findVariantForPreviewQuery(variants, { variant_id, variant_name });
    const variant =
      variantFromQuery ||
      variants.find((item, index) => {
        if (!item) {
          return false;
        }
        if (index === 0) {
          return true;
        }
        const label = String(item.name || '')
          .trim()
          .toLowerCase();
        return label === 'control' || label.startsWith('control ');
      }) ||
      variants[0];

    if (!variant) {
      return res.status(404).json({ success: false, error: 'Variant not found' });
    }

    const rawConfig = variant.config && typeof variant.config === 'object' ? variant.config : {};
    const config = normalizePreviewVariantConfig(rawConfig);
    if (variant.code && config.code === undefined) {
      config.code = variant.code;
    }

    const previewVariant = {
      variantId: variant.id,
      variantName: variant.name,
      config,
    };
    const previewUserId = user_id !== undefined && user_id !== null ? String(user_id).trim() : '';
    const signedPreviewVariant = withAssignmentSignature(
      previewVariant,
      String(test_id).trim(),
      previewUserId,
      domain
    );

    return res.json({
      success: true,
      variant: signedPreviewVariant,
    });
  })
);

/**
 * GET /api/track/preview-storefront-test
 * Minimal test row for storefront script (same shape as activeTests[]).
 * Used when previewing draft/paused tests that are not embedded in script.js activeTests.
 */
router.get(
  '/preview-storefront-test',
  asyncHandler(async (req, res) => {
    const { test_id, shop_domain, site } = req.query;
    const domain = await resolveTenantDomain(shop_domain, site);

    if (!test_id || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: test_id and shop_domain or site',
      });
    }
    const tenantPs = await getTenantByDomain(domain);
    if (tenantPs && isTenantSuspendedOrBlocked(tenantPs)) {
      return res.status(403).json({ success: false, error: 'Access suspended. Contact support.' });
    }

    if (!validators.isValidUUID(test_id)) {
      return res.status(400).json({ success: false, error: 'Invalid test_id format' });
    }

    const testRow = await getTestById(test_id, domain);
    if (!testRow) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    return res.json({
      success: true,
      test: mapTestToStorefrontPayload(testRow),
    });
  })
);

/**
 * GET /api/track/preview-health
 * One-shot preview diagnostics for wizard/runtime UX.
 * Query: test_id, shop_domain|site, optional variant_id, variant_name, user_id
 */
router.get(
  '/preview-health',
  asyncHandler(async (req, res) => {
    const { test_id, variant_id, variant_name, shop_domain, site, user_id } = req.query;
    const domain = await resolveTenantDomain(shop_domain, site);
    if (!test_id || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: test_id and shop_domain or site',
      });
    }
    if (!validators.isValidUUID(String(test_id))) {
      return res.status(400).json({ success: false, error: 'Invalid test_id format' });
    }
    const tenantPreview = await getTenantByDomain(domain);
    if (tenantPreview && isTenantSuspendedOrBlocked(tenantPreview)) {
      return res.status(403).json({ success: false, error: 'Access suspended. Contact support.' });
    }

    const checks = [];
    const addCheck = (id, ok, message) =>
      checks.push({
        id,
        ok: Boolean(ok),
        message: String(message || ''),
      });

    const test = await getTestById(String(test_id), domain);
    addCheck(
      'test_found',
      Boolean(test),
      test
        ? 'Preview test exists for this shop domain.'
        : 'Preview test was not found for this shop.'
    );
    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found',
        health: {
          score: 0,
          level: 'error',
          checks,
        },
      });
    }

    const variants = Array.isArray(test.variants) ? test.variants : [];
    const variantFromQuery = findVariantForPreviewQuery(variants, { variant_id, variant_name });
    const variant =
      variantFromQuery ||
      variants.find((item, index) => {
        if (!item) {
          return false;
        }
        if (index === 0) {
          return true;
        }
        const label = String(item.name || '')
          .trim()
          .toLowerCase();
        return label === 'control' || label.startsWith('control ');
      }) ||
      variants[0] ||
      null;

    addCheck(
      'variant_resolved',
      Boolean(variant),
      variant
        ? 'Preview variant resolved from query or control fallback.'
        : 'Preview variant could not be resolved.'
    );

    const storefrontShape = mapTestToStorefrontPayload(test);
    addCheck(
      'storefront_shape_ready',
      Boolean(storefrontShape && storefrontShape.id),
      storefrontShape && storefrontShape.id
        ? 'Storefront fallback test shape can be generated.'
        : 'Storefront fallback test shape is incomplete.'
    );

    const rawConfig = variant?.config && typeof variant.config === 'object' ? variant.config : {};
    const config = normalizePreviewVariantConfig(rawConfig);
    if (variant?.code && config.code === undefined) {
      config.code = variant.code;
    }
    addCheck(
      'variant_config_present',
      Object.keys(config || {}).length > 0,
      Object.keys(config || {}).length > 0
        ? 'Preview variant has normalized config.'
        : 'Preview variant config is empty (rendering may be limited).'
    );

    const previewUserId = user_id !== undefined && user_id !== null ? String(user_id).trim() : '';
    const signedPreviewVariant = withAssignmentSignature(
      {
        variantId: variant?.id || null,
        variantName: variant?.name || null,
        config,
      },
      String(test_id).trim(),
      previewUserId,
      domain
    );
    const hasSignedAssignment =
      Boolean(signedPreviewVariant?.assignment_sig) &&
      Boolean(signedPreviewVariant?.assignment_ts) &&
      Boolean(signedPreviewVariant?.assignment_user);
    addCheck(
      'assignment_signature',
      hasSignedAssignment,
      hasSignedAssignment
        ? 'Preview variant includes assignment signature fields.'
        : 'Preview variant does not include assignment signature fields.'
    );

    const okCount = checks.filter(item => item.ok).length;
    const score = Math.round((okCount / Math.max(1, checks.length)) * 100);
    const level = score >= 80 ? 'ready' : score >= 50 ? 'warning' : 'error';

    return res.json({
      success: true,
      health: {
        score,
        level,
        checks,
      },
      preview: {
        shopDomain: domain,
        testId: String(test_id).trim(),
        variantId: variant?.id || null,
        variantName: variant?.name || null,
      },
    });
  })
);

/**
 * GET /api/track/price-checkout-diagnostics
 * Operator / merchant QA: verifies batch resolver URL (APP_URL / RIPX_PRICE_RESOLVE_BATCH_URL),
 * HTTPS, optional RIPX_CHECKOUT_PRICE_SECRET mode, PRICE_RESOLVE_BATCH_MAX.
 *
 * Query (optional): shop (Shopify) or site (standalone). When provided, must be a **registered** tenant;
 * response includes count of running tests with type `price`. Omit shop/site for server-only checks.
 *
 * Does not require RIPX_CHECKOUT_PRICE_SECRET (this is for setup verification, not the resolver itself).
 * Public route returns a redacted payload by default; set RIPX_PUBLIC_CHECKOUT_DIAGNOSTICS_FULL=true
 * only when you explicitly want full infra details on the public endpoint.
 * When the repo file `extensions/ripx-checkout-discount/src/ripxConfig.js` is readable from the API process, full diagnostics include extension-vs-env drift checks. Set RIPX_DIAGNOSTICS_SKIP_EXTENSION_CONFIG=true to skip (e.g. API-only container).
 *
 * Authenticated alternative (same JSON, no CORS from the app UI): GET /api/settings/checkout-price-diagnostics
 */
router.get(
  '/price-checkout-diagnostics',
  asyncHandler(async (req, res) => {
    const shop = req.query.shop;
    const site = req.query.site;

    /** @type {{ shopDomain: string|null, tenantRegistered: boolean|null, runningPriceTests: number|null }} */
    let shopOpts = {
      shopDomain: null,
      tenantRegistered: null,
      runningPriceTests: null,
    };

    if (shop || site) {
      const domain = await resolveTenantDomain(shop, site);
      if (!domain) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid or unregistered shop/site. Omit shop and site for server-only diagnostics, or use a registered domain.',
        });
      }
      const countRes = await query(
        `SELECT COUNT(*)::int AS c FROM tests
         WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
           AND LOWER(TRIM(status)) = 'running'
           AND LOWER(TRIM(type)) IN ('price', 'pricing')`,
        [domain]
      );
      shopOpts = {
        shopDomain: domain,
        tenantRegistered: true,
        runningPriceTests: countRes.rows[0]?.c ?? 0,
      };
    }

    const skipExtDiag =
      (process.env.RIPX_DIAGNOSTICS_SKIP_EXTENSION_CONFIG || '').toLowerCase() === 'true';
    const extensionConfig = skipExtDiag
      ? { source: 'omit' }
      : extensionConfigInputFromReadResult(readRipxCheckoutExtensionConfigFile());

    const body = buildCheckoutPriceDiagnostics({
      shopDomain: shopOpts.shopDomain,
      tenantRegistered: shopOpts.tenantRegistered,
      runningPriceTests: shopOpts.runningPriceTests,
      extensionConfig,
    });

    res.set('Cache-Control', 'no-store');
    const exposeFull =
      (process.env.RIPX_PUBLIC_CHECKOUT_DIAGNOSTICS_FULL || '').toLowerCase() === 'true';
    return res.json(exposeFull ? body : toPublicCheckoutDiagnosticsPayload(body));
  })
);

/**
 * GET /api/track/price-resolve
 * Compute per-line discount so checkout can match RipX price-test display (fixed / amount / percent).
 * Intended for a Shopify Product Discount Function with network access (fetch), or server-side cart tools.
 * Cart line must include attributes _ripx_price_test (test UUID) and _ripx_variant (assigned variant id/name).
 *
 * Query: shop|shop_domain|site, test_id, assignment_variant, product_id, line_total, optional variant_id, qty, compare_at_unit (for priceBase=compare_at), assignment_sig, assignment_ts, assignment_user, currency, secret
 * When RIPX_CHECKOUT_PRICE_SECRET is set, pass secret as query param or X-RipX-Price-Secret header.
 */
router.get(
  '/price-resolve',
  asyncHandler(async (req, res) => {
    if (!requireCheckoutPriceAuth(req, res)) {
      return;
    }

    const {
      shop,
      shop_domain,
      site,
      test_id,
      assignment_variant,
      product_id,
      variant_id,
      line_total,
      qty,
      compare_at_unit,
      assignment_sig,
      assignment_ts,
      assignment_user,
      debug,
    } = req.query;

    const domain = await resolveTenantDomain(shop || shop_domain, site);
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Invalid shop or site' });
    }
    const tenantPr = await getTenantByDomain(domain);
    if (tenantPr && isTenantSuspendedOrBlocked(tenantPr)) {
      return res.status(403).json({ success: false, error: 'Access suspended' });
    }

    if (!test_id || !validators.isValidUUID(String(test_id))) {
      return res.status(400).json({ success: false, error: 'Invalid or missing test_id' });
    }
    if (!assignment_variant || !String(assignment_variant).trim()) {
      return res.status(400).json({ success: false, error: 'Missing assignment_variant' });
    }
    if (!product_id || !String(product_id).trim()) {
      return res.status(400).json({ success: false, error: 'Missing product_id' });
    }
    const lineTotal = Number.parseFloat(String(line_total || '').trim());
    if (!Number.isFinite(lineTotal) || lineTotal <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid line_total' });
    }
    const quantity = Math.max(1, Number.parseInt(String(qty || '1'), 10) || 1);

    const test = await getTestById(String(test_id), domain);
    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    const resolveArgs = {
      test,
      assignmentVariantId: String(assignment_variant).trim(),
      productId: String(product_id).trim(),
      variantId: variant_id ? String(variant_id).trim() : null,
      linePresentmentTotal: lineTotal,
      quantity,
      shopDomain: domain,
      assignmentSignature:
        assignment_sig !== undefined && assignment_sig !== null
          ? String(assignment_sig).trim()
          : '',
      assignmentIssuedAtMs:
        assignment_ts !== undefined && assignment_ts !== null ? String(assignment_ts).trim() : '',
      assignmentUserId:
        assignment_user !== undefined && assignment_user !== null
          ? String(assignment_user).trim()
          : '',
      compareAtUnitPrice:
        compare_at_unit !== undefined &&
        compare_at_unit !== null &&
        String(compare_at_unit).trim() !== ''
          ? String(compare_at_unit).trim()
          : null,
      debug: isTruthyDebugFlag(debug) || isTruthyDebugFlag(req.get('x-ripx-debug')),
    };

    let result = resolvePriceTestLineDiscount(resolveArgs);
    if (result.reason === 'auto_selected_native_variant_price') {
      const shopCapabilities = await getCheckoutMethodCapabilitiesForDomain(domain);
      if (shopCapabilities?.directPriceOverrideAvailable === true) {
        result = resolvePriceTestLineDiscount({
          ...resolveArgs,
          shopCapabilities,
        });
      }
    }

    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      applies: result.applies,
      discountDecimal: result.discountDecimal || null,
      targetLineDecimal: result.targetLineDecimal || null,
      currencyCode: req.query.currency ? String(req.query.currency).trim() : null,
      reason: result.reason || null,
    });
  })
);

/**
 * POST /api/track/price-resolve-batch
 * Batch resolver for Shopify Discount Function `cart.lines.discounts.generate.fetch` (single HTTP round-trip).
 *
 * Body JSON: { shop|site, secret?, lines: [{ line_id, test_id, assignment_variant, assignment_sig?, assignment_ts?, assignment_user?, product_id, variant_id?, line_total, qty?, compare_at_unit? }] } — compare_at_unit from CartLineCost.compareAtAmountPerQuantity when using priceBase compare_at.
 *
 * Response `lines` default shape: `{ line_id, applies, discountDecimal }` (compact for Shopify size limits).
 * Set env `RIPX_PRICE_BATCH_FULL_RESPONSE=true` to include `targetLineDecimal` and `reason` per line.
 * Authenticated/manual callers can also send body `{ debug: true }` or header `X-RipX-Debug: 1`
 * to receive full per-line output without changing the global env behavior for Shopify.
 */
router.post(
  '/price-resolve-batch',
  asyncHandler(async (req, res) => {
    if (!requireCheckoutPriceAuth(req, res)) {
      return;
    }

    const body = req.body || {};
    const shop = body.shop || body.shop_domain;
    const site = body.site;

    const domain = await resolveTenantDomain(shop, site);
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Invalid shop or site' });
    }
    const tenantPr = await getTenantByDomain(domain);
    if (tenantPr && isTenantSuspendedOrBlocked(tenantPr)) {
      return res.status(403).json({ success: false, error: 'Access suspended' });
    }

    const lines = body.lines;
    const debugRequested =
      isTruthyDebugFlag(body.debug) || isTruthyDebugFlag(req.get('x-ripx-debug'));
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ success: false, error: 'lines must be a non-empty array' });
    }
    if (lines.length > PRICE_RESOLVE_BATCH_MAX) {
      return res.status(400).json({
        success: false,
        error: `Too many lines. Maximum ${PRICE_RESOLVE_BATCH_MAX} per request.`,
      });
    }

    for (let i = 0; i < lines.length; i++) {
      const row = lines[i];
      if (!row || typeof row !== 'object') {
        return res.status(400).json({ success: false, error: `Invalid line at index ${i}` });
      }
      const tid = row.test_id;
      if (
        tid !== undefined &&
        tid !== null &&
        String(tid).trim() !== '' &&
        !validators.isValidUUID(String(tid).trim())
      ) {
        return res.status(400).json({ success: false, error: `Invalid test_id at index ${i}` });
      }
      const rawLineId = row.line_id;
      if (rawLineId !== undefined && rawLineId !== null) {
        const lineId = String(rawLineId);
        if (lineId.length > PRICE_RESOLVE_LINE_ID_MAX) {
          return res.status(400).json({
            success: false,
            error: `line_id too long at index ${i}. Maximum ${PRICE_RESOLVE_LINE_ID_MAX} characters.`,
          });
        }
      }
    }

    const t0 = Date.now();
    const resolved = await resolveCheckoutPriceBatchForDomain(
      domain,
      lines,
      getTestById,
      getTestsByIds,
      { debug: debugRequested }
    );
    const linesOut = shapePriceResolveBatchLinesForCheckout(resolved, {
      fullResponse: debugRequested,
    });
    const payload = { success: true, lines: linesOut };
    const approxBytes = batchResolveJsonUtf8Bytes(payload);

    if (batchResolveResponseTooLarge(payload)) {
      logger.warn('price_resolve_batch_response_too_large', {
        shopDomain: domain,
        lineCount: lines.length,
        approxResponseBytes: approxBytes,
        durationMs: Date.now() - t0,
      });
      return res.status(413).json({
        success: false,
        error:
          'Batch JSON response exceeds the safe size for Shopify Function network fetch (~100KB). Reduce PRICE_RESOLVE_BATCH_MAX, cart lines per checkout, or line_id payload size.',
      });
    }

    const uniqueTestCount = new Set(
      lines
        .map(r => {
          const tid = r?.test_id;
          return tid === undefined || tid === null ? '' : String(tid).trim();
        })
        .filter(Boolean)
    ).size;
    const durationMs = Date.now() - t0;
    if (durationMs > PRICE_BATCH_SLOW_LOG_MS) {
      logger.warn('price_resolve_batch_slow', {
        shopDomain: domain,
        lineCount: lines.length,
        uniqueTests: uniqueTestCount,
        durationMs,
        thresholdMs: PRICE_BATCH_SLOW_LOG_MS,
        approxResponseBytes: approxBytes,
      });
    }
    logger.info('price_resolve_batch', {
      shopDomain: domain,
      lineCount: lines.length,
      uniqueTests: uniqueTestCount,
      durationMs,
      approxResponseBytes: approxBytes,
      batchFullResponse: process.env.RIPX_PRICE_BATCH_FULL_RESPONSE === 'true',
      batchDebugResponse: debugRequested,
    });

    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/json; charset=utf-8');
    return res.json(payload);
  })
);

/**
 * POST /api/track/shipping-resolve-batch
 * Batch resolver for Shopify Discount Function `cart.delivery-options.discounts.generate.fetch`.
 *
 * Body JSON: {
 *   shop|shop_domain|site,
 *   groups: [{ delivery_group_id, test_id, assignment_variant, assignment_sig?, assignment_ts?, assignment_user?, cart_total, handles?[] }]
 * }
 */
router.post(
  '/shipping-resolve-batch',
  asyncHandler(async (req, res) => {
    if (!requireCheckoutPriceAuth(req, res)) {
      return;
    }

    const body = req.body || {};
    const shop = body.shop || body.shop_domain;
    const site = body.site;
    const domain = await resolveTenantDomain(shop, site);
    if (!domain) {
      return res.status(400).json({ success: false, error: 'Invalid shop or site' });
    }
    const tenantPr = await getTenantByDomain(domain);
    if (tenantPr && isTenantSuspendedOrBlocked(tenantPr)) {
      return res.status(403).json({ success: false, error: 'Access suspended' });
    }

    const groups = body.groups;
    const debugRequested =
      isTruthyDebugFlag(body.debug) || isTruthyDebugFlag(req.get('x-ripx-debug'));
    if (!Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ success: false, error: 'groups must be a non-empty array' });
    }
    if (groups.length > PRICE_RESOLVE_BATCH_MAX) {
      return res.status(400).json({
        success: false,
        error: `Too many groups. Maximum ${PRICE_RESOLVE_BATCH_MAX} per request.`,
      });
    }

    for (let i = 0; i < groups.length; i++) {
      const row = groups[i];
      if (!row || typeof row !== 'object') {
        return res.status(400).json({ success: false, error: `Invalid group at index ${i}` });
      }
      const tid = row.test_id;
      if (!tid || !validators.isValidUUID(String(tid).trim())) {
        return res.status(400).json({ success: false, error: `Invalid test_id at index ${i}` });
      }
      if (!row.delivery_group_id || !String(row.delivery_group_id).trim()) {
        return res
          .status(400)
          .json({ success: false, error: `Missing delivery_group_id at index ${i}` });
      }
      if (!row.assignment_variant || !String(row.assignment_variant).trim()) {
        return res
          .status(400)
          .json({ success: false, error: `Missing assignment_variant at index ${i}` });
      }
      const cartTotal = Number.parseFloat(String(row.cart_total || '').trim());
      if (!Number.isFinite(cartTotal) || cartTotal < 0) {
        return res.status(400).json({ success: false, error: `Invalid cart_total at index ${i}` });
      }
    }

    const resolved = await resolveCheckoutShippingBatchForDomain(
      domain,
      groups,
      getTestById,
      getTestsByIds,
      { debug: debugRequested }
    );
    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      groups: resolved,
    });
  })
);

/**
 * POST /api/track/shipping-carrier-rates
 * Minimal callback endpoint for Shopify CarrierService app rates.
 */
router.post(
  '/shipping-carrier-rates',
  asyncHandler(async (req, res) => {
    const rawStrategy = String(req.query?.strategy || 'flat_rate')
      .trim()
      .toLowerCase();
    const amountRaw = String(req.query?.amount || '').trim();
    const amount = amountRaw ? Number.parseFloat(amountRaw) : null;
    const currency =
      String(
        req.body?.rate?.currency || req.body?.currency || req.query?.currency || 'USD'
      ).trim() || 'USD';
    const serviceName =
      String(req.query?.service_name || req.query?.serviceName || 'RipX Shipping').trim() ||
      'RipX Shipping';
    const serviceCodeBase =
      String(req.query?.variant_id || req.query?.variant_index || req.query?.test_id || 'shipping')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 48) || 'shipping';
    const toRateSortValue = value => {
      const n = Number.parseInt(String(value ?? '').trim(), 10);
      return Number.isFinite(n) ? n : null;
    };
    const parseRatesFromQuery = raw => {
      if (!raw || typeof raw !== 'string') {
        return [];
      }
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed
          .map(rate => {
            const item = rate && typeof rate === 'object' ? rate : {};
            const amount = Number.parseFloat(String(item.amount ?? '').trim());
            return {
              name: String(item.name || item.service_name || '').trim(),
              description: String(item.description || '').trim(),
              delivery_promise: item.delivery_promise || item.deliveryPromise || null,
              min_delivery_date: String(
                item.min_delivery_date || item.minDeliveryDate || ''
              ).trim(),
              max_delivery_date: String(
                item.max_delivery_date || item.maxDeliveryDate || ''
              ).trim(),
              amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
              currency: String(item.currency || currency || 'USD')
                .trim()
                .toUpperCase(),
              service_code: String(item.service_code || item.serviceCode || '').trim(),
              priority: toRateSortValue(item.priority),
              sort_order: toRateSortValue(item.sort_order ?? item.sortOrder),
            };
          })
          .filter(rate => rate.amount !== null);
      } catch {
        return [];
      }
    };
    const parseCheckoutDisplayFromQuery = raw => {
      if (!raw || typeof raw !== 'string') {
        return normalizeCheckoutDisplayConfig({});
      }
      try {
        return normalizeCheckoutDisplayConfig(JSON.parse(raw));
      } catch {
        return normalizeCheckoutDisplayConfig({});
      }
    };
    const sortConfiguredRates = list =>
      (Array.isArray(list) ? list : []).slice().sort((a, b) => {
        const aPriority = toRateSortValue(a?.priority) ?? Number.MAX_SAFE_INTEGER;
        const bPriority = toRateSortValue(b?.priority) ?? Number.MAX_SAFE_INTEGER;
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        const aSort = toRateSortValue(a?.sort_order ?? a?.sortOrder) ?? Number.MAX_SAFE_INTEGER;
        const bSort = toRateSortValue(b?.sort_order ?? b?.sortOrder) ?? Number.MAX_SAFE_INTEGER;
        if (aSort !== bSort) {
          return aSort - bSort;
        }
        return String(a?.name || a?.service_name || '').localeCompare(
          String(b?.name || b?.service_name || '')
        );
      });
    const assignmentRequired =
      String(req.query?.require_assignment || req.query?.requireAssignment || '')
        .trim()
        .toLowerCase() === '1' ||
      String(req.query?.require_assignment || req.query?.requireAssignment || '')
        .trim()
        .toLowerCase() === 'true';

    const shopDomain = normalizeDomain(req.query?.shop_domain || req.query?.shop || '') || null;
    const testId = String(req.query?.test_id || '').trim();
    let resolvedShippingVariant = null;
    let resolvedShippingConfig = null;
    if (shopDomain && validators.isValidUUID(testId)) {
      const test = await getTestById(testId, shopDomain);
      const resolved = findShippingVariantByCallbackQuery(test, req.query);
      if (resolved.variant) {
        resolvedShippingVariant = resolved;
        resolvedShippingConfig = normalizeShippingVariantConfig(resolved.variant.config || {});
      }
    }
    const strategy = normalizeShippingCallbackStrategy(rawStrategy, resolvedShippingConfig);
    const rates = [];
    const expectedAssignment = {
      testId: req.query?.test_id,
      variantId:
        resolvedShippingVariant?.variant?.id ||
        resolvedShippingVariant?.variant?.variant_id ||
        req.query?.variant_id,
      variantIndex: req.query?.variant_index,
      variantName:
        resolvedShippingVariant?.variant?.name ||
        resolvedShippingVariant?.variant?.variantName ||
        req.query?.variant_name,
    };
    const assignmentMatches =
      !assignmentRequired || carrierRequestMatchesAssignment(req, expectedAssignment);
    const assignmentDiagnostics = summarizeCarrierAssignmentDiagnostics(req, expectedAssignment);
    if (strategy === 'flat_rate' && assignmentMatches) {
      let configuredRates = [];
      let resolvedAmount = amount;
      let variantConfig = {
        checkout_display: parseCheckoutDisplayFromQuery(
          String(req.query?.checkout_display_json || '').trim()
        ),
        metadata: {
          shipping_config_revision: String(req.query?.cfg_rev || '').trim(),
        },
      };
      if (resolvedShippingVariant?.variant && resolvedShippingConfig) {
        variantConfig = resolvedShippingConfig;
        if (resolvedShippingConfig.amount !== null && resolvedShippingConfig.amount !== undefined) {
          resolvedAmount = resolvedShippingConfig.amount;
        }
        configuredRates = Array.isArray(resolvedShippingConfig.rates)
          ? resolvedShippingConfig.rates
          : [];
      }
      if (configuredRates.length === 0) {
        configuredRates = parseRatesFromQuery(String(req.query?.rates_json || '').trim());
      }
      const candidateRates =
        configuredRates.length > 0
          ? sortConfiguredRates(configuredRates)
          : [{ amount: resolvedAmount, currency }];
      candidateRates.forEach((rateConfig, index) => {
        const normalizedRateConfig =
          rateConfig && typeof rateConfig === 'object' ? { ...rateConfig } : { amount, currency };
        const rate = formatCarrierRateForCheckout({
          rateConfig: normalizedRateConfig,
          variantConfig,
          index,
          serviceName,
          serviceCodeBase,
          fallbackAmount: resolvedAmount,
          fallbackCurrency: currency,
        });
        if (rate) {
          rates.push(rate);
        }
      });
    }
    if (strategy === 'flat_rate' && assignmentRequired && !assignmentMatches) {
      logger.info('shipping_carrier_flat_rate_assignment_missing', {
        testId: req.query?.test_id || null,
        variantIndex: req.query?.variant_index || null,
        variantId: req.query?.variant_id || null,
        assignmentDiagnostics,
      });
    }

    if (strategy === 'carrier_quote' && assignmentRequired && !assignmentMatches) {
      logger.info('shipping_carrier_quote_assignment_missing', {
        testId: req.query?.test_id || null,
        variantIndex: req.query?.variant_index || null,
        variantId: req.query?.variant_id || null,
        assignmentDiagnostics,
      });
    }

    if (strategy === 'carrier_quote' && assignmentMatches) {
      let providerConfig = {
        provider: String(req.query?.quote_provider || '').trim(),
        amount,
        service_name: serviceName,
        country_rates: String(req.query?.country_rates || '').trim(),
      };
      if (resolvedShippingVariant?.variant && resolvedShippingConfig) {
        providerConfig = resolveVariantProviderConfig({
          ...resolvedShippingVariant.variant,
          config: resolvedShippingConfig,
        });
      }
      const destinationCountry =
        String(
          req.body?.rate?.destination?.country || req.body?.destination?.country || ''
        ).trim() || '';
      const quoteResult = resolveCarrierQuoteRates({
        providerConfig,
        currency,
        serviceName:
          providerConfig.service_name ||
          String(
            req.query?.service_name || req.query?.serviceName || 'RipX Shipping Quote'
          ).trim() ||
          'RipX Shipping Quote',
        serviceCodeBase,
        destinationCountry,
      });
      for (const rate of quoteResult.rates || []) {
        rates.push(rate);
      }
      logger.info('shipping_carrier_quote_callback_received', {
        testId: req.query?.test_id || null,
        variantIndex: req.query?.variant_index || null,
        profileId: req.query?.profile_id || null,
        methodHandles: req.query?.method_handles || null,
        provider: providerConfig.provider || null,
        resolvedRates: rates.length,
      });
    }

    const traceEntry = recordShippingCarrierCallbackTrace({
      test_id: req.query?.test_id || null,
      variant_id: req.query?.variant_id || null,
      variant_index: req.query?.variant_index || null,
      config_revision: String(req.query?.cfg_rev || '').trim() || null,
      strategy,
      amount,
      currency,
      rates_count: rates.length,
      rates: rates.slice(0, 10).map(rate => ({
        service_name: rate.service_name || null,
        description: rate.description || '',
        service_code: rate.service_code || null,
        currency: rate.currency || null,
        total_price: rate.total_price || null,
        min_delivery_date: rate.min_delivery_date || null,
        max_delivery_date: rate.max_delivery_date || null,
      })),
      assignment_required: assignmentRequired,
      assignment_matches: assignmentMatches,
      assignment_diagnostics: assignmentDiagnostics,
      request_shape: {
        has_rate: Boolean(req.body?.rate),
        rate_items_count: Array.isArray(req.body?.rate?.items) ? req.body.rate.items.length : null,
        items_count: Array.isArray(req.body?.items) ? req.body.items.length : null,
        line_items_count: Array.isArray(req.body?.line_items) ? req.body.line_items.length : null,
        has_destination: Boolean(req.body?.rate?.destination || req.body?.destination),
      },
    });
    logger.info('shipping_carrier_callback_received', traceEntry);
    res.set('Cache-Control', 'no-store');
    return res.json({ rates });
  })
);

router.get(
  '/shipping-carrier-rates/debug',
  asyncHandler((req, res) => {
    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      traces: getShippingCarrierCallbackTrace({
        testId: req.query?.test_id,
        limit: req.query?.limit,
      }),
    });
  })
);

/**
 * POST /api/track/client-error
 * Accept client-side error reports; log and persist to client_errors for admin list.
 */
router.post(
  '/client-error',
  asyncHandler(async (req, res) => {
    const {
      error,
      stack,
      componentStack,
      url,
      shop_domain: bodyShop,
      shopDomain,
      metadata,
    } = req.body || {};
    const shop = bodyShop || shopDomain || req.query.shop || req.query.site;

    if (!error) {
      return res.status(400).json({ success: false, error: 'Missing error message' });
    }

    const domain =
      typeof shop === 'string' && shop.trim()
        ? normalizeDomain(shop) || shop.trim().toLowerCase()
        : null;

    logger.error('Client error reported', {
      error,
      stack,
      componentStack,
      url,
      shopDomain: domain,
      metadata,
    });

    try {
      const errMsg = String(error).slice(0, 5000);
      const stackVal = stack !== null && stack !== undefined ? String(stack).slice(0, 10000) : null;
      const compStack =
        componentStack !== null && componentStack !== undefined
          ? String(componentStack).slice(0, 10000)
          : null;
      const urlVal = url !== null && url !== undefined ? String(url).slice(0, 2048) : null;
      const metaJson =
        metadata !== null && metadata !== undefined && typeof metadata === 'object'
          ? JSON.stringify(metadata)
          : null;
      await query(
        `INSERT INTO client_errors (shop_domain, error_message, stack, component_stack, url, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [domain || 'unknown', errMsg, stackVal, compStack, urlVal, metaJson]
      );
    } catch (e) {
      logger.warn('Failed to persist client error', { err: e.message });
    }

    return res.json({ success: true });
  })
);

router.__testUtils = {
  isValidHeatmapVariantId,
  isHeatmapVariantAllowedForTest,
  normalizeHeatmapCaptureEvent,
  parseFiniteHeatmapNumber,
  collectCarrierRequestAttributes,
  carrierRequestMatchesAssignment,
  summarizeCarrierAssignmentDiagnostics,
  normalizeShippingCallbackStrategy,
  recordShippingCarrierCallbackTrace,
  getShippingCarrierCallbackTrace,
};

module.exports = router;
