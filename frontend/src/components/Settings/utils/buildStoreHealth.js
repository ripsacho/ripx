import { isStorefrontRuntimeReady } from '../../../utils/storefrontSetupStatus';

/**
 * Derive store setup health checks from installation + checkout diagnostics payloads.
 */
export function buildStoreHealth(installation, checkoutDiag) {
  const checks = [];
  const liveRuntimeReady = isStorefrontRuntimeReady(installation?.liveSetupStatus);
  const liveEmbedDetected = installation?.liveSetupStatus?.embedStatus?.detected === true;
  const proxyStatus = installation?.liveSetupStatus?.proxyStatus || {};
  const embedStatus = installation?.liveSetupStatus?.embedStatus || {};
  const liveProxyOk = proxyStatus.ok === true;
  const proxyScriptReachable = proxyStatus.scriptDetected === true;
  const storefrontPasswordGated = Boolean(
    proxyStatus.passwordProtected || embedStatus.passwordProtected
  );
  const scriptDetected = installation?.scriptVerified === true || liveRuntimeReady;
  const scriptVerifiedLive =
    (scriptDetected && liveProxyOk !== false) || (storefrontPasswordGated && !proxyScriptReachable);
  const scriptPasswordAdvisory = storefrontPasswordGated && !proxyScriptReachable;
  checks.push({
    key: 'script_detected',
    ok: scriptVerifiedLive,
    required: true,
    advisory: scriptPasswordAdvisory,
    message:
      scriptVerifiedLive && !scriptPasswordAdvisory
        ? liveEmbedDetected
          ? 'RipX app embed detected on the live theme.'
          : 'Storefront script detected on store theme.'
        : scriptPasswordAdvisory
          ? proxyStatus.note ||
            embedStatus.note ||
            'Storefront is password-protected; RipX could not verify App Proxy from the server. Disable the store password or open /apps/ripx/script.js in a browser while logged in to confirm.'
          : liveProxyOk === false
            ? 'RipX App Proxy script is not reachable from this storefront.'
            : 'RipX app embed/snippet is not detected. Enable the theme app embed before launching live storefront tests.',
  });

  const failedChecklist = Array.isArray(checkoutDiag?.checklist)
    ? checkoutDiag.checklist.filter(item => !item?.ok)
    : [];
  const blockingDiagChecklist = failedChecklist.filter(
    item => String(item?.severity || '').toLowerCase() === 'error'
  );
  const diagReady = blockingDiagChecklist.length === 0;
  const firstBlockingDiagMessage = blockingDiagChecklist[0]?.message || null;
  const firstAdvisoryDiagMessage = failedChecklist[0]?.message || null;
  checks.push({
    key: 'checkout_diag',
    ok: diagReady,
    required: true,
    advisory: failedChecklist.length > 0 && blockingDiagChecklist.length === 0,
    message: diagReady
      ? failedChecklist.length > 0
        ? `Checkout diagnostics has advisory item(s).${firstAdvisoryDiagMessage ? ` First: ${firstAdvisoryDiagMessage}` : ''}`
        : 'Checkout diagnostics passed.'
      : `Checkout diagnostics has blocking issue(s).${firstBlockingDiagMessage ? ` First: ${firstBlockingDiagMessage}` : ''}`,
  });

  const runningPriceTests =
    checkoutDiag?.shop?.running_price_tests === null ||
    checkoutDiag?.shop?.running_price_tests === undefined
      ? null
      : Number(checkoutDiag.shop.running_price_tests);
  const hasRunningPriceTest = runningPriceTests === null ? null : runningPriceTests > 0;
  checks.push({
    key: 'running_price_test',
    ok: hasRunningPriceTest === null ? false : hasRunningPriceTest,
    required: false,
    advisory: true,
    message:
      hasRunningPriceTest === null
        ? 'Running price-test count unavailable.'
        : hasRunningPriceTest
          ? `Running price tests found (${runningPriceTests}).`
          : 'No running price test found for this shop.',
  });

  const tenantRegistered =
    checkoutDiag?.shop?.tenant_registered === undefined ||
    checkoutDiag?.shop?.tenant_registered === null
      ? null
      : Boolean(checkoutDiag.shop.tenant_registered);
  checks.push({
    key: 'tenant_registered',
    ok: tenantRegistered === null ? false : tenantRegistered,
    required: true,
    message:
      tenantRegistered === null
        ? 'Tenant registration status unavailable.'
        : tenantRegistered
          ? 'Shop tenant is registered.'
          : 'Shop tenant is not registered for this backend.',
  });

  const cartNativeStatus = String(
    installation?.instructions?.cartNative?.status ||
      checkoutDiag?.support?.cart_rendering?.level ||
      ''
  )
    .trim()
    .toLowerCase();
  const cartNativeInstalled =
    cartNativeStatus === 'native_installed' ||
    cartNativeStatus === 'ready' ||
    cartNativeStatus === 'native_supported';
  checks.push({
    key: 'cart_native_rendering',
    ok: cartNativeInstalled,
    required: false,
    message: cartNativeInstalled
      ? 'Cart native discount rendering markers are configured.'
      : 'Cart native discount rendering is not confirmed (JS fallback may still be used on this theme).',
  });

  const requiredChecks = checks.filter(c => c.required !== false);
  const ready = requiredChecks.every(c => c.ok || c.advisory === true);
  const supportLevel = !ready
    ? 'setup_incomplete'
    : cartNativeInstalled
      ? 'native_cart_checkout_aligned'
      : 'checkout_aligned_cart_fallback';
  return {
    ready,
    checks,
    failed: requiredChecks.filter(c => !c.ok && c.advisory !== true),
    advisories: checks.filter(c => c.advisory === true || (c.required === false && !c.ok)),
    supportLevel,
  };
}
