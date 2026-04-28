(function () {
  if (window.__RIPX_APP_EMBED_LOADER__) return;
  window.__RIPX_APP_EMBED_LOADER__ = true;

  var CONFIG_ID = 'ripx-app-embed-config';
  var PREVIEW_STORAGE_KEY = '__ripx_preview_ctx_v1__';
  var ensureTimer = null;
  var attemptCount = 0;
  var maxAttempts = 30;

  function readConfig() {
    try {
      var el = document.getElementById(CONFIG_ID);
      if (!el) return {};
      return JSON.parse(el.textContent || '{}') || {};
    } catch (_e) {
      return {};
    }
  }

  var config = readConfig();
  var shopHost = String(config.shopHost || window.location.hostname || '').trim();
  var version = String(config.version || '').trim() || '1.0.40';
  var directScriptBaseUrl = String(config.directScriptBaseUrl || '').trim();

  function hasRipx() {
    return !!(window.RipX && window.RipX.version);
  }

  function readPreviewCtx() {
    try {
      if (!window.sessionStorage) return null;
      var raw = window.sessionStorage.getItem(PREVIEW_STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (_e) {
      return null;
    }
  }

  function seedPreviewCtxFromUrl() {
    try {
      if (!window.sessionStorage || !window.location || !window.location.search) return null;
      var params = new URLSearchParams(window.location.search || '');
      var previewFlag = params.get('ab_preview') === '1';
      var testId = params.get('ab_preview_test') || null;
      var variantId = params.get('ab_preview_variant') || null;
      var variantName = params.get('ab_preview_variant_name') || null;
      var tenantDomain = params.get('ab_preview_domain') || null;
      if (!(previewFlag || testId || variantId || variantName)) return null;
      var ctx = {
        preview: previewFlag,
        testId: testId,
        variantId: variantId,
        variantName: variantName,
        tenantDomain: tenantDomain,
        simple: params.get('ab_preview_simple') === '1',
        persistedAtMs: Date.now(),
      };
      window.sessionStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(ctx));
      return ctx;
    } catch (_e) {
      return null;
    }
  }

  function hasPreviewCtx() {
    var ctx = readPreviewCtx();
    return !!(ctx && (ctx.preview || ctx.testId || ctx.variantId || ctx.variantName));
  }

  function withPreviewBust(src) {
    if (!src) return '';
    try {
      var parsed = new URL(src, window.location.origin);
      if (hasPreviewCtx()) parsed.searchParams.set('ripx_preview_bust', String(Date.now()));
      return parsed.toString();
    } catch (_e) {
      return src;
    }
  }

  function hasScriptTagFor(src) {
    if (!src) return false;
    var normalized = String(src).split('?')[0];
    try {
      return Array.prototype.slice.call(document.scripts || []).some(function (script) {
        var current = String((script && script.src) || '').split('?')[0];
        return !!current && current === normalized;
      });
    } catch (_e) {
      return false;
    }
  }

  function appendScript(src, isFallback) {
    if (!src || hasScriptTagFor(src)) return;
    var tag = document.createElement('script');
    tag.src = src;
    tag.async = false;
    tag.setAttribute('fetchpriority', 'high');
    tag.onload = function () {
      if (hasRipx()) stopEnsure();
    };
    tag.onerror = function () {
      try {
        window.__RIPX_APP_EMBED_LOADER_STATUS__ = {
          ok: false,
          failedSrc: src,
          fallback: !!isFallback,
          at: Date.now(),
        };
      } catch (_eStatus) {}
      if (!isFallback && directScriptBaseUrl) appendScript(withPreviewBust(buildDirectSrc()), true);
    };
    (document.head || document.documentElement || document.body).appendChild(tag);
  }

  function buildPrimarySrc() {
    if (!shopHost) return '';
    return 'https://' + shopHost + '/apps/ripx/script.js?v=' + encodeURIComponent(version);
  }

  function buildDirectSrc() {
    if (!directScriptBaseUrl || !shopHost) return '';
    return (
      directScriptBaseUrl.replace(/\/+$/, '') +
      '/api/track/script.js?shop=' +
      encodeURIComponent(shopHost) +
      '&v=' +
      encodeURIComponent(version)
    );
  }

  function stopEnsure() {
    if (ensureTimer) {
      clearInterval(ensureTimer);
      ensureTimer = null;
    }
  }

  function ensureLoaded() {
    if (hasRipx()) {
      try {
        window.__RIPX_APP_EMBED_LOADER_STATUS__ = {
          ok: true,
          version: window.RipX.version,
          at: Date.now(),
        };
      } catch (_eStatus) {}
      stopEnsure();
      return;
    }

    attemptCount += 1;
    appendScript(withPreviewBust(buildPrimarySrc()), false);
    if (directScriptBaseUrl) appendScript(withPreviewBust(buildDirectSrc()), true);

    if (attemptCount >= maxAttempts) {
      stopEnsure();
      try {
        window.__RIPX_APP_EMBED_LOADER_STATUS__ = {
          ok: false,
          reason: 'runtime_missing_after_retries',
          preview: hasPreviewCtx(),
          at: Date.now(),
        };
      } catch (_eStatus) {}
    }
  }

  seedPreviewCtxFromUrl();
  ensureLoaded();
  ensureTimer = setInterval(ensureLoaded, hasPreviewCtx() ? 1000 : 3000);
  window.addEventListener('pageshow', function () {
    if (!hasRipx()) ensureLoaded();
  });
})();
