#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Diagnose why RipX cannot install cart transform / checkout discount on a Shopify store.
 *
 * Usage (on server or anywhere with DATABASE_URL + .env):
 *   node scripts/diagnose-shopify-shop.js --shop=splitter-plus.myshopify.com
 *   RIPX_VERIFY_SHOP=your-store.myshopify.com npm run diagnose:shop
 *   node scripts/diagnose-shopify-shop.js --shop=... --json
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const argShop = (args.find(a => a.startsWith('--shop=')) || '').split('=')[1] || '';
const shop = String(argShop || process.env.RIPX_VERIFY_SHOP || '')
  .trim()
  .toLowerCase();

const PRODUCTION_CLIENT_ID = '475a569769b25edb8df85288e1be9637';

const {
  parseShopifyScopes: parseScopes,
  loadRequiredShopifyScopes: loadRequiredScopes,
  missingShopifyScopes,
} = require('../backend/src/utils/shopifyScopes');

function recommendation(report) {
  const steps = [];
  if (!report.hasSession) {
    steps.push(
      'No OAuth session in DB. Install RipX on this store (Domains → install link, or open app from Shopify Admin).'
    );
    return steps;
  }
  if (report.tokenInvalid) {
    steps.push(
      'Shopify rejected the stored access token (401). Uninstall RipX from the store, then reinstall via install link or Apps → RipperX.'
    );
  }
  if (report.missingScopes.length > 0) {
    steps.push(
      `Token works but ${report.missingScopes.length} scope(s) missing: ${report.missingScopes.join(', ')}.`
    );
    steps.push(
      'On your dev machine run: npm run shopify:deploy:production:safe (pushes scope list to Partner Dashboard), release the app version, then My domains → incognito install link → approve all permissions.'
    );
    if (report.apiOk) {
      steps.push(
        'Until scopes are updated, RipX may show "Update permissions" but the store should still open (Admin API OK).'
      );
    }
  }
  if (report.apiOk && report.functionCount === 0) {
    steps.push(
      'Token works but no functions returned for this app. Run `npm run shopify:deploy:production:safe` and confirm Partner Dashboard shows a released version with ripx-cart-transform + ripx-checkout-discount.'
    );
  }
  if (report.apiOk && report.cartTransformFunction && !report.ripxCartTransformInstalled) {
    steps.push(
      'Cart transform function is deployed but not bound to the store. In RipX: Settings → Installation → Direct price override → Install (POST /api/settings/cart-transform/ensure).'
    );
  }
  if (report.apiOk && report.cartTransformBlockedByOtherApp) {
    steps.push(
      "Another cart transform is already installed (Shopify allows only one). Remove the other app's cart transform in Shopify Admin, then retry Install."
    );
  }
  if (report.apiOk && !report.shopifyPlus && !report.partnerDevelopment) {
    steps.push(
      'Store may not be Shopify Plus. Direct Price Override (cart transform) requires Plus or a partner development store.'
    );
  }
  if (steps.length === 0 && report.apiOk && report.ripxCartTransformInstalled) {
    steps.push(
      'Cart transform looks installed. If price tests still fail, run Settings → Checkout diagnostics and `npm run verify:price-go-no-go`.'
    );
  }
  return steps;
}

async function main() {
  if (!shop || !shop.includes('.myshopify.com')) {
    console.error(
      'Usage: node scripts/diagnose-shopify-shop.js --shop=your-store.myshopify.com [--json]'
    );
    process.exit(1);
  }

  const requiredScopes = loadRequiredScopes();
  const envApiKey = String(process.env.SHOPIFY_API_KEY || '').trim();
  const { getShopSession } = require('../backend/src/models/shopSession');
  const shopifyService = require('../backend/src/services/shopifyService');

  const session = await getShopSession(shop);
  const token = session?.access_token || '';
  const scopeList = parseScopes(session?.scope);
  const missingScopes = missingShopifyScopes(session?.scope, requiredScopes);

  let tenantRow = null;
  try {
    const { getTenantByDomain } = require('../backend/src/models/tenant');
    tenantRow = await getTenantByDomain(shop);
  } catch {
    tenantRow = null;
  }

  const oauthBase = String(process.env.RIPX_OAUTH_REDIRECT_BASE || process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const oauthRedirectUri = oauthBase ? `${oauthBase}/api/auth/callback` : null;

  const report = {
    shop,
    generatedAt: new Date().toISOString(),
    envApiKeyPrefix: envApiKey ? `${envApiKey.slice(0, 8)}...` : null,
    envMatchesProductionApp: envApiKey === PRODUCTION_CLIENT_ID,
    hasSession: Boolean(session),
    hasToken: Boolean(token),
    tokenPrefix: token ? `${token.slice(0, 8)}...` : null,
    installedAt: session?.installed_at || null,
    updatedAt: session?.updated_at || null,
    scopeCount: scopeList.length,
    scopes: scopeList,
    requiredScopeCount: requiredScopes.length,
    missingScopes,
    tokenInvalid: false,
    apiOk: false,
    apiError: null,
    shopName: null,
    shopifyPlus: null,
    partnerDevelopment: null,
    functionCount: 0,
    functions: [],
    cartTransformFunction: null,
    discountFunction: null,
    cartTransformCount: 0,
    cartTransforms: [],
    ripxCartTransformInstalled: false,
    cartTransformBlockedByOtherApp: false,
    tenantExists: Boolean(tenantRow),
    tenantAccountId: tenantRow?.account_id ?? null,
    oauthRedirectUri,
    recommendations: [],
  };

  if (!session) {
    report.recommendations = [
      'No OAuth session in DB — Shopify approval did not reach RipX (or used wrong API host).',
      `Log into your RipX app URL → My domains → connect ${shop} → use "Copy link for incognito".`,
      'Complete Step 1 (store admin + Back) then Step 2 (Continue to Shopify). You must see Shopify permission screen.',
      `After Allow, browser must land on /connect/oauth-success?shop=${shop} — if not, OAuth failed.`,
      oauthRedirectUri
        ? `Partner Dashboard → Allowed redirection URL must include: ${oauthRedirectUri}`
        : 'Set RIPX_OAUTH_REDIRECT_BASE or APP_URL and match Partner Dashboard redirect URL.',
      'Then re-run: node scripts/diagnose-shopify-shop.js --shop=splitter-plus.myshopify.com',
    ];
    output(report);
    const { closeDatabase } = require('../backend/src/utils/database');
    await closeDatabase();
    process.exit(2);
  }

  if (!token) {
    report.recommendations = recommendation(report);
    output(report);
    process.exit(2);
  }

  const query = `
    query ripxDiagnoseShop {
      shop {
        name
        plan {
          displayName
          partnerDevelopment
          shopifyPlus
        }
      }
      shopifyFunctions(first: 50) {
        nodes {
          id
          title
          apiType
        }
      }
      cartTransforms(first: 10) {
        nodes {
          id
          functionId
        }
      }
    }
  `;

  try {
    const resp = await shopifyService.requestAdminGraphql(shop, token, query);
    report.apiOk = true;
    const data = resp?.data || {};
    report.shopName = data.shop?.name || null;
    const plan = data.shop?.plan || {};
    report.shopifyPlus = Boolean(plan.shopifyPlus);
    report.partnerDevelopment = Boolean(plan.partnerDevelopment);
    const nodes = data.shopifyFunctions?.nodes || [];
    report.functionCount = nodes.length;
    report.functions = nodes.map(n => ({
      id: n.id,
      title: n.title,
      apiType: n.apiType,
    }));
    report.cartTransformFunction =
      nodes.find(
        n =>
          String(n?.apiType || '')
            .toLowerCase()
            .includes('cart_transform') &&
          String(n?.title || '')
            .toLowerCase()
            .includes('ripx')
      ) ||
      nodes.find(n =>
        String(n?.apiType || '')
          .toLowerCase()
          .includes('cart_transform')
      ) ||
      null;
    report.discountFunction =
      nodes.find(
        n =>
          String(n?.apiType || '')
            .toLowerCase()
            .includes('discount') &&
          String(n?.title || '')
            .toLowerCase()
            .includes('ripx')
      ) ||
      nodes.find(n =>
        String(n?.apiType || '')
          .toLowerCase()
          .includes('discount')
      ) ||
      null;
    const transforms = data.cartTransforms?.nodes || [];
    report.cartTransformCount = transforms.length;
    report.cartTransforms = transforms;
    const ripxFnId = String(report.cartTransformFunction?.id || '').trim();
    report.ripxCartTransformInstalled =
      Boolean(ripxFnId) && transforms.some(t => String(t?.functionId || '').trim() === ripxFnId);
    report.cartTransformBlockedByOtherApp =
      transforms.length > 0 && ripxFnId && !report.ripxCartTransformInstalled;
  } catch (e) {
    const msg = e?.message || String(e);
    report.apiError = msg;
    if (/401|invalid.*token|unauthorized/i.test(msg)) {
      report.tokenInvalid = true;
    }
  }

  const { getSignatureSecret } = require('../backend/src/utils/priceAssignmentSignature');
  const { runStorefrontSetupProbe } = require('../backend/src/services/storefrontSetupService');
  report.priceAssignmentSecretConfigured = Boolean(getSignatureSecret());
  report.checkoutPriceSecretConfigured = Boolean(
    String(process.env.RIPX_CHECKOUT_PRICE_SECRET || '').trim()
  );
  try {
    const storefront = await runStorefrontSetupProbe(shop);
    report.storefrontRuntimeReady = storefront.storefrontRuntimeReady === true;
    report.appProxyScriptDetected = storefront.proxyStatus?.scriptDetected === true;
    report.storefrontEmbedVia = storefront.embedStatus?.via || null;
  } catch (probeErr) {
    report.storefrontRuntimeReady = false;
    report.storefrontProbeError = probeErr?.message || String(probeErr);
  }

  report.recommendations = recommendation(report);
  if (report.apiOk && !report.priceAssignmentSecretConfigured) {
    report.recommendations.unshift(
      'Set RIPX_PRICE_ASSIGNMENT_SIGNATURE_SECRET or RIPX_CHECKOUT_PRICE_SECRET in production .env (e.g. openssl rand -hex 32), then pm2 restart ripx — required to start price tests.'
    );
  }
  if (report.apiOk && report.storefrontRuntimeReady === false) {
    report.recommendations.push(
      'Storefront/App Proxy not ready for price test preflight. In RipX open Settings → Installation; verify https://' +
        shop +
        '/apps/ripx/script.js loads.'
    );
  }

  output(report);
  const { closeDatabase } = require('../backend/src/utils/database');
  await closeDatabase();
  const exitCode =
    report.apiOk && report.missingScopes.length === 0 && report.ripxCartTransformInstalled ? 0 : 1;
  process.exit(exitCode);
}

function output(report) {
  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log('\nRipX Shopify store install diagnostic\n');
  console.log(`Shop:              ${report.shop}`);
  console.log(`Session in DB:     ${report.hasSession ? 'yes' : 'no'}`);
  if (!report.hasSession) {
    console.log(
      `Tenant row:        ${report.tenantExists ? 'yes (orphan — OAuth never saved token)' : 'no'}`
    );
    if (report.oauthRedirectUri) {
      console.log(`OAuth redirect_uri: ${report.oauthRedirectUri}`);
    }
  }
  if (report.hasSession) {
    console.log(`Token present:     ${report.hasToken ? report.tokenPrefix : 'no'}`);
    console.log(`Session updated:   ${report.updatedAt || '—'}`);
    console.log(
      `Scopes (${report.scopeCount}/${report.requiredScopeCount}): ${report.scopes.join(', ') || '—'}`
    );
    if (report.missingScopes.length > 0) {
      console.log(`Missing scopes:    ${report.missingScopes.join(', ')}`);
    }
  }
  console.log(
    `API key vs prod:   ${report.envMatchesProductionApp ? 'matches production app' : 'MISMATCH — check SHOPIFY_API_KEY'}`
  );
  console.log(`Admin API:         ${report.apiOk ? 'OK' : `FAILED — ${report.apiError}`}`);
  if (report.tokenInvalid) {
    console.log('Token status:      INVALID (401) — install buttons cannot work until re-auth');
  }
  if (report.hasSession) {
    console.log(
      `Price signing secret: ${report.priceAssignmentSecretConfigured ? 'configured' : 'MISSING (blocks start)'}`
    );
    if (report.storefrontRuntimeReady !== undefined) {
      console.log(
        `Storefront runtime:  ${report.storefrontRuntimeReady ? 'ready' : 'not ready'} (proxy script=${report.appProxyScriptDetected ? 'yes' : 'no'}${report.storefrontEmbedVia ? `, via=${report.storefrontEmbedVia}` : ''})`
      );
    }
  }
  if (report.apiOk) {
    console.log(
      `Shop plan:         ${report.shopName || '—'} (Plus=${report.shopifyPlus}, dev=${report.partnerDevelopment})`
    );
    console.log(`Functions:         ${report.functionCount} for this app`);
    report.functions.forEach(fn => {
      console.log(`  - ${fn.title} [${fn.apiType}]`);
    });
    console.log(
      `Cart transform:    ${report.ripxCartTransformInstalled ? 'installed for RipX' : report.cartTransformBlockedByOtherApp ? 'BLOCKED (another app owns slot)' : report.cartTransformFunction ? 'deployed, not installed' : 'not found on app'}`
    );
    console.log(
      `Discount function: ${report.discountFunction ? report.discountFunction.title : 'not found on app'}`
    );
  }
  console.log('\nRecommended next steps:');
  if (report.recommendations.length === 0) {
    console.log('  (none — see JSON with --json for full detail)');
  } else {
    report.recommendations.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  }
  console.log('');
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
