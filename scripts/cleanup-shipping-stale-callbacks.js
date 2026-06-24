#!/usr/bin/env node
/* eslint-disable no-console */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getTestById, updateTest } = require('../backend/src/models/test');

function parseArgs(argv = []) {
  const args = {
    testId: '',
    shopDomain: '',
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--test-id') {
      args.testId = String(argv[index + 1] || '').trim();
      index += 1;
      continue;
    }
    if (token === '--shop-domain') {
      args.shopDomain = String(argv[index + 1] || '').trim();
      index += 1;
    }
  }
  return args;
}

function printUsage() {
  console.log(
    'Usage: npm run cleanup:shipping-stale-callbacks -- --test-id <id> --shop-domain <shop.myshopify.com> [--dry-run]'
  );
}

function resolveUrlHost(url) {
  try {
    return new URL(String(url || '').trim()).host;
  } catch {
    return null;
  }
}

function resolveCurrentCallbackHost() {
  const callbackUrl = String(process.env.RIPX_SHIPPING_CARRIER_CALLBACK_URL || '').trim();
  if (callbackUrl) {
    return resolveUrlHost(callbackUrl);
  }
  const appUrl = String(process.env.APP_URL || '').trim();
  return resolveUrlHost(appUrl);
}

function cleanupVariantResources(variant, currentHost) {
  const nextVariant = { ...(variant || {}) };
  const config =
    nextVariant.config && typeof nextVariant.config === 'object' ? { ...nextVariant.config } : {};
  const metadata =
    config.metadata && typeof config.metadata === 'object' ? { ...config.metadata } : {};
  const resources = Array.isArray(metadata.shipping_resources) ? metadata.shipping_resources : [];

  const removed = [];
  const kept = resources.filter(resource => {
    if (!resource || typeof resource !== 'object') return false;
    const type = String(resource.resource_type || '').trim();
    if (type !== 'carrier_service') return true;
    const host = resolveUrlHost(resource.callback_url);
    if (!host || !currentHost || host === currentHost) {
      return true;
    }
    removed.push({ id: resource.id || null, host, callback_url: resource.callback_url || null });
    return false;
  });

  metadata.shipping_resources = kept;
  config.metadata = metadata;
  nextVariant.config = config;

  return { variant: nextVariant, removed };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.testId || !args.shopDomain) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const currentHost = resolveCurrentCallbackHost();
  if (!currentHost) {
    console.error(
      'Could not resolve current callback host. Set RIPX_SHIPPING_CARRIER_CALLBACK_URL or APP_URL in .env.'
    );
    process.exit(1);
  }

  const test = await getTestById(args.testId, args.shopDomain);
  if (!test) {
    console.error(`Test not found for id=${args.testId} shop=${args.shopDomain}`);
    process.exit(1);
  }

  const variants = Array.isArray(test.variants) ? test.variants : [];
  const removals = [];
  const nextVariants = variants.map((variant, index) => {
    const { variant: nextVariant, removed } = cleanupVariantResources(variant, currentHost);
    if (removed.length > 0) {
      removals.push({
        variant_index: index,
        variant_name: variant?.name || `Variant ${index + 1}`,
        removed,
      });
    }
    return nextVariant;
  });

  if (removals.length === 0) {
    console.log('No stale shipping callback resource refs found.');
    return;
  }

  console.log(`Current callback host: ${currentHost}`);
  console.log('Stale callback refs to remove:');
  removals.forEach(entry => {
    console.log(`- ${entry.variant_name} (${entry.variant_index})`);
    entry.removed.forEach(resource => {
      console.log(`  - ${resource.host} (${resource.id || 'no-id'})`);
    });
  });

  if (args.dryRun) {
    console.log('Dry run only. No changes written.');
    return;
  }

  await updateTest(args.testId, args.shopDomain, { variants: nextVariants });
  console.log('Updated test variants metadata and removed stale shipping callback refs.');
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
