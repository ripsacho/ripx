/**
 * Checkout price test infrastructure diagnostics (operator / merchant QA).
 * Aligns URL derivation with scripts/write-ripx-checkout-config.js
 */

const fs = require('fs');
const path = require('path');

const {
  PRICE_RESOLVE_BATCH_MAX,
  PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES,
  PRICE_BATCH_SLOW_LOG_MS,
} = require('../constants');
const {
  shouldRequireSignedAssignment,
  getSignatureSecret,
} = require('../utils/priceAssignmentSignature');

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

/** Relative to repo root — documented for operators (see write-ripx-checkout-config.js). */
const RIPX_EXTENSION_CONFIG_RELATIVE_PATH = 'extensions/ripx-checkout-discount/src/ripxConfig.js';

/**
 * Read checkout discount extension config from repo layout (backend/src/services → repo root).
 * @returns {{ source: 'present', contents: string, absolutePath: string } | { source: 'missing', absolutePath: string } | { source: 'present', contents: string, readError: string, absolutePath: string }}
 */
function readRipxCheckoutExtensionConfigFile() {
  const absolutePath = path.join(__dirname, '../../../', RIPX_EXTENSION_CONFIG_RELATIVE_PATH);
  try {
    const contents = fs.readFileSync(absolutePath, 'utf8');
    return { source: 'present', contents, absolutePath };
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return { source: 'missing', absolutePath };
    }
    return { source: 'present', contents: '', readError: e.message || String(e), absolutePath };
  }
}

/**
 * @param {ReturnType<typeof readRipxCheckoutExtensionConfigFile>} readResult
 * @returns {{ source: 'omit'|'missing'|'present', contents?: string }}
 */
function extensionConfigInputFromReadResult(readResult) {
  if (!readResult) {
    return { source: 'omit' };
  }
  if (readResult.source === 'missing') {
    return { source: 'missing' };
  }
  return { source: 'present', contents: readResult.contents };
}

/**
 * Parse JS string literals used in export const values.
 * Supports both JSON style ("...") and single-quoted ('...') strings.
 * @param {string} rawLiteral
 * @returns {{ ok: true, value: string } | { ok: false }}
 */
function parseExportedStringLiteral(rawLiteral) {
  const literal = String(rawLiteral || '').trim();
  try {
    const parsed = JSON.parse(literal);
    if (typeof parsed === 'string') {
      return { ok: true, value: parsed };
    }
  } catch {
    // fall through
  }

  // Be lenient for hand-edited files using single quotes.
  if (/^'(?:\\.|[^'])*'$/.test(literal)) {
    const inner = literal.slice(1, -1);
    try {
      const normalized = inner.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\\'/g, "'");
      const parsed = JSON.parse(`"${normalized}"`);
      if (typeof parsed === 'string') {
        return { ok: true, value: parsed };
      }
    } catch {
      // fall through
    }
  }
  return { ok: false };
}

/**
 * Parse batch URL + secret from generated ripxConfig.js (ESM export const ... = JSON.stringify(...)).
 * @param {string} source
 * @returns {{ batchUrl: string, secret: string } | { error: string }}
 */
function parseRipxCheckoutExtensionConfig(source) {
  if (!source || typeof source !== 'string') {
    return { error: 'empty_source' };
  }
  const batchRe = /export\s+const\s+RIPX_PRICE_RESOLVE_BATCH_URL\s*=\s*([^;]+);/m;
  const secretRe = /export\s+const\s+RIPX_CHECKOUT_PRICE_SECRET\s*=\s*([^;]+);/m;
  const batchM = source.match(batchRe);
  const secretM = source.match(secretRe);
  if (!batchM) {
    return { error: 'missing_batch_export' };
  }
  let secret = '';
  const batchParsed = parseExportedStringLiteral(batchM[1]);
  if (!batchParsed.ok) {
    return { error: 'invalid_batch_literal' };
  }
  const batchUrl = batchParsed.value;
  if (typeof batchUrl !== 'string') {
    return { error: 'invalid_batch_value' };
  }
  // Empty string is valid: clone-safe default until sync-config runs
  if (secretM) {
    const secretParsed = parseExportedStringLiteral(secretM[1]);
    if (!secretParsed.ok) {
      return { error: 'invalid_secret_literal' };
    }
    secret = secretParsed.value;
  }
  return {
    batchUrl: stripTrailingSlashes(batchUrl.trim()),
    secret: secret.trim(),
  };
}

/**
 * @param {object} params
 * @param {string} params.envBatchUrl — from getConfiguredBatchResolveUrls
 * @param {string} params.envSecret — trimmed RIPX_CHECKOUT_PRICE_SECRET
 * @param {'omit'|'missing'|'present'} params.extensionSource
 * @param {string} [params.extensionContents] — file source when present
 */
function buildExtensionConfigDiagnostics(params) {
  const { envBatchUrl, envSecret, extensionSource, extensionContents } = params;
  const envSecretTrim = (envSecret || '').trim();
  const secretRequired = Boolean(envSecretTrim);
  const envNorm = envBatchUrl ? stripTrailingSlashes(String(envBatchUrl).trim()) : '';

  /** @type {Record<string, unknown>} */
  const infra = {
    extension_config_path: RIPX_EXTENSION_CONFIG_RELATIVE_PATH,
    extension_config_status: extensionSource,
  };

  if (extensionSource === 'omit') {
    return { infrastructurePatch: infra, checklist: [], recommendations: [] };
  }

  if (extensionSource === 'missing') {
    return {
      infrastructurePatch: infra,
      checklist: [
        {
          id: 'extension_config_file',
          ok: true,
          severity: 'ok',
          message: `Checkout extension config file not found (${RIPX_EXTENSION_CONFIG_RELATIVE_PATH}). Cannot verify drift vs .env; run npm run shopify:checkout-discount:sync-config after changing APP_URL or secrets.`,
        },
      ],
      recommendations: [
        `After changing APP_URL or RIPX_CHECKOUT_PRICE_SECRET, run: npm run shopify:checkout-discount:sync-config (writes ${RIPX_EXTENSION_CONFIG_RELATIVE_PATH}).`,
      ],
    };
  }

  const parsed = parseRipxCheckoutExtensionConfig(extensionContents || '');
  if ('error' in parsed) {
    return {
      infrastructurePatch: {
        ...infra,
        extension_config_parse_error: parsed.error,
      },
      checklist: [
        {
          id: 'extension_config_matches_env',
          ok: false,
          severity: 'warning',
          message: `Could not parse ${RIPX_EXTENSION_CONFIG_RELATIVE_PATH} (${parsed.error}). Re-run sync-config or fix the file.`,
        },
      ],
      recommendations: [],
    };
  }

  const extBatch = parsed.batchUrl;
  const extSecret = parsed.secret;
  const batchMatches = Boolean(envNorm) && extBatch === envNorm;
  const secretMatches = envSecretTrim === extSecret;

  const infraOut = {
    ...infra,
    extension_batch_url: extBatch,
    extension_secret_configured: Boolean(extSecret),
    extension_batch_url_matches_env: envNorm ? batchMatches : null,
    extension_secret_matches_env: secretRequired || Boolean(extSecret) ? secretMatches : null,
  };

  /** @type {{ level: 'error'|'warning', text: string }[]} */
  const issues = [];
  if (secretRequired && !secretMatches) {
    issues.push({
      level: 'error',
      text: `RIPX_CHECKOUT_PRICE_SECRET mismatch: server .env and ${RIPX_EXTENSION_CONFIG_RELATIVE_PATH} must match or batch calls return 403. Run npm run shopify:checkout-discount:sync-config.`,
    });
  } else if (!secretRequired && extSecret) {
    issues.push({
      level: 'warning',
      text: 'Extension ripxConfig.js sets a checkout secret but server .env does not — align .env and sync-config before deploy.',
    });
  }
  if (Boolean(envNorm) && !batchMatches) {
    issues.push({
      level: 'warning',
      text: `Batch URL drift: extension "${extBatch || '(empty)'}" vs server .env "${envNorm}". Run npm run shopify:checkout-discount:sync-config and redeploy the checkout discount extension.`,
    });
  } else if (!envNorm && extBatch) {
    issues.push({
      level: 'warning',
      text: 'Server .env has no batch URL but extension ripxConfig.js defines one — set APP_URL or RIPX_PRICE_RESOLVE_BATCH_URL.',
    });
  } else if (!envNorm && !extBatch) {
    issues.push({
      level: 'warning',
      text: 'Extension batch URL and server .env are both unset — set APP_URL (or RIPX_PRICE_RESOLVE_BATCH_URL), run npm run shopify:checkout-discount:sync-config, then rebuild the function.',
    });
  }

  const hasError = issues.some(i => i.level === 'error');
  const ok = issues.length === 0;
  const severity = hasError ? 'error' : ok ? 'ok' : 'warning';
  const message = ok
    ? `Extension ripxConfig.js matches server .env (batch URL${secretRequired || extSecret ? ' and checkout secret' : ''}).`
    : issues.map(i => i.text).join(' ');

  return {
    infrastructurePatch: infraOut,
    checklist: [
      {
        id: 'extension_config_matches_env',
        ok,
        severity,
        message,
      },
    ],
    recommendations: ok
      ? []
      : [
          'Drift fix: npm run shopify:checkout-discount:sync-config from repo root with the same .env as production, then rebuild/deploy extensions/ripx-checkout-discount.',
        ],
  };
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
 * @param {{ source: 'omit'|'missing'|'present', contents?: string }} [opts.extensionConfig] — R5 drift: compare ripxConfig.js to .env (callers read file)
 */
function buildCheckoutPriceDiagnostics(opts = {}) {
  const { batchUrl, appUrl, usedExplicitBatchUrl } = getConfiguredBatchResolveUrls();
  const checkoutSecret = (process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim();
  const secretRequired = Boolean(checkoutSecret);
  const assignmentSignatureRequired = shouldRequireSignedAssignment();
  const assignmentSignatureSecretConfigured = Boolean(getSignatureSecret());
  const assignmentSignatureOk = !assignmentSignatureRequired || assignmentSignatureSecretConfigured;
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
    id: 'assignment_signature_enforcement',
    ok: assignmentSignatureOk,
    severity: assignmentSignatureOk ? 'ok' : 'warning',
    message: assignmentSignatureRequired
      ? assignmentSignatureSecretConfigured
        ? 'Signed assignment verification is required and signature secret is configured.'
        : 'Signed assignment verification is required but no signature secret is configured (set RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET or RIPX_CHECKOUT_PRICE_SECRET).'
      : isProduction
        ? 'Signed assignment verification is explicitly disabled in production. Consider enabling it unless you are in migration mode.'
        : 'Signed assignment verification is optional in non-production.',
  });

  const EXPECTED_BATCH_PATH = '/api/track/price-resolve-batch';
  if (batchConfigured) {
    let batchPathOk = true;
    let batchPathSeverity = 'ok';
    let batchPathMessage = '';
    if (parsed) {
      const rawPath = (parsed.pathname || '').replace(/\/+$/, '') || '/';
      const pathOk = rawPath === EXPECTED_BATCH_PATH || rawPath.endsWith(EXPECTED_BATCH_PATH);
      if (pathOk) {
        batchPathMessage = `Batch URL path ends with ${EXPECTED_BATCH_PATH}.`;
      } else if (!usedExplicitBatchUrl) {
        batchPathOk = false;
        batchPathSeverity = 'error';
        batchPathMessage = `When using APP_URL alone, the batch URL must end with ${EXPECTED_BATCH_PATH}. Current path: "${rawPath}". Fix APP_URL (no extra path segments before /api).`;
      } else {
        batchPathOk = true;
        batchPathSeverity = 'warning';
        batchPathMessage = `Custom batch path "${rawPath}" (RIPX_PRICE_RESOLVE_BATCH_URL). Ensure it forwards POST to RipX ${EXPECTED_BATCH_PATH}.`;
      }
    } else {
      batchPathOk = false;
      batchPathSeverity = 'error';
      batchPathMessage = 'Batch URL is not a valid absolute URL.';
    }
    checklist.push({
      id: 'batch_path_matches_ripx_handler',
      ok: batchPathOk,
      severity: batchPathSeverity,
      message: batchPathMessage,
    });
  }

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
  if (assignmentSignatureRequired && !assignmentSignatureSecretConfigured) {
    recommendations.push(
      'Set RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET (or reuse RIPX_CHECKOUT_PRICE_SECRET) so strict assignment signature checks can validate cart line proofs.'
    );
  }
  if (isProduction && !assignmentSignatureRequired) {
    recommendations.push(
      'Enable RIPX_CHECKOUT_REQUIRE_SIGNED_ASSIGNMENT=true in production after rollout to prevent unsigned assignment spoofing.'
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

  const {
    shopDomain = null,
    tenantRegistered = null,
    runningPriceTests = null,
    extensionConfig,
  } = opts;

  /** @type {Record<string, unknown>} */
  let infrastructureExtension = {};
  if (extensionConfig && extensionConfig.source && extensionConfig.source !== 'omit') {
    const extDiag = buildExtensionConfigDiagnostics({
      envBatchUrl: batchUrl,
      envSecret: checkoutSecret,
      extensionSource: extensionConfig.source,
      extensionContents: extensionConfig.contents,
    });
    checklist.push(...extDiag.checklist);
    recommendations.push(...extDiag.recommendations);
    infrastructureExtension = extDiag.infrastructurePatch;
  }

  const anyNotOk = checklist.some(c => !c.ok);
  const anyErrorSeverity = checklist.some(c => !c.ok && c.severity === 'error');
  const overallStatus = anyErrorSeverity ? 'error' : anyNotOk ? 'warning' : 'ok';
  const checksWarning = checklist.filter(c => c.severity === 'warning').length;
  const checksError = checklist.filter(c => c.severity === 'error').length;
  const checkoutAlignmentReady = !anyNotOk;
  const cartRenderingLevel = 'theme_integration_recommended';
  const cartRenderingSummary =
    'Cart UI can vary by theme. Prefer native Shopify discount rendering (theme app block/snippets) and use JS price paint as fallback only.';

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    summary: {
      overall_status: overallStatus,
      overall_ok: !anyNotOk,
      checks_passed: checklist.filter(c => c.ok).length,
      checks_total: checklist.length,
      checks_warning: checksWarning,
      checks_error: checksError,
    },
    infrastructure: {
      app_url_configured: Boolean(appUrl),
      app_url_host: appUrl ? parseUrlSafe(appUrl)?.hostname || null : null,
      batch_resolve_url: batchUrl || null,
      batch_url_source: usedExplicitBatchUrl ? 'RIPX_PRICE_RESOLVE_BATCH_URL' : 'APP_URL',
      uses_https: usesHttps,
      checkout_price_secret_required: secretRequired,
      assignment_signature_required: assignmentSignatureRequired,
      assignment_signature_secret_configured: assignmentSignatureSecretConfigured,
      price_resolve_batch_max: PRICE_RESOLVE_BATCH_MAX,
      price_resolve_batch_response_max_bytes: PRICE_RESOLVE_BATCH_RESPONSE_MAX_BYTES,
      batch_compact_response: process.env.RIPX_PRICE_BATCH_FULL_RESPONSE !== 'true',
      price_batch_slow_log_ms: PRICE_BATCH_SLOW_LOG_MS,
      node_env: nodeEnv,
      ...infrastructureExtension,
    },
    support: {
      model: 'discount_function_truth',
      checkout_alignment: {
        level: checkoutAlignmentReady ? 'ready' : 'needs_attention',
        summary: checkoutAlignmentReady
          ? 'Checkout discount function infrastructure is configured and checks pass.'
          : 'Checkout alignment has failing or warning checks. Resolve checklist items before relying on charged-price parity.',
      },
      cart_rendering: {
        level: cartRenderingLevel,
        summary: cartRenderingSummary,
        native_markers: [
          'data-ripx-native-cart="1"',
          'data-ripx-native-cart-line="1"',
          'data-ripx-native-cart-block="1"',
        ],
      },
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
  parseRipxCheckoutExtensionConfig,
  buildExtensionConfigDiagnostics,
  readRipxCheckoutExtensionConfigFile,
  extensionConfigInputFromReadResult,
  RIPX_EXTENSION_CONFIG_RELATIVE_PATH,
};
