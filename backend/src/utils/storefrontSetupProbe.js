/**
 * Helpers for live storefront App Proxy / theme embed probes.
 */

function isLikelyShopifyPasswordPage(html, responseUrl = '') {
  const lowerHtml = String(html || '').toLowerCase();
  const lowerUrl = String(responseUrl || '').toLowerCase();
  return (
    lowerUrl.includes('/password') ||
    lowerHtml.includes('name="form_type" value="storefront_password"') ||
    lowerHtml.includes("name='form_type' value='storefront_password'") ||
    lowerHtml.includes('this store is password protected') ||
    lowerHtml.includes('enter store password')
  );
}

function isLikelyRipXStorefrontScript(body) {
  const snippet = String(body || '').slice(0, 12000);
  if (!snippet) {
    return false;
  }
  return (
    snippet.includes('activeTests') ||
    snippet.includes('ABTestTracker') ||
    snippet.includes('[RipX]') ||
    /\bwindow\.RipX\b/.test(snippet) ||
    snippet.includes('data-ripx-af')
  );
}

function computeStorefrontRuntimeReady(proxyStatus, embedStatus) {
  const proxyReady =
    proxyStatus?.scriptDetected === true ||
    (proxyStatus?.ok === true && proxyStatus?.scriptDetected !== false);
  const embedReady = embedStatus?.detected === true;
  return Boolean(proxyReady && embedReady);
}

module.exports = {
  isLikelyShopifyPasswordPage,
  isLikelyRipXStorefrontScript,
  computeStorefrontRuntimeReady,
};
