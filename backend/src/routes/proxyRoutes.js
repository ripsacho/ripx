/**
 * App Proxy Routes
 *
 * Serves storefront assets via Shopify App Proxy.
 */

const express = require('express');
const crypto = require('crypto');
const querystring = require('querystring');
const { asyncHandler } = require('../middleware/asyncHandler');
const { getActiveTestsForStorefront } = require('../models/test');
const { listGoalMetricDefinitions } = require('../models/goalMetricDefinition');
const logger = require('../utils/logger');
const {
  SCRIPT_VERSION,
  buildStorefrontRuntimeConfig,
  getStorefrontScriptCacheControl,
} = require('../utils/storefrontScriptRuntime');
const {
  getMaintenanceMode,
  isMaintenanceActiveForDomain,
  getBlockListMessage,
} = require('../utils/maintenanceMode');
const { getTenantByDomain, normalizeDomain } = require('../models/tenant');
const { ERROR_MESSAGES } = require('../constants');
const { createPricePreviewBootstrapHandlers } = require('./pricePreviewBootstrap');
const {
  getStorefrontScriptPath,
  readStorefrontScriptSource,
} = require('../utils/storefrontScriptSource');

const router = express.Router();

const { servePricePreviewBootstrap } = createPricePreviewBootstrapHandlers({
  validatePreviewBootstrapRequest,
  SCRIPT_VERSION,
});

function isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

function isTenantSuspendedOrBlocked(tenant) {
  const status = tenant?.status;
  return status === 'suspended' || status === 'blocked';
}

/**
 * Build the message used for Shopify App Proxy HMAC (per Shopify docs).
 * Sorted key=value pairs, no delimiter between pairs. Array values joined with comma.
 */
function buildSignatureMessage(params) {
  return Object.keys(params)
    .sort()
    .map(key => {
      const v = params[key];
      const val = Array.isArray(v) ? v.join(',') : v === undefined || v === null ? '' : String(v);
      return `${key}=${val}`;
    })
    .join('');
}

/**
 * Get query params from the request URL (raw query string) so we use exactly what
 * Shopify sent, including empty params. Express req.query can merge/alter in some setups.
 */
function getQueryFromRequest(req) {
  const url = req.originalUrl || req.url || '';
  const qIndex = url.indexOf('?');
  if (qIndex === -1) {
    return {};
  }
  const queryString = url.slice(qIndex + 1);
  return querystring.parse(queryString);
}

function verifyAppProxySignature(query) {
  const signature = query.signature;
  const rawSecret = process.env.SHOPIFY_API_SECRET;
  if (!signature || !rawSecret) {
    return false;
  }
  const secret = String(rawSecret).trim();

  const { signature: _signature, ...rest } = query;
  const message = buildSignatureMessage(rest);
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const digestBuffer = Buffer.from(digest, 'utf8');
  if (signatureBuffer.length !== digestBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
}

/**
 * Shared handler: serve storefront script (used for both /script.js and /script.js/script.js).
 * Shopify appends the path to the Proxy URL; if Partner Dashboard Proxy URL includes /script.js,
 * the request arrives as /api/proxy/script.js/script.js. We handle both so the script loads either way.
 */
async function serveScript(req, res) {
  const shop = req.query.shop || req.query.shop_domain;

  if (!shop) {
    return res.status(400).json({
      success: false,
      error: 'Invalid shop domain',
      hint: `Load the script via your store URL so Shopify adds the shop parameter, e.g. https://<store>.myshopify.com/apps/ripx/script.js?v=${SCRIPT_VERSION} — do not open this proxy URL directly.`,
    });
  }
  if (!isValidShopDomain(shop)) {
    return res.status(400).json({ success: false, error: 'Invalid shop domain', shop });
  }
  const normalizedShop = normalizeDomain(shop) || String(shop).trim().toLowerCase();

  const blockListMessage = await getBlockListMessage(normalizedShop);
  if (blockListMessage !== null) {
    return res.status(403).json({
      success: false,
      error: blockListMessage || 'Access blocked.',
    });
  }

  const maintenanceValue = await getMaintenanceMode();
  if (isMaintenanceActiveForDomain(normalizedShop, maintenanceValue)) {
    return res.status(503).json({
      success: false,
      error: ERROR_MESSAGES.MAINTENANCE,
      maintenance: true,
    });
  }

  const tenant = await getTenantByDomain(normalizedShop);
  if (tenant && isTenantSuspendedOrBlocked(tenant)) {
    return res.status(403).json({
      success: false,
      error: 'Access suspended. Contact support.',
    });
  }

  const hasSignature = Boolean(req.query.signature);
  const isProduction = process.env.NODE_ENV === 'production';
  const skipVerify = !isProduction && process.env.RIPX_APP_PROXY_SKIP_VERIFY === 'true';

  if (skipVerify) {
    logger.warn('App proxy signature verification skipped (RIPX_APP_PROXY_SKIP_VERIFY=true)', {
      shop: normalizedShop,
    });
  }

  if (!hasSignature) {
    if (isProduction) {
      return res.status(401).set('Content-Type', 'application/json').json({
        success: false,
        error: 'Unauthorized',
        hint: 'App proxy requests must include signature. Check Partner Dashboard App Proxy URL.',
      });
    }
    logger.warn('App proxy signature missing (dev only)', { shop: normalizedShop });
  } else if (!skipVerify) {
    const queryFromRaw = getQueryFromRequest(req);
    let verified = verifyAppProxySignature(queryFromRaw);
    if (!verified && Object.keys(req.query).length > 0) {
      verified = verifyAppProxySignature(req.query);
    }
    if (!verified) {
      const paramKeys = Object.keys(queryFromRaw)
        .filter(k => k !== 'signature')
        .sort();
      logger.warn('App proxy signature verification failed', {
        shop: normalizedShop,
        paramKeys,
        hint: 'Use Client secret from the same app that has the App Proxy. See docs/APP_PROXY_SIGNATURE_RESEARCH.md.',
      });
      return res.status(401).set('Content-Type', 'application/json').json({
        success: false,
        error: 'Unauthorized',
        hint: 'Signature invalid. Set SHOPIFY_API_SECRET to the Client secret of the app that has the App Proxy (Partner Dashboard → app → Client credentials). SHOPIFY_API_KEY must match that app’s Client ID.',
      });
    }
  }

  const [tests, goalMetricDefinitions] = await Promise.all([
    getActiveTestsForStorefront(normalizedShop),
    listGoalMetricDefinitions(normalizedShop).catch(() => []),
  ]);
  const runtimeConfig = buildStorefrontRuntimeConfig(
    normalizedShop,
    tests,
    req,
    goalMetricDefinitions
  );
  const scriptPath = getStorefrontScriptPath();

  let scriptContents;
  try {
    scriptContents = readStorefrontScriptSource(scriptPath);
  } catch (err) {
    logger.error('Storefront script file missing or unreadable', {
      path: scriptPath,
      shop: normalizedShop,
      error: err.message,
    });
    res.status(503).set('Content-Type', 'text/plain').send('Script temporarily unavailable.');
    return;
  }

  const versionLabel = req.query.v ? String(req.query.v) : SCRIPT_VERSION;

  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Script-Version', versionLabel);
  res.set('Cache-Control', getStorefrontScriptCacheControl());
  res.send(`window.AB_TEST_RUNTIME_CONFIG=${JSON.stringify(runtimeConfig)};\n${scriptContents}`);
}

router.get('/script.js', asyncHandler(serveScript));
// Double path when Partner Dashboard Proxy URL incorrectly includes /script.js
router.get('/script.js/script.js', asyncHandler(serveScript));

async function servePreviewBootstrap(req, res) {
  const validated = await validatePreviewBootstrapRequest(req, res, 'preview-bootstrap');
  if (!validated) {
    return;
  }
  const { normalizedShop, targetUrl } = validated;
  const previewScriptBust = Date.now();
  const appProxyScriptUrl =
    `https://${normalizedShop}/apps/ripx/script.js?v=${SCRIPT_VERSION}` +
    `&ripx_preview_bust=${previewScriptBust}`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RipX preview bootstrap</title>
  </head>
  <body>
    <p>Preparing RipX preview...</p>
    <noscript>
      <p>JavaScript is required to open a RipX preview.</p>
    </noscript>
    <script>
      (function () {
        var target = ${JSON.stringify(targetUrl)};
        var appProxyScriptUrl = ${JSON.stringify(appProxyScriptUrl)};
        var mounted = false;
        var redirected = false;
        var retryCount = 0;
        try {
          var retryParams = new URLSearchParams(window.location.search || '');
          retryCount = Number(retryParams.get('ripx_retry') || '0') || 0;
        } catch (_eRetry) {}
        function seedPreviewCtx() {
          try {
            var tu = new URL(target, window.location.origin);
            var previewCtx = {
              preview: tu.searchParams.get('ab_preview') === '1',
              testId: tu.searchParams.get('ab_preview_test') || null,
              variantId: tu.searchParams.get('ab_preview_variant') || null,
              variantName: tu.searchParams.get('ab_preview_variant_name') || null,
              tenantDomain: tu.searchParams.get('ab_preview_domain') || null,
              persistedAtMs: Date.now(),
            };
            if (previewCtx.preview || previewCtx.testId || previewCtx.variantId || previewCtx.variantName) {
              try {
                window.sessionStorage.setItem('__ripx_preview_ctx_v1__', JSON.stringify(previewCtx));
              } catch (_se) {}
              try {
                window.name = '__ripx_preview_ctx_v1__:' + JSON.stringify(previewCtx);
              } catch (_ne) {}
            }
          } catch (_seedErr) {}
        }
        function showFallback() {
          try {
            var body = document.body || document.documentElement;
            if (!body) return;
            body.innerHTML = '';
            var wrap = document.createElement('main');
            wrap.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:12vh auto;padding:24px;border:1px solid #ddd;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.08);';
            var title = document.createElement('h1');
            title.textContent = 'RipX preview needs another try';
            title.style.cssText = 'font-size:22px;margin:0 0 10px;';
            var text = document.createElement('p');
            text.textContent = 'The storefront page did not finish loading through the preview bootstrap. Your preview context was saved, so retrying usually restores the price test runtime.';
            text.style.cssText = 'line-height:1.5;color:#555;margin:0 0 18px;';
            var retry = document.createElement('button');
            retry.textContent = 'Retry preview';
            retry.style.cssText = 'padding:10px 14px;border:0;border-radius:9px;background:#111827;color:white;margin-right:10px;cursor:pointer;';
            retry.onclick = function () { window.location.reload(); };
            var open = document.createElement('button');
            open.textContent = 'Open product anyway';
            open.style.cssText = 'padding:10px 14px;border:1px solid #ccc;border-radius:9px;background:white;cursor:pointer;';
            open.onclick = function () { try { window.location.replace(target); } catch (_e) { window.location.href = target; } };
            wrap.appendChild(title);
            wrap.appendChild(text);
            wrap.appendChild(retry);
            wrap.appendChild(open);
            body.appendChild(wrap);
          } catch (_e) {}
        }
        function goHard() {
          if (redirected || mounted) return;
          redirected = true;
          seedPreviewCtx();
          if (retryCount < 2) {
            try {
              var selfUrl = new URL(window.location.href);
              selfUrl.searchParams.set('ripx_retry', String(retryCount + 1));
              window.location.replace(selfUrl.toString());
              return;
            } catch (_eSelf) {}
          }
          try {
            var targetUrl = new URL(target, window.location.origin);
            var isPreviewTarget =
              targetUrl.searchParams.get('ab_preview') === '1' ||
              !!targetUrl.searchParams.get('ab_preview_test') ||
              !!targetUrl.searchParams.get('ab_preview_variant');
            if (isPreviewTarget) return showFallback();
          } catch (_eCheck) {}
          try { window.location.replace(target); } catch (_e) { window.location.href = target; }
        }
        function injectScriptTag(htmlText) {
          var tags =
            '<script>(function(){' +
            'try{' +
              'window.__RIPX_BOOTSTRAP_OK__={' +
                'ok:true,' +
                'mountedAt:Date.now(),' +
                'href:String(window.location.href||""),' +
                'source:"preview-bootstrap"' +
              '};' +
            '}catch(_e){}' +
            '})();<' + '/script>' +
            '<script>(function(){' +
            'if(window.__RIPX_PREVIEW_NAV_GUARD__) return; window.__RIPX_PREVIEW_NAV_GUARD__=true;' +
            'function readCtx(){try{var raw=window.sessionStorage&&window.sessionStorage.getItem("__ripx_preview_ctx_v1__");return raw?JSON.parse(raw):null;}catch(_e){return null;}}' +
            'function withPreview(u){var ctx=readCtx();if(!ctx)return u;' +
              'if(ctx.preview===true||ctx.preview==="1") u.searchParams.set("ab_preview","1");' +
              'if(ctx.testId) u.searchParams.set("ab_preview_test",String(ctx.testId));' +
              'if(ctx.variantId) u.searchParams.set("ab_preview_variant",String(ctx.variantId));' +
              'if(ctx.variantName) u.searchParams.set("ab_preview_variant_name",String(ctx.variantName));' +
              'if(ctx.tenantDomain) u.searchParams.set("ab_preview_domain",String(ctx.tenantDomain));' +
              'return u;}' +
            'function toBootstrapHref(href){try{' +
              'var u=new URL(href,window.location.origin);' +
              'if(String(u.hostname||"").toLowerCase()!==String(window.location.hostname||"").toLowerCase()) return "";' +
              'var upath=String(u.pathname||"").toLowerCase();' +
              'if(upath.indexOf("/apps/ripx/preview-bootstrap")===0||upath.indexOf("/apps/ripx/preview-bootstrap-v2")===0) return "";' +
              'u=withPreview(u);' +
              'return "https://"+window.location.hostname+"/apps/ripx/preview-bootstrap-v2?url="+encodeURIComponent(u.toString());' +
            '}catch(_e){return "";}}' +
            'function isCartAddHref(href){try{var p=String(new URL(href,window.location.origin).pathname||"").toLowerCase().replace(/\\/+$/,"");return p.slice(-9)==="/cart/add"||p.slice(-12)==="/cart/add.js";}catch(_e){return false;}}' +
            'function setHidden(form,name,value){try{if(!form||!name||!value)return;var input=form.querySelector("input[name=\\""+name+"\\"]");if(!input){input=document.createElement("input");input.type="hidden";input.name=name;form.appendChild(input);}input.value=value;}catch(_e){}}' +
            'function toReturnToValue(href){try{var u=new URL(href,window.location.origin);if(String(u.hostname||"").toLowerCase()===String(window.location.hostname||"").toLowerCase())return u.pathname+u.search+u.hash;return href;}catch(_e){return href||"";}}' +
            'function getCurrentBootstrapReturnHref(){try{var u=new URL(window.location.href);var upath=String(u.pathname||"").toLowerCase();if(upath.indexOf("/apps/ripx/preview-bootstrap")===0||upath.indexOf("/apps/ripx/preview-bootstrap-v2")===0)return toReturnToValue(u.toString());var next=toBootstrapHref(u.toString());return next?toReturnToValue(next):"";}catch(_e){return "";}}' +
            'function preserveCartAddPreviewReturn(form){try{var next=getCurrentBootstrapReturnHref();if(next)setHidden(form,"return_to",next);}catch(_e){}}' +
            'function submitCartAddForm(form){try{if(!form)return;preserveCartAddPreviewReturn(form);var action=form.action||"/cart/add";var fd=new FormData(form);fetch(action,{method:"POST",body:fd,credentials:"same-origin",headers:{"Accept":"application/javascript","X-Requested-With":"XMLHttpRequest"}}).then(function(){setTimeout(function(){try{window.location.replace(window.location.href);}catch(_e){window.location.href=window.location.href;}},150);}).catch(function(){try{window.location.replace(getCurrentBootstrapReturnHref()||window.location.href);}catch(_e){}});}catch(_e){try{window.location.replace(getCurrentBootstrapReturnHref()||window.location.href);}catch(_e2){}}}' +
            'function installPreviewNavMethodGuards(){try{if(window.__RIPX_PREVIEW_NAV_METHOD_GUARDS__)return;window.__RIPX_PREVIEW_NAV_METHOD_GUARDS__=true;' +
              'var hp=history&&history.pushState;var hr=history&&history.replaceState;' +
              'function wrapHistory(fn){return function(state,title,url){try{if(url){var next=toBootstrapHref(url);if(next)url=next;}}catch(_e){}return fn.apply(this,[state,title,url]);};}' +
              'if(hp)history.pushState=wrapHistory(hp);if(hr)history.replaceState=wrapHistory(hr);' +
              'try{var fp=HTMLFormElement&&HTMLFormElement.prototype;if(fp&&fp.submit){var fs=fp.submit;fp.submit=function(){try{if(isCartAddHref(this.action||window.location.href)){submitCartAddForm(this);return;}}catch(_e){}return fs.apply(this,arguments);};}if(fp&&fp.requestSubmit){var frs=fp.requestSubmit;fp.requestSubmit=function(){try{if(isCartAddHref(this.action||window.location.href)){submitCartAddForm(this);return;}}catch(_e){}return frs.apply(this,arguments);};}}catch(_eForm){}' +
              'try{var la=window.location&&window.location.assign&&window.location.assign.bind(window.location);if(la)window.location.assign=function(href){var next=toBootstrapHref(href);return la(next||href);};}catch(_eAssign){}' +
              'try{var lr=window.location&&window.location.replace&&window.location.replace.bind(window.location);if(lr)window.location.replace=function(href){var next=toBootstrapHref(href);return lr(next||href);};}catch(_eReplace){}' +
            '}catch(_e){}}' +
            'installPreviewNavMethodGuards();' +
            'document.addEventListener("click",function(e){try{' +
              'if(!e||e.defaultPrevented) return;' +
              'if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;' +
              'var t=e.target; if(!t||!t.closest) return; var a=t.closest("a[href]"); if(!a) return;' +
              'var target=(a.getAttribute("target")||"").toLowerCase(); if(target&&target!=="_self") return;' +
              'var next=toBootstrapHref(a.href); if(!next) return;' +
              'e.preventDefault(); window.location.assign(next);' +
            '}catch(_e){}} , true);' +
            'document.addEventListener("submit",function(e){try{' +
              'if(!e||e.defaultPrevented) return;' +
              'var f=e.target; if(!f||!f.action) return;' +
              'if(isCartAddHref(f.action||window.location.href)){e.preventDefault();submitCartAddForm(f);return;}' +
              'var next=toBootstrapHref(f.action||window.location.href); if(!next) return;' +
              'e.preventDefault(); window.location.assign(next);' +
            '}catch(_e){}} , true);' +
            'setInterval(function(){try{' +
              'var ctx=readCtx(); if(!ctx||!(ctx.preview||ctx.testId||ctx.variantId||ctx.variantName)) return;' +
              'if(window.RipX&&window.RipX.version) return;' +
              'var path=String(window.location.pathname||"").toLowerCase();' +
              'if(path.indexOf("/apps/ripx/preview-bootstrap")===0||path.indexOf("/apps/ripx/preview-bootstrap-v2")===0) return;' +
              'var next=toBootstrapHref(window.location.href); if(!next) return;' +
              'window.location.replace(next);' +
            '}catch(_e){}} , 1500);' +
            '})();<' + '/script>' +
            '<script>(function(){' +
            'var attempts=0;' +
            'var appSrc=' + JSON.stringify(appProxyScriptUrl) + ';' +
            'function hasBootstrap(){return !!(window.__RIPX_BOOTSTRAP_OK__&&window.__RIPX_BOOTSTRAP_OK__.ok);}' +
            'function hasRipx(){return !!(window.RipX&&window.RipX.version);}' +
            'function injectOnce(src){' +
              'if(!src) return;' +
              'try{' +
                'var exists=Array.prototype.slice.call(document.scripts||[]).some(function(s){return s&&s.src&&s.src.indexOf(src)===0;});' +
                'if(exists) return;' +
              '}catch(_e){}' +
              'var t=document.createElement("script");' +
              't.src=src;' +
              't.async=false;' +
              '(document.head||document.documentElement||document.body).appendChild(t);' +
            '}' +
            'function ensure(){' +
              'if(hasRipx()) {' +
                'try{' +
                  'window.__RIPX_BOOTSTRAP_OK__=window.__RIPX_BOOTSTRAP_OK__||{};' +
                  'window.__RIPX_BOOTSTRAP_OK__.runtimeReadyAt=Date.now();' +
                '}catch(_eReady){}' +
                'return;' +
              '}' +
              'attempts+=1;' +
              'injectOnce(appSrc);' +
              'if(!hasRipx()&&attempts<20){setTimeout(ensure,1000);}' +
              'else if(!hasRipx()&&hasBootstrap()){' +
                'try{' +
                  'window.__RIPX_BOOTSTRAP_OK__=window.__RIPX_BOOTSTRAP_OK__||{};' +
                  'window.__RIPX_BOOTSTRAP_OK__.runtimeMissingAt=Date.now();' +
                '}catch(_eMiss){}' +
              '}' +
            '}' +
            'ensure();' +
            '})();<' + '/script>';
          try {
            if (typeof DOMParser !== 'undefined') {
              var parser = new DOMParser();
              var doc = parser.parseFromString(htmlText, 'text/html');
              try {
                Array.prototype.slice.call(doc.querySelectorAll('script')).forEach(function (scriptEl) {
                  if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
                });
              } catch (_stripScriptsErr) {}
              var headEl = doc && doc.head ? doc.head : null;
              if (!headEl && doc && doc.documentElement) {
                headEl = doc.createElement('head');
                doc.documentElement.insertBefore(headEl, doc.body || null);
              }
              if (headEl) {
                var holder = doc.createElement('div');
                holder.innerHTML = tags;
                var anchor = headEl.firstChild || null;
                while (holder.firstChild) headEl.insertBefore(holder.firstChild, anchor);
                return '<!doctype html>' + doc.documentElement.outerHTML;
              }
            }
          } catch (_domErr) {}
          htmlText = String(htmlText || '').replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, '');
          if (/<head[^>]*>/i.test(htmlText)) return htmlText.replace(/<head[^>]*>/i, '$&' + tags);
          if (/<\\/head>/i.test(htmlText)) return htmlText.replace(/<\\/head>/i, tags + '</head>');
          if (/<body[^>]*>/i.test(htmlText)) return htmlText.replace(/<body[^>]*>/i, '$&' + tags);
          return '<!doctype html><html><head>' + tags + '</head><body>' + htmlText + '</body></html>';
        }
        function mountPreviewDocument(htmlText) {
          var next = injectScriptTag(htmlText);
          if (typeof DOMParser === 'undefined' || !document.documentElement) {
            document.open();
            document.write(next);
            document.close();
            return;
          }
          var parser = new DOMParser();
          var parsed = parser.parseFromString(next, 'text/html');
          var scriptNodes = Array.prototype.slice.call(parsed.querySelectorAll('script'));
          scriptNodes.forEach(function (scriptEl) {
            if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
          });
          var importedRoot = document.importNode(parsed.documentElement, true);
          document.replaceChild(importedRoot, document.documentElement);
          var scriptTarget = document.head || document.body || document.documentElement;
          scriptNodes.forEach(function (scriptEl) {
            var nextScript = document.createElement('script');
            Array.prototype.slice.call(scriptEl.attributes || []).forEach(function (attr) {
              nextScript.setAttribute(attr.name, attr.value);
            });
            if (!nextScript.src) {
              nextScript.text = scriptEl.textContent || '';
            }
            scriptTarget.appendChild(nextScript);
          });
        }
        function mount(htmlText) {
          if (!htmlText || typeof htmlText !== 'string') return goHard();
          mounted = true;
          seedPreviewCtx();
          try {
            mountPreviewDocument(htmlText);
          } catch (_e) {
            goHard();
          }
        }
        seedPreviewCtx();
        fetch(target, { method: 'GET', credentials: 'include', redirect: 'follow' })
          .then(function (r) {
            if (!r || !r.ok) throw new Error('target_fetch_failed');
            return r.text();
          })
          .then(mount)
          .catch(goHard);
        setTimeout(goHard, 15000);
      })();
    </script>
  </body>
</html>`;
  res.set('Cache-Control', 'no-store');
  res.set(
    'Content-Security-Policy',
    "default-src 'self' https:; script-src 'self' https: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; base-uri 'none'"
  );
  return res.type('html').send(html);
}

async function validatePreviewBootstrapRequest(req, res, routeName) {
  const shop = req.query.shop || req.query.shop_domain;
  if (!shop) {
    res.status(400).type('text/plain').send('Missing shop domain');
    return null;
  }
  if (!isValidShopDomain(shop)) {
    res.status(400).type('text/plain').send('Invalid shop domain');
    return null;
  }
  const normalizedShop = normalizeDomain(shop) || String(shop).trim().toLowerCase();

  const blockListMessage = await getBlockListMessage(normalizedShop);
  if (blockListMessage !== null) {
    res
      .status(403)
      .type('text/plain')
      .send(blockListMessage || 'Access blocked.');
    return null;
  }

  const maintenanceValue = await getMaintenanceMode();
  if (isMaintenanceActiveForDomain(normalizedShop, maintenanceValue)) {
    res.status(503).type('text/plain').send(ERROR_MESSAGES.MAINTENANCE);
    return null;
  }

  const tenant = await getTenantByDomain(normalizedShop);
  if (tenant && isTenantSuspendedOrBlocked(tenant)) {
    res.status(403).type('text/plain').send('Access suspended. Contact support.');
    return null;
  }

  const hasSignature = Boolean(req.query.signature);
  const isProduction = process.env.NODE_ENV === 'production';
  const skipVerify = !isProduction && process.env.RIPX_APP_PROXY_SKIP_VERIFY === 'true';
  if (skipVerify) {
    logger.warn('App proxy signature verification skipped (RIPX_APP_PROXY_SKIP_VERIFY=true)', {
      shop: normalizedShop,
      route: routeName,
    });
  }
  if (!hasSignature && isProduction) {
    res.status(401).type('text/plain').send('Unauthorized');
    return null;
  }
  if (hasSignature && !skipVerify) {
    const queryFromRaw = getQueryFromRequest(req);
    let verified = verifyAppProxySignature(queryFromRaw);
    if (!verified && Object.keys(req.query).length > 0) {
      verified = verifyAppProxySignature(req.query);
    }
    if (!verified) {
      logger.warn(`App proxy signature verification failed (${routeName})`, {
        shop: normalizedShop,
      });
      res.status(401).type('text/plain').send('Unauthorized');
      return null;
    }
  }

  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl) {
    res.status(400).type('text/plain').send('Missing url parameter');
    return null;
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(rawUrl);
  } catch (_e) {
    res.status(400).type('text/plain').send('Invalid url parameter');
    return null;
  }
  if (parsedTarget.protocol !== 'https:' && parsedTarget.protocol !== 'http:') {
    res.status(400).type('text/plain').send('Invalid target protocol');
    return null;
  }
  if (
    String(parsedTarget.hostname || '')
      .trim()
      .toLowerCase() !== normalizedShop
  ) {
    res.status(400).type('text/plain').send('Target must match shop domain');
    return null;
  }

  // Guard against recursive bootstrap chaining.
  const targetPath = String(parsedTarget.pathname || '').toLowerCase();
  if (
    targetPath.indexOf('/apps/ripx/preview-bootstrap') === 0 ||
    targetPath.indexOf('/apps/ripx/preview-bootstrap-v2') === 0
  ) {
    res.status(400).type('text/plain').send('Invalid target path');
    return null;
  }

  return {
    normalizedShop,
    targetUrl: parsedTarget.toString(),
  };
}

async function servePreviewBootstrapLoader(req, res) {
  const validated = await validatePreviewBootstrapRequest(req, res, 'preview-bootstrap-loader');
  if (!validated) {
    return;
  }
  const { normalizedShop, targetUrl } = validated;
  const previewScriptBust = Date.now();
  const appProxyScriptUrl =
    `https://${normalizedShop}/apps/ripx/script.js?v=${SCRIPT_VERSION}` +
    `&ripx_preview_bust=${previewScriptBust}`;
  const js = `(function () {
  var target = ${JSON.stringify(targetUrl)};
  var appProxyScriptUrl = ${JSON.stringify(appProxyScriptUrl)};
  var redirected = false;
  var mounted = false;
  var fallbackTimer = null;
  var retryCount = 0;
  try {
    var retryParams = new URLSearchParams(window.location.search || '');
    retryCount = Number(retryParams.get('ripx_retry') || '0') || 0;
  } catch (_eRetry) {}
  function seedPreviewCtx() {
    try {
      var tu = new URL(target, window.location.origin);
      var previewCtx = {
        preview: tu.searchParams.get('ab_preview') === '1',
        testId: tu.searchParams.get('ab_preview_test') || null,
        variantId: tu.searchParams.get('ab_preview_variant') || null,
        variantName: tu.searchParams.get('ab_preview_variant_name') || null,
        tenantDomain: tu.searchParams.get('ab_preview_domain') || null,
        persistedAtMs: Date.now(),
      };
      if (previewCtx.preview || previewCtx.testId || previewCtx.variantId || previewCtx.variantName) {
        try {
          window.sessionStorage.setItem('__ripx_preview_ctx_v1__', JSON.stringify(previewCtx));
        } catch (_se) {}
        try {
          window.name = '__ripx_preview_ctx_v1__:' + JSON.stringify(previewCtx);
        } catch (_ne) {}
      }
    } catch (_seedErr) {}
  }
  function showFallback() {
    try {
      var body = document.body || document.documentElement;
      if (!body) return;
      body.innerHTML = '';
      var wrap = document.createElement('main');
      wrap.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:12vh auto;padding:24px;border:1px solid #ddd;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.08);';
      var title = document.createElement('h1');
      title.textContent = 'RipX preview needs another try';
      title.style.cssText = 'font-size:22px;margin:0 0 10px;';
      var text = document.createElement('p');
      text.textContent = 'The storefront page did not finish loading through the preview bootstrap. Your preview context was saved, so retrying usually restores the price test runtime.';
      text.style.cssText = 'line-height:1.5;color:#555;margin:0 0 18px;';
      var retry = document.createElement('button');
      retry.textContent = 'Retry preview';
      retry.style.cssText = 'padding:10px 14px;border:0;border-radius:9px;background:#111827;color:white;margin-right:10px;cursor:pointer;';
      retry.onclick = function () { window.location.reload(); };
      var open = document.createElement('button');
      open.textContent = 'Open product anyway';
      open.style.cssText = 'padding:10px 14px;border:1px solid #ccc;border-radius:9px;background:white;cursor:pointer;';
      open.onclick = function () { try { window.location.replace(target); } catch (_e) { window.location.href = target; } };
      wrap.appendChild(title);
      wrap.appendChild(text);
      wrap.appendChild(retry);
      wrap.appendChild(open);
      body.appendChild(wrap);
    } catch (_e) {}
  }
  function goHard() {
    if (redirected || mounted) return;
    redirected = true;
    seedPreviewCtx();
    if (retryCount < 2) {
      try {
        var selfUrl = new URL(window.location.href);
        selfUrl.searchParams.set('ripx_retry', String(retryCount + 1));
        window.location.replace(selfUrl.toString());
        return;
      } catch (_eSelf) {}
    }
    try {
      var targetUrl = new URL(target, window.location.origin);
      var isPreviewTarget =
        targetUrl.searchParams.get('ab_preview') === '1' ||
        !!targetUrl.searchParams.get('ab_preview_test') ||
        !!targetUrl.searchParams.get('ab_preview_variant');
      if (isPreviewTarget) return showFallback();
    } catch (_eCheck) {}
    try { window.location.replace(target); } catch (_e) { window.location.href = target; }
  }
  function armFallback(ms) {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(goHard, ms);
  }
  function injectScriptTag(html) {
    var tags =
      '<script>(function(){' +
      'try{' +
        'window.__RIPX_BOOTSTRAP_OK__={' +
          'ok:true,' +
          'mountedAt:Date.now(),' +
          'href:String(window.location.href||""),' +
          'source:"preview-bootstrap-loader"' +
        '};' +
      '}catch(_e){}' +
      '})();<' + '/script>' +
      '<script>(function(){' +
      'if(window.__RIPX_PREVIEW_NAV_GUARD__) return; window.__RIPX_PREVIEW_NAV_GUARD__=true;' +
      'function readCtx(){try{var raw=window.sessionStorage&&window.sessionStorage.getItem("__ripx_preview_ctx_v1__");return raw?JSON.parse(raw):null;}catch(_e){return null;}}' +
      'function withPreview(u){var ctx=readCtx();if(!ctx)return u;' +
        'if(ctx.preview===true||ctx.preview==="1") u.searchParams.set("ab_preview","1");' +
        'if(ctx.testId) u.searchParams.set("ab_preview_test",String(ctx.testId));' +
        'if(ctx.variantId) u.searchParams.set("ab_preview_variant",String(ctx.variantId));' +
        'if(ctx.variantName) u.searchParams.set("ab_preview_variant_name",String(ctx.variantName));' +
        'if(ctx.tenantDomain) u.searchParams.set("ab_preview_domain",String(ctx.tenantDomain));' +
        'return u;}' +
      'function toBootstrapHref(href){try{' +
        'var u=new URL(href,window.location.origin);' +
        'if(String(u.hostname||"").toLowerCase()!==String(window.location.hostname||"").toLowerCase()) return "";' +
        'var upath=String(u.pathname||"").toLowerCase();' +
        'if(upath.indexOf("/apps/ripx/preview-bootstrap")===0||upath.indexOf("/apps/ripx/preview-bootstrap-v2")===0) return "";' +
        'u=withPreview(u);' +
        'return "https://"+window.location.hostname+"/apps/ripx/preview-bootstrap-v2?url="+encodeURIComponent(u.toString());' +
      '}catch(_e){return "";}}' +
      'function isCartAddHref(href){try{var p=String(new URL(href,window.location.origin).pathname||"").toLowerCase().replace(/\\/+$/,"");return p.slice(-9)==="/cart/add"||p.slice(-12)==="/cart/add.js";}catch(_e){return false;}}' +
      'function setHidden(form,name,value){try{if(!form||!name||!value)return;var input=form.querySelector("input[name=\\""+name+"\\"]");if(!input){input=document.createElement("input");input.type="hidden";input.name=name;form.appendChild(input);}input.value=value;}catch(_e){}}' +
      'function toReturnToValue(href){try{var u=new URL(href,window.location.origin);if(String(u.hostname||"").toLowerCase()===String(window.location.hostname||"").toLowerCase())return u.pathname+u.search+u.hash;return href;}catch(_e){return href||"";}}' +
      'function getCurrentBootstrapReturnHref(){try{var u=new URL(window.location.href);var upath=String(u.pathname||"").toLowerCase();if(upath.indexOf("/apps/ripx/preview-bootstrap")===0||upath.indexOf("/apps/ripx/preview-bootstrap-v2")===0)return toReturnToValue(u.toString());var next=toBootstrapHref(u.toString());return next?toReturnToValue(next):"";}catch(_e){return "";}}' +
      'function preserveCartAddPreviewReturn(form){try{var next=getCurrentBootstrapReturnHref();if(next)setHidden(form,"return_to",next);}catch(_e){}}' +
      'function submitCartAddForm(form){try{if(!form)return;preserveCartAddPreviewReturn(form);var action=form.action||"/cart/add";var fd=new FormData(form);fetch(action,{method:"POST",body:fd,credentials:"same-origin",headers:{"Accept":"application/javascript","X-Requested-With":"XMLHttpRequest"}}).then(function(){setTimeout(function(){try{window.location.replace(window.location.href);}catch(_e){window.location.href=window.location.href;}},150);}).catch(function(){try{window.location.replace(getCurrentBootstrapReturnHref()||window.location.href);}catch(_e){}});}catch(_e){try{window.location.replace(getCurrentBootstrapReturnHref()||window.location.href);}catch(_e2){}}}' +
      'function installPreviewNavMethodGuards(){try{if(window.__RIPX_PREVIEW_NAV_METHOD_GUARDS__)return;window.__RIPX_PREVIEW_NAV_METHOD_GUARDS__=true;' +
        'var hp=history&&history.pushState;var hr=history&&history.replaceState;' +
        'function wrapHistory(fn){return function(state,title,url){try{if(url){var next=toBootstrapHref(url);if(next)url=next;}}catch(_e){}return fn.apply(this,[state,title,url]);};}' +
        'if(hp)history.pushState=wrapHistory(hp);if(hr)history.replaceState=wrapHistory(hr);' +
        'try{var fp=HTMLFormElement&&HTMLFormElement.prototype;if(fp&&fp.submit){var fs=fp.submit;fp.submit=function(){try{if(isCartAddHref(this.action||window.location.href)){submitCartAddForm(this);return;}}catch(_e){}return fs.apply(this,arguments);};}if(fp&&fp.requestSubmit){var frs=fp.requestSubmit;fp.requestSubmit=function(){try{if(isCartAddHref(this.action||window.location.href)){submitCartAddForm(this);return;}}catch(_e){}return frs.apply(this,arguments);};}}catch(_eForm){}' +
        'try{var la=window.location&&window.location.assign&&window.location.assign.bind(window.location);if(la)window.location.assign=function(href){var next=toBootstrapHref(href);return la(next||href);};}catch(_eAssign){}' +
        'try{var lr=window.location&&window.location.replace&&window.location.replace.bind(window.location);if(lr)window.location.replace=function(href){var next=toBootstrapHref(href);return lr(next||href);};}catch(_eReplace){}' +
      '}catch(_e){}}' +
      'installPreviewNavMethodGuards();' +
      'document.addEventListener("click",function(e){try{' +
        'if(!e||e.defaultPrevented) return;' +
        'if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;' +
        'var t=e.target; if(!t||!t.closest) return; var a=t.closest("a[href]"); if(!a) return;' +
        'var target=(a.getAttribute("target")||"").toLowerCase(); if(target&&target!=="_self") return;' +
        'var next=toBootstrapHref(a.href); if(!next) return;' +
        'e.preventDefault(); window.location.assign(next);' +
      '}catch(_e){}} , true);' +
      'document.addEventListener("submit",function(e){try{' +
        'if(!e||e.defaultPrevented) return;' +
        'var f=e.target; if(!f||!f.action) return;' +
        'if(isCartAddHref(f.action||window.location.href)){e.preventDefault();submitCartAddForm(f);return;}' +
        'var next=toBootstrapHref(f.action||window.location.href); if(!next) return;' +
        'e.preventDefault(); window.location.assign(next);' +
      '}catch(_e){}} , true);' +
      'setInterval(function(){try{' +
        'var ctx=readCtx(); if(!ctx||!(ctx.preview||ctx.testId||ctx.variantId||ctx.variantName)) return;' +
        'if(window.RipX&&window.RipX.version) return;' +
        'var path=String(window.location.pathname||"").toLowerCase();' +
        'if(path.indexOf("/apps/ripx/preview-bootstrap")===0||path.indexOf("/apps/ripx/preview-bootstrap-v2")===0) return;' +
        'var next=toBootstrapHref(window.location.href); if(!next) return;' +
        'window.location.replace(next);' +
      '}catch(_e){}} , 1500);' +
      '})();<' + '/script>' +
      '<script>(function(){' +
      'var attempts=0;' +
      'var appSrc=' + JSON.stringify(appProxyScriptUrl) + ';' +
      'function hasBootstrap(){return !!(window.__RIPX_BOOTSTRAP_OK__&&window.__RIPX_BOOTSTRAP_OK__.ok);}' +
      'function hasRipx(){return !!(window.RipX&&window.RipX.version);}' +
      'function injectOnce(src){' +
        'if(!src) return;' +
        'try{' +
          'var exists=Array.prototype.slice.call(document.scripts||[]).some(function(s){return s&&s.src&&s.src.indexOf(src)===0;});' +
          'if(exists) return;' +
        '}catch(_e){}' +
        'var t=document.createElement("script");' +
        't.src=src;' +
        't.async=false;' +
        '(document.head||document.documentElement||document.body).appendChild(t);' +
      '}' +
      'function ensure(){' +
        'if(hasRipx()) {' +
          'try{' +
            'window.__RIPX_BOOTSTRAP_OK__=window.__RIPX_BOOTSTRAP_OK__||{};' +
            'window.__RIPX_BOOTSTRAP_OK__.runtimeReadyAt=Date.now();' +
          '}catch(_eReady){}' +
          'return;' +
        '}' +
        'attempts+=1;' +
        'injectOnce(appSrc);' +
        'if(!hasRipx()&&attempts<20){setTimeout(ensure,1000);}' +
        'else if(!hasRipx()&&hasBootstrap()){' +
          'try{' +
            'window.__RIPX_BOOTSTRAP_OK__=window.__RIPX_BOOTSTRAP_OK__||{};' +
            'window.__RIPX_BOOTSTRAP_OK__.runtimeMissingAt=Date.now();' +
          '}catch(_eMiss){}' +
        '}' +
      '}' +
      'ensure();' +
      '})();<' + '/script>';
    try {
      if (typeof DOMParser !== 'undefined') {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        try {
          Array.prototype.slice.call(doc.querySelectorAll('script')).forEach(function (scriptEl) {
            if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
          });
        } catch (_stripScriptsErr) {}
        var headEl = doc && doc.head ? doc.head : null;
        if (!headEl && doc && doc.documentElement) {
          headEl = doc.createElement('head');
          doc.documentElement.insertBefore(headEl, doc.body || null);
        }
        if (headEl) {
          var holder = doc.createElement('div');
          holder.innerHTML = tags;
          var anchor = headEl.firstChild || null;
          while (holder.firstChild) headEl.insertBefore(holder.firstChild, anchor);
          return '<!doctype html>' + doc.documentElement.outerHTML;
        }
      }
    } catch (_domErr) {}
    html = String(html || '').replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, '');
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, '$&' + tags);
    if (/<\\/head>/i.test(html)) return html.replace(/<\\/head>/i, tags + '</head>');
    if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, '$&' + tags);
    return '<!doctype html><html><head>' + tags + '</head><body>' + html + '</body></html>';
  }
  function mountPreviewDocument(html) {
    var next = injectScriptTag(html);
    if (typeof DOMParser === 'undefined' || !document.documentElement) {
      document.open();
      document.write(next);
      document.close();
      return;
    }
    var parser = new DOMParser();
    var parsed = parser.parseFromString(next, 'text/html');
    var scriptNodes = Array.prototype.slice.call(parsed.querySelectorAll('script'));
    scriptNodes.forEach(function (scriptEl) {
      if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
    });
    var importedRoot = document.importNode(parsed.documentElement, true);
    document.replaceChild(importedRoot, document.documentElement);
    var scriptTarget = document.head || document.body || document.documentElement;
    scriptNodes.forEach(function (scriptEl) {
      var nextScript = document.createElement('script');
      Array.prototype.slice.call(scriptEl.attributes || []).forEach(function (attr) {
        nextScript.setAttribute(attr.name, attr.value);
      });
      if (!nextScript.src) {
        nextScript.text = scriptEl.textContent || '';
      }
      scriptTarget.appendChild(nextScript);
    });
  }
  function mount(html) {
    if (!html || typeof html !== 'string') return goHard();
    mounted = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    seedPreviewCtx();
    try {
      mountPreviewDocument(html);
    } catch (_e) {
      goHard();
    }
  }
  seedPreviewCtx();
  fetch(target, { method: 'GET', credentials: 'include', redirect: 'follow' })
    .then(function (r) {
      if (!r || !r.ok) throw new Error('target_fetch_failed');
      return r.text();
    })
    .then(mount)
    .catch(goHard);
  // Keep fallback generous; fetching full storefront HTML can exceed a few seconds.
  armFallback(15000);
})();`;
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  return res.send(js);
}

router.get('/preview-bootstrap', asyncHandler(servePreviewBootstrap));
router.get('/preview-bootstrap-v2', asyncHandler(servePreviewBootstrap));
router.get('/preview-bootstrap/preview-bootstrap', asyncHandler(servePreviewBootstrap));
router.get('/preview-bootstrap-v2/preview-bootstrap-v2', asyncHandler(servePreviewBootstrap));
// App proxy base sometimes includes /script.js; Shopify then rewrites to /script.js/preview-bootstrap.
router.get('/script.js/preview-bootstrap', asyncHandler(servePreviewBootstrap));
router.get('/script.js/preview-bootstrap-v2', asyncHandler(servePreviewBootstrap));
router.get('/script.js/script.js/preview-bootstrap', asyncHandler(servePreviewBootstrap));
router.get('/script.js/script.js/preview-bootstrap-v2', asyncHandler(servePreviewBootstrap));
router.get('/price-preview-bootstrap-v1', asyncHandler(servePricePreviewBootstrap));
router.get('/script.js/price-preview-bootstrap-v1', asyncHandler(servePricePreviewBootstrap));
router.get(
  '/script.js/script.js/price-preview-bootstrap-v1',
  asyncHandler(servePricePreviewBootstrap)
);
router.get('/preview-bootstrap-loader.js', asyncHandler(servePreviewBootstrapLoader));
router.get('/preview-bootstrap-v2-loader.js', asyncHandler(servePreviewBootstrapLoader));
router.get('/script.js/preview-bootstrap-loader.js', asyncHandler(servePreviewBootstrapLoader));
router.get('/script.js/preview-bootstrap-v2-loader.js', asyncHandler(servePreviewBootstrapLoader));
router.get(
  '/script.js/script.js/preview-bootstrap-loader.js',
  asyncHandler(servePreviewBootstrapLoader)
);
router.get(
  '/script.js/script.js/preview-bootstrap-v2-loader.js',
  asyncHandler(servePreviewBootstrapLoader)
);

module.exports = router;
