/**
 * Price Preview Bootstrap
 *
 * This module is intentionally separate from the generic Shopify preview bootstrap.
 * Price tests need a stricter, less fragile runner because the storefront runtime must
 * patch add-to-cart forms before Shopify navigates away from the product page.
 *
 * Design goals:
 * - Do not rewrite Shopify's full HTML with document.write.
 * - Keep the browser on an app-proxy bootstrap URL while previewing.
 * - Fetch and mount the product page in this controlled app-proxy document.
 * - Inject RipX before theme scripts so add-to-cart forms are patched early.
 */

function buildPreviewContextScript(targetUrl) {
  return `
function buildPreviewCtx() {
  try {
    var tu = new URL(${JSON.stringify(targetUrl)}, window.location.origin);
    return {
      preview: tu.searchParams.get('ab_preview') === '1',
      testId: tu.searchParams.get('ab_preview_test') || null,
      variantId: tu.searchParams.get('ab_preview_variant') || null,
      variantName: tu.searchParams.get('ab_preview_variant_name') || null,
      tenantDomain: tu.searchParams.get('ab_preview_domain') || null,
      simple: tu.searchParams.get('ab_preview_simple') === '1',
      persistedAtMs: Date.now()
    };
  } catch (_e) {
    return { preview: true, persistedAtMs: Date.now() };
  }
}

function persistPreviewCtx(targetWindow) {
  var ctx = buildPreviewCtx();
  try {
    window.sessionStorage.setItem('__ripx_preview_ctx_v1__', JSON.stringify(ctx));
  } catch (_eTopSession) {}
  try {
    window.name = '__ripx_preview_ctx_v1__:' + JSON.stringify(ctx);
  } catch (_eTopName) {}
  try {
    if (targetWindow && targetWindow.sessionStorage) {
      targetWindow.sessionStorage.setItem('__ripx_preview_ctx_v1__', JSON.stringify(ctx));
    }
  } catch (_eFrameSession) {}
  try {
    if (targetWindow) targetWindow.name = '__ripx_preview_ctx_v1__:' + JSON.stringify(ctx);
  } catch (_eFrameName) {}
  return ctx;
}
`;
}

function buildPricePreviewHtml({ targetUrl, appProxyScriptUrl }) {
  const previewContextScript = buildPreviewContextScript(targetUrl);
  const simplePreview = (() => {
    try {
      return new URL(targetUrl).searchParams.get('ab_preview_simple') === '1';
    } catch (_e) {
      return false;
    }
  })();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RipX price preview</title>
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: #f6f6f7;
      }
      .ripx-price-preview-bar {
        align-items: center;
        background: rgba(17, 24, 39, 0.92);
        border-radius: 999px;
        bottom: 14px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
        color: #fff;
        display: flex;
        font: 12px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        gap: 10px;
        left: 50%;
        max-width: calc(100vw - 28px);
        padding: 8px 12px;
        position: fixed;
        transform: translateX(-50%);
        z-index: 2147483647;
      }
      .ripx-price-preview-dot {
        background: #f59e0b;
        border-radius: 999px;
        height: 8px;
        width: 8px;
      }
      .ripx-price-preview-dot.ready {
        background: #22c55e;
      }
      .ripx-price-preview-bar button {
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 999px;
        color: #fff;
        cursor: pointer;
        font: inherit;
        padding: 4px 9px;
      }
    </style>
  </head>
  <body>
    <div class="ripx-price-preview-bar" id="ripx-price-preview-bar" style="${simplePreview ? 'display:none' : ''}">
      <span class="ripx-price-preview-dot" id="ripx-price-preview-dot"></span>
      <span id="ripx-price-preview-status">Loading price preview...</span>
      <button type="button" id="ripx-price-preview-retry">Retry</button>
      <button type="button" id="ripx-price-preview-open">Open product</button>
    </div>
    <script>
      (function () {
        var target = ${JSON.stringify(targetUrl)};
        var appProxyScriptUrl = ${JSON.stringify(appProxyScriptUrl)};
        var simplePreview = ${JSON.stringify(simplePreview)};
        var statusEl = document.getElementById('ripx-price-preview-status');
        var dotEl = document.getElementById('ripx-price-preview-dot');
        var retryButton = document.getElementById('ripx-price-preview-retry');
        var openButton = document.getElementById('ripx-price-preview-open');
        var injectionAttempt = 0;
        var mounted = false;
        var lastError = null;

        ${previewContextScript}

        function ensureStatusBar() {
          if (simplePreview) return;
          if (statusEl && document.documentElement.contains(statusEl)) return;
          if (!document.body) return;
          var style = document.getElementById('ripx-price-preview-style');
          if (!style) {
            style = document.createElement('style');
            style.id = 'ripx-price-preview-style';
            style.textContent =
              '.ripx-price-preview-bar{align-items:center;background:rgba(17,24,39,.92);border-radius:999px;bottom:14px;box-shadow:0 10px 30px rgba(0,0,0,.22);color:#fff;display:flex;font:12px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;gap:10px;left:50%;max-width:calc(100vw - 28px);padding:8px 12px;position:fixed;transform:translateX(-50%);z-index:2147483647}.ripx-price-preview-dot{background:#f59e0b;border-radius:999px;height:8px;width:8px}.ripx-price-preview-dot.ready{background:#22c55e}.ripx-price-preview-bar button{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);border-radius:999px;color:#fff;cursor:pointer;font:inherit;padding:4px 9px}';
            (document.head || document.documentElement).appendChild(style);
          }
          var bar = document.getElementById('ripx-price-preview-bar');
          if (!bar) {
            bar = document.createElement('div');
            bar.className = 'ripx-price-preview-bar';
            bar.id = 'ripx-price-preview-bar';
            bar.innerHTML =
              '<span class="ripx-price-preview-dot" id="ripx-price-preview-dot"></span>' +
              '<span id="ripx-price-preview-status">Loading price preview...</span>' +
              '<button type="button" id="ripx-price-preview-retry">Retry</button>' +
              '<button type="button" id="ripx-price-preview-open">Open product</button>';
            document.body.appendChild(bar);
          }
          statusEl = document.getElementById('ripx-price-preview-status');
          dotEl = document.getElementById('ripx-price-preview-dot');
          retryButton = document.getElementById('ripx-price-preview-retry');
          openButton = document.getElementById('ripx-price-preview-open');
          if (retryButton) retryButton.onclick = reloadPreview;
          if (openButton) {
            openButton.onclick = function () {
              try { window.open(target, '_blank', 'noopener'); } catch (_e) {}
            };
          }
        }

        function setStatus(message, ready) {
          ensureStatusBar();
          if (statusEl) statusEl.textContent = message;
          if (dotEl) dotEl.className = 'ripx-price-preview-dot' + (ready ? ' ready' : '');
        }

        function startStatusBarWatchdog() {
          try {
            window.setInterval(function () {
              ensureStatusBar();
              if (hasRipxRuntime()) {
                if (statusEl) statusEl.textContent = 'RipX price preview ready';
                if (dotEl) dotEl.className = 'ripx-price-preview-dot ready';
              }
            }, 1500);
          } catch (_eWatchdog) {}
        }

        function hasRipxRuntime() {
          try {
            return !!(window.RipX && window.RipX.version);
          } catch (_e) {
            return false;
          }
        }

        function mirrorRuntimeForConsole() {
          try {
            window.__RIPX_BOOTSTRAP_OK__ = {
              ok: true,
              mountedAt: Date.now(),
              href: String(window.location.href || ''),
              source: 'price-preview-bootstrap',
              runtimeReadyAt: Date.now()
            };
          } catch (_e2) {}
        }

        function cleanSimplePreviewAddressBar() {
          if (!simplePreview || !window.history || typeof window.history.replaceState !== 'function') return;
          try {
            var clean = new URL(target, window.location.origin);
            [
              'ab_preview',
              'ab_preview_simple',
              'ab_preview_test',
              'ab_preview_variant',
              'ab_preview_variant_name',
              'ab_preview_domain'
            ].forEach(function (key) {
              clean.searchParams.delete(key);
            });
            window.history.replaceState(
              window.history.state || null,
              document.title || '',
              clean.pathname + clean.search + clean.hash
            );
            window.__RIPX_SIMPLE_PREVIEW_CLEAN_URL__ = {
              cleaned: true,
              at: Date.now(),
              href: clean.toString(),
              source: 'price-preview-bootstrap'
            };
          } catch (_eClean) {}
        }

        function buildPriceBootstrapUrl(urlValue) {
          try {
            var parsed = new URL(urlValue || target, window.location.origin);
            if (String(parsed.hostname || '').toLowerCase() !== String(window.location.hostname || '').toLowerCase()) {
              return parsed.toString();
            }
            var path = String(parsed.pathname || '').toLowerCase();
            if (path.indexOf('/apps/ripx/price-preview-bootstrap-v1') === 0) return parsed.toString();
            return 'https://' + parsed.hostname + '/apps/ripx/price-preview-bootstrap-v1?url=' + encodeURIComponent(parsed.toString());
          } catch (_e) {
            return target;
          }
        }

        function installNavigationGuard() {
          document.addEventListener('click', function (event) {
            var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (!anchor) return;
            var href = anchor.getAttribute('href') || '';
            if (!href || href.indexOf('#') === 0 || /^mailto:|^tel:|^javascript:/i.test(href)) return;
            try {
              var next = new URL(href, target);
              if (String(next.hostname || '').toLowerCase() !== String(window.location.hostname || '').toLowerCase()) return;
              var nextPath = String(next.pathname || '').replace(/\\/+$/, '').toLowerCase() || '/';
              var cartToggle = anchor.closest(
                '[data-cart-drawer], [data-cart-toggle], [data-drawer-trigger], [aria-controls*="Cart"], [aria-controls*="cart"], cart-drawer, #cart-icon-bubble, .header__icon--cart'
              );
              // Cart drawer triggers often use href="/cart" as a no-JS fallback. Let the
              // theme handler own those clicks; intercepting them causes an instant cart-page redirect.
              if (nextPath === '/cart' || cartToggle) return;
              event.preventDefault();
              window.location.assign(buildPriceBootstrapUrl(next.toString()));
            } catch (_e) {}
          }, true);
        }

        function buildDebugStatus() {
          var scripts = [];
          try {
            scripts = Array.prototype.slice.call(document.scripts || []).map(function (script) {
              return script && script.src ? script.src : '';
            }).filter(Boolean);
          } catch (_eScripts) {}
          return {
            href: String(window.location.href || ''),
            target: target,
            mounted: mounted,
            ripxVersion: window.RipX ? window.RipX.version || null : null,
            lastError: lastError,
            previewCtx: (function () {
              try { return window.sessionStorage.getItem('__ripx_preview_ctx_v1__'); } catch (_e) { return null; }
            })(),
            ripxScripts: scripts.filter(function (src) {
              return src.indexOf('/apps/ripx/script.js') !== -1 || src.indexOf('/api/track/script.js') !== -1;
            })
          };
        }

        window.RipXPricePreview = {
          debugStatus: buildDebugStatus,
          retry: reloadPreview
        };

        function appendScriptFromParsed(scriptEl) {
          var nextScript = document.createElement('script');
          try {
            Array.prototype.slice.call(scriptEl.attributes || []).forEach(function (attr) {
              nextScript.setAttribute(attr.name, attr.value);
            });
          } catch (_eAttrs) {}
          if (!nextScript.src) nextScript.text = scriptEl.textContent || '';
          (document.head || document.body || document.documentElement).appendChild(nextScript);
        }

        function injectRipxRuntimeThenScripts(scriptNodes) {
          injectionAttempt += 1;
          persistPreviewCtx(window);

          if (hasRipxRuntime()) {
            mirrorRuntimeForConsole();
            setStatus('RipX price preview ready', true);
            return;
          }

          try {
            window.__RIPX_PRICE_PREVIEW_FRAME__ = true;
            var existing = Array.prototype.slice.call(document.scripts || []).some(function (script) {
              return script && script.src && script.src.indexOf('/apps/ripx/script.js') !== -1;
            });
            if (!existing) {
              var script = document.createElement('script');
              script.src = appProxyScriptUrl + '&price_preview_frame=1';
              script.async = false;
              script.onload = function () {
                mirrorRuntimeForConsole();
                setStatus('RipX price preview ready', true);
                try {
                  (scriptNodes || []).forEach(appendScriptFromParsed);
                } catch (_eScriptsAfterRipx) {}
              };
              script.onerror = function () {
                lastError = 'ripx_script_failed';
                setStatus('RipX runtime failed to load', false);
              };
              (document.head || document.documentElement || document.body).appendChild(script);
            }
          } catch (_injectErr) {
            lastError = _injectErr && _injectErr.message ? _injectErr.message : 'inject_failed';
            setStatus('Could not inject RipX runtime', false);
          }
        }

        function mountFetchedDocument(htmlText) {
          if (!htmlText || typeof htmlText !== 'string') throw new Error('empty_html');
          if (typeof DOMParser === 'undefined') throw new Error('domparser_missing');

          var parsed = new DOMParser().parseFromString(htmlText, 'text/html');
          var scriptNodes = Array.prototype.slice.call(parsed.querySelectorAll('script'));
          scriptNodes.forEach(function (scriptEl) {
            if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
          });

          var base = parsed.createElement('base');
          try {
            var baseUrl = new URL(target);
            base.href = baseUrl.origin + '/';
          } catch (_eBase) {
            base.href = '/';
          }
          (parsed.head || parsed.documentElement).insertBefore(base, (parsed.head || parsed.documentElement).firstChild);

          var importedRoot = document.importNode(parsed.documentElement, true);
          document.replaceChild(importedRoot, document.documentElement);
          mounted = true;
          persistPreviewCtx(window);
          cleanSimplePreviewAddressBar();
          installNavigationGuard();
          injectRipxRuntimeThenScripts(scriptNodes);
        }

        function loadPreview() {
          injectionAttempt = 0;
          lastError = null;
          persistPreviewCtx(window);
          setStatus('Loading product preview...', false);
          fetch(target, { method: 'GET', credentials: 'include', redirect: 'follow' })
            .then(function (response) {
              if (!response || !response.ok) throw new Error('target_fetch_failed_' + (response && response.status ? response.status : 'unknown'));
              return response.text();
            })
            .then(mountFetchedDocument)
            .catch(function (err) {
              lastError = err && err.message ? err.message : 'target_fetch_failed';
              setStatus('Could not load product preview', false);
            });
        }

        function reloadPreview() {
          window.location.replace(buildPriceBootstrapUrl(target));
        }

        if (retryButton) retryButton.onclick = reloadPreview;
        if (openButton) {
          openButton.onclick = function () {
            try { window.open(target, '_blank', 'noopener'); } catch (_e) {}
          };
        }

        persistPreviewCtx(null);
        window.__RIPX_PRICE_PREVIEW_FRAME__ = true;
        startStatusBarWatchdog();
        loadPreview();
      })();
    </script>
  </body>
</html>`;
}

function createPricePreviewBootstrapHandlers({ validatePreviewBootstrapRequest, SCRIPT_VERSION }) {
  /**
   * Main isolated price-preview route.
   *
   * The generic preview bootstrap is shared by all test types. This price-only route
   * mounts the product document directly and injects RipX before theme scripts.
   */
  async function servePricePreviewBootstrap(req, res) {
    const validated = await validatePreviewBootstrapRequest(req, res, 'price-preview-bootstrap');
    if (!validated) {
      return;
    }

    const { normalizedShop, targetUrl } = validated;
    const previewScriptBust = Date.now();
    const appProxyScriptUrl =
      `https://${normalizedShop}/apps/ripx/script.js?v=${SCRIPT_VERSION}` +
      `&ripx_preview_bust=${previewScriptBust}`;

    res.set('Cache-Control', 'no-store');
    res.set(
      'Content-Security-Policy',
      "default-src 'self' https:; script-src 'self' https: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src 'self' https:; connect-src 'self' https:; base-uri 'self'"
    );
    return res.type('html').send(buildPricePreviewHtml({ targetUrl, appProxyScriptUrl }));
  }

  return {
    servePricePreviewBootstrap,
  };
}

module.exports = {
  createPricePreviewBootstrapHandlers,
};
