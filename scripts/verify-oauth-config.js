#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Print OAuth redirect URI and scope config for production debugging.
 *
 * Usage: node scripts/verify-oauth-config.js
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  loadRequiredShopifyScopes,
  parseShopifyScopes,
} = require('../backend/src/utils/shopifyScopes');

const PRODUCTION_CLIENT_ID = '475a569769b25edb8df85288e1be9637';

function oauthRedirectBase() {
  const strict = String(process.env.RIPX_OAUTH_REDIRECT_BASE || '')
    .trim()
    .replace(/\/+$/, '');
  if (strict) {
    return strict;
  }
  return String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

function main() {
  const apiKey = String(process.env.SHOPIFY_API_KEY || '').trim();
  const secret = String(process.env.SHOPIFY_API_SECRET || '').trim();
  const base = oauthRedirectBase();
  const redirectUri = base
    ? `${base}/api/auth/callback`
    : '(set APP_URL or RIPX_OAUTH_REDIRECT_BASE)';
  const scopes = loadRequiredShopifyScopes();
  const envScopes = parseShopifyScopes(process.env.SHOPIFY_SCOPES);

  console.log('\nRipX OAuth configuration check\n');
  console.log(`SHOPIFY_API_KEY:           ${apiKey ? `${apiKey.slice(0, 8)}...` : 'MISSING'}`);
  console.log(
    `Matches production app:  ${apiKey === PRODUCTION_CLIENT_ID ? 'yes' : 'NO — Partner Dashboard Client ID must match'}`
  );
  console.log(`SHOPIFY_API_SECRET:        ${secret ? 'set' : 'MISSING'}`);
  console.log(`APP_URL:                   ${process.env.APP_URL || '(unset)'}`);
  console.log(
    `RIPX_OAUTH_REDIRECT_BASE:  ${process.env.RIPX_OAUTH_REDIRECT_BASE || '(unset — uses APP_URL)'}`
  );
  console.log(`OAuth redirect_uri:        ${redirectUri}`);
  console.log(`Required scopes (${scopes.length}): ${scopes.join(', ') || '—'}`);
  if (envScopes.length && envScopes.length !== scopes.length) {
    console.log(`SHOPIFY_SCOPES in .env (${envScopes.length}): parsed OK`);
  }
  console.log('\nPartner Dashboard must include exactly:');
  console.log(
    `  Application URL:              ${base || 'https://your-domain'}/home (or your app URL)`
  );
  console.log(`  Allowed redirection URL(s):   ${redirectUri}`);
  console.log('\nAfter a successful install, diagnose must show Session in DB: yes');
  console.log('and you should briefly see: /connect/oauth-success?shop=your-store.myshopify.com\n');
}

main();
