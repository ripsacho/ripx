/**
 * Track Routes
 *
 * Public endpoints for tracking conversion events
 * These are called from the storefront
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const validators = require('../utils/validators');
const { trackEvent } = require('../models/analytics');
const { getActiveTestsForStorefront, getTestById } = require('../models/test');
const abTestEngine = require('../services/abTestEngine');
const { tenantExists, getTenantByDomain, normalizeDomain } = require('../models/tenant');
const { insertHeatmapEventsBatch } = require('../models/heatmap');
const {
  getMaintenanceMode,
  isMaintenanceActiveForDomain,
  getBlockListMessage,
} = require('../utils/maintenanceMode');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/asyncHandler');

/** Middleware: return 403 when domain is on block list (key_value_store key block_list.<domain>) */
async function blockListCheck(req, res, next) {
  const shop = req.query.shop || req.body?.shop_domain;
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
  const shop = req.query.shop || req.body?.shop_domain;
  const site = req.query.site || req.body?.site;
  const domain = await resolveTenantDomain(shop, site);
  if (isMaintenanceActiveForDomain(domain, maintenanceValue)) {
    return res.status(503).json({ success: false, maintenance: true });
  }
  next();
}

function _isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
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

/** Returns true if tenant is suspended or blocked (admin) */
function isTenantSuspendedOrBlocked(tenant) {
  const s = tenant?.status;
  return s === 'suspended' || s === 'blocked';
}

function getStorefrontScriptPath() {
  return path.join(__dirname, '../../..', 'shopify', 'storefront-script.js');
}

const SCRIPT_VERSION = '1';

function buildRuntimeConfig(shop, tests, req) {
  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

  return {
    apiUrl: `${appUrl}/api`,
    shopDomain: shop,
    version: SCRIPT_VERSION,
    consentRequired: process.env.RIPX_CONSENT_REQUIRED === 'true',
    activeTests: (tests || []).map(test => {
      const ids =
        test.target_ids && Array.isArray(test.target_ids)
          ? test.target_ids.filter(Boolean)
          : test.target_id
            ? [test.target_id]
            : [];
      const jsTargeting = test.segments?.js_targeting;
      return {
        id: test.id,
        type: test.type,
        targetType: test.target_type,
        targetId: test.target_id || null,
        targetIds: ids.length > 0 ? ids : null,
        jsTargeting:
          jsTargeting?.enabled && jsTargeting?.code
            ? { enabled: true, code: jsTargeting.code }
            : null,
      };
    }),
  };
}

router.use(blockListCheck);
router.use(maintenanceCheck);

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

    const domain = await resolveTenantDomain(shop, site);
    if (!domain) {
      return res
        .status(400)
        .send('Invalid shop or site. Use ?shop=xxx.myshopify.com or ?site=example.com');
    }

    const tenant = await getTenantByDomain(domain);
    if (tenant && isTenantSuspendedOrBlocked(tenant)) {
      return res.status(403).json({ success: false, error: 'Access suspended. Contact support.' });
    }

    const tests = await getActiveTestsForStorefront(domain);
    const runtimeConfig = buildRuntimeConfig(domain, tests, req);
    const scriptPath = getStorefrontScriptPath();
    const scriptContents = fs.readFileSync(scriptPath, 'utf8');

    const version = req.query.v || SCRIPT_VERSION;
    const cacheSeconds = version ? 31536000 : 300;

    res.set('Content-Type', 'application/javascript');
    res.set('X-Script-Version', version);
    res.set('Cache-Control', `public, max-age=${cacheSeconds}`);
    res.send(`window.AB_TEST_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};\n${scriptContents}`);
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
    const variant = await abTestEngine.getVariant(test_id, user_id, domain);

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

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.json({ success: true, inserted: 0 });
    }

    const valid = events.filter(
      e =>
        e.test_id &&
        e.variant_id &&
        e.page_url &&
        (e.event_type === 'click' || e.event_type === 'scroll')
    );

    if (valid.length === 0) {
      return res.json({ success: true, inserted: 0 });
    }

    const toInsert = valid.map(e => ({
      test_id: e.test_id,
      variant_id: e.variant_id,
      shop_domain: domain,
      page_url: String(e.page_url).substring(0, 2048),
      event_type: e.event_type,
      x: e.x != null ? parseFloat(e.x) : null, // eslint-disable-line eqeqeq
      y: e.y != null ? parseFloat(e.y) : null, // eslint-disable-line eqeqeq
      scroll_depth: e.scroll_depth != null ? parseFloat(e.scroll_depth) : null, // eslint-disable-line eqeqeq
      viewport_width: e.viewport_width != null ? parseInt(e.viewport_width, 10) : null, // eslint-disable-line eqeqeq
      viewport_height: e.viewport_height != null ? parseInt(e.viewport_height, 10) : null, // eslint-disable-line eqeqeq
    }));

    const { inserted } = await insertHeatmapEventsBatch(toInsert);

    res.json({ success: true, inserted });
  })
);

/**
 * GET /api/track/variants
 * Batch get variants for multiple tests (reduces round trips for storefront)
 */
router.get(
  '/variants',
  asyncHandler(async (req, res) => {
    const {
      user_id,
      shop_domain,
      test_ids,
      device,
      customer,
      country,
      traffic_source,
      current_url,
      session_count,
      referrer,
      utm_source,
      utm_medium,
      js_targeting_results,
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

    const context = { device, customer, country };
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

    res.json({
      success: true,
      variants: assignments,
    });
  })
);

/**
 * GET /api/track/variant
 * Get variant for a user (for storefront integration)
 */
router.get(
  '/variant',
  asyncHandler(async (req, res) => {
    const {
      test_id,
      user_id,
      shop_domain,
      device,
      customer,
      country,
      traffic_source,
      current_url,
      session_count,
      referrer,
      utm_source,
      utm_medium,
      js_targeting_passed,
      force_variant,
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

    const context = { device, customer, country };
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

    res.json({
      success: true,
      variant,
    });

    if (process.env.LOG_TRACK_EVENTS === 'true') {
      logger.info('Variant assignment returned', {
        test_id,
        user_id,
        shop_domain: domain,
        variant_id: variant?.variantId,
      });
    }
  })
);

/**
 * GET /api/track/preview
 * Return a specific variant config for preview links.
 */
router.get(
  '/preview',
  asyncHandler(async (req, res) => {
    const { test_id, variant_id, variant_name, shop_domain, site } = req.query;
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
    const variant = variants.find(item => {
      if (variant_id && item?.id) {
        return item.id === variant_id;
      }
      if (variant_name && item?.name) {
        return item.name === variant_name;
      }
      return false;
    });

    if (!variant) {
      return res.status(404).json({ success: false, error: 'Variant not found' });
    }

    const config = variant.config && typeof variant.config === 'object' ? variant.config : {};
    if (variant.code && config.code === undefined) {
      config.code = variant.code;
    }

    return res.json({
      success: true,
      variant: {
        variantId: variant.id,
        variantName: variant.name,
        config,
      },
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
      const { query } = require('../utils/database');
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

module.exports = router;
