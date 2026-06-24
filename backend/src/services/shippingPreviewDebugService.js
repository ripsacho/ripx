function isLocalOrPrivateUrl(url) {
  const candidate = String(url || '').trim();
  if (!candidate) {
    return true;
  }
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) {
      return true;
    }
    if (/^10\./.test(host)) {
      return true;
    }
    if (/^192\.168\./.test(host)) {
      return true;
    }
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function resolveUrlHost(url) {
  try {
    return new URL(String(url || '').trim()).host;
  } catch {
    return null;
  }
}

function stepStatusFromBoolean(value, { unknownWhen = false } = {}) {
  if (unknownWhen) {
    return 'unknown';
  }
  return value ? 'pass' : 'fail';
}

function summarizeStoredCarrierCallbacks(storedShippingResources = [], expectedHost = null) {
  const resources = Array.isArray(storedShippingResources) ? storedShippingResources : [];
  const carrierResources = resources.filter(item =>
    String(item?.resource_type || item?.adapter || '').includes('carrier')
  );
  const hosts = carrierResources.map(item => resolveUrlHost(item?.callback_url)).filter(Boolean);
  const uniqueHosts = Array.from(new Set(hosts));
  const staleHosts = expectedHost ? uniqueHosts.filter(host => host !== expectedHost) : [];
  return {
    carrier_resource_count: carrierResources.length,
    unique_callback_hosts: uniqueHosts,
    stale_callback_hosts: staleHosts,
    has_stale_stored_callbacks: staleHosts.length > 0,
    has_multiple_stored_carriers: carrierResources.length > 1,
  };
}

function buildShippingPreviewDebugChecklist({
  testId = null,
  testStatus = null,
  urls = {},
  readiness = {},
  liveResourceChecks = [],
  carrierCallbackTrace = [],
  storedShippingResources = [],
} = {}) {
  const carrierCallbackUrl = String(urls.carrier_callback_url || '').trim();
  const resolveBatchUrl = String(urls.shipping_resolve_batch_url || '').trim();
  const latestCallback = Array.isArray(carrierCallbackTrace)
    ? carrierCallbackTrace[0] || null
    : null;
  const carrierCount = Number(readiness.live_carrier_services_found || 0);
  const pendingCarrierCount = Number(readiness.pending_carrier_services || 0);
  const staleCallbacks = Number(readiness.stale_carrier_callbacks || 0);
  const missingBindings = Number(readiness.missing_carrier_profile_bindings || 0);
  const callbackPublic = Boolean(carrierCallbackUrl) && !isLocalOrPrivateUrl(carrierCallbackUrl);
  const callbackHost = resolveUrlHost(carrierCallbackUrl);
  const resolveHost = resolveUrlHost(resolveBatchUrl);
  const hostsMatch = Boolean(callbackHost && resolveHost && callbackHost === resolveHost);

  const staleCheck = (Array.isArray(liveResourceChecks) ? liveResourceChecks : []).find(
    item => item?.live_resource?.callback_matches === false
  );
  const storedCarrierSummary = summarizeStoredCarrierCallbacks(
    storedShippingResources,
    callbackHost
  );
  const hasStoredStaleOnly = Boolean(
    storedCarrierSummary.has_stale_stored_callbacks && staleCallbacks === 0 && !staleCheck
  );

  const steps = [
    {
      id: 'test_running',
      title: 'Shipping test is running',
      status:
        String(testStatus || '')
          .trim()
          .toLowerCase() === 'running'
          ? 'pass'
          : String(testStatus || '')
                .trim()
                .toLowerCase() === 'stopped'
            ? 'warn'
            : 'unknown',
      detail:
        String(testStatus || '')
          .trim()
          .toLowerCase() === 'running'
          ? 'Test status is running.'
          : `Test status is ${testStatus || 'unknown'}. Preview can still work after Apply shipping, but stopped tests may have stale Shopify resources.`,
      fix: 'Start the test, then Save/Apply shipping again before checkout QA.',
      layer: 'shopify_resources',
    },
    {
      id: 'callback_url_configured',
      title: 'Carrier callback URL configured',
      status: stepStatusFromBoolean(Boolean(carrierCallbackUrl)),
      detail:
        carrierCallbackUrl || 'Missing RIPX_SHIPPING_CARRIER_CALLBACK_URL and APP_URL fallback.',
      fix: 'Set RIPX_SHIPPING_CARRIER_CALLBACK_URL or APP_URL in .env.',
      layer: 'environment',
    },
    {
      id: 'callback_url_public',
      title: 'Carrier callback is publicly reachable',
      status: !carrierCallbackUrl ? 'unknown' : callbackPublic ? 'pass' : 'fail',
      detail: callbackPublic
        ? carrierCallbackUrl
        : `Shopify cannot call ${carrierCallbackUrl || 'the callback URL'} from the internet.`,
      fix: 'Use a tunnel host: npm run dev:switch-tunnel -- https://YOUR-CURRENT.trycloudflare.com ripx-plus.myshopify.com',
      layer: 'environment',
    },
    {
      id: 'track_urls_consistent',
      title: 'Track URLs use the same host',
      status: !resolveBatchUrl || !carrierCallbackUrl ? 'warn' : hostsMatch ? 'pass' : 'fail',
      detail: hostsMatch
        ? `Carrier and resolve batch both use ${callbackHost}.`
        : `Carrier callback host (${callbackHost || 'missing'}) differs from resolve batch host (${resolveHost || 'missing'}).`,
      fix: 'Re-run dev:switch-tunnel so all RIPX_* track URLs share the current tunnel host.',
      layer: 'environment',
    },
    {
      id: 'carrier_service_live',
      title: 'CarrierService exists in Shopify',
      status:
        carrierCount > 0
          ? 'pass'
          : pendingCarrierCount > 0
            ? 'warn'
            : callbackPublic
              ? 'fail'
              : 'unknown',
      detail:
        carrierCount > 0
          ? `${carrierCount} live CarrierService resource(s) found.`
          : pendingCarrierCount > 0
            ? 'CarrierService is pending activation in Shopify.'
            : 'No live CarrierService is registered for this shipping revision.',
      fix: 'Click Save changes or Apply shipping to provision the CarrierService.',
      layer: 'shopify_resources',
    },
    {
      id: 'carrier_callback_synced',
      title: 'Shopify callback URL matches RipX config',
      status:
        carrierCount === 0
          ? 'unknown'
          : staleCallbacks > 0
            ? 'fail'
            : staleCheck
              ? 'fail'
              : hasStoredStaleOnly
                ? 'warn'
                : 'pass',
      detail:
        staleCallbacks > 0 || staleCheck
          ? `Shopify still has ${staleCheck?.live_resource?.callback_url || 'an older callback URL'}, but RipX expects ${staleCheck?.live_resource?.expected_callback_url || carrierCallbackUrl}.`
          : hasStoredStaleOnly
            ? `Saved shipping resources still reference old tunnel host(s): ${storedCarrierSummary.stale_callback_hosts.join(', ')}. Current host is ${callbackHost || 'unknown'}. Live callback is aligned; re-apply shipping to prune stale records.`
            : carrierCount > 0
              ? 'Live CarrierService callback URL matches the current RipX config.'
              : 'Apply shipping before checking callback sync.',
      fix: 'Run dev:switch-tunnel with the current host, restart dev, then Save changes / Apply shipping again.',
      layer: 'shopify_resources',
      stored_carrier_summary: storedCarrierSummary,
    },
    {
      id: 'carrier_profile_bound',
      title: 'CarrierService attached to a delivery profile zone',
      status: carrierCount === 0 ? 'unknown' : missingBindings === 0 ? 'pass' : 'fail',
      detail:
        carrierCount === 0
          ? 'No CarrierService to bind yet.'
          : missingBindings === 0
            ? 'CarrierService is bound to the selected profile/zone scope.'
            : `${missingBindings} variant scope binding(s) are missing in Shopify.`,
      fix: 'Open Shipping Variant Config, use Current Shopify setup → Use as scope, then Save changes.',
      layer: 'shopify_resources',
    },
    {
      id: 'shopify_callback_received',
      title: 'Shopify reached RipX during checkout',
      status:
        carrierCount === 0 ? 'unknown' : readiness.latest_carrier_callback_seen ? 'pass' : 'fail',
      detail: readiness.latest_carrier_callback_seen
        ? `Latest callback at ${readiness.latest_carrier_callback_at || latestCallback?.at || 'unknown time'}.`
        : 'No POST /api/track/shipping-carrier-rates recorded for this test in the current backend session.',
      fix: 'Open customer preview with a fresh cart, add a product, then go to checkout shipping step.',
      layer: 'checkout_runtime',
    },
  ];

  if (latestCallback) {
    steps.push({
      id: 'assignment_matched',
      title: 'Checkout cart assignment matched test variant',
      status:
        latestCallback.assignment_matches === true
          ? 'pass'
          : latestCallback.assignment_matches === false
            ? 'fail'
            : 'warn',
      detail:
        latestCallback.assignment_matches === true
          ? 'Carrier callback saw the expected _ripx_price_test / _ripx_variant markers.'
          : latestCallback.assignment_matches === false
            ? 'Carrier callback required assignment but cart line markers did not match this test variant.'
            : 'Assignment matching was not required for the latest callback.',
      fix: 'On storefront before checkout run window.RipX.debugShippingFlow() and confirm cart.items[].properties include _ripx_price_test and _ripx_variant.',
      layer: 'checkout_runtime',
      diagnostics: latestCallback.assignment_diagnostics || null,
    });
    steps.push({
      id: 'rates_returned',
      title: 'RipX returned replacement rates to Shopify',
      status: Number(latestCallback.rates_count || 0) > 0 ? 'pass' : 'fail',
      detail:
        Number(latestCallback.rates_count || 0) > 0
          ? `Returned ${latestCallback.rates_count} rate(s): ${(latestCallback.rates || [])
              .slice(0, 3)
              .map(rate => rate?.service_name || 'Unnamed rate')
              .join(', ')}.`
          : 'Carrier callback completed but returned zero rates.',
      fix: 'If assignment failed, fix cart handoff first. Otherwise review variant rate config and replacement mode rules.',
      layer: 'checkout_runtime',
      rates: latestCallback.rates || [],
    });
  }

  const primaryBlocker =
    steps.find(step => step.status === 'fail') ||
    steps.find(step => step.status === 'warn' && step.id === 'carrier_service_live') ||
    null;

  const passCount = steps.filter(step => step.status === 'pass').length;
  const failCount = steps.filter(step => step.status === 'fail').length;
  const overallStatus =
    failCount > 0 ? 'blocked' : passCount === steps.length ? 'live_ok' : 'warning';

  return {
    generated_at: new Date().toISOString(),
    test_id: testId || null,
    overall_status: overallStatus,
    summary: {
      pass_count: passCount,
      fail_count: failCount,
      step_count: steps.length,
    },
    primary_blocker: primaryBlocker
      ? {
          id: primaryBlocker.id,
          title: primaryBlocker.title,
          detail: primaryBlocker.detail,
          fix: primaryBlocker.fix || null,
          layer: primaryBlocker.layer || null,
        }
      : null,
    steps,
    storefront_manual_checks: [
      {
        id: 'fresh_preview_session',
        title: 'Use a fresh preview session',
        detail: 'Clear cart or reset preview session after rate/config changes.',
      },
      {
        id: 'storefront_assignment',
        title: 'Verify cart assignment on storefront',
        command: 'window.RipX.debugShippingFlow()',
        detail:
          'Run on product/cart page before checkout. cart.items[].properties must include _ripx_price_test and _ripx_variant.',
      },
      {
        id: 'checkout_handoff_trail',
        title: 'Confirm checkout handoff trail',
        detail:
          'debugShippingFlow().trail should include shipping_assignment_injected and checkout_handoff_* events.',
      },
    ],
    debug_endpoints: {
      carrier_callback_trace: testId
        ? `/api/track/shipping-carrier-rates/debug?test_id=${testId}`
        : '/api/track/shipping-carrier-rates/debug',
      shipping_diagnostics: testId ? `/api/tests/${testId}/shipping/diagnostics` : null,
    },
  };
}

module.exports = {
  buildShippingPreviewDebugChecklist,
  isLocalOrPrivateUrl,
  summarizeStoredCarrierCallbacks,
};
