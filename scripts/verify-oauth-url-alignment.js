#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Verify OAuth/Application URL host alignment between .env and shopify.app.*.toml.
 *
 * Usage:
 *   node scripts/verify-oauth-url-alignment.js --config shopify.app.production.toml
 *   node scripts/verify-oauth-url-alignment.js --config shopify.app.production.toml --env-file .env
 */

const fs = require('fs');
const path = require('path');
const { getRepoRoot, evaluateOAuthUrlAlignment } = require('./shopify-local-config-utils');

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

function parseEnvFile(envPath) {
  const out = {};
  if (!fs.existsSync(envPath)) {
    return out;
  }
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) {
        return;
      }
      out[match[1]] = String(match[2] || '')
        .trim()
        .replace(/^["']|["']$/g, '');
    });
  return out;
}

function main() {
  const configArg = getArg('--config') || 'shopify.app.production.toml';
  const envFileArg = getArg('--env-file') || '.env';
  const skipEnv = process.argv.includes('--skip-env');
  const repoRoot = getRepoRoot();
  const configPath = path.isAbsolute(configArg) ? configArg : path.join(repoRoot, configArg);
  const envPath = path.isAbsolute(envFileArg) ? envFileArg : path.join(repoRoot, envFileArg);

  if (!fs.existsSync(configPath)) {
    console.error(`❌ Config file not found: ${configPath}`);
    process.exit(1);
  }

  const tomlRaw = fs.readFileSync(configPath, 'utf8');
  const env = skipEnv ? {} : parseEnvFile(envPath);
  const result = evaluateOAuthUrlAlignment({
    env,
    tomlRaw,
    configLabel: path.basename(configPath),
  });

  console.log(`OAuth URL alignment (${path.basename(configPath)})`);
  console.log(`  application_url: ${result.applicationUrl || '(missing)'}`);
  console.log(`  redirect_url:    ${result.redirectUrl || '(missing)'}`);
  Object.entries(result.envHosts).forEach(([key, host]) => {
    console.log(`  ${key}: ${host}`);
  });

  result.warnings.forEach(message => console.warn(`⚠️  ${message}`));

  if (result.errors.length > 0) {
    console.error('\n❌ OAuth URL alignment failed:');
    result.errors.forEach(message => console.error(`  - ${message}`));
    console.error(
      '\nFix: set APP_URL, SHOPIFY_APP_URL, and RIPX_OAUTH_REDIRECT_BASE to the same stable host as application_url, ' +
        'then update Shopify Partner Dashboard → App setup → URLs.'
    );
    console.error('Check live values: GET /api/auth/oauth-redirect-uri');
    process.exit(1);
  }

  console.log('\n✅ OAuth URL alignment looks consistent.');
}

main();
