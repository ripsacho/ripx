/**
 * Build Shopify OAuth URL to refresh scopes for an already-connected store.
 */

const userModel = require('../models/user');
const {
  generateOAuthState,
  buildOAuthAuthorizeUrl,
  setShopifyOAuthStartCookies,
  getOAuthRedirectBase,
} = require('../utils/shopifyOAuthAuthorize');

function buildScopeReauthorizeFailureRedirect(req, shop, reason = 'scope_update') {
  const base = getOAuthRedirectBase(req);
  const normalizedShop = String(shop || '')
    .trim()
    .toLowerCase();
  const params = new URLSearchParams({
    reason,
  });
  if (normalizedShop) {
    params.set('shop', normalizedShop);
  }
  return `${base}/connect?${params.toString()}`;
}

/**
 * @returns {Promise<string>} Shopify OAuth authorize URL
 */
async function buildShopifyScopeReauthorizeUrl(req, res) {
  const shop = String(req.shopDomain || req.query?.shop || '')
    .trim()
    .toLowerCase();
  if (!shop) {
    const error = new Error('Shop domain required');
    error.status = 400;
    error.code = 'SHOP_REQUIRED';
    throw error;
  }
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_SCOPES || !process.env.APP_URL) {
    const error = new Error('OAuth configuration missing');
    error.status = 500;
    error.code = 'OAUTH_CONFIG_MISSING';
    throw error;
  }

  let email = req.email
    ? String(req.email || '')
        .trim()
        .toLowerCase()
    : '';
  if (!email) {
    const user = await userModel.getByDomain(shop);
    email = user?.email ? String(user.email).trim().toLowerCase() : '';
  }
  if (!email) {
    const error = new Error('Sign in to connect this store');
    error.status = 401;
    error.code = 'SIGN_IN_REQUIRED';
    throw error;
  }

  const callbackBase =
    typeof req.query.callback_base === 'string' ? req.query.callback_base.trim() : undefined;
  const state = generateOAuthState(shop, email || '');
  setShopifyOAuthStartCookies(res, { shop, state });
  return buildOAuthAuthorizeUrl(shop, state, callbackBase, req);
}

module.exports = {
  buildShopifyScopeReauthorizeUrl,
  buildScopeReauthorizeFailureRedirect,
};
