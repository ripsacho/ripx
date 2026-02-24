/**
 * RipX Storefront Integration Script
 *
 * Multi-platform: works on Shopify and standalone sites.
 * 1. Get variant assignments for users
 * 2. Apply test variations (prices, content, etc.)
 * 3. Track conversion events
 *
 * Shopify: Load via app proxy or GET /api/track/script.js?shop=xxx.myshopify.com
 * Standalone: Load via GET /api/track/script.js?site=example.com
 *
 * Graceful degradation: If the assignment API fails (network error, 5xx, or 503 maintenance),
 * getVariant/getVariantCachePromise return null or {} so the page shows the control variant
 * and does not break. Track (conversion/event) failures are logged but do not throw.
 * Do not cache the script per-user; assignment is fetched per session/page as needed.
 */

(function () {
  'use strict';

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
  const consentRequired = !!CONFIG.consentRequired;

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
  const PREVIEW_TEST_ID = URL_PARAMS.get('ab_preview_test');
  const PREVIEW_VARIANT_ID = URL_PARAMS.get('ab_preview_variant');
  const PREVIEW_VARIANT_NAME = URL_PARAMS.get('ab_preview_variant_name');
  const PREVIEW_MODE = URL_PARAMS.get('ab_preview') === '1' || !!PREVIEW_TEST_ID;

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
      session_count: String(sessionCount),
      referrer: document.referrer || '',
      utm_source: urlParams.get('utm_source') || '',
      utm_medium: urlParams.get('utm_medium') || '',
    });
    if (Object.keys(jsTargetingResults).length > 0) {
      params.set('js_targeting_results', JSON.stringify(jsTargetingResults));
    }
    _variantCachePromise = fetch(`${CONFIG.apiUrl}/track/variants?${params.toString()}`)
      .then(function (r) {
        return r.ok ? r.json() : { variants: {} };
      })
      .then(function (data) {
        return data.variants || {};
      })
      .catch(function () {
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
      const response = await fetch(`${CONFIG.apiUrl}/track/variant?${params.toString()}`);

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

      const response = await fetch(`${CONFIG.apiUrl}/track/preview?${params.toString()}`);

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
      await fetch(`${CONFIG.apiUrl}/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          test_id: testId,
          variant_id: variantId,
          user_id: userId,
          shop_domain: shopDomain,
          event_type: 'conversion',
          event_value: value,
          metadata: meta,
        }),
      });
    } catch (error) {
      console.error('Error tracking conversion:', error);
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
      await fetch(`${CONFIG.apiUrl}/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
      });
    } catch (error) {
      console.error('Error tracking custom event:', error);
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
   * Get current product/collection ID from page (Shopify or data attributes)
   */
  function getCurrentTargetId() {
    if (window.ShopifyAnalytics?.meta?.product?.id) {
      return 'gid://shopify/Product/' + window.ShopifyAnalytics.meta.product.id;
    }
    if (window.Shopify?.meta?.product?.id) {
      return 'gid://shopify/Product/' + window.Shopify.meta.product.id;
    }
    const el = document.querySelector('[data-product-id]');
    if (el) {
      const id = el.getAttribute('data-product-id');
      if (id) return id.startsWith('gid://') ? id : 'gid://shopify/Product/' + id;
    }
    return null;
  }

  /**
   * Check if current page matches test target (single or multiple)
   */
  function matchesTarget(test) {
    const ids =
      test.targetIds || (test.targetId || test.target_id ? [test.targetId || test.target_id] : []);
    if (!ids.length) return true;
    const current = getCurrentTargetId();
    if (!current) return false;
    return ids.some(id => id && (String(id) === String(current) || current.endsWith(String(id))));
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
      const currentTargetId = getCurrentTargetId();

      activeTests.forEach(test => {
        if (!matchesTarget(test)) return;

        getVariant(test.id).then(variant => {
          if (!variant) return;
          applyCustomCode(test.id, variant);

          if (test.type === 'price') {
            const productId =
              test.targetIds && test.targetIds.length > 0 && currentTargetId
                ? currentTargetId
                : test.targetId || test.target_id;
            if (productId) {
              applyPriceTest(test.id, productId, test.targetVariantId || null, variant);
            }
          }
        });
      });

      initHeatmap();
    }

    whenConsent(run);
  }

  // Start batch variant fetch immediately (overlaps with page load, reduces flicker)
  ensureBatchFetched();

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for use in other scripts
  const api = {
    getVariant,
    trackConversion,
    trackEvent,
    applyPriceTest,
  };
  window.ABTestTracker = api;
  window.RipX = api;
})();
