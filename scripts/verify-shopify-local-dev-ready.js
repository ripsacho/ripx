#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fail fast before `shopify app dev` when local config cannot start dev preview.
 *
 * Usage:
 *   node scripts/verify-shopify-local-dev-ready.js
 *   node scripts/verify-shopify-local-dev-ready.js --config shopify.app.local.toml
 */

const fs = require('fs');
const path = require('path');
const { isEphemeralTunnelUrl, parseTomlQuotedValue } = require('./shopify-local-config-utils');

const repoRoot = path.join(__dirname, '..');

const WEBHOOK_TOPIC_SCOPES = {
  'products/update': ['read_products'],
  'app/uninstalled': [],
};

function getArg(flagName) {
  const eqArg = process.argv.find(arg => arg.startsWith(`${flagName}=`));
  if (eqArg) {
    return eqArg.slice(flagName.length + 1).trim();
  }
  const idx = process.argv.indexOf(flagName);
  if (idx >= 0 && process.argv[idx + 1]) {
    return String(process.argv[idx + 1]).trim();
  }
  return '';
}

function parseTomlValue(raw, key) {
  const re = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm');
  const match = String(raw || '').match(re);
  return match ? match[1].trim() : '';
}

function parseWebhookTopics(raw) {
  const topics = [];
  const re = /topics\s*=\s*\[\s*"([^"]+)"\s*\]/g;
  let match = re.exec(raw);
  while (match) {
    topics.push(match[1].trim());
    match = re.exec(raw);
  }
  return topics;
}

function parseScopes(raw) {
  const scopes = parseTomlValue(raw, 'scopes');
  if (!scopes) {
    return [];
  }
  return scopes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function fail(msg, details = null) {
  console.error(`❌ ${msg}`);
  if (details) {
    console.error(details);
  }
  console.error('See docs/SHOPIFY_DEV_PREVIEW_FIX.md for local Shopify preview recovery steps.');
  process.exit(1);
}

function main() {
  const configArg = getArg('--config') || 'shopify.app.local.toml';
  const configPath = path.isAbsolute(configArg) ? configArg : path.join(repoRoot, configArg);

  if (!fs.existsSync(configPath)) {
    fail(`Config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const scopes = parseScopes(raw);
  const topics = parseWebhookTopics(raw);

  if (scopes.length === 0) {
    fail(
      `access_scopes.scopes is empty in ${path.basename(configPath)}.`,
      'Dev preview fails with: "Missing scope for webhook topic". Copy scopes from shopify.app.toml or shopify.app.production.toml.'
    );
  }

  const scopeSet = new Set(scopes);
  const missingByTopic = [];
  topics.forEach(topic => {
    const required = WEBHOOK_TOPIC_SCOPES[topic] || [];
    const missing = required.filter(scope => !scopeSet.has(scope));
    if (missing.length > 0) {
      missingByTopic.push({ topic, missing });
    }
  });

  if (missingByTopic.length > 0) {
    const lines = missingByTopic.map(item => `- ${item.topic}: needs ${item.missing.join(', ')}`);
    fail(
      `Webhook topics in ${path.basename(configPath)} require scopes that are not declared.`,
      `${lines.join('\n')}\nAdd the missing scopes under [access_scopes].scopes.`
    );
  }

  const applicationUrl = parseTomlQuotedValue(raw, 'application_url');
  if (applicationUrl && isEphemeralTunnelUrl(applicationUrl)) {
    fail(
      `${path.basename(configPath)} application_url must not use an ephemeral tunnel host.`,
      `Current value: ${applicationUrl}\n` +
        'Run: npm run shopify:sanitize:local-toml\n' +
        'Then start dev again. Shopify CLI will rewrite URLs for the active tunnel.'
    );
  }

  console.log(`✅ ${path.basename(configPath)} is ready for dev preview`);
  console.log(`   scopes: ${scopes.length} declared`);
  if (topics.length > 0) {
    console.log(`   webhooks: ${topics.join(', ')}`);
  }
  console.log('   docs: docs/SHOPIFY_DEV_PREVIEW_FIX.md');
}

main();
