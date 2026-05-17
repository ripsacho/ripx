/**
 * Live storefront App Proxy + theme embed probes (shared by routes and preflight).
 */

const { SCRIPT_VERSION } = require('../utils/storefrontScriptRuntime');
const {
  isLikelyShopifyPasswordPage,
  isLikelyRipXStorefrontScript,
  computeStorefrontRuntimeReady,
} = require('../utils/storefrontSetupProbe');

const STOREFRONT_PROBE_HEADERS = {
  Accept: '*/*',
  'User-Agent':
    'Mozilla/5.0 (compatible; RipX-Setup-Probe/1.0; +https://github.com/echologyx/ripx)',
};

async function checkAppProxyStatus(shopDomain) {
  const url = `https://${shopDomain}/apps/ripx/script.js?v=${SCRIPT_VERSION}`;
  const status = {
    url,
    ok: false,
    scriptDetected: false,
    passwordProtected: false,
    statusCode: null,
    contentType: null,
    finalUrl: null,
    note: null,
    error: null,
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: STOREFRONT_PROBE_HEADERS,
    });
    status.statusCode = response.status;
    status.contentType = response.headers.get('content-type');
    status.finalUrl = response.url || url;
    const body = await response.text();
    status.passwordProtected = isLikelyShopifyPasswordPage(body, status.finalUrl);
    status.scriptDetected = response.ok && isLikelyRipXStorefrontScript(body);
    status.ok = status.scriptDetected;
    if (status.passwordProtected && !status.scriptDetected) {
      status.note =
        'Your store uses a password page, so RipX could not verify the tracking script automatically. Remove the storefront password, or open /apps/ripx/script.js in a browser while logged into the store.';
    }
  } catch (error) {
    status.error = error.message;
  }

  return status;
}

function applyProxyEmbedFallback(embedStatus, proxyStatus) {
  if (embedStatus.detected || !proxyStatus?.scriptDetected) {
    if (embedStatus.passwordProtected && !embedStatus.detected && proxyStatus?.scriptDetected) {
      embedStatus.note =
        'Homepage is password-protected; theme HTML could not be scanned. App Proxy script is reachable.';
    }
    return embedStatus;
  }

  embedStatus.detected = true;
  embedStatus.via = 'app_proxy';
  embedStatus.confidence = embedStatus.passwordProtected ? 'medium' : 'high';
  embedStatus.note = embedStatus.passwordProtected
    ? 'RipX script is served via App Proxy. Enable the theme app embed in Online Store → Themes → Customize → App embeds for best coverage.'
    : 'RipX script is reachable via App Proxy.';
  return embedStatus;
}

async function checkEmbedStatus(shopDomain, proxyStatus = null) {
  const url = `https://${shopDomain}`;
  const status = {
    url,
    detected: false,
    via: null,
    confidence: 'low',
    passwordProtected: false,
    statusCode: null,
    note: null,
    error: null,
  };

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        ...STOREFRONT_PROBE_HEADERS,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      },
    });
    status.statusCode = response.status;
    const finalUrl = response.url || url;

    if (!response.ok) {
      return applyProxyEmbedFallback(status, proxyStatus);
    }

    const html = await response.text();
    status.passwordProtected = isLikelyShopifyPasswordPage(html, finalUrl);
    status.detected = String(html || '')
      .toLowerCase()
      .includes('/apps/ripx/script.js');
    if (status.detected) {
      status.via = 'theme_html';
      status.confidence = status.passwordProtected ? 'medium' : 'high';
    }
    return applyProxyEmbedFallback(status, proxyStatus);
  } catch (error) {
    status.error = error.message;
    return applyProxyEmbedFallback(status, proxyStatus);
  }
}

async function runStorefrontSetupProbe(shopDomain) {
  const normalized = String(shopDomain || '')
    .trim()
    .toLowerCase();
  const proxyStatus = await checkAppProxyStatus(normalized);
  const embedStatus = await checkEmbedStatus(normalized, proxyStatus);
  return {
    shopDomain: normalized,
    proxyStatus,
    embedStatus,
    storefrontRuntimeReady: computeStorefrontRuntimeReady(proxyStatus, embedStatus),
  };
}

function requiresStorefrontRuntimeForTest(test = {}) {
  const type = String(test?.type || '')
    .trim()
    .toLowerCase();
  return (
    type === 'price' ||
    type === 'pricing' ||
    type === 'offer' ||
    type === 'shipping' ||
    type === 'theme' ||
    type === 'content' ||
    type === 'url'
  );
}

module.exports = {
  checkAppProxyStatus,
  checkEmbedStatus,
  runStorefrontSetupProbe,
  requiresStorefrontRuntimeForTest,
};
