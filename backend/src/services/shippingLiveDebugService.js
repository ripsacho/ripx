const {
  buildShippingPreviewDebugChecklist,
  summarizeStoredCarrierCallbacks,
  isLocalOrPrivateUrl,
} = require('./shippingPreviewDebugService');
const {
  fetchCarrierServicesViaAdmin,
  compareShippingCarrierCallbackUrls,
  buildShippingCarrierCallbackUrl,
} = require('./shippingAutoExecutionService');
const { shouldReplaceExistingRates } = require('./shippingExecutionPlanner');

function resolveShippingCarrierCallbackBaseUrl() {
  const explicit = String(process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL || '').trim();
  if (explicit) {
    return explicit;
  }
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!appUrl) {
    return '';
  }
  return `${appUrl}/api/track/shipping-carrier-rates`;
}

function getShippingConfigRevision(test = {}, variant = {}) {
  const config = variant?.config && typeof variant.config === 'object' ? variant.config : {};
  const metadata = config.metadata && typeof config.metadata === 'object' ? config.metadata : {};
  return String(
    metadata.shipping_config_revision ||
      metadata.shippingConfigRevision ||
      test?.updated_at ||
      test?.updatedAt ||
      ''
  ).trim();
}

function resolveUrlHost(url) {
  try {
    return new URL(String(url || '').trim()).host;
  } catch {
    return '';
  }
}

function resolveShippingDiagnosticsUrls() {
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const carrierCallbackUrl =
    String(process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL || '').trim() ||
    (appUrl ? `${appUrl}/api/track/shipping-carrier-rates` : '');
  return {
    app_url: appUrl || null,
    carrier_callback_url: carrierCallbackUrl || null,
    carrier_callback_host: resolveUrlHost(carrierCallbackUrl) || null,
  };
}

function summarizeLiveCarrierServices(services = [], expectedCallbackUrl = '') {
  const list = Array.isArray(services) ? services : [];
  return list
    .filter(service => {
      const name = String(service?.name || '')
        .trim()
        .toLowerCase();
      return name.startsWith('ripx shipping rate');
    })
    .map(service => {
      const callback = String(service?.callback_url || '').trim();
      return {
        id: service?.id ? String(service.id) : null,
        name: service?.name || null,
        active: service?.active !== false,
        callback_host: resolveUrlHost(callback) || null,
        callback_matches: expectedCallbackUrl
          ? compareShippingCarrierCallbackUrls(expectedCallbackUrl, callback)
          : null,
        callback_url: callback || null,
      };
    });
}

function pickActiveTreatmentVariant(test = {}) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  return (
    variants.find(variant => {
      const strategy = String(variant?.config?.strategy || variant?.strategy || '')
        .trim()
        .toLowerCase();
      return strategy && strategy !== 'control';
    }) ||
    variants[1] ||
    variants[0] ||
    null
  );
}

function buildExpectedCarrierCallbackUrl(test, variant) {
  const baseUrl = resolveShippingCarrierCallbackBaseUrl();
  if (!baseUrl || !test || !variant) {
    return '';
  }
  return buildShippingCarrierCallbackUrl(baseUrl, test, {
    ...variant,
    index: (Array.isArray(test.variants) ? test.variants : []).findIndex(
      item => String(item?.id || item?.name || '') === String(variant?.id || variant?.name || '')
    ),
  });
}

async function probeCarrierCallback(callbackUrl, assignment = {}) {
  const candidate = ensureAssignmentProbeUrl(callbackUrl);
  if (!candidate) {
    return { ok: false, error: 'missing_callback_url' };
  }
  try {
    const response = await fetch(candidate, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        rate: {
          destination: { country: 'US' },
          items: [
            {
              properties: {
                _ripx_price_test: assignment.testId || null,
                _ripx_variant: assignment.variantName || null,
              },
            },
          ],
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    const rates = Array.isArray(payload?.rates) ? payload.rates : [];
    return {
      ok: response.ok,
      status: response.status,
      rates_count: rates.length,
      assignment_required: true,
      rates: rates.slice(0, 5).map(rate => ({
        service_name: rate?.service_name || null,
        description: rate?.description || '',
        service_code: rate?.service_code || null,
        total_price: rate?.total_price || null,
        currency: rate?.currency || null,
      })),
      error: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'probe_failed',
      rates_count: 0,
      rates: [],
    };
  }
}

function ensureAssignmentProbeUrl(callbackUrl) {
  const raw = String(callbackUrl || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('require_assignment')) {
      url.searchParams.set('require_assignment', '1');
    }
    return url.toString();
  } catch {
    return raw;
  }
}

async function buildShippingLiveDebugReport({
  test,
  shopDomain,
  accessToken,
  liveResourceChecks = [],
  readiness = {},
  carrierCallbackTrace = [],
} = {}) {
  const urls = resolveShippingDiagnosticsUrls();
  const treatmentVariant = pickActiveTreatmentVariant(test);
  const storedResources = treatmentVariant?.config?.metadata?.shipping_resources || [];
  const storedCarrierSummary = summarizeStoredCarrierCallbacks(
    storedResources,
    urls.carrier_callback_host
  );
  const expectedCallbackUrl = buildExpectedCarrierCallbackUrl(test, treatmentVariant);
  const liveCarrierServices = accessToken
    ? await fetchCarrierServicesViaAdmin(shopDomain, accessToken).catch(() => [])
    : [];
  const liveRipxCarriers = summarizeLiveCarrierServices(liveCarrierServices, expectedCallbackUrl);
  const latestTrace = Array.isArray(carrierCallbackTrace) ? carrierCallbackTrace[0] || null : null;
  const callbackProbe = expectedCallbackUrl
    ? await probeCarrierCallback(expectedCallbackUrl, {
        testId: test?.id || null,
        variantName: treatmentVariant?.name || treatmentVariant?.id || null,
      })
    : { ok: false, error: 'expected_callback_missing', rates_count: 0, rates: [] };

  const debugChecklist = buildShippingPreviewDebugChecklist({
    testId: test?.id || null,
    testStatus: test?.status || null,
    urls,
    readiness,
    liveResourceChecks,
    carrierCallbackTrace,
    storedShippingResources: storedResources,
  });

  const staleLiveCarriers = liveRipxCarriers.filter(item => item.callback_matches === false);
  const matchingLiveCarriers = liveRipxCarriers.filter(item => item.callback_matches === true);

  return {
    generated_at: new Date().toISOString(),
    test_id: test?.id || null,
    test_status: test?.status || null,
    shop_domain: shopDomain || null,
    treatment_variant: treatmentVariant
      ? {
          name: treatmentVariant.name || null,
          strategy: treatmentVariant.config?.strategy || null,
          amount: treatmentVariant.config?.amount ?? null,
          shipping_display_mode: treatmentVariant.config?.shipping_display_mode || null,
          delivery_method_names: treatmentVariant.config?.delivery_method_names || [],
          config_revision: getShippingConfigRevision(test, treatmentVariant) || null,
          checkout_display: treatmentVariant.config?.checkout_display || null,
          rates: treatmentVariant.config?.rates || [],
        }
      : null,
    environment: {
      app_url: urls.app_url,
      carrier_callback_url: urls.carrier_callback_url,
      carrier_callback_host: urls.carrier_callback_host,
      carrier_callback_public:
        Boolean(urls.carrier_callback_url) && !isLocalOrPrivateUrl(urls.carrier_callback_url),
    },
    stored_resources: {
      carrier_summary: storedCarrierSummary,
      carrier_services: storedResources.filter(item => item?.resource_type === 'carrier_service'),
      delivery_customizations: storedResources.filter(
        item => item?.resource_type === 'delivery_customization'
      ),
    },
    live_shopify: {
      ripx_carrier_services: liveRipxCarriers,
      matching_callback_count: matchingLiveCarriers.length,
      stale_callback_count: staleLiveCarriers.length,
      stale_callbacks: staleLiveCarriers,
    },
    expected_callback_url: expectedCallbackUrl || null,
    callback_probe: callbackProbe,
    latest_checkout_callback: latestTrace,
    debug_checklist: debugChecklist,
    storefront_checks: [
      {
        title: 'Storefront assignment',
        command: 'await window.RipX.debugShippingFlow()',
        expect: 'shippingAssignmentReady: true and cart.items[].assignedVariant set',
      },
      {
        title: 'Carrier trace (public)',
        command: `GET /api/track/shipping-carrier-rates/debug?test_id=${test?.id || ''}`,
        expect: 'Recent POST during checkout with assignment_matches: true and rates_count > 0',
      },
      {
        title: 'Checkout shipping step',
        command: 'Open checkout shipping step and watch dev server logs',
        expect: 'POST /api/track/shipping-carrier-rates then delivery customization function run',
      },
    ],
    likely_issues: [
      staleLiveCarriers.length > 0
        ? `Shopify still has ${staleLiveCarriers.length} RipX carrier service(s) on old tunnel host(s). Run Apply shipping.`
        : null,
      storedCarrierSummary.has_multiple_stored_carriers
        ? 'Multiple saved carrier resources exist for this variant. Apply shipping to prune stale services.'
        : null,
      !callbackProbe.ok
        ? `Carrier callback probe failed (${callbackProbe.error || 'unknown'}).`
        : null,
      callbackProbe.ok && callbackProbe.rates_count === 0
        ? 'Carrier callback responded but returned zero rates for an assigned cart probe. Re-apply shipping and confirm quote amount/name are set in Checkout offer.'
        : null,
      shouldReplaceExistingRates(treatmentVariant?.config || {}) &&
      callbackProbe.ok &&
      callbackProbe.rates_count === 0
        ? 'Replace mode is active but the carrier probe returned no replacement rate. Checkout may hide native methods and show nothing until this is fixed.'
        : null,
      latestTrace && latestTrace.assignment_matches === false
        ? 'Latest checkout callback saw cart assignment mismatch.'
        : null,
      treatmentVariant?.config?.rates?.some(
        rate =>
          String(rate?.name || '')
            .trim()
            .toLowerCase() === 'standard'
      )
        ? 'Replacement rate name matches native "Standard". Consider renaming to avoid checkout confusion.'
        : null,
    ].filter(Boolean),
  };
}

module.exports = {
  buildShippingLiveDebugReport,
  probeCarrierCallback,
  resolveShippingDiagnosticsUrls,
};
