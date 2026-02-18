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
const { tenantExists, normalizeDomain } = require('../models/tenant');
const { insertHeatmapEventsBatch } = require('../models/heatmap');
const logger = require('../utils/logger');

function _isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

async function resolveTenantDomain(shop, site) {
  const domain = shop || site;
  if (!domain) {return null;}
  const normalized = normalizeDomain(domain);
  if (!normalized) {return null;}
  const exists = await tenantExists(normalized);
  return exists ? normalized : null;
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
      const ids = test.target_ids && Array.isArray(test.target_ids)
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
        jsTargeting: jsTargeting?.enabled && jsTargeting?.code
          ? { enabled: true, code: jsTargeting.code }
          : null,
      };
    }),
  };
}

/**
 * GET /api/track/script.js
 * Serve storefront script with runtime configuration
 * Query: shop (Shopify) or site (standalone)
 */
router.get('/script.js', async (req, res, next) => {
  try {
    const shop = req.query.shop;
    const site = req.query.site;

    const domain = await resolveTenantDomain(shop, site);
    if (!domain) {
      return res.status(400).send('Invalid shop or site. Use ?shop=xxx.myshopify.com or ?site=example.com');
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
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/track
 * Track a conversion event
 */
router.post('/', async (req, res, next) => {
  try {
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
        error: 'Missing required fields: test_id, user_id, shop_domain',
      });
    }

    if (!validators.isValidUUID(test_id)) {
      return res.status(400).json({ error: 'Invalid test_id format' });
    }

    if (String(user_id).length > 512 || String(shop_domain).length > 255) {
      return res.status(400).json({ error: 'user_id or shop_domain exceeds max length' });
    }

    const domain = normalizeDomain(shop_domain);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ error: 'Site not registered' });
    }

    // Get user's variant assignment
    const variant = await abTestEngine.getVariant(test_id, user_id, domain);

    if (!variant) {
      return res.status(404).json({
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
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/track/heatmap
 * Batch receive heatmap events (clicks, scroll) from storefront
 */
router.post('/heatmap', async (req, res, next) => {
  try {
    const { shop_domain, site, events } = req.body || {};

    const domain = await resolveTenantDomain(shop_domain, site);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ error: 'Site not registered' });
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
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/track/variants
 * Batch get variants for multiple tests (reduces round trips for storefront)
 */
router.get('/variants', async (req, res, next) => {
  try {
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
        error: 'Missing required query parameters: user_id, shop_domain, test_ids',
      });
    }

    if (String(user_id).length > 512 || String(shop_domain).length > 255) {
      return res.status(400).json({ error: 'user_id or shop_domain exceeds max length' });
    }

    const ids = String(test_ids).split(',').map(s => s.trim()).filter(Boolean);
    const invalidIds = ids.filter(id => !validators.isValidUUID(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: 'Invalid test_id format in test_ids' });
    }
    if (ids.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 tests per request' });
    }
    let jsResults = {};
    try {
      if (js_targeting_results) {
        jsResults = typeof js_targeting_results === 'string'
          ? JSON.parse(js_targeting_results)
          : js_targeting_results;
      }
    } catch {
      jsResults = {};
    }

    const context = { device, customer, country };
    context.user_agent = req.headers['user-agent'] || req.query.user_agent || null;
    context.user_ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.connection?.remoteAddress || null;
    if (traffic_source) {context.traffic_source = traffic_source;}
    if (current_url) {context.current_url = current_url;}
    if (session_count !== undefined && session_count !== null && session_count !== '') {
      context.session_count = Number(session_count);
    }
    if (referrer) {context.referrer = referrer;}
    if (utm_source) {context.utm_source = utm_source;}
    if (utm_medium) {context.utm_medium = utm_medium;}

    const domain = normalizeDomain(shop_domain);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ error: 'Site not registered' });
    }

    const contextOverrides = {};
    for (const tid of ids) {
      if (jsResults[tid] !== undefined) {
        contextOverrides[tid] = { js_targeting_passed: jsResults[tid] === true || jsResults[tid] === 'true' };
      }
    }

    let assignments;
    if (ids.length > 1) {
      assignments = await abTestEngine.getVariantsBatch(ids, user_id, domain, context, contextOverrides);
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
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/track/variant
 * Get variant for a user (for storefront integration)
 */
router.get('/variant', async (req, res, next) => {
  try {
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
    } = req.query;

    if (!test_id || !user_id || !shop_domain) {
      return res.status(400).json({
        error: 'Missing required query parameters',
      });
    }

    if (!validators.isValidUUID(test_id)) {
      return res.status(400).json({ error: 'Invalid test_id format' });
    }

    if (String(user_id).length > 512 || String(shop_domain).length > 255) {
      return res.status(400).json({ error: 'user_id or shop_domain exceeds max length' });
    }

    const context = { device, customer, country };
    context.user_agent = req.headers['user-agent'] || req.query.user_agent || null;
    context.user_ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.connection?.remoteAddress || null;
    if (traffic_source) {context.traffic_source = traffic_source;}
    if (js_targeting_passed !== undefined) {
      context.js_targeting_passed = js_targeting_passed === true || js_targeting_passed === 'true';
    }
    if (current_url) {context.current_url = current_url;}
    if (session_count !== undefined && session_count !== null && session_count !== '') {
      context.session_count = Number(session_count);
    }
    if (referrer) {context.referrer = referrer;}
    if (utm_source) {context.utm_source = utm_source;}
    if (utm_medium) {context.utm_medium = utm_medium;}

    const domain = normalizeDomain(shop_domain);
    if (!domain || !(await tenantExists(domain))) {
      return res.status(403).json({ error: 'Site not registered' });
    }

    const variant = await abTestEngine.getVariant(test_id, user_id, domain, context);

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
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/track/preview
 * Return a specific variant config for preview links.
 */
router.get('/preview', async (req, res, next) => {
  try {
    const { test_id, variant_id, variant_name, shop_domain, site } = req.query;
    const domain = await resolveTenantDomain(shop_domain, site);

    if (!test_id || !domain) {
      return res.status(400).json({
        error: 'Missing required parameters: test_id and shop_domain or site',
      });
    }

    if (!validators.isValidUUID(test_id)) {
      return res.status(400).json({ error: 'Invalid test_id format' });
    }

    const test = await getTestById(test_id, domain);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
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
      return res.status(404).json({ error: 'Variant not found' });
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
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/track/client-error
 * Accept client-side error reports
 */
router.post('/client-error', (req, res, next) => {
  try {
    const { error, stack, componentStack, url, shopDomain, metadata } = req.body || {};

    if (!error) {
      return res.status(400).json({ error: 'Missing error message' });
    }

    logger.error('Client error reported', {
      error,
      stack,
      componentStack,
      url,
      shopDomain,
      metadata,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
