#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-command go/no-go decision for Shopify price-test readiness.
 *
 * Combines:
 *  - scripts/verify-price-pipeline.js --json
 *  - scripts/verify-price-assignment-readiness.js --json
 *
 * Usage:
 *   node scripts/verify-price-go-no-go.js
 *   RIPX_VERIFY_SHOP=your-store.myshopify.com node scripts/verify-price-go-no-go.js
 *   node scripts/verify-price-go-no-go.js --shop=your-store.myshopify.com
 *   node scripts/verify-price-go-no-go.js --json
 *   node scripts/verify-price-go-no-go.js --strict
 */

const path = require('path');
const { spawnSync } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const strictMode =
  args.includes('--strict') ||
  ['1', 'true', 'yes', 'on'].includes(String(process.env.RIPX_VERIFY_STRICT || '').toLowerCase());
const argShop = (args.find(a => a.startsWith('--shop=')) || '').split('=')[1] || '';
const shop = String(argShop || process.env.RIPX_VERIFY_SHOP || '').trim();

function runJsonScript(scriptRelativePath, envExtra) {
  const scriptPath = path.join(__dirname, scriptRelativePath);
  const run = spawnSync(process.execPath, [scriptPath, '--json'], {
    env: { ...process.env, ...(envExtra || {}) },
    encoding: 'utf8',
  });
  if (run.error) {
    throw run.error;
  }
  const stdout = String(run.stdout || '').trim();
  if (run.status !== 0 && !stdout) {
    const stderr = String(run.stderr || '').trim();
    throw new Error(stderr || `${path.basename(scriptPath)} exited with ${run.status}`);
  }
  try {
    return JSON.parse(stdout);
  } catch (e) {
    throw new Error(
      `Failed to parse JSON from ${path.basename(scriptPath)}: ${e.message || String(e)}`
    );
  }
}

function evaluate(pipeline, assignment, selectedShop, options = {}) {
  const strict = options.strictMode === true;
  const blockers = [];
  const warnings = [];

  const pipelineOk = Boolean(pipeline?.summary?.overall_ok);
  if (!pipelineOk) {
    blockers.push('Pipeline diagnostics are not fully passing.');
  }

  const checkoutReady = String(pipeline?.support?.checkout_alignment?.level || '') === 'ready';
  if (!checkoutReady) {
    blockers.push('Checkout alignment support is not ready.');
  }

  if (selectedShop) {
    if (pipeline?.shop?.tenant_registered !== true) {
      blockers.push('Shop tenant is not registered for this backend.');
    }
    const running = Number(pipeline?.shop?.running_price_tests ?? 0);
    if (!Number.isFinite(running) || running <= 0) {
      blockers.push('No running price test found for the selected shop.');
    }
  }

  const rolloutDecision = String(assignment?.rollout?.decision || '').toLowerCase();
  if (rolloutDecision !== 'go') {
    blockers.push('Signed-assignment rollout gates are not in GO state.');
  }

  const cartLevel = String(pipeline?.support?.cart_rendering?.level || '');
  if (cartLevel && cartLevel !== 'native_installed' && cartLevel !== 'ready') {
    warnings.push(
      'Cart native rendering is not fully installed; some themes may still rely on fallback cart paint.'
    );
  }

  if (strict && warnings.length > 0) {
    blockers.push('Strict mode enabled: warnings are treated as blockers.');
  }

  const verdict = blockers.length === 0 ? 'go' : 'no-go';
  return {
    success: true,
    verdict,
    shop: selectedShop || null,
    blockers,
    warnings,
    summary: {
      pipeline_status: pipeline?.summary?.overall_status || 'unknown',
      assignment_readiness: assignment?.summary?.readiness || 'unknown',
      checkout_alignment_level: pipeline?.support?.checkout_alignment?.level || 'unknown',
      cart_rendering_level: pipeline?.support?.cart_rendering?.level || 'unknown',
      running_price_tests:
        pipeline?.shop?.running_price_tests === undefined
          ? null
          : pipeline?.shop?.running_price_tests,
      tenant_registered:
        pipeline?.shop?.tenant_registered === undefined ? null : pipeline?.shop?.tenant_registered,
      assignment_rollout_decision: assignment?.rollout?.decision || 'unknown',
      strict_mode: strict,
    },
    next_steps:
      blockers.length === 0
        ? [
            'Run a live checkout smoke test from preview URL in incognito to confirm charged totals.',
            'If cart support remains fallback, install native cart snippets/app block for this theme.',
          ]
        : [
            'Resolve blockers above, then rerun this verifier.',
            'Use scripts/verify-price-pipeline.js --json and scripts/verify-price-assignment-readiness.js --json for deeper details.',
          ],
  };
}

function printHuman(result) {
  const verdictLabel = result.verdict === 'go' ? 'GO' : 'NO-GO';
  console.log('\n=== RipX price test go/no-go ===\n');
  console.log('Verdict:', verdictLabel);
  console.log('Strict mode:', result.summary.strict_mode ? 'on' : 'off');
  if (result.shop) console.log('Shop:', result.shop);
  console.log('Checkout alignment:', result.summary.checkout_alignment_level);
  console.log('Cart rendering:', result.summary.cart_rendering_level);
  if (result.summary.running_price_tests !== null) {
    console.log('Running price tests:', result.summary.running_price_tests);
  }
  if (result.summary.tenant_registered !== null) {
    console.log('Tenant registered:', result.summary.tenant_registered);
  }
  console.log('Signed-assignment rollout:', result.summary.assignment_rollout_decision);

  if (result.blockers.length) {
    console.log('\nBlockers:');
    result.blockers.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  }
  if (result.warnings.length) {
    console.log('\nWarnings:');
    result.warnings.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  }
  if (result.next_steps.length) {
    console.log('\nNext steps:');
    result.next_steps.forEach((line, i) => console.log(`  ${i + 1}. ${line}`));
  }
  console.log('');
}

function main() {
  const envExtra = shop ? { RIPX_VERIFY_SHOP: shop } : {};
  const pipeline = runJsonScript('verify-price-pipeline.js', envExtra);
  const assignment = runJsonScript('verify-price-assignment-readiness.js', envExtra);
  const result = evaluate(pipeline, assignment, shop, { strictMode });

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }

  process.exit(result.verdict === 'go' ? 0 : 1);
}

try {
  main();
} catch (error) {
  const msg = error && (error.message || String(error));
  if (jsonMode) {
    console.log(
      JSON.stringify(
        { success: false, verdict: 'no-go', blockers: [msg], warnings: [], summary: {} },
        null,
        2
      )
    );
  } else {
    console.error('\nRipX go/no-go verifier failed:\n', msg, '\n');
  }
  process.exit(1);
}
