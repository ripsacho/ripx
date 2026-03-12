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
const {
  tenantExists,
  getTenantByDomain,
  normalizeDomain,
  setDomainVerifiedAt,
} = require('../models/tenant');
const { insertHeatmapEventsBatch } = require('../models/heatmap');
const {
  getMaintenanceMode,
  isMaintenanceActiveForDomain,
  getBlockListMessage,
} = require('../utils/maintenanceMode');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/asyncHandler');
const { HEATMAP_EVENTS_BATCH_MAX, ERROR_MESSAGES } = require('../constants');

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
  const appUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(
    /\/+$/,
    ''
  );

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
        shopDomain: 'preview-test',
        version: SCRIPT_VERSION,
        consentRequired: process.env.RIPX_CONSENT_REQUIRED === 'true',
        activeTests: [],
      };
    } else {
      domain = await resolveTenantDomain(shop, site);
      if (!domain) {
        return res
          .status(400)
          .send('Invalid shop or site. Use ?shop=xxx.myshopify.com or ?site=example.com');
      }

      const tenant = await getTenantByDomain(domain);
      if (tenant && isTenantSuspendedOrBlocked(tenant)) {
        return res
          .status(403)
          .json({ success: false, error: 'Access suspended. Contact support.' });
      }

      const tests = await getActiveTestsForStorefront(domain);
      runtimeConfig = buildRuntimeConfig(domain, tests, req);
    }

    const scriptPath = getStorefrontScriptPath();
    const scriptContents = fs.readFileSync(scriptPath, 'utf8');

    const version = req.query.v || SCRIPT_VERSION;
    const cacheSeconds = version ? 31536000 : 300;
    const cacheControl = version
      ? `public, max-age=${cacheSeconds}, immutable`
      : `public, max-age=${cacheSeconds}`;

    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Script-Version', version);
    res.set('Cache-Control', cacheControl);
    res.send(`window.AB_TEST_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};\n${scriptContents}`);
  })
);

const PREVIEW_FALLBACK_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview unavailable</title></head><body style="margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f3f4f6;color:#6b7280;"><script>try{window.parent.postMessage({type:"ripx-preview-error"},"*");}catch(e){}</script><p style="margin:0;font-size:0.9375rem;">Preview unavailable. Check the URL or try again.</p></body></html>';

function sendPreviewFallback(res) {
  res
    .status(200)
    .set('Content-Type', 'text/html; charset=utf-8')
    .set('Cache-Control', 'no-store')
    .send(PREVIEW_FALLBACK_HTML);
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
      const fetchRes = await fetch(rawUrl, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
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

      const runtimeConfig = {
        apiUrl: `${appUrl.replace(/\/+$/, '')}/api`,
        shopDomain: hostname,
        activeTests: [],
        visualEditor: true, // preview-document is only used for visual editor iframe
        previewTestId: req.query.ab_preview_test || null,
        previewVariantId: req.query.ab_preview_variant || null,
        previewVariantName: req.query.ab_preview_variant_name || null,
        previewMode: req.query.ab_preview === '1' || !!req.query.ab_preview_test,
      };
      let scriptContent;
      try {
        scriptContent = fs.readFileSync(getStorefrontScriptPath(), 'utf8');
        scriptContent = scriptContent.replace(/<\/script>/gi, '<\\/script>');
      } catch (e) {
        logger.warn('Preview document: could not read storefront script', { error: e.message });
        sendPreviewFallback(res);
        return;
      }
      const injectScript =
        `<script>window.AB_TEST_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};</script>` +
        (scriptContent ? `<script>${scriptContent}</script>` : '');

      // Inject base and referrer policy at start of <head> so all relative URLs resolve to the store.
      if (html.includes('<head')) {
        html = html.replace(/(<head\s*[^>]*>)/i, `$1\n${baseTag}\n${referrerMeta}`);
      }
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${injectScript}\n</head>`);
      } else if (html.includes('<body')) {
        html = html.replace(/(<body[^>]*>)/i, `$1\n${baseTag}\n${injectScript}\n`);
      } else {
        html = baseTag + '\n' + injectScript + '\n' + html;
      }
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      // Permissive CSP for preview iframe so injected script and store CSS/JS/resources load; frame-ancestors limits embedding to same origin.
      res.set(
        'Content-Security-Policy',
        "default-src 'self' https: http:; script-src 'unsafe-inline' 'unsafe-eval' 'self' https: http:; style-src 'unsafe-inline' 'self' https: http:; img-src 'self' data: https: http:; font-src 'self' https: http: data:; connect-src 'self' https: http:; frame-ancestors 'self'"
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

    if (events.length > HEATMAP_EVENTS_BATCH_MAX) {
      return res.status(400).json({
        success: false,
        error: `Too many events. Maximum ${HEATMAP_EVENTS_BATCH_MAX} per request.`,
      });
    }

    const valid = events.filter(
      e =>
        validators.isValidUUID(e.test_id) &&
        validators.isValidUUID(e.variant_id) &&
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
      context.current_pathname = getPathnameFromUrl(current_url);
    }
    if (req.query.current_pathname && typeof req.query.current_pathname === 'string') {
      context.current_pathname =
        (req.query.current_pathname || '').trim() || context.current_pathname;
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
      context.current_pathname = getPathnameFromUrl(current_url);
    }
    if (req.query.current_pathname && typeof req.query.current_pathname === 'string') {
      context.current_pathname =
        (req.query.current_pathname || '').trim() || context.current_pathname;
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
