#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Signed assignment migration readiness checker.
 *
 * Usage:
 *   node scripts/verify-price-assignment-readiness.js
 *   RIPX_VERIFY_SHOP=your-store.myshopify.com node scripts/verify-price-assignment-readiness.js
 *   node scripts/verify-price-assignment-readiness.js --json
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const jsonMode = process.argv.includes('--json');
const argShop = (process.argv.find(a => a.startsWith('--shop=')) || '').split('=')[1] || '';

function bool(v) {
  return !!v;
}

function isCheckoutSupportedPriceTargetType(targetType) {
  const tt = String(targetType || '')
    .toLowerCase()
    .trim();
  return tt === 'product' || tt === 'all-products' || tt === 'all_products';
}

function readSourceSafely(filePath) {
  try {
    return { ok: true, source: fs.readFileSync(filePath, 'utf8') };
  } catch (error) {
    return { ok: false, source: '', error: error?.message || String(error) };
  }
}

function getReadinessSeverity(flags) {
  if (flags.some(f => f.level === 'error')) return 'error';
  if (flags.some(f => f.level === 'warning')) return 'warning';
  return 'ok';
}

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getSyntheticProbeLineTotal() {
  const raw = toFiniteNumber(process.env.RIPX_ASSIGNMENT_PROBE_LINE_TOTAL);
  if (raw === null || raw <= 0) {
    return 100;
  }
  return Math.round(raw * 100) / 100;
}

function getSyntheticProbeQty() {
  const raw = Number.parseInt(String(process.env.RIPX_ASSIGNMENT_PROBE_QTY || '1').trim(), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function variantLooksLikeDiscountProbeCandidate(variant) {
  if (!variant || typeof variant !== 'object') return false;
  const cfg = variant.config;
  if (!cfg || typeof cfg !== 'object') return false;
  const mode = String(cfg.priceMode || 'fixed').toLowerCase();
  const priceBase = String(cfg.priceBase || 'price').toLowerCase();

  if (mode === 'fixed') {
    const fixed = toFiniteNumber(cfg.price);
    return fixed !== null && fixed >= 0 && fixed < 100;
  }
  if (mode === 'amount') {
    const delta = toFiniteNumber(cfg.priceDelta);
    return delta !== null && delta < 0 && priceBase !== 'compare_at';
  }
  if (mode === 'percent') {
    const pct = toFiniteNumber(cfg.pricePercent);
    return pct !== null && pct > 0 && priceBase !== 'compare_at';
  }
  return false;
}

function buildRolloutGates({ strictRequired, signatureSecretConfigured, flags, syntheticProbe }) {
  const storefrontOk = flags.some(
    f => f.key === 'storefront_signature_properties' && f.level === 'ok'
  );
  const extensionOk = flags.some(
    f => f.key === 'extension_signature_forwarding' && f.level === 'ok'
  );
  const syntheticOk =
    !syntheticProbe ||
    syntheticProbe.ok !== true ||
    flags.some(
      f =>
        f.key === 'synthetic_probe_signed_behavior' && (f.level === 'ok' || f.level === 'warning')
    );

  const gates = [
    {
      id: 'strict_required',
      pass: strictRequired,
      message: strictRequired
        ? 'Strict signed-assignment is required in target environment.'
        : 'Strict signed-assignment is not required in target environment.',
    },
    {
      id: 'signature_secret_configured',
      pass: signatureSecretConfigured,
      message: signatureSecretConfigured
        ? 'Signature secret is configured.'
        : 'Signature secret is missing.',
    },
    {
      id: 'storefront_and_extension_wired',
      pass: storefrontOk && extensionOk,
      message:
        storefrontOk && extensionOk
          ? 'Storefront + checkout extension signature wiring is present.'
          : 'Storefront and/or checkout extension signature wiring is missing.',
    },
    {
      id: 'synthetic_probe_result',
      pass: syntheticOk,
      message: syntheticOk
        ? 'Synthetic probe does not show signature-blocking regressions.'
        : 'Synthetic probe indicates signature-blocking issues.',
    },
  ];

  const allCriticalPass = gates
    .filter(g =>
      ['strict_required', 'signature_secret_configured', 'storefront_and_extension_wired'].includes(
        g.id
      )
    )
    .every(g => g.pass);

  return {
    gates,
    decision: allCriticalPass ? 'go' : 'no-go',
    reason: allCriticalPass
      ? 'Critical rollout gates passed.'
      : 'One or more critical rollout gates failed.',
  };
}

async function loadSyntheticProbe(shopDomain, probeLineTotal, probeQty) {
  const { query } = require('../backend/src/utils/database');
  const { getTestById } = require('../backend/src/models/test');
  const { normalizeDomain } = require('../backend/src/models/tenant');
  const {
    resolvePriceTestLineDiscount,
  } = require('../backend/src/services/priceTestCheckoutResolve');
  const { signPriceAssignment } = require('../backend/src/utils/priceAssignmentSignature');

  const domain = normalizeDomain(shopDomain);
  if (!domain) {
    return { ok: false, reason: 'invalid_shop_domain' };
  }

  const rowRes = await query(
    `SELECT id
     FROM tests
     WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
       AND LOWER(TRIM(type)) IN ('price', 'pricing')
       AND LOWER(TRIM(status)) = 'running'
     ORDER BY
       CASE
        WHEN LOWER(TRIM(target_type)) IN ('product', 'all-products', 'all_products') THEN 0
         ELSE 1
       END,
       updated_at DESC NULLS LAST,
       created_at DESC
     LIMIT 1`,
    [domain]
  );
  const testId = rowRes.rows?.[0]?.id;
  if (!testId) {
    return { ok: false, reason: 'no_running_price_test' };
  }
  const test = await getTestById(testId, domain);
  if (!test) {
    return { ok: false, reason: 'running_price_test_not_found', testId };
  }
  if (!isCheckoutSupportedPriceTargetType(test.target_type)) {
    return {
      ok: false,
      reason: 'no_running_checkout_supported_price_test',
      testId,
      targetType: test.target_type || null,
    };
  }

  const variants = Array.isArray(test.variants) ? test.variants : [];
  const candidateVariant =
    variants.find(variantLooksLikeDiscountProbeCandidate) ||
    variants.find(v => {
      if (!v || typeof v !== 'object') return false;
      const cfg = v.config;
      if (!cfg || typeof cfg !== 'object') return false;
      const mode = String(cfg.priceMode || 'fixed').toLowerCase();
      if (mode === 'fixed') return toFiniteNumber(cfg.price) !== null;
      if (mode === 'amount') return toFiniteNumber(cfg.priceDelta) !== null;
      if (mode === 'percent') return toFiniteNumber(cfg.pricePercent) !== null;
      return false;
    }) ||
    variants.find(v => v && (v.id || v.name));
  if (!candidateVariant) {
    return { ok: false, reason: 'no_variant_in_test', testId: test.id };
  }

  const targetIds = Array.isArray(test.target_ids)
    ? test.target_ids
    : test.target_id
      ? [test.target_id]
      : [];
  const productId = targetIds[0] || 'gid://shopify/Product/0';
  const assignmentVariantId =
    candidateVariant.id !== undefined && candidateVariant.id !== null
      ? String(candidateVariant.id)
      : String(candidateVariant.name);
  const userId = 'ripx-readiness-check-user';
  const issuedAtMs = Date.now();
  const signature = signPriceAssignment({
    testId: test.id,
    variantId: assignmentVariantId,
    userId,
    shopDomain: domain,
    issuedAtMs,
  });

  const unsigned = resolvePriceTestLineDiscount({
    test,
    assignmentVariantId,
    productId,
    variantId: null,
    linePresentmentTotal: probeLineTotal,
    quantity: probeQty,
    shopDomain: domain,
  });

  const signed = resolvePriceTestLineDiscount({
    test,
    assignmentVariantId,
    productId,
    variantId: null,
    linePresentmentTotal: probeLineTotal,
    quantity: probeQty,
    shopDomain: domain,
    assignmentSignature: signature || '',
    assignmentIssuedAtMs: String(issuedAtMs),
    assignmentUserId: userId,
  });

  return {
    ok: true,
    testId: test.id,
    selectedVariantName: candidateVariant?.name || null,
    selectedVariantPriceMode: candidateVariant?.config?.priceMode || null,
    assignmentVariantId,
    productId,
    probeLineTotal,
    probeQty,
    unsigned,
    signed,
  };
}

async function main() {
  const {
    buildCheckoutPriceDiagnostics,
  } = require('../backend/src/services/priceCheckoutDiagnostics');
  const {
    shouldRequireSignedAssignment,
    getSignatureSecret,
  } = require('../backend/src/utils/priceAssignmentSignature');

  const shop = (argShop || process.env.RIPX_VERIFY_SHOP || '').trim();
  const probeLineTotal = getSyntheticProbeLineTotal();
  const probeQty = getSyntheticProbeQty();
  const strictRequired = shouldRequireSignedAssignment();
  const signatureSecretConfigured = bool(getSignatureSecret());

  const diagnostics = buildCheckoutPriceDiagnostics(
    shop ? { shopDomain: shop, tenantRegistered: null, runningPriceTests: null } : {}
  );
  const flags = [];

  flags.push({
    key: 'strict_required',
    level: strictRequired ? 'ok' : 'warning',
    message: strictRequired
      ? 'Signed assignment verification is required in current environment.'
      : 'Signed assignment verification is not required. Enable for stronger spoof protection.',
  });
  flags.push({
    key: 'signature_secret_configured',
    level: signatureSecretConfigured ? 'ok' : strictRequired ? 'error' : 'warning',
    message: signatureSecretConfigured
      ? 'Signature secret is configured.'
      : 'Signature secret is not configured.',
  });

  const storefrontSourceResult = readSourceSafely(
    path.join(__dirname, '../shopify/storefront-script.js')
  );
  const extensionFetchSourceResult = readSourceSafely(
    path.join(
      __dirname,
      '../extensions/ripx-checkout-discount/src/cart_lines_discounts_generate_fetch.js'
    )
  );
  const storefrontSource = storefrontSourceResult.source;
  const extensionFetchSource = extensionFetchSourceResult.source;
  const storefrontHasSig = storefrontSource.includes('properties[_ripx_assignment_sig]');
  const extensionHasSig = extensionFetchSource.includes('assignment_sig');
  flags.push({
    key: 'storefront_signature_properties',
    level: storefrontSourceResult.ok && storefrontHasSig ? 'ok' : 'error',
    message: storefrontHasSig
      ? 'Storefront script injects assignment signature properties.'
      : storefrontSourceResult.ok
        ? 'Storefront script missing assignment signature cart properties.'
        : `Unable to read storefront script: ${storefrontSourceResult.error}`,
  });
  flags.push({
    key: 'extension_signature_forwarding',
    level: extensionFetchSourceResult.ok && extensionHasSig ? 'ok' : 'error',
    message: extensionHasSig
      ? 'Checkout discount fetch forwards assignment signature fields.'
      : extensionFetchSourceResult.ok
        ? 'Checkout discount fetch does not forward assignment signature fields.'
        : `Unable to read checkout extension fetch source: ${extensionFetchSourceResult.error}`,
  });

  let syntheticProbe = null;
  if (shop) {
    try {
      syntheticProbe = await loadSyntheticProbe(shop, probeLineTotal, probeQty);
      if (!syntheticProbe.ok) {
        flags.push({
          key: 'synthetic_probe',
          level: 'warning',
          message: `Synthetic probe skipped: ${syntheticProbe.reason}.`,
        });
      } else {
        const unsignedReason = syntheticProbe.unsigned?.reason || '';
        const unsignedBlockedBySignature =
          syntheticProbe.unsigned?.applies === false &&
          (unsignedReason === 'missing_assignment_signature' ||
            unsignedReason === 'invalid_assignment_signature' ||
            unsignedReason === 'assignment_signature_expired' ||
            unsignedReason === 'assignment_signature_not_configured');
        const signedAvoidedSigFailure =
          syntheticProbe.signed?.reason !== 'missing_assignment_signature' &&
          syntheticProbe.signed?.reason !== 'invalid_assignment_signature' &&
          syntheticProbe.signed?.reason !== 'assignment_signature_expired';
        flags.push({
          key: 'synthetic_probe_unsigned_behavior',
          level: strictRequired && !unsignedBlockedBySignature ? 'warning' : 'ok',
          message: strictRequired
            ? unsignedBlockedBySignature
              ? 'Unsigned synthetic line is blocked as expected in strict mode.'
              : `Unsigned synthetic line was not blocked (reason: ${syntheticProbe.unsigned?.reason || 'none'}).`
            : 'Unsigned synthetic line behavior checked (strict mode disabled).',
        });
        flags.push({
          key: 'synthetic_probe_signed_behavior',
          level: signedAvoidedSigFailure ? 'ok' : 'error',
          message: signedAvoidedSigFailure
            ? `Signed synthetic line accepted by signature checks (reason: ${syntheticProbe.signed?.reason || 'none'}).`
            : `Signed synthetic line failed signature checks (reason: ${syntheticProbe.signed?.reason || 'none'}).`,
        });
      }
    } catch (e) {
      flags.push({
        key: 'synthetic_probe',
        level: 'warning',
        message: `Synthetic probe failed: ${e.message || String(e)}`,
      });
    }
  } else {
    flags.push({
      key: 'synthetic_probe',
      level: 'warning',
      message:
        'Set RIPX_VERIFY_SHOP to run a synthetic signed/unsigned resolver probe against a running price test.',
    });
  }

  const output = {
    success: true,
    generatedAt: new Date().toISOString(),
    summary: {
      readiness: getReadinessSeverity(flags),
      strict_required: strictRequired,
      signature_secret_configured: signatureSecretConfigured,
      synthetic_probe_line_total: probeLineTotal,
      synthetic_probe_qty: probeQty,
    },
    diagnostics_summary: diagnostics.summary,
    flags,
    synthetic_probe: syntheticProbe,
  };
  output.rollout = buildRolloutGates({
    strictRequired,
    signatureSecretConfigured,
    flags,
    syntheticProbe,
  });

  if (jsonMode) {
    console.log(JSON.stringify(output, null, 2));
    process.exit(output.summary.readiness === 'error' ? 1 : 0);
  }

  console.log('\n=== RipX signed assignment readiness ===\n');
  console.log('Readiness:', output.summary.readiness);
  console.log(
    'Strict required:',
    output.summary.strict_required,
    '| signature secret configured:',
    output.summary.signature_secret_configured
  );
  console.log('\n--- Checks ---');
  flags.forEach(f => {
    const mark = f.level === 'ok' ? '✓' : f.level === 'warning' ? '!' : '✗';
    console.log(`  [${mark}] ${f.key}: ${f.message}`);
  });
  if (syntheticProbe && syntheticProbe.ok) {
    console.log('\n--- Synthetic probe ---');
    console.log('  test:', syntheticProbe.testId);
    console.log('  unsigned reason:', syntheticProbe.unsigned?.reason || 'none');
    console.log('  signed reason:', syntheticProbe.signed?.reason || 'none');
  }
  console.log('\n--- Rollout gates ---');
  output.rollout.gates.forEach(g => {
    console.log(`  [${g.pass ? '✓' : '✗'}] ${g.id}: ${g.message}`);
  });
  console.log(
    `\nRollout decision: ${output.rollout.decision.toUpperCase()} (${output.rollout.reason})`
  );
  console.log(
    '\nTip: RIPX_VERIFY_SHOP=your-store.myshopify.com npm run verify:price-assignment-readiness\n'
  );
  process.exit(output.summary.readiness === 'error' ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
