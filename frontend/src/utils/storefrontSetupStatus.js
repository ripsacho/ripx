/**
 * Interpret GET /api/shopify/setup/status for UI readiness checks.
 */

export function isStorefrontRuntimeReady(setupStatus) {
  if (!setupStatus || typeof setupStatus !== 'object') {
    return false;
  }
  if (setupStatus.storefrontRuntimeReady === true) {
    return true;
  }
  if (setupStatus.storefrontRuntimeReady === false) {
    return false;
  }
  const proxy = setupStatus.proxyStatus || {};
  const embed = setupStatus.embedStatus || {};
  const proxyReady = proxy.scriptDetected === true || proxy.ok === true;
  const embedReady = embed.detected === true;
  return Boolean(proxyReady && embedReady);
}

export function storefrontRuntimeReviewMessage(setupStatus) {
  if (!setupStatus) {
    return null;
  }
  const proxy = setupStatus.proxyStatus || {};
  const embed = setupStatus.embedStatus || {};
  if (proxy.scriptDetected !== true && proxy.ok !== true) {
    return 'App Proxy script is not reachable at /apps/ripx/script.js. Check Settings → Installation and your Shopify app proxy configuration.';
  }
  if (embed.detected !== true) {
    return 'Theme app embed was not detected. Enable RipX in Online Store → Themes → Customize → App embeds, then save the theme.';
  }
  if (embed.passwordProtected && embed.via === 'app_proxy') {
    return (
      embed.note ||
      'Storefront is password-protected; RipX confirmed the App Proxy script. Enable the theme embed for full page coverage.'
    );
  }
  return null;
}
