/**
 * Checkout price test infrastructure diagnostics (operator / merchant QA).
 * Aligns URL derivation with scripts/write-ripx-checkout-config.js
 */

const {
  PRICE_RESOLVE_BATCH_MAX,
  PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES,
  PRICE_BATCH_SLOW_LOG_MS,
} = require('../constants');

function stripTrailingSlashes(s) {
  return String(s || '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * @returns {{ batchUrl: string, appUrl: string, usedExplicitBatchUrl: boolean }}
 */
function getConfiguredBatchResolveUrls() {
  const appUrl = stripTrailingSlashes(process.env.APP_URL || '');
  const explicit = stripTrailingSlashes(process.env.RIPX_PRICE_RESOLVE_BATCH_URL || '');
  let batchUrl = explicit;
  const usedExplicitBatchUrl = Boolean(explicit);
  if (!batchUrl && appUrl) {
    batchUrl = `${appUrl}/api/track/price-resolve-batch`;
  }
  return { batchUrl, appUrl, usedExplicitBatchUrl };
}

function parseUrlSafe(urlString) {
  try {
    return new URL(urlString);
  } catch {
    return null;
  }
}

/** Dev tunnels — hostnames change or are not suitable as production API bases for Shopify Functions. */
function isEphemeralTunnelHost(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }
  const h = hostname.toLowerCase();
  return (
    h.endsWith('.trycloudflare.com') ||
    h.endsWith('.ngrok-free.app') ||
    h.endsWith('.ngrok.io') ||
    h.endsWith('.ngrok.app') ||
    h.endsWith('.loca.lt')
  );
}

/**
 * Build diagnostics object (no I/O).
 * @param {object} [opts]
 * @param {string|null} [opts.shopDomain] — normalized tenant domain if known
 * @param {boolean} [opts.tenantRegistered]
 * @param {number} [opts.runningPriceTests]
 */
function buildCheckoutPriceDiagnostics(opts = {}) {
  const { batchUrl, appUrl, usedExplicitBatchUrl } = getConfiguredBatchResolveUrls();
  const checkoutSecret = (process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim();
  const secretRequired = Boolean(checkoutSecret);
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  const parsed = batchUrl ? parseUrlSafe(batchUrl) : null;
  const usesHttps = parsed ? parsed.protocol === 'https:' : false;
  const hostname = parsed ? parsed.hostname : '';

  /** @type {{ id: string, ok: boolean, severity: 'ok'|'warning'|'error', message: string }[]} */
  const checklist = [];

  const batchConfigured = Boolean(batchUrl);
  checklist.push({
    id: 'batch_url_configured',
    ok: batchConfigured,
    severity: batchConfigured ? 'ok' : 'error',
    message: batchConfigured
      ? 'Batch resolver URL is set (APP_URL or RIPX_PRICE_RESOLVE_BATCH_URL).'
      : 'Set APP_URL or RIPX_PRICE_RESOLVE_BATCH_URL so the Discount Function can reach your API.',
  });

  checklist.push({
    id: 'https_public_url',
    ok: !batchConfigured || usesHttps,
    severity: !batchConfigured || usesHttps ? 'ok' : isProduction ? 'error' : 'warning',
    message: usesHttps
      ? 'Batch URL uses HTTPS (required for Shopify to call your API).'
      : batchConfigured
        ? 'Batch URL should use https:// in production (Shopify Functions require a public HTTPS endpoint).'
        : 'N/A until batch URL is configured.',
  });

  if (hostname && isEphemeralTunnelHost(hostname)) {
    checklist.push({
      id: 'tunnel_stability',
      ok: !isProduction,
      severity: isProduction ? 'warning' : 'ok',
      message:
        'Batch URL host looks like a dev tunnel (Cloudflare/ngrok/etc.) — fine for dev; use a stable HTTPS domain in production so Shopify can reach your API reliably.',
    });
  }

  const secretOk = secretRequired || !isProduction;
  checklist.push({
    id: 'checkout_secret_consistency',
    ok: secretOk,
    severity: secretOk ? 'ok' : 'warning',
    message: secretRequired
      ? 'RIPX_CHECKOUT_PRICE_SECRET is set — extension ripxConfig and Discount Function requests must include the same secret.'
      : isProduction
        ? 'RIPX_CHECKOUT_PRICE_SECRET is unset in production — anyone who discovers your batch URL could call it; set a secret and sync the extension.'
        : 'RIPX_CHECKOUT_PRICE_SECRET is unset — OK for local dev; set in production.',
  });

  /** @type {string[]} */
  const recommendations = [];
  if (!batchConfigured) {
    recommendations.push(
      'Set APP_URL to your public API origin, then run: npm run shopify:checkout-discount:sync-config'
    );
  } else if (!usesHttps && isProduction) {
    recommendations.push('Serve RipX API over TLS and set APP_URL to https://...');
  }
  if (!secretRequired && isProduction) {
    recommendations.push(
      'Set RIPX_CHECKOUT_PRICE_SECRET and redeploy the checkout discount extension with sync-config.'
    );
  }
  recommendations.push(
    'Ensure Shopify Plus (or eligible plan) + Discount Function network access + an active automatic discount using the RipX function.'
  );
  recommendations.push(
    'Verify cart lines include RipX properties (_ripx_price_test, _ripx_variant, _ripx_shop) before checkout.'
  );
  recommendations.push(
    'Shopify Discount Function HTTP fetch: readTimeoutMs must be 100–2000ms; RipX extension uses 2000ms. Shopify may cache successful responses ~300s (and errors/429 ~30s) per store — brief staleness after you change a test is possible.'
  );
  recommendations.push(
    `Batch JSON responses larger than ~${Math.round(PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES / 1024)}KB are rejected with HTTP 413 so Shopify never hits a 502 for oversize bodies (Shopify ~100KB limit including headers). Lower PRICE_RESOLVE_BATCH_MAX if needed.`
  );
  recommendations.push(
    'Default batch API returns compact lines { line_id, applies, discountDecimal } (smaller payload). Set RIPX_PRICE_BATCH_FULL_RESPONSE=true if you need targetLineDecimal and reason per line for debugging.'
  );
  recommendations.push(
    'Checkout price secret is compared with a timing-safe check; use a long random value (e.g. openssl rand -hex 32). Server logs a warning when a batch request exceeds PRICE_BATCH_SLOW_LOG_MS (default 800ms) — tune DB/indexes if you see this under load.'
  );

  const { shopDomain = null, tenantRegistered = null, runningPriceTests = null } = opts;

  const anyNotOk = checklist.some(c => !c.ok);
  const anyErrorSeverity = checklist.some(c => !c.ok && c.severity === 'error');
  const overallStatus = anyErrorSeverity ? 'error' : anyNotOk ? 'warning' : 'ok';

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    summary: {
      overall_status: overallStatus,
      overall_ok: !anyNotOk,
      checks_passed: checklist.filter(c => c.ok).length,
      checks_total: checklist.length,
    },
    infrastructure: {
      app_url_configured: Boolean(appUrl),
      app_url_host: appUrl ? parseUrlSafe(appUrl)?.hostname || null : null,
      batch_resolve_url: batchUrl || null,
      batch_url_source: usedExplicitBatchUrl ? 'RIPX_PRICE_RESOLVE_BATCH_URL' : 'APP_URL',
      uses_https: usesHttps,
      checkout_price_secret_required: secretRequired,
      price_resolve_batch_max: PRICE_RESOLVE_BATCH_MAX,
      price_resolve_batch_response_max_bytes: PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES,
      batch_compact_response: process.env.RIPX_PRICE_BATCH_FULL_RESPONSE !== 'true',
      price_batch_slow_log_ms: PRICE_BATCH_SLOW_LOG_MS,
      node_env: nodeEnv,
    },
    checklist,
    recommendations,
    shop:
      shopDomain !== undefined && shopDomain !== null
        ? {
            domain: shopDomain,
            tenant_registered: tenantRegistered === true,
            running_price_tests: typeof runningPriceTests === 'number' ? runningPriceTests : null,
          }
        : null,
  };
}

module.exports = {
  getConfiguredBatchResolveUrls,
  buildCheckoutPriceDiagnostics,
  isEphemeralTunnelHost,
};
