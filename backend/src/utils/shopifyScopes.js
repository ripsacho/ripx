/**
 * Parse Shopify OAuth scopes from env or app config.
 */

const fs = require('fs');
const path = require('path');

function parseShopifyScopes(raw) {
  return String(raw || '')
    .split(/[,\s]+/)
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

/**
 * Shopify OAuth often returns only write_* scopes even when read_* was requested.
 * write_* includes read access for the same resource, so treat it as satisfying read_*.
 */
function expandGrantedShopifyScopes(grantedScopeRaw) {
  const granted = parseShopifyScopes(grantedScopeRaw);
  const expanded = new Set(granted);
  for (const scope of granted) {
    if (scope.startsWith('write_')) {
      expanded.add(`read_${scope.slice('write_'.length)}`);
    }
  }
  return Array.from(expanded).sort();
}

function normalizeGrantedShopifyScopeString(grantedScopeRaw) {
  const expanded = expandGrantedShopifyScopes(grantedScopeRaw);
  return expanded.length > 0 ? expanded.join(',') : '';
}

function missingShopifyScopes(grantedScopeRaw, requiredScopes = loadRequiredShopifyScopes()) {
  const grantedSet = new Set(expandGrantedShopifyScopes(grantedScopeRaw));
  return requiredScopes.filter(scope => !grantedSet.has(scope));
}

module.exports = {
  parseShopifyScopes,
  loadRequiredShopifyScopes,
  expandGrantedShopifyScopes,
  normalizeGrantedShopifyScopeString,
  missingShopifyScopes,
};
