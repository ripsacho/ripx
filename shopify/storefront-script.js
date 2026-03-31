/**
 * RipX Storefront Integration Script
 * @version 1.0.0
 *
 * Multi-platform: works on Shopify and standalone sites.
 * 1. Get variant assignments for users
 * 2. Apply test variations (prices, content, etc.)
 * 3. Track conversion events
 *
 * Shopify: Load via app proxy or GET /api/track/script.js?shop=xxx.myshopify.com
 * Standalone: Load via GET /api/track/script.js?site=example.com
 *
 * Best practices: Load in <head> with defer (Theme App Embed target: head). Deferred scripts run in order
 * after document parse, before DOMContentLoaded — earlier fetch than body-bottom tags reduces flicker.
 * Standalone preview: /track/preview and /track/preview-storefront-test use the same tenant param as ping
 * (shop_domain for .myshopify.com, else site=).
 * Graceful degradation: If the assignment API fails (network error, 5xx, or 503 maintenance),
 * getVariant/getVariantCachePromise return null or {} so the page shows the control variant
 * and does not break. Track (conversion/event) failures are logged but do not throw.
 * Do not cache the script per-user; assignment is fetched per session/page as needed.
 * The server sends short Cache-Control for script.js (activeTests are embedded); hard-refresh or wait for max-age after starting/stopping tests.
 *
 * Debug: Set window.__RIPX_DEBUG__ = true before the script loads to enable console logs (no PII).
 * With debug on, cart/add interception logs [RipX] lines: path matched, patched vs unchanged body, near-miss paths, missing line state.
 * Version: Exposed as window.RipX.version / window.ABTestTracker.version for support.
 */

(function () {
  'use strict';

  // Prevent double execution if snippet is accidentally included twice
  if (window.__RIPX_LOADED__) {
    return;
  }
  window.__RIPX_LOADED__ = true;

  // Configuration
  const DEFAULT_CONFIG = {
    apiUrl: '',
    cookieName: 'ab_test_user_id',
    cookieExpiry: 365, // days
    shopDomain: null,
    activeTests: [],
  };

  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.AB_TEST_RUNTIME_CONFIG || {});
  const hasValidConfig = !!(CONFIG.apiUrl && CONFIG.apiUrl.trim());

  /** Polyfill CSS.escape for older browsers (selector building in visual editor). */
  if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function') {
    window.CSS = window.CSS || {};
    if (!window.CSS.escape) {
      window.CSS.escape = function (val) {
        var s = String(val);
        return s.replace(/\\/g, '\\\\').replace(/([^\w-])/g, '\\$1');
      };
    }
  }
  const consentRequired = !!CONFIG.consentRequired;
  const SCRIPT_VERSION = (CONFIG.version && String(CONFIG.version)) || '1.0.0';
  const DEBUG = !!(typeof window !== 'undefined' && window.__RIPX_DEBUG__);
  const ANTI_FLICKER_MAX_MS = 1400;
  var antiFlickerState = { active: false, pending: 0, timeoutId: null };
  /** Backend may send type "pricing"; treat same as "price" for storefront logic. */
  function testTypeIsPrice(test) {
    if (!test || test.type === undefined || test.type === null) return false;
    var ty = String(test.type).toLowerCase();
    return ty === 'price' || ty === 'pricing';
  }
  function getNormalizedTargetType(test) {
    var tt = String((test && (test.targetType || test.target_type)) || '')
      .toLowerCase()
      .trim();
    if ((!tt || tt === 'all') && testTypeIsPrice(test)) return 'all-products';
    return tt;
  }
  function getAntiFlickerModeForTest(test) {
    if (!test || typeof test !== 'object') return 'balanced';
    var raw = String(test.antiFlickerMode || test.anti_flicker_mode || '')
      .toLowerCase()
      .trim();
    return raw === 'strict' ? 'strict' : 'balanced';
  }
  function shouldUseAntiFlickerForTest(test) {
    var mode = getAntiFlickerModeForTest(test);
    // strict: include all test types; balanced: avoid price to reduce render delay.
    if (mode === 'strict') return true;
    return !testTypeIsPrice(test);
  }
  function hasAntiFlickerEligibleTests(tests) {
    return (tests || []).some(function (test) {
      return shouldUseAntiFlickerForTest(test);
    });
  }
  function installAntiFlickerGuard() {
    if (antiFlickerState.active || typeof document === 'undefined') return;
    antiFlickerState.active = true;
    antiFlickerState.pending = 0;
    var styleId = 'ripx-anti-flicker-style';
    if (!document.getElementById(styleId)) {
      var styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent = 'html[data-ripx-af="1"] body{opacity:0 !important;}';
      (document.head || document.documentElement || document.body).appendChild(styleEl);
    }
    if (document.documentElement) document.documentElement.setAttribute('data-ripx-af', '1');
    antiFlickerState.timeoutId = setTimeout(function () {
      releaseAntiFlickerGuard();
    }, ANTI_FLICKER_MAX_MS);
  }
  function releaseAntiFlickerGuard() {
    if (!antiFlickerState.active) return;
    antiFlickerState.active = false;
    antiFlickerState.pending = 0;
    if (antiFlickerState.timeoutId) {
      clearTimeout(antiFlickerState.timeoutId);
      antiFlickerState.timeoutId = null;
    }
    if (document.documentElement) document.documentElement.removeAttribute('data-ripx-af');
  }
  function markAntiFlickerPending() {
    if (!antiFlickerState.active) return;
    antiFlickerState.pending += 1;
  }
  function markAntiFlickerDone() {
    if (!antiFlickerState.active) return;
    antiFlickerState.pending = Math.max(0, antiFlickerState.pending - 1);
    if (antiFlickerState.pending === 0) releaseAntiFlickerGuard();
  }
  function debugLog() {
    if (DEBUG && typeof console !== 'undefined' && console.log) {
      console.log.apply(console, ['[RipX]'].concat(Array.prototype.slice.call(arguments)));
    }
  }
  /** Fetch with timeout to avoid hanging on slow/failed networks. Uses AbortController. */
  function fetchWithTimeout(url, options, timeoutMs) {
    var t = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 10000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var signal = controller ? controller.signal : undefined;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, t);
    var opts = Object.assign({}, options || {});
    if (signal) opts.signal = signal;
    return fetch(url, opts).then(
      function (r) {
        clearTimeout(timer);
        return r;
      },
      function (err) {
        clearTimeout(timer);
        throw err;
      }
    );
  }
  /** Fetch with one retry after delay (for transient failures). */
  function fetchWithRetry(url, options, timeoutMs, retryDelayMs) {
    var delay = typeof retryDelayMs === 'number' && retryDelayMs > 0 ? retryDelayMs : 800;
    return fetchWithTimeout(url, options, timeoutMs).catch(function (err) {
      debugLog('fetch failed, retrying once', url.substring(0, 80) + '...');
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          fetchWithTimeout(url, options, timeoutMs).then(resolve, reject);
        }, delay);
      });
    });
  }

  function hasConsent() {
    if (!consentRequired) return true;
    return !!(
      window.ripx_consent ||
      (window.gdprConsent && window.gdprConsent.marketing) ||
      (window.__cmp && false) // CMP integration: check via __cmp('getConsentData')
    );
  }

  function whenConsent(cb) {
    if (hasConsent()) {
      cb();
      return;
    }
    window.ripx_consent_callback = cb;
  }
  const URL_PARAMS = new URLSearchParams(window.location.search);
  const PREVIEW_TEST_ID =
    URL_PARAMS.get('ab_preview_test') ||
    (CONFIG.previewTestId && String(CONFIG.previewTestId)) ||
    null;
  const PREVIEW_VARIANT_ID =
    URL_PARAMS.get('ab_preview_variant') ||
    (CONFIG.previewVariantId && String(CONFIG.previewVariantId)) ||
    null;
  const PREVIEW_VARIANT_NAME =
    URL_PARAMS.get('ab_preview_variant_name') ||
    (CONFIG.previewVariantName && String(CONFIG.previewVariantName)) ||
    null;
  // True only when a concrete preview context is active (target test id or runtime preview flag).
  const PREVIEW_TEST_CONTEXT = !!PREVIEW_TEST_ID || !!(CONFIG.previewMode === true);
  const PREVIEW_MODE = URL_PARAMS.get('ab_preview') === '1' || PREVIEW_TEST_CONTEXT;
  const VISUAL_PICKER_MODE = URL_PARAMS.get('ab_visual_picker') === '1';
  const AB_VISUAL_EDITOR =
    URL_PARAMS.get('ab_visual_editor') === '1' || !!(CONFIG.visualEditor === true);
  const IN_IFRAME = typeof window.parent !== 'undefined' && window.self !== window.top;
  const VISUAL_EDITOR_EMBED = AB_VISUAL_EDITOR && IN_IFRAME;
  /** Visual picker (and editor) only run when page is in iframe + param; never on live site to avoid affecting normal use */
  const VISUAL_PICKER_EMBED = VISUAL_PICKER_MODE && IN_IFRAME;

  /**
   * Generate or retrieve user ID
   */
  function getUserId() {
    if (consentRequired && !hasConsent()) return null;
    let userId = getCookie(CONFIG.cookieName);

    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
      setCookie(CONFIG.cookieName, userId, CONFIG.cookieExpiry);
    }

    return userId;
  }

  function getDeviceType() {
    return window.innerWidth <= 768 ? 'mobile' : 'desktop';
  }

  function getCustomerType() {
    if (consentRequired && !hasConsent()) return 'new';
    const key = 'ab_test_returning';
    const existing = getCookie(key);
    if (existing) {
      return 'returning';
    }
    setCookie(key, '1', CONFIG.cookieExpiry);
    return 'new';
  }

  function getCountryCode() {
    if (window.Shopify?.country) {
      return window.Shopify.country;
    }
    const language = navigator.language || '';
    const parts = language.split('-');
    return parts.length > 1 ? parts[1].toUpperCase() : '';
  }

  /**
   * Detect traffic source from UTM params and referrer
   */
  function getTrafficSource() {
    const params = new URLSearchParams(window.location.search);
    const utmSource = (params.get('utm_source') || '').toLowerCase();
    const utmMedium = (params.get('utm_medium') || '').toLowerCase();
    const referrer = (document.referrer || '').toLowerCase();

    if (utmMedium === 'email') return 'email';
    if (
      ['cpc', 'ppc', 'paid', 'cpv', 'cpm'].some(function (m) {
        return utmMedium.indexOf(m) !== -1;
      })
    )
      return 'paid';
    if (
      [
        'facebook',
        'twitter',
        'instagram',
        'linkedin',
        'pinterest',
        'tiktok',
        'youtube',
        'reddit',
      ].some(function (s) {
        return utmSource.indexOf(s) !== -1 || referrer.indexOf(s) !== -1;
      })
    )
      return 'social';

    if (!referrer) return 'organic';
    try {
      const refHost = new URL(referrer).hostname.toLowerCase();
      const searchEngines = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex'];
      if (
        searchEngines.some(function (e) {
          return refHost.indexOf(e) !== -1;
        })
      )
        return 'organic';
    } catch (e) {}
    return 'referral';
  }

  /**
   * Get and increment session count for min_sessions targeting (once per page load)
   */
  var _sessionCountIncremented = false;
  function getAndIncrementSessionCount() {
    const key = 'ab_test_session_count';
    if (!_sessionCountIncremented) {
      _sessionCountIncremented = true;
      var count = parseInt(getCookie(key), 10) || 0;
      count += 1;
      setCookie(key, String(count), CONFIG.cookieExpiry);
      return count;
    }
    return parseInt(getCookie(key), 10) || 0;
  }

  /**
   * Get shop domain
   */
  function getShopDomain() {
    return CONFIG.shopDomain || window.Shopify?.shop || document.domain;
  }

  /**
   * Match /track/ping: Shopify tenants use shop_domain=, standalone uses site= (both resolve the same tenant).
   * @param {URLSearchParams} params
   */
  function appendTrackTenantParams(params) {
    var d = getShopDomain();
    if (!d || !params) return params;
    var dom = String(d).toLowerCase();
    if (dom.indexOf('.myshopify.com') !== -1) {
      params.set('shop_domain', d);
    } else {
      params.set('site', d);
    }
    return params;
  }

  /**
   * Evaluate JS targeting code safely. Code must return boolean.
   * Has access to: location, document, navigator, window, Shopify, getDeviceType, getCountryCode, etc.
   */
  function evaluateJsTargeting(testId, code) {
    if (!code || typeof code !== 'string' || !code.trim()) return true;
    try {
      const fn = new Function(
        'location',
        'document',
        'navigator',
        'window',
        'getDeviceType',
        'getCountryCode',
        'getTrafficSource',
        'return (function(){ ' + code + ' })();'
      );
      const result = fn(
        window.location,
        document,
        navigator,
        window,
        getDeviceType,
        getCountryCode,
        getTrafficSource
      );
      return result === true;
    } catch (e) {
      console.warn('[RipX] JS targeting error for test ' + testId + ':', e);
      return false;
    }
  }

  // Batch variant cache: pre-fetch all assignments in one request (reduces flicker)
  var _variantCachePromise = null;
  /** Single in-flight GET /track/preview per page (main loop + visual preview + reapply share it). */
  var _previewVariantInflight = null;
  var _previewVariantInflightKey = '';
  /** Latest line-attribute payload to apply on theme AJAX cart/add requests. */
  var _ripxCartAttributeState = null;
  var _ripxCartFormTargetProductIds = null;
  var _ripxCartFormObserverInstalled = false;
  var _ripxCartFormObserverTimer = null;
  var _ripxCartAddInterceptorsInstalled = false;

  function getVariantCachePromise() {
    if (_variantCachePromise) return _variantCachePromise;
    // Preview without a target test should still use normal batch assignments.
    // Only bypass /track/variants when a specific preview test is active.
    if (PREVIEW_MODE && PREVIEW_TEST_ID) {
      _variantCachePromise = Promise.resolve({});
      return _variantCachePromise;
    }
    if (!hasValidConfig || !CONFIG.activeTests || CONFIG.activeTests.length === 0) {
      return Promise.resolve({});
    }
    if (consentRequired && !hasConsent()) {
      return Promise.resolve({});
    }
    const userId = getUserId();
    const shopDomain = getShopDomain();
    const testIds = CONFIG.activeTests
      .map(function (t) {
        return t.id;
      })
      .join(',');
    const device = getDeviceType();
    const customer = getCustomerType();
    const country = getCountryCode();
    const trafficSource = getTrafficSource();
    const currentUrl = window.location.href || '';
    const currentPathname =
      window.location.pathname != null && window.location.pathname !== ''
        ? window.location.pathname
        : '/';
    const sessionCount = getAndIncrementSessionCount();

    const jsTargetingResults = {};
    CONFIG.activeTests.forEach(function (t) {
      if (t.jsTargeting && t.jsTargeting.enabled && t.jsTargeting.code) {
        jsTargetingResults[t.id] = evaluateJsTargeting(t.id, t.jsTargeting.code);
      }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams({
      user_id: userId,
      shop_domain: shopDomain,
      test_ids: testIds,
      device: device,
      customer: customer,
      country: country || '',
      traffic_source: trafficSource,
      current_url: currentUrl,
      current_pathname: currentPathname,
      session_count: String(sessionCount),
      referrer: document.referrer || '',
      utm_source: urlParams.get('utm_source') || '',
      utm_medium: urlParams.get('utm_medium') || '',
    });
    var cProductId = getCurrentProductId();
    var cCollectionId = getCurrentCollectionId();
    if (cProductId) params.set('current_product_id', cProductId);
    if (cCollectionId) params.set('current_collection_id', cCollectionId);
    if (Object.keys(jsTargetingResults).length > 0) {
      params.set('js_targeting_results', JSON.stringify(jsTargetingResults));
    }
    var variantsUrl = CONFIG.apiUrl + '/track/variants?' + params.toString();
    _variantCachePromise = fetchWithRetry(variantsUrl, { method: 'GET' }, 8000, 600)
      .then(function (r) {
        return r.ok ? r.json() : { variants: {} };
      })
      .then(function (data) {
        return data.variants || {};
      })
      .catch(function (err) {
        if (DEBUG) debugLog('variants fetch failed', err && (err.message || err.name));
        return {};
      });
    return _variantCachePromise;
  }

  function ensureBatchFetched() {
    getVariantCachePromise();
  }

  /**
   * Get variant for a test
   */
  async function getVariant(testId) {
    if (!hasValidConfig) {
      return null;
    }
    if (
      PREVIEW_MODE &&
      PREVIEW_TEST_ID === String(testId) &&
      (PREVIEW_VARIANT_ID || PREVIEW_VARIANT_NAME)
    ) {
      const previewVariant = await getPreviewVariantSingleFlight(testId);
      if (previewVariant) {
        return {
          ...previewVariant,
          isPreview: true,
        };
      }

      if (DEBUG) {
        debugLog(
          'Preview variant fetch failed or empty config — check Network for /track/preview (CORS, 404).'
        );
      }
      return {
        variantId: PREVIEW_VARIANT_ID || null,
        variantName: PREVIEW_VARIANT_NAME || 'Preview',
        isPreview: true,
      };
    }

    const id = String(testId);

    try {
      const cache = await getVariantCachePromise();
      if (cache && typeof cache === 'object') {
        var fromCache = cache[id];
        if (fromCache === undefined || fromCache === null) {
          fromCache = cache[testId];
        }
        if (fromCache !== undefined && fromCache !== null) return fromCache;
      }
    } catch (e) {
      console.error('Error getting variant from cache:', e);
    }

    const userId = getUserId();
    const shopDomain = getShopDomain();

    try {
      const device = getDeviceType();
      const customer = getCustomerType();
      const country = getCountryCode();
      const trafficSource = getTrafficSource();
      const currentUrl = window.location.href || '';
      const currentPathname =
        window.location.pathname != null && window.location.pathname !== ''
          ? window.location.pathname
          : '/';
      const sessionCount = getAndIncrementSessionCount();

      const urlParams = new URLSearchParams(window.location.search);
      const params = new URLSearchParams({
        test_id: id,
        user_id: userId,
        shop_domain: shopDomain,
        device: device,
        customer: customer,
        country: country || '',
        traffic_source: trafficSource,
        current_url: currentUrl,
        current_pathname: currentPathname,
        session_count: String(sessionCount),
        referrer: document.referrer || '',
        utm_source: urlParams.get('utm_source') || '',
        utm_medium: urlParams.get('utm_medium') || '',
      });
      const testConfig = CONFIG.activeTests.find(function (t) {
        return String(t.id) === id;
      });
      if (
        testConfig &&
        testConfig.jsTargeting &&
        testConfig.jsTargeting.enabled &&
        testConfig.jsTargeting.code
      ) {
        params.set(
          'js_targeting_passed',
          String(evaluateJsTargeting(id, testConfig.jsTargeting.code))
        );
      }
      const response = await fetchWithTimeout(
        `${CONFIG.apiUrl}/track/variant?${params.toString()}`,
        { method: 'GET' },
        8000
      );

      if (response.ok) {
        const data = await response.json();
        return data.variant;
      }
    } catch (error) {
      console.error('Error getting variant:', error);
    }

    return null;
  }

  /**
   * Coalesce parallel preview variant requests (same test + variant params).
   * @param {string} testId
   * @returns {Promise<object|null>}
   */
  function getPreviewVariantSingleFlight(testId) {
    var key =
      String(testId) +
      '\u0000' +
      (PREVIEW_VARIANT_ID || '') +
      '\u0000' +
      (PREVIEW_VARIANT_NAME || '');
    if (_previewVariantInflight && _previewVariantInflightKey === key) {
      return _previewVariantInflight;
    }
    var p = fetchPreviewVariant(testId);
    _previewVariantInflightKey = key;
    var wrapped = p.finally(function () {
      if (_previewVariantInflight === wrapped) {
        _previewVariantInflight = null;
        _previewVariantInflightKey = '';
      }
    });
    _previewVariantInflight = wrapped;
    return wrapped;
  }

  async function fetchPreviewVariant(testId) {
    if (!hasValidConfig) {
      return null;
    }

    try {
      const params = new URLSearchParams();
      params.set('test_id', testId);
      appendTrackTenantParams(params);
      var previewUserId = getUserId();
      if (!previewUserId) {
        if (!window.__RIPX_PREVIEW_USER_ID__) {
          window.__RIPX_PREVIEW_USER_ID__ =
            'ripx_preview_' + Math.random().toString(36).slice(2, 12);
        }
        previewUserId = window.__RIPX_PREVIEW_USER_ID__;
      }
      if (previewUserId && String(previewUserId).trim()) {
        params.set('user_id', String(previewUserId).trim());
      }

      if (PREVIEW_VARIANT_ID) {
        params.set('variant_id', PREVIEW_VARIANT_ID);
      }
      if (PREVIEW_VARIANT_NAME) {
        params.set('variant_name', PREVIEW_VARIANT_NAME);
      }

      const response = await fetchWithTimeout(
        `${CONFIG.apiUrl}/track/preview?${params.toString()}`,
        { method: 'GET' },
        8000
      );

      if (response.ok) {
        const data = await response.json();
        return data.variant;
      }
    } catch (error) {
      console.error('Error getting preview variant:', error);
    }

    return null;
  }

  /**
   * Fetch minimal test payload for preview when the test is draft/paused (not in script.js activeTests).
   */
  async function fetchPreviewStorefrontTestShape(testId) {
    if (!hasValidConfig || !testId) {
      return null;
    }
    try {
      const params = new URLSearchParams();
      params.set('test_id', String(testId));
      appendTrackTenantParams(params);
      const response = await fetchWithTimeout(
        `${CONFIG.apiUrl}/track/preview-storefront-test?${params.toString()}`,
        { method: 'GET' },
        8000
      );
      if (response.ok) {
        const data = await response.json();
        return data.test || null;
      }
    } catch (error) {
      console.error('Error fetching preview storefront test:', error);
    }
    return null;
  }

  /**
   * Track conversion event (purchase/order)
   */
  async function trackConversion(testId, variantId, value = 0, metadata = {}) {
    if (PREVIEW_TEST_CONTEXT || !hasValidConfig) {
      return;
    }
    const userId = getUserId();
    const shopDomain = getShopDomain();

    const meta = { ...metadata };
    if (!meta.conversion_url && typeof window !== 'undefined' && window.location) {
      meta.conversion_url = window.location.pathname || window.location.href;
    }

    try {
      await fetchWithTimeout(
        CONFIG.apiUrl + '/track',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            test_id: testId,
            variant_id: variantId,
            user_id: userId,
            shop_domain: shopDomain,
            event_type: 'conversion',
            event_value: value,
            metadata: meta,
          }),
        },
        6000
      );
    } catch (error) {
      if (DEBUG) debugLog('track conversion failed', error && (error.message || error.name));
    }
  }

  /**
   * Track custom event (add_to_cart, signup, etc.)
   * Use when variant is unknown - fetches from cache. Pass variantId if known.
   *
   * @param {string} testId - Test ID
   * @param {string} eventName - Custom event name (e.g. add_to_cart, newsletter_signup)
   * @param {number} [value=0] - Optional numeric value
   * @param {Object} [metadata={}] - Optional metadata
   * @param {string} [variantId] - Variant ID if known (avoids extra fetch)
   */
  async function trackEvent(testId, eventName, value = 0, metadata = {}, variantId) {
    if (PREVIEW_TEST_CONTEXT || !hasValidConfig || !eventName || !String(eventName).trim()) {
      return;
    }
    const userId = getUserId();
    const shopDomain = getShopDomain();
    let vid = variantId;

    if (!vid) {
      const variant = await getVariant(testId);
      vid = variant?.variantId;
    }
    if (!vid) return;

    try {
      await fetchWithTimeout(
        CONFIG.apiUrl + '/track',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            test_id: testId,
            variant_id: vid,
            user_id: userId,
            shop_domain: shopDomain,
            event_type: 'custom',
            event_name: String(eventName).trim(),
            event_value: typeof value === 'number' ? value : 0,
            metadata: metadata && typeof metadata === 'object' ? metadata : {},
          }),
        },
        6000
      );
    } catch (error) {
      if (DEBUG) debugLog('track event failed', error && (error.message || error.name));
    }
  }

  /**
   * Numeric Shopify product id for data-product-id attributes (themes use number, not GID).
   */
  function toNumericProductId(id) {
    if (id == null || id === '') return '';
    var s = String(id).trim();
    var m = s.match(/Product\/(\d+)/);
    if (m) return m[1];
    return s.replace(/\D/g, '') || s;
  }

  /**
   * Active store currency (Shopify.theme or currency meta).
   */
  function getShopCurrency() {
    if (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) {
      return String(window.Shopify.currency.active);
    }
    var el = document.querySelector('[data-shop-currency], [data-currency-code]');
    if (el) {
      return (
        el.getAttribute('data-shop-currency') || el.getAttribute('data-currency-code') || 'USD'
      );
    }
    return 'USD';
  }

  /**
   * Format price for display (theme money format when available).
   */
  function formatShopPrice(amount) {
    var n = parseFloat(amount, 10);
    if (isNaN(n) || n < 0) return '';
    if (typeof Shopify !== 'undefined' && typeof Shopify.formatMoney === 'function') {
      try {
        return Shopify.formatMoney(Math.round(n * 100));
      } catch (e) {}
    }
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: getShopCurrency(),
      }).format(n);
    } catch (e) {
      return String(n);
    }
  }

  /**
   * Get product JSON from page (Dawn #ProductJson, theme script, or meta).
   * Returns { product, variants, selectedVariant } or null.
   */
  function getProductJson() {
    var script = document.querySelector(
      '#ProductJson, script[type="application/json"][data-product-json], script[data-section-type="product-template"], script[data-section-type="product"]'
    );
    if (script && script.textContent) {
      try {
        var data = JSON.parse(script.textContent);
        var product = data.product || data;
        var variants = product.variants || data.variants || [];
        if (!variants.length && product && product.variants) variants = product.variants;
        var selected =
          product.selected_or_first_available_variant ||
          data.selected_or_first_available_variant ||
          (variants.length ? variants[0] : null);
        if (selected && variants.length) {
          var selId = selected.id || selected.variant_id;
          if (
            selId &&
            !variants.find(function (v) {
              return String(v.id) === String(selId);
            })
          ) {
            selected =
              variants.find(function (v) {
                return String(v.id) === String(selId);
              }) || variants[0];
          }
        }
        return { product: product, variants: variants, selectedVariant: selected };
      } catch (e) {}
    }
    if (window.ShopifyAnalytics?.meta?.product) {
      var p = window.ShopifyAnalytics.meta.product;
      var vs = p.variants || [];
      var sel =
        vs.find(function (v) {
          return String(v.id) === String(p.selected_variant_id);
        }) || vs[0];
      return { product: p, variants: vs, selectedVariant: sel };
    }
    if (window.Shopify?.meta?.product) {
      var p2 = window.Shopify.meta.product;
      var vs2 = p2.variants || [];
      var sel2 =
        vs2.find(function (v) {
          return String(v.id) === String(p2.selected_variant_id);
        }) || vs2[0];
      return { product: p2, variants: vs2, selectedVariant: sel2 };
    }
    return null;
  }

  /**
   * Get currently selected variant ID (form input or product JSON).
   */
  function getSelectedVariantId() {
    var input = document.querySelector('input[name="id"], input[name="variant_id"], [name="id"]');
    if (input && input.value) return input.value.trim();
    var json = getProductJson();
    if (json && json.selectedVariant && json.selectedVariant.id) {
      return String(json.selectedVariant.id);
    }
    return null;
  }

  /**
   * Parse variant price or compare_at_price from JSON (Shopify uses subunits/cents when integer).
   */
  function parseVariantPrice(raw) {
    if (raw === null || raw === undefined) return null;
    var num = parseFloat(String(raw).replace(/[^0-9.-]/g, ''), 10);
    if (isNaN(num)) return null;
    if (typeof raw === 'number' && Number.isInteger(raw)) num = raw / 100;
    else if (String(raw).indexOf('.') === -1 && num >= 100) num = num / 100;
    return num;
  }

  /**
   * Get catalog selling price for current (or given) variant in dollars.
   */
  function getCatalogPriceFromPage(preferredVariantId) {
    var json = getProductJson();
    if (!json || !json.variants || !json.variants.length) return null;
    var vid = preferredVariantId || getSelectedVariantId();
    var v = json.variants.find(function (x) {
      return String(x.id) === String(vid);
    });
    if (!v) v = json.selectedVariant || json.variants[0];
    if (!v) return null;
    return parseVariantPrice(v.price);
  }

  /**
   * Get catalog compare_at_price for current variant in dollars (for "percent off list").
   * Returns null if not present; themes/API may omit it.
   */
  function getCatalogCompareAtFromPage(preferredVariantId) {
    var json = getProductJson();
    if (!json || !json.variants || !json.variants.length) return null;
    var vid = preferredVariantId || getSelectedVariantId();
    var v = json.variants.find(function (x) {
      return String(x.id) === String(vid);
    });
    if (!v) v = json.selectedVariant || json.variants[0];
    if (!v || v.compare_at_price == null) return null;
    return parseVariantPrice(v.compare_at_price);
  }

  /**
   * Inject line item properties on product /cart/add forms so checkout Discount Functions can read CartLine attributes.
   * Shopify expects properties[_key] (not attributes[]) for line-level data. Leading underscore = hidden from buyers in most themes.
   * See docs/SHOPIFY_CHECKOUT_PRICE_RESOLVER.md
   */
  function getRipxCartAttrsPayload(testId, variantId, shopDomain, assignmentProof) {
    var out = {
      _ripx_price_test: String(testId || ''),
      _ripx_variant: String(variantId == null ? '' : variantId),
      _ripx_shop: shopDomain ? String(shopDomain) : '',
    };
    if (
      assignmentProof &&
      assignmentProof.sig &&
      assignmentProof.ts &&
      assignmentProof.user &&
      String(assignmentProof.sig).trim() &&
      String(assignmentProof.ts).trim() &&
      String(assignmentProof.user).trim()
    ) {
      out._ripx_assignment_sig = String(assignmentProof.sig).trim();
      out._ripx_assignment_ts = String(assignmentProof.ts).trim();
      out._ripx_assignment_user = String(assignmentProof.user).trim();
    }
    return out;
  }

  function setRipxAttrValueOnFormData(formData, key, value, preserveExisting) {
    if (!formData || !key) return;
    if (value === undefined || value === null || String(value).trim() === '') return;
    if (
      preserveExisting &&
      typeof formData.get === 'function' &&
      formData.get(key) !== null &&
      String(formData.get(key)).trim() !== ''
    ) {
      return;
    }
    formData.set(key, value);
  }

  function applyRipxCartAttrsToFormData(formData, payload, preserveExisting) {
    if (!formData || !payload) return false;
    setRipxAttrValueOnFormData(
      formData,
      'properties[_ripx_price_test]',
      payload._ripx_price_test,
      preserveExisting
    );
    setRipxAttrValueOnFormData(
      formData,
      'properties[_ripx_variant]',
      payload._ripx_variant,
      preserveExisting
    );
    setRipxAttrValueOnFormData(
      formData,
      'properties[_ripx_shop]',
      payload._ripx_shop,
      preserveExisting
    );
    setRipxAttrValueOnFormData(
      formData,
      'properties[_ripx_assignment_sig]',
      payload._ripx_assignment_sig,
      preserveExisting
    );
    setRipxAttrValueOnFormData(
      formData,
      'properties[_ripx_assignment_ts]',
      payload._ripx_assignment_ts,
      preserveExisting
    );
    setRipxAttrValueOnFormData(
      formData,
      'properties[_ripx_assignment_user]',
      payload._ripx_assignment_user,
      preserveExisting
    );
    return true;
  }

  function setRipxAttrValueOnSearchParams(params, key, value, preserveExisting) {
    if (!params || !key) return;
    if (value === undefined || value === null || String(value).trim() === '') return;
    if (preserveExisting && params.get(key) != null && String(params.get(key)).trim() !== '') {
      return;
    }
    params.set(key, value);
  }

  function applyRipxCartAttrsToSearchParams(params, payload, preserveExisting) {
    if (!params || !payload) return false;
    setRipxAttrValueOnSearchParams(
      params,
      'properties[_ripx_price_test]',
      payload._ripx_price_test,
      preserveExisting
    );
    setRipxAttrValueOnSearchParams(
      params,
      'properties[_ripx_variant]',
      payload._ripx_variant,
      preserveExisting
    );
    setRipxAttrValueOnSearchParams(
      params,
      'properties[_ripx_shop]',
      payload._ripx_shop,
      preserveExisting
    );
    setRipxAttrValueOnSearchParams(
      params,
      'properties[_ripx_assignment_sig]',
      payload._ripx_assignment_sig,
      preserveExisting
    );
    setRipxAttrValueOnSearchParams(
      params,
      'properties[_ripx_assignment_ts]',
      payload._ripx_assignment_ts,
      preserveExisting
    );
    setRipxAttrValueOnSearchParams(
      params,
      'properties[_ripx_assignment_user]',
      payload._ripx_assignment_user,
      preserveExisting
    );
    return true;
  }

  function isCartAddPath(urlValue) {
    if (!urlValue) return false;
    try {
      var parsed = new URL(String(urlValue), window.location.origin);
      var p = (parsed.pathname || '').replace(/\/+$/, '');
      // Suffix match: /cart/add or /cart/add.js with any prefix (/en/…, /en-us/…, nested Markets paths).
      return /\/cart\/add(?:\.js)?$/i.test(p);
    } catch (e) {
      return false;
    }
  }

  /** @type {Record<string, true>} */
  var _ripxCartDebugNearMiss = {};

  function pathnameFromCartUrl(urlValue) {
    try {
      var p = new URL(String(urlValue), window.location.origin).pathname || '';
      return p.replace(/\/+$/, '') || '/';
    } catch (e) {
      return '(invalid-url)';
    }
  }

  function looksLikeCartAddNearMiss(urlValue) {
    if (!urlValue || isCartAddPath(urlValue)) return false;
    try {
      var p = (new URL(String(urlValue), window.location.origin).pathname || '').toLowerCase();
      return p.indexOf('cart') !== -1 && p.indexOf('add') !== -1;
    } catch (e) {
      return false;
    }
  }

  function debugLogCartNearMissOnce(pathname) {
    if (!DEBUG) return;
    if (_ripxCartDebugNearMiss[pathname]) return;
    if (Object.keys(_ripxCartDebugNearMiss).length >= 32) return;
    _ripxCartDebugNearMiss[pathname] = true;
    debugLog(
      'cart near-miss:',
      pathname,
      'POST path mentions cart+add but is not */cart/add(.js) — if this is add-to-cart, file an issue with the path pattern.'
    );
  }

  /** Body shape hint when patchCartAddBodyForRipx returns changed:false (debug only). */
  function debugDescribeCartAddBody(body) {
    if (body == null || body === '') return 'body:none';
    try {
      if (typeof FormData !== 'undefined' && body instanceof FormData) return 'body:FormData';
      if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
        return 'body:URLSearchParams';
      }
      if (typeof body === 'string') {
        var t = body.trim();
        if (!t) return 'body:string(empty)';
        var c0 = t.charAt(0);
        if (c0 === '{' || c0 === '[') return 'body:string(JSON)';
        if (t.indexOf('=') !== -1) return 'body:string(form)';
        return 'body:string(other)';
      }
      if (typeof Blob !== 'undefined' && body instanceof Blob) return 'body:Blob';
      if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer)
        return 'body:ArrayBuffer';
    } catch (e) {}
    return 'body:' + typeof body;
  }

  function getHeaderValue(headers, headerName) {
    if (!headers || !headerName) return '';
    var key = String(headerName).toLowerCase();
    try {
      if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        return headers.get(headerName) || headers.get(key) || '';
      }
    } catch (e) {}
    if (Array.isArray(headers)) {
      for (var i = 0; i < headers.length; i++) {
        var pair = headers[i];
        if (Array.isArray(pair) && String(pair[0]).toLowerCase() === key) {
          return String(pair[1] || '');
        }
      }
      return '';
    }
    if (typeof headers === 'object') {
      for (var h in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, h) && String(h).toLowerCase() === key) {
          return String(headers[h] || '');
        }
      }
    }
    return '';
  }

  function setHeaderValue(headers, headerName, headerValue) {
    if (!headers || !headerName) return;
    try {
      if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        headers.set(headerName, headerValue);
        return;
      }
    } catch (e) {}
    if (Array.isArray(headers)) {
      var key = String(headerName).toLowerCase();
      for (var i = 0; i < headers.length; i++) {
        var pair = headers[i];
        if (Array.isArray(pair) && String(pair[0]).toLowerCase() === key) {
          pair[1] = headerValue;
          return;
        }
      }
      headers.push([headerName, headerValue]);
      return;
    }
    if (typeof headers === 'object') {
      headers[headerName] = headerValue;
    }
  }

  function patchCartAddBodyForRipx(body, headers, payload) {
    if (!payload || !payload._ripx_price_test || !payload._ripx_variant) {
      if (DEBUG) debugLog('cart patch skip: missing _ripx_price_test / _ripx_variant on payload');
      return { changed: false, body: body };
    }

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      applyRipxCartAttrsToFormData(body, payload, true);
      return { changed: true, body: body };
    }
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      applyRipxCartAttrsToSearchParams(body, payload, true);
      return { changed: true, body: body };
    }
    if (typeof body === 'string') {
      var ct = String(getHeaderValue(headers, 'content-type') || '').toLowerCase();
      var trimmed = body.trim();

      var looksJson = ct.indexOf('application/json') !== -1 || /^\{[\s\S]*\}$/.test(trimmed);
      if (looksJson) {
        try {
          var obj = JSON.parse(trimmed || '{}');
          if (obj && typeof obj === 'object') {
            function mergedRipxProps(existing) {
              var nextProps = Object.assign({}, existing || {});
              function setPropIfMissing(key, value) {
                if (value === undefined || value === null || String(value).trim() === '') return;
                if (nextProps[key] != null && String(nextProps[key]).trim() !== '') return;
                nextProps[key] = value;
              }
              setPropIfMissing('_ripx_price_test', payload._ripx_price_test);
              setPropIfMissing('_ripx_variant', payload._ripx_variant);
              setPropIfMissing('_ripx_shop', payload._ripx_shop);
              setPropIfMissing('_ripx_assignment_sig', payload._ripx_assignment_sig);
              setPropIfMissing('_ripx_assignment_ts', payload._ripx_assignment_ts);
              setPropIfMissing('_ripx_assignment_user', payload._ripx_assignment_user);
              return nextProps;
            }
            function mapCartLinesWithRipx(arr) {
              if (!Array.isArray(arr)) return;
              for (var li = 0; li < arr.length; li++) {
                var item = arr[li];
                if (!item || typeof item !== 'object') continue;
                var nextItem = Object.assign({}, item);
                nextItem.properties = mergedRipxProps(item.properties);
                arr[li] = nextItem;
              }
            }
            var hasItems = Array.isArray(obj.items);
            var hasLineItems = Array.isArray(obj.line_items);
            if (hasItems) {
              mapCartLinesWithRipx(obj.items);
            }
            if (hasLineItems) {
              mapCartLinesWithRipx(obj.line_items);
            }
            if (!hasItems && !hasLineItems) {
              obj.properties = mergedRipxProps(obj.properties);
            }
            return {
              changed: true,
              body: JSON.stringify(obj),
              contentType: 'application/json',
            };
          }
        } catch (e) {
          if (DEBUG) {
            debugLog('cart patch: JSON parse failed', e && (e.message || String(e)));
          }
        }
      }

      var looksUrlEncoded =
        ct.indexOf('application/x-www-form-urlencoded') !== -1 || trimmed.indexOf('=') !== -1;
      if (looksUrlEncoded) {
        try {
          var params = new URLSearchParams(body);
          applyRipxCartAttrsToSearchParams(params, payload, true);
          return {
            changed: true,
            body: params.toString(),
            contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
          };
        } catch (e) {
          if (DEBUG) {
            debugLog('cart patch: URLSearchParams parse failed', e && (e.message || String(e)));
          }
        }
      }
    }
    return { changed: false, body: body };
  }

  function installRipxCartAddInterceptors() {
    if (_ripxCartAddInterceptorsInstalled) return;
    _ripxCartAddInterceptorsInstalled = true;

    // Intercept fetch('/cart/add(.js)') theme flows (no HTML form submit path).
    if (typeof window.fetch === 'function') {
      var nativeFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        try {
          var url =
            typeof input === 'string'
              ? input
              : input && typeof input.url === 'string'
                ? input.url
                : '';
          var methodRaw =
            (init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET';
          var method = String(methodRaw || 'GET').toUpperCase();

          if (method === 'POST' && isCartAddPath(url)) {
            var ripxCartPath = pathnameFromCartUrl(url);
            if (!_ripxCartAttributeState) {
              if (DEBUG) {
                debugLog(
                  'cart intercept fetch:',
                  ripxCartPath,
                  '— skip (no RipX line state yet; open preview URL or wait for price test to apply)'
                );
              }
            } else {
              var nextInit = init ? Object.assign({}, init) : {};
              if (!nextInit.headers) nextInit.headers = (input && input.headers) || {};
              if (nextInit.body === undefined && input && typeof input !== 'string') {
                if (
                  typeof FormData !== 'undefined' &&
                  input.body &&
                  input.body instanceof FormData
                ) {
                  nextInit.body = input.body;
                } else if (
                  typeof URLSearchParams !== 'undefined' &&
                  input.body &&
                  input.body instanceof URLSearchParams
                ) {
                  nextInit.body = input.body;
                } else if (typeof input.body === 'string') {
                  nextInit.body = input.body;
                } else if (typeof input.clone === 'function' && typeof input.text === 'function') {
                  return input
                    .clone()
                    .text()
                    .then(function (requestBodyText) {
                      var asyncInit = Object.assign({}, nextInit);
                      asyncInit.body = requestBodyText;
                      var asyncPatch = patchCartAddBodyForRipx(
                        asyncInit.body,
                        asyncInit.headers,
                        _ripxCartAttributeState
                      );
                      if (asyncPatch.changed) {
                        asyncInit.body = asyncPatch.body;
                        if (
                          asyncPatch.contentType &&
                          !getHeaderValue(asyncInit.headers, 'content-type')
                        ) {
                          setHeaderValue(asyncInit.headers, 'Content-Type', asyncPatch.contentType);
                        }
                      }
                      if (DEBUG) {
                        debugLog(
                          'cart intercept fetch:',
                          ripxCartPath,
                          asyncPatch.changed ? 'patched' : 'unchanged',
                          asyncPatch.changed ? '' : debugDescribeCartAddBody(asyncInit.body)
                        );
                      }
                      return nativeFetch(input, asyncInit);
                    })
                    .catch(function () {
                      return nativeFetch(input, init);
                    });
                }
              }
              var patch = patchCartAddBodyForRipx(
                nextInit.body,
                nextInit.headers,
                _ripxCartAttributeState
              );
              if (patch.changed) {
                nextInit.body = patch.body;
                if (patch.contentType && !getHeaderValue(nextInit.headers, 'content-type')) {
                  setHeaderValue(nextInit.headers, 'Content-Type', patch.contentType);
                }
              }
              if (DEBUG) {
                debugLog(
                  'cart intercept fetch:',
                  ripxCartPath,
                  patch.changed ? 'patched' : 'unchanged',
                  patch.changed ? '' : debugDescribeCartAddBody(nextInit.body)
                );
              }
              return nativeFetch(input, nextInit);
            }
          } else if (DEBUG && method === 'POST' && looksLikeCartAddNearMiss(url)) {
            debugLogCartNearMissOnce(pathnameFromCartUrl(url));
          }
        } catch (e) {}
        return nativeFetch(input, init);
      };
    }

    // Intercept XHR cart/add flows used by older or custom themes.
    if (typeof XMLHttpRequest !== 'undefined') {
      var origOpen = XMLHttpRequest.prototype.open;
      var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
      var origSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url) {
        this.__ripxMethod = method;
        this.__ripxUrl = url;
        this.__ripxContentType = '';
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (name && String(name).toLowerCase() === 'content-type') {
          this.__ripxContentType = String(value || '');
        }
        return origSetHeader.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function (body) {
        try {
          var method = String(this.__ripxMethod || 'GET').toUpperCase();
          var xhrCartPath = pathnameFromCartUrl(this.__ripxUrl);
          if (method === 'POST' && isCartAddPath(this.__ripxUrl)) {
            if (!_ripxCartAttributeState) {
              if (DEBUG) {
                debugLog(
                  'cart intercept xhr:',
                  xhrCartPath,
                  '— skip (no RipX line state yet; open preview URL or wait for price test to apply)'
                );
              }
            } else {
              var bodyBeforeXhr = body;
              var headerObj = { 'content-type': this.__ripxContentType || '' };
              var patch = patchCartAddBodyForRipx(body, headerObj, _ripxCartAttributeState);
              body = patch.body;
              if (patch.contentType && !this.__ripxContentType) {
                this.setRequestHeader('Content-Type', patch.contentType);
                this.__ripxContentType = patch.contentType;
              }
              if (DEBUG) {
                debugLog(
                  'cart intercept xhr:',
                  xhrCartPath,
                  patch.changed ? 'patched' : 'unchanged',
                  patch.changed ? '' : debugDescribeCartAddBody(bodyBeforeXhr)
                );
              }
            }
          } else if (DEBUG && method === 'POST' && looksLikeCartAddNearMiss(this.__ripxUrl)) {
            debugLogCartNearMissOnce(xhrCartPath);
          }
        } catch (e) {}
        return origSend.call(this, body);
      };
    }
  }

  function formMatchesTargetProductIds(form, targetProductIds) {
    if (!form || !Array.isArray(targetProductIds) || targetProductIds.length === 0) return true;
    var scoped = targetProductIds
      .map(function (id) {
        return toNumericProductId(id);
      })
      .filter(Boolean);
    if (!scoped.length) return true;
    var holder = form.closest
      ? form.closest('[data-product-id],[data-product],[data-product-handle]')
      : null;
    var raw =
      (form.getAttribute && form.getAttribute('data-product-id')) ||
      (holder && holder.getAttribute && holder.getAttribute('data-product-id')) ||
      '';
    var pid = toNumericProductId(raw);
    if (!pid) return true;
    return scoped.indexOf(pid) !== -1;
  }

  /**
   * Re-apply hidden RipX line properties to cart/add forms (dynamic drawers, section reloads).
   * Uses _ripxCartAttributeState; respects last injectPriceTestCartAttributes target scope.
   */
  function applyRipxStateToCartForms(targetProductIds) {
    var state = _ripxCartAttributeState;
    if (!state || !state._ripx_price_test || !state._ripx_variant) return;
    var keyTest = '_ripx_price_test';
    var keyVariant = '_ripx_variant';
    var keyShop = '_ripx_shop';
    var valueTest = String(state._ripx_price_test);
    var valueVariant = String(state._ripx_variant);
    var valueShop = state._ripx_shop ? String(state._ripx_shop) : '';
    var forms = document.querySelectorAll(
      'form[action*="cart/add"], form[action*="/cart/add"], form[data-ajax-cart-form], form[data-cart-add]'
    );
    forms.forEach(function (form) {
      if (!form) return;
      if (!formMatchesTargetProductIds(form, targetProductIds)) return;
      function setProperty(propKey, value) {
        if (value === undefined || value === null || String(value).trim() === '') return;
        var fullName = 'properties[' + propKey + ']';
        var inputs = form.querySelectorAll('input[type="hidden"]');
        for (var hi = 0; hi < inputs.length; hi++) {
          if (inputs[hi].name === fullName) {
            inputs[hi].value = value;
            return;
          }
        }
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = fullName;
        input.value = value;
        form.appendChild(input);
      }
      setProperty(keyTest, valueTest);
      setProperty(keyVariant, valueVariant);
      if (valueShop) setProperty(keyShop, valueShop);
      if (state._ripx_assignment_sig) {
        setProperty('_ripx_assignment_sig', state._ripx_assignment_sig);
      }
      if (state._ripx_assignment_ts) {
        setProperty('_ripx_assignment_ts', state._ripx_assignment_ts);
      }
      if (state._ripx_assignment_user) {
        setProperty('_ripx_assignment_user', state._ripx_assignment_user);
      }
    });
  }

  function installRipxCartFormObserver() {
    if (_ripxCartFormObserverInstalled) return;
    if (typeof MutationObserver === 'undefined') return;
    var root = document.documentElement || document.body;
    if (!root) return;
    _ripxCartFormObserverInstalled = true;
    var observer = new MutationObserver(function () {
      if (!_ripxCartAttributeState) return;
      if (_ripxCartFormObserverTimer) clearTimeout(_ripxCartFormObserverTimer);
      _ripxCartFormObserverTimer = setTimeout(function () {
        _ripxCartFormObserverTimer = null;
        applyRipxStateToCartForms(_ripxCartFormTargetProductIds);
      }, 200);
    });
    try {
      observer.observe(root, { childList: true, subtree: true });
    } catch (e) {
      _ripxCartFormObserverInstalled = false;
    }
  }

  function injectPriceTestCartAttributes(testId, variantId, assignmentProof, targetProductIds) {
    if (!testId || variantId == null || String(variantId).trim() === '') return;
    var valueShop =
      (CONFIG.shopDomain && String(CONFIG.shopDomain).trim()) ||
      (typeof window !== 'undefined' &&
        window.Shopify &&
        window.Shopify.shop &&
        String(window.Shopify.shop).trim()) ||
      '';
    _ripxCartAttributeState = getRipxCartAttrsPayload(
      String(testId),
      String(variantId),
      valueShop,
      assignmentProof
    );
    _ripxCartFormTargetProductIds = targetProductIds;
    installRipxCartAddInterceptors();
    applyRipxStateToCartForms(targetProductIds);
    installRipxCartFormObserver();
    if (DEBUG)
      debugLog(
        'injectPriceTestCartAttributes:',
        String(testId),
        String(variantId),
        valueShop || '(no shop)'
      );
  }

  /**
   * Preview may return a stub when /track/preview fails — no config, so DOM price helpers bail.
   * Checkout still needs _ripx_* line properties; inject when preview + test/variant ids are known.
   */
  function injectPreviewCartAttributesWhenConfigMissing(testId, variant) {
    if (!PREVIEW_MODE || !testId || !variant) return;
    if (variant.config) return;
    var allow =
      variant.isPreview || (PREVIEW_TEST_ID != null && String(testId) === String(PREVIEW_TEST_ID));
    if (!allow) return;
    var vid = variant.variantId != null ? variant.variantId : variant.id;
    if (vid == null || String(vid).trim() === '') vid = PREVIEW_VARIANT_ID;
    if (vid == null || String(vid).trim() === '') return;
    injectPriceTestCartAttributes(testId, vid, getAssignmentProofFromVariant(variant), null);
  }

  /**
   * Normalize variant ID for lookup (numeric string or gid). Used for byVariant keys.
   */
  function toVariantIdKey(variantId) {
    if (variantId == null || variantId === '') return null;
    var s = String(variantId).trim();
    var m = s.match(/ProductVariant\/\s*(\d+)/i) || s.match(/\b(\d{10,})\b/);
    if (m) return m[1];
    return s;
  }

  function getAssignmentProofFromVariant(variant) {
    if (!variant || typeof variant !== 'object') return null;
    var sig = variant.assignment_sig || variant.assignmentSig;
    var ts = variant.assignment_ts || variant.assignmentTs;
    var user = variant.assignment_user || variant.assignmentUser || getUserId();
    if (!sig || !ts || !user) return null;
    return { sig: sig, ts: ts, user: user };
  }

  function hasModeValue(cfg, mode) {
    if (!cfg || typeof cfg !== 'object') return false;
    var m = String(mode || '').toLowerCase();
    if (m === 'fixed')
      return cfg.price !== null && cfg.price !== undefined && String(cfg.price).trim() !== '';
    if (m === 'amount')
      return (
        cfg.priceDelta !== null &&
        cfg.priceDelta !== undefined &&
        String(cfg.priceDelta).trim() !== ''
      );
    if (m === 'percent')
      return (
        cfg.pricePercent !== null &&
        cfg.pricePercent !== undefined &&
        String(cfg.pricePercent).trim() !== ''
      );
    if (m === 'control') return true;
    return false;
  }

  function normalizeMergedPriceConfig(baseCfg, mergedCfg) {
    var base = baseCfg && typeof baseCfg === 'object' ? baseCfg : {};
    var merged =
      mergedCfg && typeof mergedCfg === 'object'
        ? Object.assign({}, mergedCfg)
        : Object.assign({}, base);
    var mergedMode = String(merged.priceMode || 'fixed').toLowerCase();
    if (hasModeValue(merged, mergedMode)) return merged;
    var baseMode = String(base.priceMode || 'fixed').toLowerCase();
    if (!hasModeValue(base, baseMode)) return merged;
    merged.priceMode = baseMode;
    if (baseMode === 'fixed') merged.price = base.price;
    if (baseMode === 'amount') {
      merged.priceDelta = base.priceDelta;
      merged.priceBase = base.priceBase || merged.priceBase;
    }
    if (baseMode === 'percent') {
      merged.pricePercent = base.pricePercent;
      merged.priceBase = base.priceBase || merged.priceBase;
    }
    if (base.roundTo !== undefined && base.roundTo !== null && merged.roundTo == null) {
      merged.roundTo = base.roundTo;
    }
    return merged;
  }

  /**
   * Get effective price config for current product (and optionally product variant/SKU).
   * cfg.byProduct[productId] overrides base; cfg.byProduct[productId].byVariant[variantId] overrides per SKU.
   */
  function getEffectivePriceConfig(cfg, productId, currentVariantId) {
    if (!cfg || typeof cfg !== 'object') return cfg;
    var byProduct = cfg.byProduct;
    if (!byProduct || typeof byProduct !== 'object') return cfg;
    var pid = toNumericProductId(productId);
    var gid = pid ? 'gid://shopify/Product/' + pid : '';
    var override = byProduct[productId] || byProduct[pid] || (gid ? byProduct[gid] : null);
    if (!override || typeof override !== 'object') return cfg;
    var merged = {};
    for (var k in cfg)
      if (k !== 'byProduct' && Object.prototype.hasOwnProperty.call(cfg, k)) merged[k] = cfg[k];
    for (var j in override)
      if (j !== 'byVariant' && Object.prototype.hasOwnProperty.call(override, j))
        merged[j] = override[j];
    var byVariant = override.byVariant;
    if (
      currentVariantId != null &&
      currentVariantId !== '' &&
      byVariant &&
      typeof byVariant === 'object'
    ) {
      var vkey = toVariantIdKey(currentVariantId);
      var variantOverride = vkey
        ? byVariant[vkey] ||
          byVariant[currentVariantId] ||
          byVariant['gid://shopify/ProductVariant/' + vkey]
        : null;
      if (variantOverride && typeof variantOverride === 'object') {
        for (var v in variantOverride)
          if (Object.prototype.hasOwnProperty.call(variantOverride, v))
            merged[v] = variantOverride[v];
      }
    }
    return normalizeMergedPriceConfig(cfg, merged);
  }

  /**
   * Parse roundTo from config (number or string, e.g. 0.25 or "0.25"). Returns a positive number or 0 if invalid.
   */
  function parseRoundTo(roundTo) {
    if (roundTo == null) return 0;
    var n = typeof roundTo === 'number' ? roundTo : parseFloat(roundTo, 10);
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : 0;
  }

  /**
   * Apply price test — PDP only; scoped to main product (avoids cart, recs, collection cards).
   * Supports priceMode: 'fixed' (default), 'amount' (catalog + priceDelta), 'percent' (catalog * (1 - pricePercent/100); negative pricePercent = increase, e.g. -10 = 10% on).
   * When variant.config.byProduct[productId] exists, uses that override for this product (different price per product).
   * Note: Display only; checkout = catalog unless Plus/Functions/discounts. Injects cart attributes so a Discount Function can align checkout.
   * Sidecart: line-item prices in cart drawer/mini-cart are not painted here (theme-dependent DOM); Discount Function aligns charged price at checkout.
   */
  async function applyPriceTest(testId, productId, variantId, providedVariant) {
    var variant = providedVariant || (await getVariant(testId));
    if (!variant) return;
    if (!variant.config) {
      injectPreviewCartAttributesWhenConfigMissing(testId, variant);
      return;
    }

    var variantIdForCart = variant.variantId != null ? variant.variantId : variant.id;
    var currentPdpVariantId = getSelectedVariantId();
    var cfg = getEffectivePriceConfig(variant.config, productId, currentPdpVariantId);
    var priceMode = (cfg.priceMode || 'fixed').toLowerCase();
    if (priceMode === 'control') return;

    var priceNum = null;

    if (priceMode === 'fixed') {
      var rawPrice = cfg.price;
      if (rawPrice === null || rawPrice === undefined || rawPrice === '') return;
      priceNum = parseFloat(rawPrice, 10);
    } else if (priceMode === 'amount') {
      var useCompareAt = (cfg.priceBase || 'price').toLowerCase() === 'compare_at';
      var catalog = useCompareAt ? getCatalogCompareAtFromPage() : null;
      if (catalog === null) catalog = getCatalogPriceFromPage();
      if (catalog === null) {
        if (DEBUG) debugLog('applyPriceTest: amount mode but no catalog price on page');
        return;
      }
      if (
        cfg.priceDelta === null ||
        cfg.priceDelta === undefined ||
        String(cfg.priceDelta).trim() === ''
      )
        return;
      var delta = parseFloat(cfg.priceDelta, 10);
      if (isNaN(delta)) return;
      priceNum = catalog + delta;
    } else if (priceMode === 'percent') {
      var useCompareAtPct = (cfg.priceBase || 'price').toLowerCase() === 'compare_at';
      var catalogP = useCompareAtPct ? getCatalogCompareAtFromPage() : null;
      if (catalogP === null) catalogP = getCatalogPriceFromPage();
      if (catalogP === null) {
        if (DEBUG) debugLog('applyPriceTest: percent mode but no catalog price on page');
        return;
      }
      if (
        cfg.pricePercent === null ||
        cfg.pricePercent === undefined ||
        String(cfg.pricePercent).trim() === ''
      )
        return;
      var pct = parseFloat(cfg.pricePercent, 10);
      if (isNaN(pct)) return;
      priceNum = catalogP * (1 - pct / 100);
    } else {
      return;
    }

    if (isNaN(priceNum) || !isFinite(priceNum)) return;
    priceNum = Math.max(0, Math.round(priceNum * 100) / 100);
    var roundToVal = parseRoundTo(cfg.roundTo);
    if (roundToVal > 0) {
      priceNum = Math.round(priceNum / roundToVal) * roundToVal;
      priceNum = Math.max(0, Math.round(priceNum * 100) / 100);
    }

    var display = formatShopPrice(priceNum);
    if (!display) return;

    var currentDisplay = display;

    function recomputeDisplay() {
      if (priceMode === 'fixed') return currentDisplay;
      if (priceMode === 'amount') {
        var useCompareAt = (cfg.priceBase || 'price').toLowerCase() === 'compare_at';
        var catalogAmt = useCompareAt ? getCatalogCompareAtFromPage() : null;
        if (catalogAmt === null) catalogAmt = getCatalogPriceFromPage();
        if (catalogAmt === null) return null;
        var deltaAmt = parseFloat(cfg.priceDelta, 10);
        if (isNaN(deltaAmt)) return null;
        var numAmt = Math.max(0, Math.round((catalogAmt + deltaAmt) * 100) / 100);
        var roundAmt = parseRoundTo(cfg.roundTo);
        if (roundAmt > 0) numAmt = Math.round(numAmt / roundAmt) * roundAmt;
        if (!isFinite(numAmt)) return null;
        return formatShopPrice(numAmt) || null;
      }
      if (priceMode === 'percent') {
        var useCompareAtPct = (cfg.priceBase || 'price').toLowerCase() === 'compare_at';
        var catalogPct = useCompareAtPct ? getCatalogCompareAtFromPage() : null;
        if (catalogPct === null) catalogPct = getCatalogPriceFromPage();
        if (catalogPct === null) return null;
        var pctVal = parseFloat(cfg.pricePercent, 10);
        if (isNaN(pctVal)) return null;
        var numPct = catalogPct * (1 - pctVal / 100);
        numPct = Math.max(0, Math.round(numPct * 100) / 100);
        var roundPct = parseRoundTo(cfg.roundTo);
        if (roundPct > 0) numPct = Math.round(numPct / roundPct) * roundPct;
        if (!isFinite(numPct)) return null;
        return formatShopPrice(numPct) || null;
      }
      return currentDisplay;
    }

    var pid = toNumericProductId(productId);
    var pdpGid = getCurrentProductId();
    if (!pid || !pdpGid || toNumericProductId(pdpGid) !== pid) {
      if (DEBUG)
        debugLog(
          'applyPriceTest: skip (need PDP for this product)',
          pid,
          pdpGid ? 'mismatch' : 'no PDP'
        );
      return;
    }

    var vid = variantId ? String(variantId).replace(/\D/g, '') : '';

    var cartUi =
      '.cart-drawer,.cart-notification,#CartDrawer,#mini-cart,.mini-cart,[data-cart-drawer],.drawer--cart,aside.mini-cart,cart-drawer,.header__cart,.site-header__cart,predictive-search';

    function inCartUi(el) {
      return el.closest && el.closest(cartUi);
    }

    var specificSelectors = [];
    if (pid) {
      specificSelectors.push(
        '.product-price[data-product-id="' + pid + '"]',
        '[data-product-id="' + pid + '"] .price',
        '[data-product-id="' + pid + '"] .product__price',
        '[data-product-id="' + pid + '"] .price-item--regular .price',
        '[data-product-id="' + pid + '"] .price-item__regular',
        '[data-product-id="' + pid + '"] [data-price-container] .money',
        'product-info[data-product-id="' + pid + '"] .price',
        'product-price[data-product-id="' + pid + '"]'
      );
    }
    if (vid) {
      specificSelectors.push(
        '.price[data-variant-id="' + vid + '"]',
        '[data-variant-id="' + vid + '"] .money',
        '.product-form [data-variant-id="' + vid + '"] .price'
      );
    }

    var broadSelectors = [
      '.product__price',
      '.product-single__price',
      '#ProductPrice',
      '#productPrice',
      '.product .price:not(.price--compare)',
      '.price-item--sale .price-item__sale .money',
      '.price-item--regular .price-item__regular .money',
      '[data-product-price]',
      '.product-price .money',
      'sale-price .money',
      '.price--large',
      'span[data-type="price"]',
    ];

    function mainProductRoot() {
      return (
        document.querySelector('product-info[data-product-id="' + pid + '"]') ||
        document.querySelector('.product-single[data-product-id="' + pid + '"]') ||
        document.querySelector('[data-section-type="product-template"]') ||
        document.querySelector('#MainProduct-template') ||
        document.querySelector('main .product[data-product-id="' + pid + '"]') ||
        document.querySelector('main .product-single') ||
        document.querySelector('.product-template__container')
      );
    }

    function paint() {
      var seen = new WeakSet();
      function paintEl(el) {
        if (!el || seen.has(el) || inCartUi(el)) return;
        seen.add(el);
        // Avoid continuous mutation churn by writing only when value changed.
        if (el.textContent !== currentDisplay) {
          el.textContent = currentDisplay;
        }
        el.setAttribute('data-test-variant', String(variantIdForCart));
        el.setAttribute('data-test-id', String(testId));
        el.setAttribute('data-ripx-price', '1');
      }
      specificSelectors.forEach(function (sel) {
        try {
          document.querySelectorAll(sel).forEach(function (el) {
            var pinfo = el.closest('product-info[data-product-id]');
            if (pinfo && toNumericProductId(pinfo.getAttribute('data-product-id')) !== pid) return;
            var ps = el.closest('.product-single[data-product-id]');
            if (ps && toNumericProductId(ps.getAttribute('data-product-id')) !== pid) return;
            if (
              el.closest &&
              el.closest(
                '.recommended-products,.related-products,[data-section-type="recently-viewed"],[id*="related"]'
              )
            )
              return;
            paintEl(el);
          });
        } catch (e) {}
      });
      var root = mainProductRoot();
      var broadRoot = root || document.querySelector('main') || document.body;
      broadSelectors.forEach(function (sel) {
        try {
          broadRoot.querySelectorAll(sel).forEach(function (el) {
            if (root && !root.contains(el)) return;
            if (!root) {
              var holder = el.closest('[data-product-id]');
              if (
                holder &&
                holder.getAttribute('data-product-id') &&
                toNumericProductId(holder.getAttribute('data-product-id')) !== pid
              )
                return;
              if (
                el.closest &&
                el.closest(
                  '.recommended-products,.related-products,[data-section-type="recently-viewed"]'
                )
              )
                return;
            }
            paintEl(el);
          });
        } catch (e) {}
      });
    }

    paint();

    var root =
      mainProductRoot() ||
      document.querySelector(
        'product-info, [data-section-type="product-template"], main .product'
      ) ||
      document.body;
    try {
      if (root && root !== document.body) root.setAttribute('data-ripx-price-test', String(testId));
    } catch (e) {}
    setTimeout(paint, 400);

    var t = null;
    try {
      var obs = new MutationObserver(function () {
        if (t) clearTimeout(t);
        t = setTimeout(paint, 80);
      });
      obs.observe(root, { childList: true, subtree: true, characterData: false });
    } catch (e) {}

    function recomputeAndPaint() {
      var next = recomputeDisplay();
      if (next) currentDisplay = next;
      if (currentDisplay) paint();
    }
    ['variant:change', 'shopify:section:load', 'product:update'].forEach(function (evt) {
      document.addEventListener(evt, function () {
        setTimeout(recomputeAndPaint, 50);
      });
    });
    var variantInput = document.querySelector(
      'input[name="id"], input[name="variant_id"], [data-variant-picker] input'
    );
    if (variantInput) {
      variantInput.addEventListener('change', function () {
        setTimeout(recomputeAndPaint, 50);
      });
    }

    if (variantIdForCart != null && String(variantIdForCart).trim() !== '') {
      window.__RIPX_PRICE_TEST_CTX__ = { testId: testId, variantId: variantIdForCart };
      injectPriceTestCartAttributes(
        testId,
        variantIdForCart,
        getAssignmentProofFromVariant(variant),
        [productId]
      );
    }
  }

  /**
   * Parse numeric price from displayed string or element (e.g. "$29.99", "€29,99", "1.234,56").
   */
  function parsePriceFromDisplay(val) {
    if (val == null) return null;
    var s = typeof val === 'string' ? val : val.textContent || val.innerText || '';
    if (typeof s !== 'string') return null;
    s = s.trim().replace(/\s/g, '');
    if (!s) return null;
    var lastComma = s.lastIndexOf(',');
    var lastDot = s.lastIndexOf('.');
    var normalized =
      lastComma > lastDot && lastComma >= 0
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
    var num = parseFloat(normalized.replace(/[^0-9.-]/g, ''), 10);
    if (isNaN(num)) return null;
    if (s.indexOf('.') === -1 && s.indexOf(',') === -1 && num >= 100) num = num / 100;
    return num;
  }

  /**
   * All-products fallback painter for amount/percent price tests.
   * Some themes don't include data-product-id on listing cards or cart rows, which breaks per-product matching.
   * For all-products tests with global delta/percent config (no byProduct overrides), we can still compute from
   * the visible catalog number and repaint.
   */
  function canUseAllProductsGlobalFallback(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    if (cfg.byProduct && typeof cfg.byProduct === 'object' && Object.keys(cfg.byProduct).length > 0)
      return false;
    var pm = String(cfg.priceMode || '').toLowerCase();
    return pm === 'amount' || pm === 'percent';
  }

  function computeAllProductsAdjustedPrice(catalog, cfg) {
    if (catalog == null || !isFinite(catalog)) return null;
    var pm = String(cfg.priceMode || '').toLowerCase();
    if (pm === 'amount') {
      var d = parseFloat(cfg.priceDelta, 10);
      if (isNaN(d)) return null;
      return Math.max(0, Math.round((catalog + d) * 100) / 100);
    }
    if (pm === 'percent') {
      var p = parseFloat(cfg.pricePercent, 10);
      if (isNaN(p)) return null;
      return Math.max(0, Math.round(catalog * (1 - p / 100) * 100) / 100);
    }
    return null;
  }

  function paintAllProductsGlobalPrices(testId, variant, scope) {
    if (!variant || !variant.config) return;
    var cfg = variant.config;
    if (!canUseAllProductsGlobalFallback(cfg)) return;
    var pm = String(cfg.priceMode || '').toLowerCase();
    if (pm === 'control') return;

    var cartUi =
      '.cart-drawer,.cart-notification,#CartDrawer,#mini-cart,.mini-cart,[data-cart-drawer],.drawer--cart,aside.mini-cart,cart-drawer,.header__cart,.site-header__cart,predictive-search';
    function inCartUi(el) {
      return el.closest && el.closest(cartUi);
    }
    // Reuse the same selector set as other painters.
    var sel =
      '.price .money, .price, [data-product-price], .money, .price-item--regular, .price-item__regular, .product-price .money, .price-item, [data-price], .line-item__price, [data-line-item-price], .cart-item__price .money, .cart-item__price';
    var roots = [];
    if (scope === 'cart') {
      roots = Array.prototype.slice.call(
        document.querySelectorAll(
          '.cart-drawer, #CartDrawer, .drawer--cart, [data-cart-drawer], #cart-form, form[action*="/cart"], .cart-items, main .cart'
        )
      );
    } else {
      roots = [document.querySelector('main') || document.body];
    }
    var variantIdForCart = variant.variantId != null ? variant.variantId : variant.id;

    roots.forEach(function (root) {
      if (!root) return;
      try {
        root.querySelectorAll(sel).forEach(function (el) {
          if (!el) return;
          if (scope === 'listing' && inCartUi(el)) return;
          var catalog = parsePriceFromDisplay(el);
          if (catalog == null) return;
          var adjusted = computeAllProductsAdjustedPrice(catalog, cfg);
          if (adjusted == null) return;
          var roundToVal = parseRoundTo(cfg.roundTo);
          if (roundToVal > 0) {
            adjusted = Math.round(adjusted / roundToVal) * roundToVal;
            adjusted = Math.max(0, Math.round(adjusted * 100) / 100);
          }
          var display = formatShopPrice(adjusted);
          if (!display) return;
          el.textContent = display;
          if (variantIdForCart != null && String(variantIdForCart).trim() !== '') {
            el.setAttribute('data-test-variant', String(variantIdForCart));
          }
          el.setAttribute('data-test-id', String(testId));
          el.setAttribute('data-ripx-price', '1');
        });
      } catch (e) {}
    });
  }

  /**
   * Apply price test to product cards on collection/homepage/search (non-PDP).
   * Prefers elements with data-product-id / data-variant-id (Intelligems-style tagging) for reliable targeting.
   * Finds [data-product-id] cards matching test targets and paints variant price.
   */
  function applyPriceTestToProductCards(testId, variant, targetIds) {
    if (!variant || !targetIds || !targetIds.length) return;
    if (!variant.config) {
      injectPreviewCartAttributesWhenConfigMissing(testId, variant);
      return;
    }
    var variantIdForCart = variant.variantId != null ? variant.variantId : variant.id;
    if (variantIdForCart != null && String(variantIdForCart).trim() !== '') {
      window.__RIPX_PRICE_TEST_CTX__ = { testId: testId, variantId: variantIdForCart };
      injectPriceTestCartAttributes(
        testId,
        variantIdForCart,
        getAssignmentProofFromVariant(variant),
        targetIds
      );
    }
    var cartUi =
      '.cart-drawer,.cart-notification,#CartDrawer,#mini-cart,.mini-cart,[data-cart-drawer],.drawer--cart,aside.mini-cart,cart-drawer,.header__cart,.site-header__cart,predictive-search';
    function inCartUi(el) {
      return el.closest && el.closest(cartUi);
    }
    targetIds.forEach(function (targetId) {
      if (!targetId) return;
      var pid = toNumericProductId(targetId);
      if (!pid) return;
      var cfg = getEffectivePriceConfig(variant.config, targetId, null);
      var priceMode = cfg && cfg.priceMode ? String(cfg.priceMode).toLowerCase() : 'fixed';
      if (priceMode === 'control') return;
      var priceNum = null;
      if (priceMode === 'fixed') {
        var raw = cfg.price;
        if (raw === null || raw === undefined || raw === '') return;
        priceNum = parseFloat(raw, 10);
      } else if (priceMode === 'amount' || priceMode === 'percent') {
        priceNum = 0;
      }
      if (priceNum == null || isNaN(priceNum) || !isFinite(priceNum)) return;
      priceNum = Math.max(0, Math.round(priceNum * 100) / 100);
      var roundToVal = parseRoundTo(cfg.roundTo);
      if (roundToVal > 0) {
        priceNum = Math.round(priceNum / roundToVal) * roundToVal;
        priceNum = Math.max(0, Math.round(priceNum * 100) / 100);
      }
      var display = formatShopPrice(priceNum);
      if (!display && priceMode === 'fixed') return;
      var allWithProductId = document.querySelectorAll(
        '[data-product-id], .product-card, .grid-product__content, [data-product], .card--product, product-card, .product-card-wrapper, .product-item, .grid__item .card, .collection-list__product'
      );
      allWithProductId.forEach(function (card) {
        if (!card || inCartUi(card)) return;
        var attr =
          card.getAttribute('data-product-id') ||
          (card.querySelector &&
            card.querySelector('[data-product-id]') &&
            card.querySelector('[data-product-id]').getAttribute('data-product-id'));
        if (!attr || toNumericProductId(attr) !== pid) return;
        var cardPriceNum = priceNum;
        var cardDisplay = display || formatShopPrice(0);
        if (priceMode === 'amount' || priceMode === 'percent') {
          var priceEl = card.querySelector(
            '.price .money, .price, [data-product-price], .money, .price-item--regular, .price-item__regular, .product-price, [data-price]'
          );
          if (priceEl) {
            var catalog = parsePriceFromDisplay(priceEl);
            if (catalog != null) {
              if (priceMode === 'amount' && cfg.priceDelta != null) {
                var delta = parseFloat(cfg.priceDelta, 10);
                if (!isNaN(delta)) cardPriceNum = Math.max(0, catalog + delta);
              } else if (priceMode === 'percent' && cfg.pricePercent != null) {
                var pct = parseFloat(cfg.pricePercent, 10);
                if (!isNaN(pct)) cardPriceNum = Math.max(0, catalog * (1 - pct / 100));
              }
              cardPriceNum = Math.round(cardPriceNum * 100) / 100;
              cardDisplay = formatShopPrice(cardPriceNum);
            }
          }
        }
        var priceEls = card.querySelectorAll(
          '.price .money, .price, [data-product-price], .money, .price-item--regular, .price-item__regular, .product-price .money, .price-item, [data-price]'
        );
        priceEls.forEach(function (el) {
          if (!el || inCartUi(el)) return;
          el.textContent = cardDisplay;
          el.setAttribute('data-test-variant', String(variantIdForCart));
          el.setAttribute('data-test-id', String(testId));
          el.setAttribute('data-ripx-price', '1');
        });
      });
    });
  }

  /**
   * Collection-targeted price test on a matching collection (or listing) page: paint every visible product card.
   * Uses each card's product id for getEffectivePriceConfig (byProduct / variant picker).
   */
  function applyPriceTestToCollectionListingCards(testId, variant) {
    if (!variant) return;
    if (!variant.config) {
      injectPreviewCartAttributesWhenConfigMissing(testId, variant);
      return;
    }
    var variantIdForCart = variant.variantId != null ? variant.variantId : variant.id;
    if (variantIdForCart != null && String(variantIdForCart).trim() !== '') {
      window.__RIPX_PRICE_TEST_CTX__ = { testId: testId, variantId: variantIdForCart };
      injectPriceTestCartAttributes(
        testId,
        variantIdForCart,
        getAssignmentProofFromVariant(variant)
      );
    }
    var cartUi =
      '.cart-drawer,.cart-notification,#CartDrawer,#mini-cart,.mini-cart,[data-cart-drawer],.drawer--cart,aside.mini-cart,cart-drawer,.header__cart,.site-header__cart,predictive-search';
    function inCartUi(el) {
      return el.closest && el.closest(cartUi);
    }
    var allWithProductId = document.querySelectorAll(
      '[data-product-id], .product-card, .grid-product__content, [data-product], .card--product, product-card, .product-card-wrapper, .product-item, .grid__item .card, .collection-list__product'
    );
    allWithProductId.forEach(function (card) {
      if (!card || inCartUi(card)) return;
      var attr =
        card.getAttribute('data-product-id') ||
        (card.querySelector &&
          card.querySelector('[data-product-id]') &&
          card.querySelector('[data-product-id]').getAttribute('data-product-id'));
      if (!attr) return;
      var pid = toNumericProductId(attr);
      if (!pid) return;
      var targetId = toProductGid(attr) || attr;
      var cfg = getEffectivePriceConfig(variant.config, targetId, null);
      var priceMode = cfg && cfg.priceMode ? String(cfg.priceMode).toLowerCase() : 'fixed';
      if (priceMode === 'control') return;
      var priceNum = null;
      if (priceMode === 'fixed') {
        var raw = cfg.price;
        if (raw === null || raw === undefined || raw === '') return;
        priceNum = parseFloat(raw, 10);
      } else if (priceMode === 'amount' || priceMode === 'percent') {
        priceNum = 0;
      }
      if (priceNum == null || isNaN(priceNum) || !isFinite(priceNum)) return;
      priceNum = Math.max(0, Math.round(priceNum * 100) / 100);
      var roundToVal = parseRoundTo(cfg.roundTo);
      if (roundToVal > 0) {
        priceNum = Math.round(priceNum / roundToVal) * roundToVal;
        priceNum = Math.max(0, Math.round(priceNum * 100) / 100);
      }
      var display = formatShopPrice(priceNum);
      if (!display && priceMode === 'fixed') return;
      var cardPriceNum = priceNum;
      var cardDisplay = display || formatShopPrice(0);
      if (priceMode === 'amount' || priceMode === 'percent') {
        var priceEl = card.querySelector(
          '.price .money, .price, [data-product-price], .money, .price-item--regular, .price-item__regular, .product-price, [data-price]'
        );
        if (priceEl) {
          var catalog = parsePriceFromDisplay(priceEl);
          if (catalog != null) {
            if (priceMode === 'amount' && cfg.priceDelta != null) {
              var delta = parseFloat(cfg.priceDelta, 10);
              if (!isNaN(delta)) cardPriceNum = Math.max(0, catalog + delta);
            } else if (priceMode === 'percent' && cfg.pricePercent != null) {
              var pct = parseFloat(cfg.pricePercent, 10);
              if (!isNaN(pct)) cardPriceNum = Math.max(0, catalog * (1 - pct / 100));
            }
            cardPriceNum = Math.round(cardPriceNum * 100) / 100;
            cardDisplay = formatShopPrice(cardPriceNum);
          }
        }
      }
      var priceEls = card.querySelectorAll(
        '.price .money, .price, [data-product-price], .money, .price-item--regular, .price-item__regular, .product-price .money, .price-item, [data-price]'
      );
      priceEls.forEach(function (el) {
        if (!el || inCartUi(el)) return;
        el.textContent = cardDisplay;
        el.setAttribute('data-test-variant', String(variantIdForCart));
        el.setAttribute('data-test-id', String(testId));
        el.setAttribute('data-ripx-price', '1');
      });
    });

    // If the theme lacks data-product-id entirely, try a safe all-products fallback for amount/percent.
    // (fixed mode cannot be inferred without knowing which product it belongs to).
    paintAllProductsGlobalPrices(testId, variant, 'listing');
  }

  /**
   * Apply price test to cart line items (drawer, cart page). Display only; checkout uses catalog unless Discount Function.
   * Matches rows by data-product-id (and product id in selector) or by data-variant-id when present (best effort for themes without product id on line).
   */
  function applyPriceTestToCart(testId, variant, targetIds) {
    if (!variant || !targetIds || !targetIds.length) return;
    if (!variant.config) {
      injectPreviewCartAttributesWhenConfigMissing(testId, variant);
      return;
    }
    var variantIdForCart = variant.variantId != null ? variant.variantId : variant.id;
    var cartContainers =
      '.cart-drawer, #CartDrawer, .drawer--cart, [data-cart-drawer], #cart-form, form[action*="/cart"], .cart-items, main .cart';
    var containers = document.querySelectorAll(cartContainers);
    if (!containers.length) return;
    var cartPriceSelectors =
      '.price .money, .price, .line-item__price, [data-line-item-price], .cart-item__price .money, .cart-item__price, .line-item-price, [data-price], .money';
    function paintCartRow(row, rowDisplay, skipIfPainted) {
      var priceEls = row.querySelectorAll(cartPriceSelectors);
      if (skipIfPainted && priceEls.length) {
        var first = priceEls[0];
        if (first && first.getAttribute('data-ripx-price') === '1') return;
      }
      priceEls.forEach(function (el) {
        el.textContent = rowDisplay;
        el.setAttribute('data-test-variant', String(variantIdForCart));
        el.setAttribute('data-test-id', String(testId));
        el.setAttribute('data-ripx-price', '1');
      });
    }
    targetIds.forEach(function (targetId) {
      if (!targetId) return;
      var pid = toNumericProductId(targetId);
      if (!pid) return;
      var cfg = getEffectivePriceConfig(variant.config, targetId, null);
      var priceMode = cfg && cfg.priceMode ? String(cfg.priceMode).toLowerCase() : 'fixed';
      if (priceMode === 'control') return;
      var priceNum = null;
      if (priceMode === 'fixed') {
        var raw = cfg.price;
        if (raw === null || raw === undefined || raw === '') return;
        priceNum = parseFloat(raw, 10);
      } else if (priceMode === 'amount' || priceMode === 'percent') {
        priceNum = 0;
      }
      if (priceNum == null || isNaN(priceNum) || !isFinite(priceNum)) return;
      priceNum = Math.max(0, Math.round(priceNum * 100) / 100);
      var display = formatShopPrice(priceNum);
      if (!display && priceMode === 'fixed') return;
      containers.forEach(function (container) {
        var rows = container.querySelectorAll(
          '[data-product-id="' +
            pid +
            '"], [data-product-id*="' +
            pid +
            '"], [data-line-item-key], .cart-item, [data-cart-item]'
        );
        rows.forEach(function (row) {
          var linePid =
            row.getAttribute('data-product-id') ||
            (row.querySelector('[data-product-id]') &&
              row.querySelector('[data-product-id]').getAttribute('data-product-id'));
          if (!linePid || toNumericProductId(linePid) !== pid) return;
          var rowDisplay = display || formatShopPrice(0);
          var priceEls = row.querySelectorAll(cartPriceSelectors);
          if (priceMode !== 'fixed' && priceEls.length) {
            var catalog = parsePriceFromDisplay(priceEls[0]);
            if (catalog != null && cfg) {
              var rowPrice = priceNum;
              if (priceMode === 'amount' && cfg.priceDelta != null) {
                var delta = parseFloat(cfg.priceDelta, 10);
                if (!isNaN(delta)) rowPrice = Math.max(0, catalog + delta);
              } else if (priceMode === 'percent' && cfg.pricePercent != null) {
                var pct = parseFloat(cfg.pricePercent, 10);
                if (!isNaN(pct)) rowPrice = Math.max(0, catalog * (1 - pct / 100));
              }
              rowDisplay = formatShopPrice(Math.round(rowPrice * 100) / 100);
            }
          }
          paintCartRow(row, rowDisplay, false);
        });
      });
    });
    if (variantIdForCart != null && String(variantIdForCart).trim() !== '') {
      var firstTargetId = targetIds[0];
      if (firstTargetId) {
        var cfg = getEffectivePriceConfig(variant.config, firstTargetId, null);
        var priceMode = cfg && cfg.priceMode ? String(cfg.priceMode).toLowerCase() : 'fixed';
        if (priceMode !== 'control') {
          var priceNum = null;
          if (priceMode === 'fixed' && cfg.price != null) {
            priceNum = parseFloat(cfg.price, 10);
          } else if (priceMode === 'amount' || priceMode === 'percent') {
            priceNum = 0;
          }
          if (priceNum != null && !isNaN(priceNum) && isFinite(priceNum)) {
            priceNum = Math.max(0, Math.round(priceNum * 100) / 100);
            var displayByVariant = formatShopPrice(priceNum);
            var escapedVid =
              typeof CSS !== 'undefined' && CSS.escape
                ? CSS.escape(String(variantIdForCart))
                : String(variantIdForCart).replace(/"|\\/g, '\\$&');
            containers.forEach(function (container) {
              var variantRows = container.querySelectorAll(
                '[data-variant-id="' + escapedVid + '"]'
              );
              variantRows.forEach(function (row) {
                var linePid =
                  row.getAttribute('data-product-id') ||
                  (row.querySelector('[data-product-id]') &&
                    row.querySelector('[data-product-id]').getAttribute('data-product-id'));
                var linePidNum = linePid ? toNumericProductId(linePid) : '';
                if (
                  linePidNum &&
                  !targetIds.some(function (id) {
                    return id && toNumericProductId(id) === linePidNum;
                  })
                )
                  return;
                var rowDisplay = displayByVariant;
                if (priceMode === 'amount' || priceMode === 'percent') {
                  var priceEls = row.querySelectorAll(cartPriceSelectors);
                  if (priceEls.length) {
                    var catalog = parsePriceFromDisplay(priceEls[0]);
                    if (catalog != null && cfg) {
                      var rowPrice = catalog;
                      if (priceMode === 'amount' && cfg.priceDelta != null) {
                        var d = parseFloat(cfg.priceDelta, 10);
                        if (!isNaN(d)) rowPrice = Math.max(0, catalog + d);
                      } else if (priceMode === 'percent' && cfg.pricePercent != null) {
                        var p = parseFloat(cfg.pricePercent, 10);
                        if (!isNaN(p)) rowPrice = Math.max(0, catalog * (1 - p / 100));
                      }
                      rowDisplay = formatShopPrice(Math.round(rowPrice * 100) / 100);
                    }
                  }
                }
                paintCartRow(row, rowDisplay, true);
              });
            });
          }
        }
      }
    }
  }

  function applyPriceTestToCartAllProductsFallback(testId, variant) {
    if (!variant) return;
    if (!variant.config) {
      injectPreviewCartAttributesWhenConfigMissing(testId, variant);
      return;
    }
    // Ensure line props exist for checkout, even if we can't match rows by product id.
    var variantIdForCart = variant.variantId != null ? variant.variantId : variant.id;
    if (variantIdForCart != null && String(variantIdForCart).trim() !== '') {
      window.__RIPX_PRICE_TEST_CTX__ = { testId: testId, variantId: variantIdForCart };
      injectPriceTestCartAttributes(
        testId,
        variantIdForCart,
        getAssignmentProofFromVariant(variant),
        null
      );
    }
    paintAllProductsGlobalPrices(testId, variant, 'cart');
  }

  function parseCombinedCode(code) {
    if (!code) {
      return { css: '', js: '' };
    }
    const cssMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const jsMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!cssMatch && !jsMatch) {
      return { css: '', js: code.trim() };
    }
    return {
      css: cssMatch ? cssMatch[1].trim() : '',
      js: jsMatch ? jsMatch[1].trim() : '',
    };
  }

  function applyCustomCode(testId, variant) {
    const marker = `ab-test-${testId}`;
    const customCss = variant?.config?.customCss;
    const customJs = variant?.config?.customJs;
    const combinedCode = variant?.config?.code || variant?.code;
    const parsed = combinedCode ? parseCombinedCode(combinedCode) : { css: '', js: '' };

    const cssToApply =
      typeof customCss === 'string' && customCss.trim() ? customCss.trim() : parsed.css || '';
    const jsToApply =
      typeof customJs === 'string' && customJs.trim() ? customJs.trim() : parsed.js || '';

    if (!cssToApply && !jsToApply) {
      return;
    }

    if (cssToApply) {
      const existingStyle = document.querySelector(`style[data-ab-test="${marker}"]`);
      if (existingStyle) {
        existingStyle.remove();
      }
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-ab-test', marker);
      styleEl.textContent = cssToApply;
      document.head.appendChild(styleEl);
    }

    if (jsToApply) {
      const existingScript = document.querySelector(`script[data-ab-test="${marker}"]`);
      if (existingScript) {
        existingScript.remove();
      }
      const scriptEl = document.createElement('script');
      scriptEl.setAttribute('data-ab-test', marker);
      scriptEl.textContent = jsToApply;
      (document.head || document.documentElement || document.body).appendChild(scriptEl);
    }
  }

  /** Position values from visual editor map to insertAdjacentElement. */
  var VISUAL_RULE_POSITION_MAP = {
    after: 'afterend',
    before: 'beforebegin',
    afterbegin: 'afterbegin',
    beforeend: 'beforeend',
  };

  /**
   * Apply visual editor rules (selector + css/js + position) in preview/visual editor mode.
   * Injects style/script nodes relative to the first element matching each rule's selector.
   */
  function applyVisualEditorRules(testId, variant) {
    var rules = variant?.config?.visual_editor_rules;
    if (!Array.isArray(rules) || rules.length === 0) return;
    var markerPrefix = 'ab-test-ve-' + String(testId || 'preview') + '-';
    document.querySelectorAll('[data-ab-test-ve]').forEach(function (node) {
      var val = node.getAttribute('data-ab-test-ve');
      if (val && val.indexOf(markerPrefix) === 0) node.remove();
    });
    rules.forEach(function (rule, index) {
      if (!rule || typeof rule !== 'object') return;
      var selector = typeof rule.selector === 'string' ? rule.selector.trim() : '';
      if (!selector) return;
      var css = typeof rule.css === 'string' ? rule.css.trim() : '';
      var js = typeof rule.js === 'string' ? rule.js.trim() : '';
      if (!css && !js) return;
      var position = VISUAL_RULE_POSITION_MAP[rule.position] || 'afterend';
      var el;
      try {
        el = document.querySelector(selector);
      } catch (e) {
        return;
      }
      if (!el || !el.insertAdjacentElement) return;
      var marker = markerPrefix + index;
      if (js) {
        var scriptEl = document.createElement('script');
        scriptEl.setAttribute('data-ab-test-ve', marker);
        scriptEl.textContent = js;
        el.insertAdjacentElement(position, scriptEl);
      }
      if (css) {
        var styleEl = document.createElement('style');
        styleEl.setAttribute('data-ab-test-ve', marker);
        styleEl.textContent = css;
        el.insertAdjacentElement(position, styleEl);
      }
    });
  }

  /**
   * Build a short, unique CSS selector for an element (for visual editor picker).
   * Prefers: id, then data-* (e.g. data-product-id, data-variant-id for Shopify), then tag.class, then path.
   * Skips non-element nodes (e.g. document, text nodes) and ensures tagName is safe for selectors.
   */
  function getSelectorForElement(el) {
    if (!el || typeof el.tagName !== 'string') return '';
    if (el.nodeType !== 1) return ''; /* ELEMENT_NODE */
    var tag = el.tagName.toLowerCase();
    if (!tag) return '';

    if (
      el.id &&
      typeof el.id === 'string' &&
      /^[a-zA-Z][\w-]*$/.test(el.id) &&
      !/^\d+$/.test(el.id)
    ) {
      try {
        if (document.querySelector('#' + CSS.escape(el.id)) === el) {
          return '#' + CSS.escape(el.id);
        }
      } catch (e) {}
    }

    var dataAttrs = [
      'data-product-id',
      'data-variant-id',
      'data-section-id',
      'data-block-id',
      'data-id',
    ];
    for (var d = 0; d < dataAttrs.length; d++) {
      var val = el.getAttribute(dataAttrs[d]);
      if (val != null && String(val).trim()) {
        try {
          var escaped = String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          var dataSel = '[' + dataAttrs[d] + '="' + escaped + '"]';
          if (document.querySelector(tag + dataSel) === el) return tag + dataSel;
          if (document.querySelector(dataSel) === el) return dataSel;
        } catch (e) {}
      }
    }
    if (el.attributes) {
      for (var a = 0; a < el.attributes.length; a++) {
        var attr = el.attributes[a];
        if (
          attr.name &&
          attr.name.indexOf('data-') === 0 &&
          attr.value &&
          !/^(data-ember|data-react|data-v-)/i.test(attr.name)
        ) {
          try {
            var escapedA = String(attr.value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            var ds = '[' + attr.name + '="' + escapedA + '"]';
            if (document.querySelector(tag + ds) === el) return tag + ds;
            if (document.querySelector(ds) === el) return ds;
          } catch (e) {}
        }
      }
    }

    var classes =
      el.className && typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(Boolean)
        : [];
    for (var c = 0; c < classes.length; c++) {
      var cls = classes[c];
      if (/^[a-zA-Z_][\w-]*$/.test(cls) && !/^(ng-|ember|react|data-|js-)/i.test(cls)) {
        try {
          var sel = tag + '.' + CSS.escape(cls);
          if (document.querySelector(sel) === el) return sel;
        } catch (e) {}
      }
    }

    var path = [];
    var current = el;
    while (current && current !== document.body) {
      var part = current.tagName.toLowerCase();
      var parent = current.parentElement;
      if (parent) {
        var siblings = parent.children;
        for (var i = 0; i < siblings.length; i++) {
          if (siblings[i] === current) {
            part += ':nth-child(' + (i + 1) + ')';
            break;
          }
        }
      }
      path.unshift(part);
      current = parent;
    }
    return path.length ? path.join(' > ') : tag;
  }

  /**
   * Visual editor element picker: overlay, highlight hovered element, on click send selector to opener or copy.
   * Only run when embedded (defensive).
   */
  function initVisualPicker() {
    if (typeof window.parent !== 'undefined' && window.self === window.top) return;
    if (!document.body) {
      setTimeout(initVisualPicker, 50);
      return;
    }
    var overlay = document.createElement('div');
    overlay.id = 'ripx-visual-picker-overlay';
    overlay.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;');
    var box = document.createElement('div');
    box.id = 'ripx-visual-picker-highlight';
    box.setAttribute(
      'style',
      'position:fixed;border:2px solid #06b6d4;background:rgba(6,182,212,0.15);pointer-events:none;' +
        'border-radius:4px;box-sizing:border-box;transition:top 0.05s,left 0.05s,width 0.05s,height 0.05s;'
    );
    var bar = document.createElement('div');
    bar.id = 'ripx-visual-picker-bar';
    bar.setAttribute(
      'style',
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:auto;' +
        'background:#1a1a1a;color:#fff;padding:10px 16px;font-family:system-ui,sans-serif;' +
        'font-size:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);'
    );
    var label = document.createElement('span');
    label.id = 'ripx-visual-picker-label';
    label.textContent =
      'Click an element to select it. Selector will be sent to the editor or copy below.';
    label.setAttribute('style', 'flex:1;min-width:120px;');
    var selectorInput = document.createElement('input');
    selectorInput.type = 'text';
    selectorInput.readOnly = true;
    selectorInput.placeholder = 'Selector will appear here after click';
    selectorInput.setAttribute(
      'style',
      'flex:1;min-width:160px;max-width:320px;padding:6px 10px;border:1px solid #444;border-radius:4px;' +
        'background:#2a2a2a;color:#e5e5e5;font-family:monospace;font-size:12px;'
    );
    var copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy selector';
    copyBtn.setAttribute(
      'style',
      'background:#06b6d4;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:13px;'
    );
    copyBtn.onclick = function () {
      var val = selectorInput.value.trim();
      if (!val) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(val).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () {
              copyBtn.textContent = 'Copy selector';
            }, 2000);
          });
        }
      } catch (e) {}
    };
    var sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send to RipX';
    sendBtn.setAttribute(
      'style',
      'background:#059669;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:600;'
    );
    sendBtn.onclick = function () {
      var val = selectorInput.value.trim();
      if (!val) return;
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            { type: 'ripx-visual-selector', selector: val, source: 'ripx-picker' },
            '*'
          );
          sendBtn.textContent = 'Sent!';
          setTimeout(function () {
            sendBtn.textContent = 'Send to RipX';
          }, 2000);
        } else {
          sendBtn.textContent = 'Open from editor tab';
          setTimeout(function () {
            sendBtn.textContent = 'Send to RipX';
          }, 2500);
        }
      } catch (e) {}
    };
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.setAttribute(
      'style',
      'background:#444;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:13px;'
    );
    closeBtn.onclick = function () {
      if (window.opener && !window.opener.closed)
        try {
          window.close();
        } catch (e) {}
    };
    bar.appendChild(label);
    bar.appendChild(selectorInput);
    bar.appendChild(copyBtn);
    bar.appendChild(sendBtn);
    bar.appendChild(closeBtn);
    document.body.appendChild(overlay);
    document.body.appendChild(box);
    document.body.appendChild(bar);

    var barHeight = bar.offsetHeight;

    function setHighlight(rect) {
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        box.style.display = 'none';
        return;
      }
      box.style.display = 'block';
      box.style.top = rect.top + barHeight + 'px';
      box.style.left = rect.left + 'px';
      box.style.width = rect.width + 'px';
      box.style.height = rect.height + 'px';
    }

    function onSelectorChosen(selector) {
      selectorInput.value = selector;
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: 'ripx-visual-selector',
              selector: selector,
              source: 'ripx-picker',
            },
            '*'
          );
          label.textContent = 'Selector sent to editor! You can close this tab or copy below.';
          label.setAttribute('style', 'flex:1;min-width:120px;color:#34d399;');
        } else {
          label.textContent = 'Copy the selector below and paste it in the editor.';
          label.setAttribute('style', 'flex:1;min-width:120px;color:#fbbf24;');
        }
      } catch (e) {
        label.textContent = 'Copy the selector below and paste it in the editor.';
        label.setAttribute('style', 'flex:1;min-width:120px;color:#fbbf24;');
      }
    }

    document.addEventListener(
      'mousemove',
      function (e) {
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === overlay || el === box || el === bar || bar.contains(el)) {
          setHighlight(null);
          if (!selectorInput.value) {
            label.textContent =
              'Click an element to select it. Selector will be sent to the editor or copy below.';
            label.setAttribute('style', 'flex:1;min-width:120px;');
          }
          return;
        }
        var rect = el.getBoundingClientRect();
        setHighlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        var sel = getSelectorForElement(el);
        label.textContent = sel
          ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' \u2192 ' + sel
          : el.tagName.toLowerCase();
        label.setAttribute('style', 'flex:1;min-width:120px;');
      },
      { passive: true }
    );

    document.addEventListener(
      'click',
      function (e) {
        if (bar.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === overlay || el === box || el === bar) return;
        var selector = getSelectorForElement(el);
        if (selector) onSelectorChosen(selector);
      },
      true
    );
  }

  /**
   * Visual editor: in iframe. Prevent navigation, click-to-select, send selector to parent.
   * Only run when embedded (defensive: never run on live site).
   */
  var visualEditorEmbedInitialized = false;
  function initVisualEditorEmbed() {
    if (typeof window.parent !== 'undefined' && window.self === window.top) return;
    if (visualEditorEmbedInitialized) return;
    if (!document.body) {
      setTimeout(initVisualEditorEmbed, 25);
      return;
    }
    visualEditorEmbedInitialized = true;
    var targetWindow = window.parent;
    if (!targetWindow) return;

    var overlay = document.createElement('div');
    overlay.id = 'ripx-visual-editor-overlay';
    overlay.setAttribute('style', 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;');
    var box = document.createElement('div');
    box.id = 'ripx-visual-editor-highlight';
    box.setAttribute(
      'style',
      'position:fixed;border:2px solid #06b6d4;background:rgba(6,182,212,0.2);pointer-events:none;' +
        'border-radius:4px;box-sizing:border-box;transition:top 0.05s,left 0.05s,width 0.05s,height 0.05s;'
    );
    var hint = document.createElement('div');
    hint.setAttribute(
      'style',
      'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
        'padding:8px 14px;background:#1a1a1a;color:#fff;font-size:13px;border-radius:6px;' +
        'box-shadow:0 2px 8px rgba(0,0,0,0.3);pointer-events:none;'
    );
    hint.textContent = 'Click an element to select — selector will appear in the panel';
    document.body.appendChild(overlay);
    document.body.appendChild(box);
    document.body.appendChild(hint);

    function setHighlight(rect) {
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        box.style.display = 'none';
        return;
      }
      box.style.display = 'block';
      box.style.top = rect.top + 'px';
      box.style.left = rect.left + 'px';
      box.style.width = rect.width + 'px';
      box.style.height = rect.height + 'px';
    }

    function getTargetUnderCursor(clientX, clientY) {
      var list = document.elementsFromPoint ? document.elementsFromPoint(clientX, clientY) : [];
      for (var i = 0; i < list.length; i++) {
        var node = list[i];
        if (node && node !== overlay && node !== box && !(hint && hint.contains(node))) return node;
      }
      var fallback = document.elementFromPoint(clientX, clientY);
      if (
        fallback &&
        fallback !== overlay &&
        fallback !== box &&
        !(hint && hint.contains(fallback))
      )
        return fallback;
      return null;
    }

    var lastClientX = -1;
    var lastClientY = -1;
    var rafScheduled = false;
    function updateHighlightAtCursor() {
      var el = getTargetUnderCursor(lastClientX, lastClientY);
      if (!el) {
        setHighlight(null);
        return;
      }
      var rect = el.getBoundingClientRect();
      setHighlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    }

    document.addEventListener(
      'mousemove',
      function (e) {
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        if (!rafScheduled) {
          rafScheduled = true;
          requestAnimationFrame(function () {
            rafScheduled = false;
            updateHighlightAtCursor();
          });
        }
      },
      { passive: true }
    );

    function onScrollOrResize() {
      if (lastClientX >= 0 && lastClientY >= 0) updateHighlightAtCursor();
    }
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    function handleSelectClick(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      var el = getTargetUnderCursor(e.clientX, e.clientY);
      if (!el) return;
      var selector = '';
      try {
        selector = getSelectorForElement(el) || '';
      } catch (err) {}
      if (selector && targetWindow && !targetWindow.closed) {
        try {
          targetWindow.postMessage(
            { type: 'ripx-visual-selector', selector: selector, source: 'ripx-visual-editor' },
            '*'
          );
        } catch (err) {}
      }
    }

    document.addEventListener('mousedown', handleSelectClick, true);
  }

  /**
   * Track checkout completion
   */
  function trackCheckout() {
    // This would be called on the order confirmation page
    if (window.Shopify?.checkout) {
      const orderId = window.Shopify.checkout.order_id;
      const totalPrice = window.Shopify.checkout.total_price;

      // Get all active test variants from the page
      const testVariants = document.querySelectorAll('[data-test-variant]');

      testVariants.forEach(element => {
        const testId = element.getAttribute('data-test-id');
        const variantId = element.getAttribute('data-test-variant');

        if (testId && variantId) {
          trackConversion(testId, variantId, parseFloat(totalPrice) / 100, {
            order_id: orderId,
          });
        }
      });
    }
  }

  /**
   * Cookie helpers
   */
  function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = 'expires=' + date.toUTCString();
    document.cookie = name + '=' + value + ';' + expires + ';path=/';
  }

  function getCookie(name) {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  /** @deprecated use formatShopPrice */
  function formatPrice(price) {
    return formatShopPrice(price);
  }

  /**
   * Normalize a numeric or GID to full Shopify Product GID
   */
  function toProductGid(id) {
    if (!id) return null;
    var s = String(id).trim();
    if (s.indexOf('gid://shopify/Product/') === 0) return s;
    var num = s.replace(/\D/g, '');
    return num ? 'gid://shopify/Product/' + num : null;
  }

  /**
   * Normalize a numeric or GID to full Shopify Collection GID
   */
  function toCollectionGid(id) {
    if (!id) return null;
    var s = String(id).trim();
    if (s.indexOf('gid://shopify/Collection/') === 0) return s;
    var num = s.replace(/\D/g, '');
    return num ? 'gid://shopify/Collection/' + num : null;
  }

  /**
   * Get current product ID on PDP (Shopify meta, data attributes, or theme JSON script). Returns GID or null.
   */
  function getCurrentProductId() {
    if (window.ShopifyAnalytics?.meta?.product?.id) {
      return toProductGid(window.ShopifyAnalytics.meta.product.id);
    }
    if (window.Shopify?.meta?.product?.id) {
      return toProductGid(window.Shopify.meta.product.id);
    }
    // Prefer PDP roots before any global [data-product-id] (cards/recommendations often render first).
    var primary =
      document.querySelector('product-info[data-product-id]') ||
      document.querySelector('.product-single[data-product-id]') ||
      document.querySelector('main [data-product-id][data-product]') ||
      document.querySelector('main .product[data-product-id]') ||
      document.querySelector('main [data-product-id]');
    if (primary) {
      var primaryId = primary.getAttribute('data-product-id');
      if (primaryId) return toProductGid(primaryId);
    }
    // Theme fallback: many themes put product JSON in a script tag (e.g. #ProductJson, [data-product-json])
    var script = document.querySelector(
      '#ProductJson, script[type="application/json"][data-product-json], script[data-section-type="product-template"], script[data-section-type="product"]'
    );
    if (script && script.textContent) {
      try {
        var data = JSON.parse(script.textContent);
        var id = data.id || data.product_id || (data.product && data.product.id);
        if (id) return toProductGid(id);
      } catch (e) {}
    }
    var el = document.querySelector('[data-product-id]');
    if (el) {
      var id = el.getAttribute('data-product-id');
      if (id) return toProductGid(id);
    }
    return null;
  }

  /**
   * Get current collection ID on collection page (Shopify meta, data attributes, or theme JSON script). Returns GID or null.
   * Works when ShopifyAnalytics/Shopify.meta are not yet set (e.g. local dev, theme dev, or async script order).
   */
  function getCurrentCollectionId() {
    if (window.ShopifyAnalytics?.meta?.collection?.id) {
      return toCollectionGid(window.ShopifyAnalytics.meta.collection.id);
    }
    if (window.Shopify?.meta?.collection?.id) {
      return toCollectionGid(window.Shopify.meta.collection.id);
    }
    var el = document.querySelector(
      '[data-collection-id], body[data-collection-id], html[data-collection-id]'
    );
    if (el) {
      var id = el.getAttribute('data-collection-id');
      if (id) return toCollectionGid(id);
    }
    // Meta tag fallback (some themes set this)
    var meta = document.querySelector('meta[name="collection-id"], meta[property="collection:id"]');
    if (meta && meta.content) {
      var id = meta.getAttribute('content');
      if (id) return toCollectionGid(id);
    }
    // Theme fallback: many themes put collection JSON in a script tag (e.g. #CollectionJson, Dawn-style)
    var script = document.querySelector(
      '#CollectionJson, script[type="application/json"][data-collection-json], script[data-section-type="collection"]'
    );
    if (script && script.textContent) {
      try {
        var data = JSON.parse(script.textContent);
        var id = data.id || data.collection_id || (data.collection && data.collection.id);
        if (id) return toCollectionGid(id);
      } catch (e) {}
    }
    // JSON-LD fallback: some themes output Collection in structured data
    var jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < jsonLd.length; i++) {
      try {
        var ld = JSON.parse(jsonLd[i].textContent);
        var item = Array.isArray(ld) ? ld[0] : ld;
        if (item && (item['@type'] === 'CollectionPage' || item['@type'] === 'ItemList')) {
          var url = item.url || (item.mainEntity && item.mainEntity.url);
          if (url && url.indexOf('/collections/') !== -1) {
            var num = url.replace(/.*\/collections\/[^/]*\/?(\d+).*/, '$1').replace(/\D/g, '');
            if (num) return toCollectionGid(num);
          }
        }
      } catch (e) {}
    }
    return null;
  }

  /**
   * Get current product or collection ID for backward compatibility (product first).
   */
  function getCurrentTargetId() {
    return getCurrentProductId() || getCurrentCollectionId();
  }

  /**
   * Check if two GIDs refer to the same resource (handles trailing slashes, numeric suffix, and full GID)
   */
  function gidMatches(a, b) {
    if (!a || !b) return false;
    var sa = String(a).trim();
    var sb = String(b).trim();
    if (sa === sb) return true;
    if (sa.indexOf(sb) === 0 && (sa.length === sb.length || sa.charAt(sb.length) === '/'))
      return true;
    if (sb.indexOf(sa) === 0 && (sb.length === sa.length || sb.charAt(sa.length) === '/'))
      return true;
    var trailA = sa.replace(/.*\/(\d+)\/?$/, '$1') || sa;
    var trailB = sb.replace(/.*\/(\d+)\/?$/, '$1') || sb;
    if (trailA === trailB && trailA !== '') {
      var typeA =
        sa.indexOf('/Product/') !== -1
          ? 'Product'
          : sa.indexOf('/Collection/') !== -1
            ? 'Collection'
            : '';
      var typeB =
        sb.indexOf('/Product/') !== -1
          ? 'Product'
          : sb.indexOf('/Collection/') !== -1
            ? 'Collection'
            : '';
      if (typeA === typeB && typeA !== '') return true;
    }
    return false;
  }

  /**
   * URLs where product cards may appear (collection, home, search, CMS pages with grids).
   * Path-based so we still run price listing when meta product id is missing or wrong.
   */
  function isProductListingSurface() {
    var p = (window.location.pathname || '').trim() || '/';
    if (p === '/' || p === '') return true;
    if (p.indexOf('/collections/') === 0) return true;
    if (p.indexOf('/search') === 0) return true;
    if (p.indexOf('/pages/') === 0) return true;
    return false;
  }

  function isCartSurface() {
    var p = (window.location.pathname || '').trim().toLowerCase();
    return p === '/cart' || p.indexOf('/cart/') === 0;
  }

  function getCartVisibleProductTargetIds() {
    var seen = {};
    var out = [];
    var nodes = document.querySelectorAll(
      '.cart-item [data-product-id], [data-cart-item] [data-product-id], [data-line-item-key] [data-product-id], [data-product-id]'
    );
    nodes.forEach(function (el) {
      var raw = el && el.getAttribute ? el.getAttribute('data-product-id') : '';
      var pid = toNumericProductId(raw);
      if (!pid || seen[pid]) return;
      seen[pid] = true;
      out.push(toProductGid(raw) || 'gid://shopify/Product/' + pid);
    });
    return out;
  }

  /**
   * Product-targeted price test: may show test prices on listing surfaces even when matchesTarget is false (no PDP product id).
   */
  function shouldRunPriceTestOnListingSurface(test) {
    if (!testTypeIsPrice(test)) return false;
    var tt = getNormalizedTargetType(test);
    if (!isProductScopeTargetType(tt)) return false;
    if (tt === 'all-products' || tt === 'all_products') return isProductListingSurface();
    var tids =
      test.targetIds || (test.targetId || test.target_id ? [test.targetId || test.target_id] : []);
    if (!tids || !tids.length) return false;
    return isProductListingSurface();
  }

  function isProductScopeTargetType(targetType) {
    var tt = String(targetType || '').toLowerCase();
    return tt === 'product' || tt === 'all-products' || tt === 'all_products';
  }

  /**
   * Check if current page matches test target (single or multiple); supports product and collection.
   */
  function matchesTarget(test) {
    var ids =
      test.targetIds || (test.targetId || test.target_id ? [test.targetId || test.target_id] : []);
    if (!ids.length) return true;

    var targetType = getNormalizedTargetType(test);
    var current = null;
    if (isProductScopeTargetType(targetType)) {
      current = getCurrentProductId();
    } else if (targetType === 'collection') {
      current = getCurrentCollectionId();
    } else {
      current = getCurrentTargetId();
    }
    if (!current) return false;
    return ids.some(function (id) {
      return id && gidMatches(id, current);
    });
  }

  /**
   * Collection GIDs linked to the current PDP product (theme Product JSON / meta). Empty if unknown.
   */
  function getCollectionGidsLinkedToCurrentProduct() {
    var out = [];
    function pushUnique(g) {
      if (!g) return;
      var i = 0;
      for (; i < out.length; i++) {
        if (gidMatches(out[i], g)) return;
      }
      out.push(g);
    }
    try {
      var script = document.querySelector(
        '#ProductJson, script[type="application/json"][data-product-json], script[data-section-type="product"]'
      );
      if (script && script.textContent) {
        var data = JSON.parse(script.textContent);
        var cols = data.collections || (data.product && data.product.collections);
        if (Array.isArray(cols)) {
          cols.forEach(function (c) {
            if (c == null) return;
            if (typeof c === 'number' || typeof c === 'string') pushUnique(toCollectionGid(c));
            else if (typeof c === 'object' && c.id != null) pushUnique(toCollectionGid(c.id));
          });
        }
      }
    } catch (e) {}
    try {
      var p =
        window.ShopifyAnalytics &&
        window.ShopifyAnalytics.meta &&
        window.ShopifyAnalytics.meta.product;
      if (p && p.collectionId) pushUnique(toCollectionGid(p.collectionId));
    } catch (e2) {}
    return out;
  }

  /**
   * True if current product (PDP) belongs to any of the test's target collections.
   */
  function productBelongsToPriceTestCollections(collectionTargetIds) {
    if (!collectionTargetIds || !collectionTargetIds.length) return false;
    var onProduct = getCollectionGidsLinkedToCurrentProduct();
    if (!onProduct.length) return false;
    return collectionTargetIds.some(function (tid) {
      if (!tid) return false;
      return onProduct.some(function (c) {
        return gidMatches(tid, c);
      });
    });
  }

  /**
   * Whether this test's storefront logic should run (target match, product cards on listings, or collection test on PDP with product-in-collection data).
   */
  function shouldRunPriceTestOnCurrentPage(test) {
    if (!test) return false;
    if (matchesTarget(test)) return true;
    if (shouldRunPriceTestOnListingSurface(test)) return true;
    if (testTypeIsPrice(test)) {
      var tt = getNormalizedTargetType(test);
      if (isProductScopeTargetType(tt) && isCartSurface()) {
        return true;
      }
      if (tt === 'collection' && getCurrentProductId()) {
        var cids =
          test.targetIds ||
          (test.targetId || test.target_id ? [test.targetId || test.target_id] : []);
        if (productBelongsToPriceTestCollections(cids)) return true;
      }
    }
    // Preview: run the same price pipeline on PDP, listings, and cart — not only /products/…
    // (preview links with ?ab_preview=1 were previously PDP-only, so cart/collection looked broken).
    if (
      PREVIEW_TEST_CONTEXT &&
      testTypeIsPrice(test) &&
      isProductScopeTargetType(getNormalizedTargetType(test))
    ) {
      var pathPv = (window.location.pathname || '').toLowerCase();
      if (pathPv.indexOf('/products/') !== -1 && pathPv.length > '/products/'.length + 1) {
        return true;
      }
      if (isProductListingSurface()) return true;
      if (isCartSurface()) return true;
    }
    return false;
  }

  /**
   * Heatmap: buffer and flush click/scroll events
   */
  const heatmapBuffer = [];
  const HEATMAP_FLUSH_INTERVAL = 10000;

  function captureHeatmapEvent(testId, variantId, eventType, data) {
    if (!hasValidConfig || PREVIEW_TEST_CONTEXT) return;
    heatmapBuffer.push({
      test_id: testId,
      variant_id: variantId,
      page_url: window.location.href,
      event_type: eventType,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      ...data,
    });
  }

  function flushHeatmap(sync) {
    if (heatmapBuffer.length === 0) return;
    const events = heatmapBuffer.splice(0, heatmapBuffer.length);
    const shopDomain = getShopDomain();
    const body = JSON.stringify({
      shop_domain: shopDomain,
      site: !shopDomain ? window.location.hostname : null,
      events,
    });

    if (sync && navigator.sendBeacon) {
      navigator.sendBeacon(`${CONFIG.apiUrl}/track/heatmap`, body);
    } else {
      fetch(`${CONFIG.apiUrl}/track/heatmap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(function () {});
    }
  }

  function initHeatmap() {
    if (!hasValidConfig) return;

    getVariantCachePromise().then(function (cache) {
      const pageUrl = window.location.href;

      document.addEventListener(
        'click',
        function (e) {
          if (!hasConsent()) return;
          const x = (e.clientX / window.innerWidth) * 100;
          const y = (e.clientY / window.innerHeight) * 100;
          CONFIG.activeTests.forEach(function (test) {
            if (!matchesTarget(test)) return;
            const v = cache[test.id];
            if (!v || !v.variantId) return;
            captureHeatmapEvent(test.id, v.variantId, 'click', { x, y });
          });
        },
        true
      );

      var scrollThrottle = null;
      window.addEventListener(
        'scroll',
        function () {
          if (!hasConsent()) return;
          if (scrollThrottle) return;
          scrollThrottle = setTimeout(function () {
            scrollThrottle = null;
            const depth =
              ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100;
            CONFIG.activeTests.forEach(function (test) {
              if (!matchesTarget(test)) return;
              const v = cache[test.id];
              if (!v || !v.variantId) return;
              captureHeatmapEvent(test.id, v.variantId, 'scroll', {
                scroll_depth: Math.min(100, depth),
              });
            });
          }, 200);
        },
        { passive: true }
      );
    });

    setInterval(function () {
      flushHeatmap(false);
    }, HEATMAP_FLUSH_INTERVAL);

    window.addEventListener('beforeunload', function () {
      flushHeatmap(true);
    });
  }

  /**
   * Initialize on page load
   */
  function init() {
    if (VISUAL_PICKER_EMBED) {
      initVisualPicker();
    }
    function run() {
      if (
        window.location.pathname.includes('/thank_you') ||
        window.location.pathname.includes('/orders/')
      ) {
        trackCheckout();
      }

      if (!CONFIG.apiUrl) {
        console.warn('AB Test Tracker: apiUrl not configured');
        return;
      }

      if (PREVIEW_MODE && PREVIEW_TEST_ID && (PREVIEW_VARIANT_ID || PREVIEW_VARIANT_NAME)) {
        injectPriceTestCartAttributes(
          PREVIEW_TEST_ID,
          PREVIEW_VARIANT_ID || PREVIEW_VARIANT_NAME,
          null,
          null
        );
      }

      const activeTests = CONFIG.activeTests || [];

      if (DEBUG && activeTests.length === 0 && !(PREVIEW_MODE && PREVIEW_TEST_ID)) {
        debugLog(
          'No active tests in config. Ensure the test is Running and the script is loaded with the correct shop (e.g. App Proxy or ?shop=xxx.myshopify.com).'
        );
      }

      (async function runWithPreviewTestMerge() {
        var testsToRun = activeTests.slice();
        if (PREVIEW_MODE && PREVIEW_TEST_ID) {
          var hasPreview = testsToRun.some(function (t) {
            return String(t.id) === String(PREVIEW_TEST_ID);
          });
          if (!hasPreview) {
            var extraTest = await fetchPreviewStorefrontTestShape(PREVIEW_TEST_ID);
            if (extraTest) {
              testsToRun.push(extraTest);
            } else if (DEBUG) {
              debugLog(
                'Preview: test not in activeTests and preview-storefront-test fetch failed — is the test saved for this shop? Open DevTools → Network for /track/preview-storefront-test.'
              );
            }
          }
          CONFIG.activeTests = testsToRun;
        }
        var guardEnabled = hasAntiFlickerEligibleTests(testsToRun);
        if (guardEnabled) installAntiFlickerGuard();

        testsToRun.forEach(function (test) {
          const shouldTrackAntiFlicker = guardEnabled && shouldUseAntiFlickerForTest(test);
          if (shouldTrackAntiFlicker) markAntiFlickerPending();
          if (!shouldRunPriceTestOnCurrentPage(test)) {
            if (DEBUG) {
              var targetType = test.targetType || test.target_type || 'page';
              var ids =
                test.targetIds ||
                (test.targetId || test.target_id ? [test.targetId || test.target_id] : []);
              debugLog(
                'Test skipped (target mismatch):',
                test.id,
                'targetType=' + targetType,
                'targetIds=' + (ids.length ? ids.join(',') : 'any'),
                'current product=' + (getCurrentProductId() || 'none'),
                'current collection=' + (getCurrentCollectionId() || 'none')
              );
            }
            if (shouldTrackAntiFlicker) markAntiFlickerDone();
            return;
          }
          getVariant(test.id).then(
            function (variant) {
              try {
                if (!variant) {
                  if (DEBUG) {
                    debugLog(
                      'Test skipped (no variant assigned):',
                      test.id,
                      '- URL/segment may not match. Check targeting (URL pattern, device, etc.) or open with ?ab_preview=1 for preview.'
                    );
                  }
                  return;
                }
                var tt = getNormalizedTargetType(test);
                var productScope = isProductScopeTargetType(tt);
                var matched = matchesTarget(test);
                if (!matched && PREVIEW_TEST_CONTEXT && testTypeIsPrice(test) && productScope) {
                  var pathM = (window.location.pathname || '').toLowerCase();
                  if (
                    pathM.indexOf('/products/') !== -1 &&
                    pathM.length > '/products/'.length + 1
                  ) {
                    matched = true;
                  } else if (isProductListingSurface() || isCartSurface()) {
                    matched = true;
                  }
                }
                if (matched && testTypeIsPrice(test) && variant && !variant.config) {
                  injectPreviewCartAttributesWhenConfigMissing(test.id, variant);
                }
                if (matched) {
                  if (
                    variant.config &&
                    typeof variant.config.url === 'string' &&
                    variant.config.url.trim()
                  ) {
                    var rawUrl = variant.config.url.trim();
                    try {
                      var dest = new URL(rawUrl, window.location.href);
                      var cur = window.location;
                      var sameOriginPath =
                        dest.origin === cur.origin &&
                        dest.pathname === cur.pathname &&
                        (dest.search || '') === (cur.search || '');
                      if (!sameOriginPath) {
                        if (DEBUG) debugLog('Split-URL redirect', dest.toString());
                        window.location.href = dest.toString();
                        return;
                      }
                    } catch (e) {
                      if (DEBUG) debugLog('Split-URL invalid URL', rawUrl);
                    }
                  }
                  var previewFocusTest =
                    PREVIEW_MODE && String(test.id) === String(PREVIEW_TEST_ID);
                  if (!previewFocusTest) {
                    applyCustomCode(test.id, variant);
                  }
                }

                var tids =
                  test.targetIds ||
                  (test.targetId || test.target_id ? [test.targetId || test.target_id] : []);
                if (testTypeIsPrice(test)) {
                  // Read after async preview merge / deferred Product JSON (avoids stale null on PDP).
                  var curProductId = getCurrentProductId();
                  var pdpProductMatch =
                    productScope &&
                    matched &&
                    curProductId &&
                    (tt === 'all-products' ||
                      tt === 'all_products' ||
                      (tids.length &&
                        tids.some(function (id) {
                          return id && gidMatches(id, curProductId);
                        })));
                  var pdpCollectionMatch =
                    tt === 'collection' &&
                    curProductId &&
                    tids.length &&
                    productBelongsToPriceTestCollections(tids);
                  if (pdpProductMatch || pdpCollectionMatch) {
                    applyPriceTest(test.id, curProductId, test.targetVariantId || null, variant);
                  }
                  if (
                    variant &&
                    variant.config &&
                    (tids.length || tt === 'all-products' || tt === 'all_products')
                  ) {
                    if (tt === 'product' && isProductListingSurface()) {
                      applyPriceTestToProductCards(test.id, variant, tids);
                    } else if (
                      (tt === 'all-products' || tt === 'all_products') &&
                      isProductListingSurface()
                    ) {
                      applyPriceTestToCollectionListingCards(test.id, variant);
                    } else if (tt === 'collection' && matched && isProductListingSurface()) {
                      applyPriceTestToCollectionListingCards(test.id, variant);
                    }
                    if (tt === 'product') {
                      applyPriceTestToCart(test.id, variant, tids);
                    } else if (tt === 'all-products' || tt === 'all_products') {
                      var cartTids = getCartVisibleProductTargetIds();
                      if (cartTids.length) {
                        applyPriceTestToCart(test.id, variant, cartTids);
                      } else if (isCartSurface()) {
                        applyPriceTestToCartAllProductsFallback(test.id, variant);
                      }
                    }
                  }
                }
              } finally {
                if (shouldTrackAntiFlicker) markAntiFlickerDone();
              }
            },
            function () {
              if (shouldTrackAntiFlicker) markAntiFlickerDone();
            }
          );
        });

        // Preview mode: apply the preview variant's CSS/JS and visual editor rules
        if (PREVIEW_MODE && PREVIEW_TEST_ID) {
          getVariant(PREVIEW_TEST_ID).then(function (variant) {
            if (variant) {
              applyCustomCode(PREVIEW_TEST_ID, variant);
              applyVisualEditorRules(PREVIEW_TEST_ID, variant);
            }
          });
        }

        initHeatmap();

        // Re-apply price tests after delays so dynamically loaded content (cart drawer, AJAX sections, predictive search) shows test prices (Intelligems-style: price everywhere).
        function reapplyPriceTestsOnly() {
          if (!hasValidConfig || !CONFIG.activeTests || CONFIG.activeTests.length === 0) return;
          CONFIG.activeTests.forEach(function (test) {
            if (!testTypeIsPrice(test)) return;
            if (!shouldRunPriceTestOnCurrentPage(test)) return;
            var tt = getNormalizedTargetType(test);
            var productScope = isProductScopeTargetType(tt);
            var tids =
              test.targetIds ||
              (test.targetId || test.target_id ? [test.targetId || test.target_id] : []);
            if (!productScope && tt !== 'collection' && tids.length === 0) return;
            getVariant(test.id).then(function (variant) {
              if (!variant) return;
              injectPreviewCartAttributesWhenConfigMissing(test.id, variant);
              if (!variant.config) return;
              var curPid = getCurrentProductId();
              var matchedNow = matchesTarget(test);
              if (!matchedNow && PREVIEW_TEST_CONTEXT && testTypeIsPrice(test) && productScope) {
                var pathRm = (window.location.pathname || '').toLowerCase();
                if (
                  pathRm.indexOf('/products/') !== -1 &&
                  pathRm.length > '/products/'.length + 1
                ) {
                  matchedNow = true;
                } else if (isProductListingSurface() || isCartSurface()) {
                  matchedNow = true;
                }
              }
              if (
                productScope &&
                matchedNow &&
                curPid &&
                (tt === 'all-products' ||
                  tt === 'all_products' ||
                  tids.some(function (id) {
                    return id && gidMatches(id, curPid);
                  }))
              ) {
                applyPriceTest(test.id, curPid, test.targetVariantId || null, variant);
              }
              if (tt === 'collection' && curPid && productBelongsToPriceTestCollections(tids)) {
                applyPriceTest(test.id, curPid, test.targetVariantId || null, variant);
              }
              if (tt === 'product' && isProductListingSurface()) {
                applyPriceTestToProductCards(test.id, variant, tids);
              } else if (
                (tt === 'all-products' || tt === 'all_products') &&
                isProductListingSurface()
              ) {
                applyPriceTestToCollectionListingCards(test.id, variant);
              } else if (tt === 'collection' && matchedNow && isProductListingSurface()) {
                applyPriceTestToCollectionListingCards(test.id, variant);
              }
              if (tt === 'product') {
                applyPriceTestToCart(test.id, variant, tids);
              } else if (tt === 'all-products' || tt === 'all_products') {
                var cartTids = getCartVisibleProductTargetIds();
                if (cartTids.length) {
                  applyPriceTestToCart(test.id, variant, cartTids);
                } else if (isCartSurface()) {
                  applyPriceTestToCartAllProductsFallback(test.id, variant);
                }
              }
            });
          });
        }
        setTimeout(reapplyPriceTestsOnly, 1200);
        setTimeout(reapplyPriceTestsOnly, 3500);
        setTimeout(reapplyPriceTestsOnly, 6000);
        setTimeout(reapplyPriceTestsOnly, 10000);
        document.addEventListener('shopify:section:load', function () {
          setTimeout(reapplyPriceTestsOnly, 300);
        });
        var lastCartReapplyAt = 0;
        var cartReapply = function () {
          var now = Date.now();
          if (now - lastCartReapplyAt < 400) return;
          lastCartReapplyAt = now;
          setTimeout(reapplyPriceTestsOnly, 100);
          setTimeout(reapplyPriceTestsOnly, 500);
        };
        if (document.body) {
          document.body.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) return;
            if (
              t.closest(
                'a[href*="/cart"], .cart-icon, #cart-icon-bubble, [data-cart-drawer-toggle], .header__icon--cart, .site-header__cart, [data-cart-toggle], .js-drawer-open-cart, button[aria-label*="cart" i]'
              )
            ) {
              cartReapply();
            }
          });
        }
        ['cart:open', 'cart-drawer:open', 'cart:updated', 'shopify:cart:change'].forEach(
          function (evt) {
            try {
              document.addEventListener(evt, cartReapply, false);
            } catch (e) {}
          }
        );
        if (window.RipX) {
          window.RipX.reapplyPriceTests = reapplyPriceTestsOnly;
          window.RipX.reapplyCartFormRipxProps = function () {
            applyRipxStateToCartForms(_ripxCartFormTargetProductIds);
          };
        }
      })();
    }

    whenConsent(run);
  }

  // Start batch variant fetch immediately (overlaps with page load, reduces flicker)
  ensureBatchFetched();

  // Ping backend when script loads so the dashboard can show "Script detected" for standalone
  if (hasValidConfig && CONFIG.shopDomain) {
    var pingParam = CONFIG.shopDomain.indexOf('.myshopify.com') !== -1 ? 'shop=' : 'site=';
    var pingUrl =
      CONFIG.apiUrl + '/track/ping?' + pingParam + encodeURIComponent(CONFIG.shopDomain);
    try {
      fetchWithTimeout(pingUrl, { method: 'GET', keepalive: true }, 5000).catch(function () {});
    } catch (e) {}
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Element selection / visual editor: only when ab_visual_editor=1 AND in iframe. Never runs on live site.
  if (VISUAL_EDITOR_EMBED) {
    function runVisualEditorEmbed() {
      if (document.body) {
        initVisualEditorEmbed();
      } else {
        setTimeout(runVisualEditorEmbed, 5);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runVisualEditorEmbed, { once: true });
    } else {
      runVisualEditorEmbed();
    }
  }

  // Export for use in other scripts (version for support/debugging)
  const api = {
    getVariant,
    trackConversion,
    trackEvent,
    applyPriceTest,
    reapplyPriceTests: null,
    reapplyCartFormRipxProps: null,
    version: SCRIPT_VERSION,
  };
  window.ABTestTracker = api;
  window.RipX = api;
  // Test-only hooks (enabled when host page predefines window.__RIPX_TEST_HOOKS__ object).
  if (window.__RIPX_TEST_HOOKS__ && typeof window.__RIPX_TEST_HOOKS__ === 'object') {
    window.__RIPX_TEST_HOOKS__.getRipxCartAttrsPayload = getRipxCartAttrsPayload;
    window.__RIPX_TEST_HOOKS__.patchCartAddBodyForRipx = patchCartAddBodyForRipx;
    window.__RIPX_TEST_HOOKS__.installRipxCartAddInterceptors = installRipxCartAddInterceptors;
    window.__RIPX_TEST_HOOKS__.isCartAddPath = isCartAddPath;
    window.__RIPX_TEST_HOOKS__.pathnameFromCartUrl = pathnameFromCartUrl;
    window.__RIPX_TEST_HOOKS__.debugDescribeCartAddBody = debugDescribeCartAddBody;
    window.__RIPX_TEST_HOOKS__.looksLikeCartAddNearMiss = looksLikeCartAddNearMiss;
    window.__RIPX_TEST_HOOKS__.previewMode = PREVIEW_MODE;
    window.__RIPX_TEST_HOOKS__.previewTestContext = PREVIEW_TEST_CONTEXT;
    window.__RIPX_TEST_HOOKS__.previewTestId = PREVIEW_TEST_ID;
    window.__RIPX_TEST_HOOKS__.setRipxCartAttributeState = function (payload) {
      _ripxCartAttributeState = payload || null;
    };
  }
  debugLog('init', 'v' + SCRIPT_VERSION);
})();
