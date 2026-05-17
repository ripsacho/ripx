/**
 * Parse Shopify OAuth scopes from env or app config.
 */

const fs = require('fs');
const path = require('path');

function parseShopifyScopes(raw) {
  return String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .sort();
}

function loadRequiredShopifyScopes() {
  const fromEnv = process.env.SHOPIFY_SCOPES;
  if (fromEnv) {
    return parseShopifyScopes(fromEnv);
  }
  const tomlCandidates = [
    path.join(__dirname, '../../shopify.app.production.toml'),
    path.join(__dirname, '../../shopify.app.toml'),
  ];
  for (const tomlPath of tomlCandidates) {
    if (!fs.existsSync(tomlPath)) {
      continue;
    }
    const raw = fs.readFileSync(tomlPath, 'utf8');
    const match = raw.match(/^\s*scopes\s*=\s*"([^"]+)"/m);
    if (match) {
      return parseShopifyScopes(match[1]);
    }
  }
  return [];
}

function missingShopifyScopes(grantedScopeRaw, requiredScopes = loadRequiredShopifyScopes()) {
  const granted = parseShopifyScopes(grantedScopeRaw);
  return requiredScopes.filter(scope => !granted.includes(scope));
}

module.exports = {
  parseShopifyScopes,
  loadRequiredShopifyScopes,
  missingShopifyScopes,
};
