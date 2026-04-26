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
 * - Load the product page in a same-origin iframe and inject only the RipX runtime there.
 * - Re-inject after iframe navigation so preview survives cart/page transitions.
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

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildPricePreviewHtml({ targetUrl, appProxyScriptUrl }) {
  const previewContextScript = buildPreviewContextScript(targetUrl);
  const escapedTargetUrl = escapeHtmlAttribute(targetUrl);

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
      .ripx-price-preview-frame {
        border: 0;
        display: block;
        height: 100vh;
        width: 100vw;
        background: #fff;
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
    <iframe
      class="ripx-price-preview-frame"
      id="ripx-price-preview-frame"
      src="${escapedTargetUrl}"
      title="RipX price preview"
    ></iframe>
    <div class="ripx-price-preview-bar" id="ripx-price-preview-bar">
      <span class="ripx-price-preview-dot" id="ripx-price-preview-dot"></span>
      <span id="ripx-price-preview-status">Preparing price preview...</span>
      <button type="button" id="ripx-price-preview-retry">Retry</button>
      <button type="button" id="ripx-price-preview-open">Open product</button>
    </div>
    <script>
      (function () {
        var target = ${JSON.stringify(targetUrl)};
        var appProxyScriptUrl = ${JSON.stringify(appProxyScriptUrl)};
        var frame = document.getElementById('ripx-price-preview-frame');
        var statusEl = document.getElementById('ripx-price-preview-status');
        var dotEl = document.getElementById('ripx-price-preview-dot');
        var retryButton = document.getElementById('ripx-price-preview-retry');
        var openButton = document.getElementById('ripx-price-preview-open');
        var injectionAttempt = 0;

        ${previewContextScript}

        function setStatus(message, ready) {
          if (statusEl) statusEl.textContent = message;
          if (dotEl) dotEl.className = 'ripx-price-preview-dot' + (ready ? ' ready' : '');
        }

        function frameWindow() {
          return frame && frame.contentWindow ? frame.contentWindow : null;
        }

        function frameDocument() {
          try {
            var win = frameWindow();
            return win && win.document ? win.document : null;
          } catch (_e) {
            return null;
          }
        }

        function sameOriginFrameReady() {
          var doc = frameDocument();
          return !!(doc && (doc.head || doc.documentElement || doc.body));
        }

        function hasRipxRuntime() {
          try {
            var win = frameWindow();
            return !!(win && win.RipX && win.RipX.version);
          } catch (_e) {
            return false;
          }
        }

        function mirrorRuntimeForConsole() {
          try {
            var win = frameWindow();
            if (win && win.RipX) window.RipX = win.RipX;
          } catch (_e) {}
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

        function buildDebugStatus() {
          var win = frameWindow();
          var doc = frameDocument();
          var scripts = [];
          var frameHref = null;
          var ripxVersion = null;
          try {
            scripts = doc
              ? Array.prototype.slice.call(doc.scripts || []).map(function (script) {
                  return script && script.src ? script.src : '';
                }).filter(Boolean)
              : [];
          } catch (_eScripts) {}
          try {
            frameHref = win && win.location ? String(win.location.href || '') : null;
          } catch (_eFrameHref) {}
          try {
            ripxVersion = win && win.RipX ? win.RipX.version || null : null;
          } catch (_eRipxVersion) {}
          return {
            href: String(window.location.href || ''),
            target: target,
            frameHref: frameHref,
            frameReady: sameOriginFrameReady(),
            ripxVersion: ripxVersion,
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
          retry: reloadFrame
        };

        function injectRipxRuntime() {
          injectionAttempt += 1;
          persistPreviewCtx(frameWindow());

          var doc = frameDocument();
          if (!sameOriginFrameReady()) {
            setStatus('Waiting for product frame...', false);
            if (injectionAttempt < 60) setTimeout(injectRipxRuntime, 500);
            return;
          }

          if (hasRipxRuntime()) {
            mirrorRuntimeForConsole();
            setStatus('RipX price preview ready', true);
            return;
          }

          try {
            var win = frameWindow();
            if (win) win.__RIPX_PRICE_PREVIEW_FRAME__ = true;
            var existing = Array.prototype.slice.call(doc.scripts || []).some(function (script) {
              return script && script.src && script.src.indexOf('/apps/ripx/script.js') !== -1;
            });
            if (!existing) {
              var script = doc.createElement('script');
              script.src = appProxyScriptUrl + '&price_preview_frame=1';
              script.async = false;
              (doc.head || doc.documentElement || doc.body).appendChild(script);
            }
          } catch (_injectErr) {
            setStatus('Could not inject RipX yet; retrying...', false);
          }

          if (injectionAttempt < 60) {
            setTimeout(injectRipxRuntime, 500);
          } else if (!hasRipxRuntime()) {
            setStatus('RipX runtime did not load in the product frame', false);
          }
        }

        function reloadFrame() {
          injectionAttempt = 0;
          persistPreviewCtx(frameWindow());
          if (frame) frame.src = target;
          setStatus('Reloading price preview...', false);
        }

        if (retryButton) retryButton.onclick = reloadFrame;
        if (openButton) {
          openButton.onclick = function () {
            try { window.open(target, '_blank', 'noopener'); } catch (_e) {}
          };
        }

        persistPreviewCtx(null);
        if (frame) {
          frame.addEventListener('load', function () {
            injectionAttempt = 0;
            setTimeout(injectRipxRuntime, 50);
          });
        }
        injectRipxRuntime();
      })();
    </script>
  </body>
</html>`;
}

function createPricePreviewBootstrapHandlers({ validatePreviewBootstrapRequest, SCRIPT_VERSION }) {
  /**
   * Main isolated price-preview route.
   *
   * The generic preview bootstrap rewrites full Shopify HTML. This route avoids that
   * by leaving Shopify's page inside a same-origin iframe and injecting RipX there.
   */
  async function servePricePreviewBootstrap(req, res) {
    const validated = await validatePreviewBootstrapRequest(req, res, 'price-preview-bootstrap');
    if (!validated) {return;}

    const { normalizedShop, targetUrl } = validated;
    const previewScriptBust = Date.now();
    const appProxyScriptUrl =
      `https://${normalizedShop}/apps/ripx/script.js?v=${SCRIPT_VERSION}` +
      `&ripx_preview_bust=${previewScriptBust}`;

    res.set('Cache-Control', 'no-store');
    res.set(
      'Content-Security-Policy',
      "default-src 'self' https:; script-src 'self' https: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src 'self' https:; connect-src 'self' https:; base-uri 'none'"
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
