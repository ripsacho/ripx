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
 * Best practices: Load in <head> with defer for non-blocking execution. Script runs after DOM is ready.
 * Graceful degradation: If the assignment API fails (network error, 5xx, or 503 maintenance),
 * getVariant/getVariantCachePromise return null or {} so the page shows the control variant
 * and does not break. Track (conversion/event) failures are logged but do not throw.
 * Do not cache the script per-user; assignment is fetched per session/page as needed.
 *
 * Debug: Set window.__RIPX_DEBUG__ = true before the script loads to enable console logs (no PII).
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
  const PREVIEW_MODE =
    URL_PARAMS.get('ab_preview') === '1' || !!PREVIEW_TEST_ID || !!(CONFIG.previewMode === true);
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
  function getVariantCachePromise() {
    if (_variantCachePromise) return _variantCachePromise;
    if (!hasValidConfig || PREVIEW_MODE || !CONFIG.activeTests || CONFIG.activeTests.length === 0) {
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
    if (PREVIEW_MODE && PREVIEW_TEST_ID === String(testId) && PREVIEW_VARIANT_ID) {
      const previewVariant = await fetchPreviewVariant(testId);
      if (previewVariant) {
        return {
          ...previewVariant,
          isPreview: true,
        };
      }

      return {
        variantId: PREVIEW_VARIANT_ID,
        variantName: PREVIEW_VARIANT_NAME || 'Preview',
        isPreview: true,
      };
    }

    const id = String(testId);

    try {
      const cache = await getVariantCachePromise();
      if (cache[id]) return cache[id];
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
        return t.id === id;
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

  async function fetchPreviewVariant(testId) {
    if (!hasValidConfig) {
      return null;
    }
    const shopDomain = getShopDomain();

    try {
      const params = new URLSearchParams({
        test_id: testId,
        shop_domain: shopDomain,
      });

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
   * Track conversion event (purchase/order)
   */
  async function trackConversion(testId, variantId, value = 0, metadata = {}) {
    if (PREVIEW_MODE || !hasValidConfig) {
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
    if (PREVIEW_MODE || !hasValidConfig || !eventName || !String(eventName).trim()) {
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
   * Apply price test
   */
  async function applyPriceTest(testId, productId, variantId, providedVariant) {
    const variant = providedVariant || (await getVariant(testId));

    if (!variant) return;

    // Find the price element and update it
    const selectors = [
      `.product-price[data-product-id="${productId}"]`,
      variantId ? `.price[data-variant-id="${variantId}"]` : null,
      `.product__price`,
    ].filter(Boolean);

    selectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element && variant.config && variant.config.price) {
        element.textContent = formatPrice(variant.config.price);
        element.setAttribute('data-test-variant', variant.variantId);
      }
    });
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
      document.body.appendChild(scriptEl);
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

  /**
   * Format price
   */
  function formatPrice(price) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
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
    var el = document.querySelector('[data-product-id]');
    if (el) {
      var id = el.getAttribute('data-product-id');
      if (id) return toProductGid(id);
    }
    // Theme fallback: many themes put product JSON in a script tag (e.g. #ProductJson, [data-product-json])
    var script = document.querySelector(
      '#ProductJson, script[type="application/json"][data-product-json], script[data-section-type="product"]'
    );
    if (script && script.textContent) {
      try {
        var data = JSON.parse(script.textContent);
        var id = data.id || data.product_id || (data.product && data.product.id);
        if (id) return toProductGid(id);
      } catch (e) {}
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
   * Check if current page matches test target (single or multiple); supports product and collection.
   */
  function matchesTarget(test) {
    var ids =
      test.targetIds || (test.targetId || test.target_id ? [test.targetId || test.target_id] : []);
    if (!ids.length) return true;

    var targetType = (test.targetType || test.target_type || '').toLowerCase();
    var current = null;
    if (targetType === 'product') {
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
   * Heatmap: buffer and flush click/scroll events
   */
  const heatmapBuffer = [];
  const HEATMAP_FLUSH_INTERVAL = 10000;

  function captureHeatmapEvent(testId, variantId, eventType, data) {
    if (!hasValidConfig || PREVIEW_MODE) return;
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

      const activeTests = CONFIG.activeTests || [];
      const currentProductId = getCurrentProductId();

      if (DEBUG && activeTests.length === 0) {
        debugLog(
          'No active tests in config. Ensure the test is Running and the script is loaded with the correct shop (e.g. App Proxy or ?shop=xxx.myshopify.com).'
        );
      }

      activeTests.forEach(test => {
        if (!matchesTarget(test)) {
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
          return;
        }

        getVariant(test.id).then(variant => {
          if (!variant) {
            if (DEBUG)
              debugLog(
                'Test skipped (no variant assigned):',
                test.id,
                '- URL/segment may not match. Check targeting (URL pattern, device, etc.) or open with ?ab_preview=1 for preview.'
              );
            return;
          }
          applyCustomCode(test.id, variant);

          if (test.type === 'price') {
            var productId =
              test.targetIds && test.targetIds.length > 0 && currentProductId
                ? currentProductId
                : test.targetId || test.target_id;
            if (productId) {
              applyPriceTest(test.id, productId, test.targetVariantId || null, variant);
            }
          }
        });
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
    version: SCRIPT_VERSION,
  };
  window.ABTestTracker = api;
  window.RipX = api;
  debugLog('init', 'v' + SCRIPT_VERSION);
})();
