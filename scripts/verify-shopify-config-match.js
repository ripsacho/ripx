#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Fail fast when .env Client IDs do not match the selected Shopify app config.
 *
 * Usage:
 *   node scripts/verify-shopify-config-match.js --config shopify.app.local.toml
 *   node scripts/verify-shopify-config-match.js --config shopify.app.production.toml --env-file .env.production
 *
 * Also supported:
 *   --config=<path>
 *   --env-file=<path>
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');

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

function showUsageAndExit(exitCode) {
  const msg = [
    'Usage:',
    '  node scripts/verify-shopify-config-match.js --config <shopify.app.*.toml> [--env-file .env]',
    '',
    'Examples:',
    '  node scripts/verify-shopify-config-match.js --config shopify.app.local.toml',
    '  node scripts/verify-shopify-config-match.js --config shopify.app.production.toml --env-file .env.production',
  ].join('\n');
  if (exitCode === 0) {
    console.log(msg);
  } else {
    console.error(msg);
  }
  process.exit(exitCode);
}

function stripInlineComment(rawValue) {
  const value = String(rawValue || '');
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === '#' && !inSingle && !inDouble) {
      return value.slice(0, i).trim();
    }
  }
  return value.trim();
}

function unquote(value) {
  const s = String(value || '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function parseEnvFile(envPath) {
  const out = {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = unquote(stripInlineComment(match[2]));
    out[key] = value;
  }
  return out;
}

function parseClientIdFromToml(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const match = raw.match(/^\s*client_id\s*=\s*"([^"]+)"/m);
  return match ? match[1].trim() : '';
}

function resolveAbsolute(p) {
  if (!p) {
    return '';
  }
  return path.isAbsolute(p) ? p : path.join(repoRoot, p);
}

function fail(msg, details = null) {
  console.error(`❌ ${msg}`);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsageAndExit(0);
  }

  const configArg = getArg('--config');
  if (!configArg) {
    showUsageAndExit(1);
  }

  const envFileArg = getArg('--env-file') || '.env';
  const configPath = resolveAbsolute(configArg);
  const envFilePath = resolveAbsolute(envFileArg);

  if (!fs.existsSync(configPath)) {
    fail(`Config file not found: ${configPath}`);
  }
  if (!fs.existsSync(envFilePath)) {
    fail(`Env file not found: ${envFilePath}`);
  }

  const clientIdFromConfig = parseClientIdFromToml(configPath);
  if (!clientIdFromConfig) {
    fail(`Missing client_id in ${configPath}`);
  }

  const envVars = parseEnvFile(envFilePath);
  const shopifyApiKey = (envVars.SHOPIFY_API_KEY || '').trim();
  const viteShopifyApiKey = (envVars.VITE_SHOPIFY_API_KEY || '').trim();

  if (!shopifyApiKey) {
    fail(
      `Missing required env value in ${envFilePath}: SHOPIFY_API_KEY`,
      'Set SHOPIFY_API_KEY to match the selected app config client_id.'
    );
  }

  const mismatches = [];
  if (shopifyApiKey !== clientIdFromConfig) {
    mismatches.push(
      `SHOPIFY_API_KEY (${shopifyApiKey}) does not match client_id (${clientIdFromConfig}).`
    );
  }
  if (viteShopifyApiKey && viteShopifyApiKey !== clientIdFromConfig) {
    mismatches.push(
      `VITE_SHOPIFY_API_KEY (${viteShopifyApiKey}) does not match client_id (${clientIdFromConfig}).`
    );
  }

  if (mismatches.length > 0) {
    fail(
      `Shopify Client ID mismatch for ${path.basename(configPath)}.`,
      `${mismatches.join('\n')}\nUpdate ${path.basename(envFilePath)} or switch to the matching app config.`
    );
  }

  console.log(`✅ Shopify config matches env`);
  console.log(`   Config: ${path.basename(configPath)} (client_id=${clientIdFromConfig})`);
  console.log(`   Env: ${path.basename(envFilePath)}`);
  if (!viteShopifyApiKey) {
    console.log(
      '   Note: VITE_SHOPIFY_API_KEY is not set. This is okay for non-embedded UI, but set it if you enable embedded App Bridge.'
    );
  }
}

main();
