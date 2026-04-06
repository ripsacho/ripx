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
const { getActiveTestsForStorefront, getTestById, getTestsByIds } = require('../models/test');
const abTestEngine = require('../services/abTestEngine');
const {
  tenantExists,
  getTenantByDomain,
  normalizeDomain,
  setDomainVerifiedAt,
} = require('../models/tenant');
const { insertHeatmapEventsBatch } = require('../models/heatmap');
const {
  SCRIPT_VERSION,
  buildStorefrontRuntimeConfig,
  getStorefrontScriptCacheControl,
  mapTestToStorefrontPayload,
} = require('../utils/storefrontScriptRuntime');
const {
  getMaintenanceMode,
  isMaintenanceActiveForDomain,
  getBlockListMessage,
} = require('../utils/maintenanceMode');
const logger = require('../utils/logger');
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
const {
  buildCheckoutPriceDiagnostics,
  readRipxCheckoutExtensionConfigFile,
  extensionConfigInputFromReadResult,
} = require('../services/priceCheckoutDiagnostics');
const { query } = require('../utils/database');
const {
  batchResolveJsonUtf8Bytes,
  batchResolveResponseTooLarge,
  shapePriceResolveBatchLinesForCheckout,
} = require('../utils/priceResolveBatchResponse');
const { checkoutPriceSecretsMatch } = require('../utils/checkoutPriceSecret');
const { signPriceAssignment } = require('../utils/priceAssignmentSignature');
const { findVariantForPreviewQuery } = require('../utils/previewVariantMatch');
const PRICE_RESOLVE_LINE_ID_MAX = Math.max(
  32,
  Number.parseInt(process.env.RIPX_PRICE_RESOLVE_LINE_ID_MAX || '256', 10) || 256
);

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
  if (!variantId || !normalizedUserId || !normalizedShop) {
    return variant;
  }
  const issuedAtMs = Date.now();
  const signature = signPriceAssignment({
    testId,
    variantId,
    userId: normalizedUserId,
    shopDomain: normalizedShop,
    issuedAtMs,
  });
  if (!signature) {
    return variant;
  }
  return {
    ...variant,
    assignment_sig: signature,
    assignment_ts: String(issuedAtMs),
    assignment_user: normalizedUserId,
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

function getStorefrontScriptPath() {
  return path.join(__dirname, '../../..', 'shopify', 'storefront-script.js');
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
      runtimeConfig = buildStorefrontRuntimeConfig(domain, tests, req);
    }

    const scriptPath = getStorefrontScriptPath();
    const scriptContents = fs.readFileSync(scriptPath, 'utf8');

    const cacheControl = getStorefrontScriptCacheControl();
    const versionLabel = req.query.v ? String(req.query.v) : SCRIPT_VERSION;

    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Script-Version', versionLabel);
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
        version: SCRIPT_VERSION,
        consentRequired: process.env.RIPX_CONSENT_REQUIRED === 'true',
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

    const signedAssignments = {};
    Object.entries(assignments || {}).forEach(([tid, variant]) => {
      signedAssignments[tid] = withAssignmentSignature(variant, tid, user_id, domain);
    });

    res.json({
      success: true,
      variants: signedAssignments,
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
 * Body/query: shop|shop_domain|site, test_id, checkout_id, optional current_url/current_pathname/device/customer/country.
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

    const testId = String(testIdRaw || '').trim();
    const checkoutId = String(checkoutIdRaw || '').trim();
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
    const currentUrl = body.current_url ?? req.query.current_url;
    const currentPathname = body.current_pathname ?? req.query.current_pathname;
    if (currentUrl && String(currentUrl).trim()) {
      context.current_url = String(currentUrl).trim();
      context.current_pathname = getPathnameFromUrl(context.current_url);
    }
    if (currentPathname && String(currentPathname).trim()) {
      context.current_pathname = String(currentPathname).trim();
    }

    const variant = await abTestEngine.getVariant(testId, userId, domain, context);
    if (!variant) {
      return res.json({ success: true, assignment: null });
    }
    const signedVariant = withAssignmentSignature(variant, testId, userId, domain);
    return res.json({
      success: true,
      assignment: {
        test_id: testId,
        user_id: userId,
        variant_id: signedVariant.variantId,
        variant_name: signedVariant.variantName || null,
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
 * Track a checkout UI extension conversion event for a checkout-scoped user key.
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
    const variant = await abTestEngine.getVariant(testId, userId, domain, context);
    if (!variant) {
      return res.status(404).json({ success: false, error: 'Test not found or not running' });
    }

    const eventNameRaw = body.event_name ?? req.query.event_name;
    const eventName = String(eventNameRaw || 'checkout_extension_conversion')
      .trim()
      .slice(0, 120);
    const eventValueRaw = body.event_value ?? req.query.event_value;
    const eventValue =
      eventValueRaw === undefined || eventValueRaw === null || eventValueRaw === ''
        ? 0
        : Number(eventValueRaw);
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    const eventPayload = {
      test_id: testId,
      variant_id: variant.variantId,
      user_id: userId,
      shop_domain: domain,
      event_type: 'conversion',
      event_name: eventName || null,
      event_value: Number.isFinite(eventValue) ? eventValue : 0,
      metadata: {
        source: 'checkout_ui_extension',
        checkout_id: checkoutId,
        ...metadata,
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
      variant_id: variant.variantId,
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
    const variant = findVariantForPreviewQuery(variants, { variant_id, variant_name });

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

module.exports = router;
