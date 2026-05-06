const fs = require('fs');
const path = require('path');

let cachedScript = null;

function getStorefrontScriptPath() {
  return path.join(__dirname, '../../..', 'shopify', 'storefront-script.js');
}

function readStorefrontScriptSource(scriptPath = getStorefrontScriptPath()) {
  const stat = fs.statSync(scriptPath);
  if (
    cachedScript &&
    cachedScript.path === scriptPath &&
    cachedScript.mtimeMs === stat.mtimeMs &&
    cachedScript.size === stat.size
  ) {
    return cachedScript.contents;
  }

  const contents = fs.readFileSync(scriptPath, 'utf8');
  cachedScript = {
    path: scriptPath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    contents,
  };
  return contents;
}

function clearStorefrontScriptSourceCache() {
  cachedScript = null;
}

module.exports = {
  getStorefrontScriptPath,
  readStorefrontScriptSource,
  clearStorefrontScriptSourceCache,
};
