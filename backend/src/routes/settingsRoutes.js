/**
 * Settings Routes
 *
 * API endpoints for shop-level AB test settings
 */

const express = require('express');
const router = express.Router();
const { query } = require('../utils/database');
const { sendError } = require('../utils/response');
const { getLastExportTime } = require('../jobs/bigQueryExport');
const { asyncHandler } = require('../middleware/asyncHandler');
const integrationConfig = require('../services/integrationConfigService');
const { getTenantByDomain } = require('../models/tenant');
const userModel = require('../models/user');
const userDomainAccess = require('../models/userDomainAccess');
const { SETTINGS_BOUNDS } = require('../constants');
const {
  buildCheckoutPriceDiagnostics,
  readRipxCheckoutExtensionConfigFile,
  extensionConfigInputFromReadResult,
} = require('../services/priceCheckoutDiagnostics');
const { buildShopifyFunctionsInventory } = require('../services/shopifyFunctionsInventory');
const { SCRIPT_VERSION } = require('../utils/storefrontScriptRuntime');
const shopifyService = require('../services/shopifyService');
const { getShopSession } = require('../models/shopSession');

const RIPX_DEFAULT_AUTOMATIC_DISCOUNT_TITLE = 'RipX Price Test Function';
const ALLOWED_DISCOUNT_CLASSES = new Set(['PRODUCT', 'ORDER', 'SHIPPING']);

function buildDiscountEnsureTroubleshooting({ shopDomain, chosenFunction, attemptedTitles = [] }) {
  return {
    shopDomain: shopDomain || null,
    function: {
      id: chosenFunction?.id || null,
      title: chosenFunction?.title || null,
      apiType: chosenFunction?.apiType || null,
    },
    attemptedTitles: attemptedTitles.filter(Boolean),
    suggestions: [
      'Ensure the checkout discount function extension is deployed for this app.',
      'Open Shopify Admin > Discounts > Automatic and verify app discounts are visible.',
      'Re-open RipX from Shopify Admin to refresh OAuth token/session for this shop.',
    ],
  };
}

function resolveDiscountClasses(rawClasses) {
  const input = Array.isArray(rawClasses) ? rawClasses : [];
  const normalized = input
    .map(v =>
      String(v || '')
        .trim()
        .toUpperCase()
    )
    .filter(v => ALLOWED_DISCOUNT_CLASSES.has(v));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : ['PRODUCT'];
}

async function fetchAutomaticAppDiscountsViaAdmin(shopDomain, accessToken) {
  const existingQuery = `
    query ripxExistingAutomaticDiscount {
      discountNodes(first: 100) {
        nodes {
          discount {
            ... on DiscountAutomaticApp {
              discountId
              title
              status
              discountClasses
              appDiscountType {
                appKey
                functionId
              }
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
          }
        }
      }
    }
  `;
  const existingResp = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    existingQuery
  );
  const existingNodes = existingResp?.data?.discountNodes?.nodes || [];
  return existingNodes.map(node => node?.discount).filter(Boolean);
}

function pickCheckoutDiscountFunction(functionsList = []) {
  if (!Array.isArray(functionsList) || functionsList.length === 0) {
    return null;
  }
  const normalized = functionsList.filter(Boolean);
  const discountFns = normalized.filter(fn =>
    String(fn?.apiType || '')
      .toLowerCase()
      .includes('discount')
  );
  const ripxDiscount = discountFns.find(fn =>
    String(fn?.title || '')
      .toLowerCase()
      .includes('ripx')
  );
  if (ripxDiscount) {
    return ripxDiscount;
  }
  if (discountFns.length > 0) {
    return discountFns[0];
  }
  return (
    normalized.find(fn =>
      String(fn?.title || '')
        .toLowerCase()
        .includes('ripx')
    ) || null
  );
}

function pickCartTransformFunction(functionsList = []) {
  if (!Array.isArray(functionsList) || functionsList.length === 0) {
    return null;
  }
  const normalized = functionsList.filter(Boolean);
  const cartTransforms = normalized.filter(fn => {
    const apiType = String(fn?.apiType || '')
      .trim()
      .toLowerCase();
    return apiType.includes('cart_transform') || apiType.includes('cart transform');
  });
  const ripxCartTransform = cartTransforms.find(fn =>
    String(fn?.title || '')
      .trim()
      .toLowerCase()
      .includes('ripx')
  );
  if (ripxCartTransform) {
    return ripxCartTransform;
  }
  return cartTransforms.length > 0 ? cartTransforms[0] : null;
}

async function fetchShopifyFunctions(shopDomain, accessToken) {
  const fnQuery = `
    query ripxShopifyFunctions {
      shopifyFunctions(first: 50) {
        nodes {
          id
          title
          apiType
        }
      }
    }
  `;
  const fnResp = await shopifyService.requestAdminGraphql(shopDomain, accessToken, fnQuery);
  return fnResp?.data?.shopifyFunctions?.nodes || [];
}

async function fetchCartTransformsViaAdmin(shopDomain, accessToken) {
  const queryText = `
    query ripxExistingCartTransforms {
      cartTransforms(first: 20) {
        nodes {
          id
          functionId
          blockOnFailure
        }
      }
    }
  `;
  const resp = await shopifyService.requestAdminGraphql(shopDomain, accessToken, queryText);
  return resp?.data?.cartTransforms?.nodes || [];
}

function escapeHtmlAttr(str) {
  if (typeof str !== 'string') {
    return '';
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * GET /api/settings
 * Get settings for the current shop
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const result = await query(
      `SELECT min_sample_size, confidence_level, auto_stop_enabled,
              outbound_webhook_url, outbound_webhook_events,
              overridden_by_admin_min_sample_size, overridden_by_admin_confidence_level,
              overridden_by_admin_auto_stop_enabled, overridden_by_admin_webhook_url,
              overridden_by_admin_webhook_events
       FROM shop_settings
       WHERE shop_domain = $1`,
      [shopDomain]
    );

    const row = result.rows[0];
    const baseMin =
      row !== null &&
      row !== undefined &&
      row.min_sample_size !== null &&
      row.min_sample_size !== undefined
        ? Number(row.min_sample_size)
        : SETTINGS_BOUNDS.DEFAULT_MIN_SAMPLE_SIZE;
    const baseConf =
      row !== null &&
      row !== undefined &&
      row.confidence_level !== null &&
      row.confidence_level !== undefined
        ? Number(row.confidence_level)
        : SETTINGS_BOUNDS.DEFAULT_CONFIDENCE_LEVEL;
    const baseAuto = row === null || row === undefined ? true : row.auto_stop_enabled !== false;
    const baseWebhookUrl = row?.outbound_webhook_url || '';
    let webhookEvents = row?.outbound_webhook_events;
    if (typeof webhookEvents === 'string') {
      try {
        webhookEvents = JSON.parse(webhookEvents);
      } catch {
        webhookEvents = ['test_complete', 'significance'];
      }
    }
    if (!Array.isArray(webhookEvents) || webhookEvents.length === 0) {
      webhookEvents = ['test_complete', 'significance'];
    }
    const minSampleSize =
      row?.overridden_by_admin_min_sample_size !== null &&
      row?.overridden_by_admin_min_sample_size !== undefined
        ? Number(row.overridden_by_admin_min_sample_size)
        : baseMin;
    const confidenceLevel =
      row?.overridden_by_admin_confidence_level !== null &&
      row?.overridden_by_admin_confidence_level !== undefined
        ? Number(row.overridden_by_admin_confidence_level)
        : baseConf;
    const autoStopEnabled =
      row?.overridden_by_admin_auto_stop_enabled !== null &&
      row?.overridden_by_admin_auto_stop_enabled !== undefined
        ? row.overridden_by_admin_auto_stop_enabled === true
        : baseAuto;
    const outboundWebhookUrl =
      row?.overridden_by_admin_webhook_url !== undefined &&
      row?.overridden_by_admin_webhook_url !== null
        ? String(row.overridden_by_admin_webhook_url)
        : baseWebhookUrl;
    let outboundWebhookEvents = webhookEvents;
    if (
      row?.overridden_by_admin_webhook_events !== null &&
      row?.overridden_by_admin_webhook_events !== undefined &&
      Array.isArray(row.overridden_by_admin_webhook_events)
    ) {
      outboundWebhookEvents = row.overridden_by_admin_webhook_events;
    } else if (
      row?.overridden_by_admin_webhook_events !== null &&
      row?.overridden_by_admin_webhook_events !== undefined &&
      typeof row.overridden_by_admin_webhook_events === 'string'
    ) {
      try {
        outboundWebhookEvents = JSON.parse(row.overridden_by_admin_webhook_events);
      } catch {
        outboundWebhookEvents = webhookEvents;
      }
    }
    const settings = {
      minSampleSize:
        Math.max(
          SETTINGS_BOUNDS.MIN_SAMPLE_SIZE,
          Math.min(SETTINGS_BOUNDS.MAX_SAMPLE_SIZE, minSampleSize)
        ) || SETTINGS_BOUNDS.DEFAULT_MIN_SAMPLE_SIZE,
      confidenceLevel:
        Math.max(
          SETTINGS_BOUNDS.CONFIDENCE_LEVEL_MIN,
          Math.min(SETTINGS_BOUNDS.CONFIDENCE_LEVEL_MAX, confidenceLevel)
        ) || SETTINGS_BOUNDS.DEFAULT_CONFIDENCE_LEVEL,
      autoStopEnabled: !!autoStopEnabled,
      outboundWebhookUrl: outboundWebhookUrl || '',
      outboundWebhookEvents:
        Array.isArray(outboundWebhookEvents) && outboundWebhookEvents.length > 0
          ? outboundWebhookEvents
          : ['test_complete', 'significance'],
    };

    res.json({ success: true, settings });
  })
);

/**
 * PUT /api/settings
 * Update settings for the current shop
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const {
      minSampleSize = SETTINGS_BOUNDS.DEFAULT_MIN_SAMPLE_SIZE,
      confidenceLevel = SETTINGS_BOUNDS.DEFAULT_CONFIDENCE_LEVEL,
      autoStopEnabled = true,
      outboundWebhookUrl = '',
      outboundWebhookEvents = ['test_complete', 'significance'],
    } = req.body;

    const webhookUrl = (outboundWebhookUrl || '').trim();
    if (webhookUrl) {
      try {
        new URL(webhookUrl);
      } catch {
        return sendError(res, 400, 'Invalid webhook URL. Must be a valid URL (e.g. https://...)');
      }
    }

    const minSample = Math.max(
      SETTINGS_BOUNDS.MIN_SAMPLE_SIZE,
      Math.min(
        SETTINGS_BOUNDS.MAX_SAMPLE_SIZE,
        parseInt(minSampleSize, 10) || SETTINGS_BOUNDS.DEFAULT_MIN_SAMPLE_SIZE
      )
    );
    const confidence = Math.max(
      SETTINGS_BOUNDS.CONFIDENCE_LEVEL_MIN,
      Math.min(
        SETTINGS_BOUNDS.CONFIDENCE_LEVEL_MAX,
        parseFloat(confidenceLevel) || SETTINGS_BOUNDS.DEFAULT_CONFIDENCE_LEVEL
      )
    );
    const events =
      Array.isArray(outboundWebhookEvents) && outboundWebhookEvents.length > 0
        ? outboundWebhookEvents
        : ['test_complete', 'significance'];

    await query(
      `INSERT INTO shop_settings (shop_domain, min_sample_size, confidence_level, auto_stop_enabled, 
        outbound_webhook_url, outbound_webhook_events, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (shop_domain)
       DO UPDATE SET
         min_sample_size = EXCLUDED.min_sample_size,
         confidence_level = EXCLUDED.confidence_level,
         auto_stop_enabled = EXCLUDED.auto_stop_enabled,
         outbound_webhook_url = EXCLUDED.outbound_webhook_url,
         outbound_webhook_events = EXCLUDED.outbound_webhook_events,
         updated_at = NOW()`,
      [
        shopDomain,
        minSample,
        confidence,
        !!autoStopEnabled,
        webhookUrl || null,
        JSON.stringify(events),
      ]
    );

    res.json({
      success: true,
      settings: {
        minSampleSize: minSample,
        confidenceLevel: confidence,
        autoStopEnabled: !!autoStopEnabled,
        outboundWebhookUrl: webhookUrl || '',
        outboundWebhookEvents: events,
      },
    });
  })
);

/**
 * GET /api/settings/installation
 * Installation snippets and script URLs for Shopify or standalone.
 * Optional query: domain=example.com (for email session, to show installation for a specific domain).
 * Returns scriptVerified: true when the script has been detected on the site (domain_verified_at set).
 */
router.get('/installation', async (req, res, next) => {
  try {
    let shopDomain = req.shopDomain || (req.query.domain && String(req.query.domain).trim()) || '';
    // Email session: req.shopDomain is the user's email; resolve domain from query or first from DB
    if (req.authType === 'email' && req.email && (shopDomain.includes('@') || !shopDomain)) {
      const user = await userModel.getByEmail(req.email);
      if (!user) {
        return sendError(res, 401, 'User not found');
      }
      const tenantIds = await userDomainAccess.getTenantIdsForUser(user.id, user.account_id);
      if (tenantIds.length === 0) {
        return sendError(res, 400, 'Add a domain in My domains first, then open Setup wizard.');
      }
      const tenantsResult = await query(
        'SELECT domain FROM tenants WHERE id = ANY($1::uuid[]) ORDER BY created_at ASC',
        [tenantIds]
      );
      const allowedDomains = tenantsResult.rows.map(r => r.domain.toLowerCase());
      const domainFromQuery =
        req.query.domain &&
        String(req.query.domain)
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, '')
          .split('/')[0];
      if (domainFromQuery && allowedDomains.includes(domainFromQuery)) {
        shopDomain = domainFromQuery;
      } else {
        shopDomain = tenantsResult.rows[0]?.domain || '';
      }
    }
    if (!shopDomain || shopDomain.includes('@')) {
      return sendError(
        res,
        401,
        'Shop domain or tenant required. Add a domain in My domains, or open a domain first.'
      );
    }

    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const isShopify = /\.myshopify\.com$/.test(shopDomain);

    let scriptUrl;
    let snippetHtml;
    let platform;
    let instructions;

    // Origin for resource hints (preconnect/dns-prefetch) to reduce script load latency
    const scriptOrigin = appUrl
      ? (function () {
          try {
            const u = new URL(appUrl);
            return u.origin || '';
          } catch (_) {
            return '';
          }
        })()
      : '';

    if (isShopify) {
      platform = 'shopify';
      scriptUrl = `https://${shopDomain}/apps/ripx/script.js?v=${SCRIPT_VERSION}`;
      const directUrl = `${appUrl}/api/track/script.js?shop=${encodeURIComponent(shopDomain)}&v=${SCRIPT_VERSION}`;
      const resourceHints = scriptOrigin
        ? `<!-- Optional: early connection to API origin (~100–300ms saved) -->
<link rel="preconnect" href="${escapeHtmlAttr(scriptOrigin)}" crossorigin>
<link rel="dns-prefetch" href="${escapeHtmlAttr(scriptOrigin)}">
`
        : '';
      snippetHtml = `<!-- RipX A/B Testing - Shopify. Place in <head> with defer (matches Theme App Embed). -->
${resourceHints}<script src="${scriptUrl}" defer crossorigin="anonymous" fetchpriority="high"></script>
<!-- fetchpriority=high reduces A/B flicker; switch to low if LCP/image loading regresses. -->
<!-- Alternative (direct API): <script src="${directUrl}" defer crossorigin="anonymous" fetchpriority="low"></script> -->`;
      instructions = {
        method: 'App Proxy + App Embed (recommended)',
        steps: [
          'Configure App Proxy in Partner Dashboard: subpath prefix "apps", subpath "ripx", proxy to your app',
          'Enable RipX App Embed in theme editor (injects in <head> with defer + fetchpriority=high, same intent as manual snippet below)',
          `Script URL includes ?v=${SCRIPT_VERSION} so theme/CDN caches refresh when RipX updates the embed`,
        ],
        altMethod: 'Direct script',
        altSnippet: `<script src="${directUrl}" defer crossorigin="anonymous" fetchpriority="low"></script>`,
        cartNative: {
          status: 'manual_required',
          heading: 'Cart native discount rendering (recommended)',
          summary:
            'Checkout charged price is controlled by the Discount Function. To align cart UI across themes, render Shopify native discount values in cart lines/summary instead of relying only on JS text replacement.',
          appBlockName: 'RipX Cart Summary',
          lineSnippet: "{% render 'ripx-native-cart-line-price', item: item %}",
          summarySnippet: "{% render 'ripx-native-cart-summary' %}",
          markers: [
            'data-ripx-native-cart="1"',
            'data-ripx-native-cart-line="1"',
            'data-ripx-native-cart-block="1"',
          ],
          steps: [
            'Enable RipX App Embed (required for assignment + _ripx_* cart properties).',
            'Add app block "RipX Cart Summary" in cart/footer sections that support app blocks.',
            'In Dawn-style cart line templates, render ripx-native-cart-line-price for each line item.',
            'Use ripx-native-cart-summary for subtotal/discount rows in cart page and drawer.',
          ],
        },
      };
    } else {
      platform = 'standalone';
      scriptUrl = `${appUrl}/api/track/script.js?site=${encodeURIComponent(shopDomain)}&v=${SCRIPT_VERSION}`;
      const resourceHints = scriptOrigin
        ? `<!-- Optional: early connection to API origin (~100–300ms saved) -->
<link rel="preconnect" href="${escapeHtmlAttr(scriptOrigin)}" crossorigin>
<link rel="dns-prefetch" href="${escapeHtmlAttr(scriptOrigin)}">
`
        : '';
      snippetHtml = `<!-- RipX A/B Testing - Standalone. Place in <head>; defer avoids blocking page load. -->
${resourceHints}<script src="${scriptUrl}" defer crossorigin="anonymous" fetchpriority="low" data-ripx-domain="${escapeHtmlAttr(shopDomain)}"></script>`;
      instructions = {
        method: 'Add to your site',
        steps: [
          "Add the script tag to your site's <head> (required for earliest variation handling and less flicker)",
          `Ensure your domain "${shopDomain}" is registered (add it in My domains if needed)`,
          'Use the same domain visitors see (no www vs non-www mismatch)',
        ],
      };
    }

    const tenant = await getTenantByDomain(shopDomain);
    const scriptVerified = !!(tenant && tenant.domain_verified_at);

    res.json({
      success: true,
      installation: {
        platform,
        domain: shopDomain,
        appUrl,
        scriptUrl,
        snippetHtml,
        instructions,
        scriptVerified,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/settings/shopify-functions-inventory
 * Lists shopifyFunctions for this app on the store + RipX manifest expectations (discount + cart transform).
 */
router.get(
  '/shopify-functions-inventory',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      const empty = buildShopifyFunctionsInventory([], shopDomain);
      res.set('Cache-Control', 'no-store');
      return res.json({
        ...empty,
        success: false,
        error:
          'Missing Shopify access token for this shop. Re-open RipX from Shopify Admin and try again.',
      });
    }

    let shopifyFunctions = [];
    try {
      shopifyFunctions = await fetchShopifyFunctions(shopDomain, accessToken);
    } catch (e) {
      const empty = buildShopifyFunctionsInventory([], shopDomain);
      res.set('Cache-Control', 'no-store');
      return res.json({
        ...empty,
        success: false,
        error: e?.message || 'Failed to query shopifyFunctions',
      });
    }

    res.set('Cache-Control', 'no-store');
    return res.json(buildShopifyFunctionsInventory(shopifyFunctions, shopDomain));
  })
);

/**
 * GET /api/settings/checkout-price-diagnostics
 * Same payload as GET /api/track/price-checkout-diagnostics?shop=… but uses the authenticated
 * shop domain (no query param). Use from the RipX app UI to avoid cross-origin fetch/CORS issues.
 */
router.get(
  '/checkout-price-diagnostics',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const countRes = await query(
      `SELECT COUNT(*)::int AS c FROM tests
       WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
         AND LOWER(TRIM(status)) = 'running'
         AND LOWER(TRIM(type)) IN ('price', 'pricing')`,
      [shopDomain]
    );
    const runningPriceTests = countRes.rows[0]?.c ?? 0;

    const skipExtDiag =
      (process.env.RIPX_DIAGNOSTICS_SKIP_EXTENSION_CONFIG || '').toLowerCase() === 'true';
    const extensionConfig = skipExtDiag
      ? { source: 'omit' }
      : extensionConfigInputFromReadResult(readRipxCheckoutExtensionConfigFile());
    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    let shopifyFunctions = [];
    if (accessToken) {
      try {
        shopifyFunctions = await fetchShopifyFunctions(shopDomain, accessToken);
      } catch (_error) {
        shopifyFunctions = [];
      }
    }

    const body = buildCheckoutPriceDiagnostics({
      shopDomain,
      tenantRegistered: true,
      runningPriceTests,
      extensionConfig,
      shopifyFunctions,
    });

    res.set('Cache-Control', 'no-store');
    return res.json(body);
  })
);

/**
 * POST /api/settings/checkout-price-discount/ensure
 * Create (or fetch) an automatic app discount that uses the RipX checkout function.
 */
router.post(
  '/checkout-price-discount/ensure',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendError(
        res,
        400,
        'Missing Shopify access token for this shop. Re-open RipX from Shopify Admin and try again.'
      );
    }

    const requestedTitle = String(req.body?.title || '').trim();
    const discountTitle = requestedTitle || RIPX_DEFAULT_AUTOMATIC_DISCOUNT_TITLE;
    const discountClasses = resolveDiscountClasses(req.body?.discountClasses);
    const functionNodes = await fetchShopifyFunctions(shopDomain, accessToken);
    const chosenFunction = pickCheckoutDiscountFunction(functionNodes);
    if (!chosenFunction?.id) {
      return sendError(
        res,
        404,
        'No discount function found for this app on the shop. Deploy the app extension and try again.'
      );
    }

    const createMutation = `
      mutation ripxCreateAutomaticAppDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
            title
            status
          }
          userErrors {
            field
            message
            code
          }
        }
      }
    `;
    const attemptedTitles = [discountTitle];
    const createVars = {
      automaticAppDiscount: {
        title: discountTitle,
        functionId: chosenFunction.id,
        discountClasses,
        startsAt: new Date().toISOString(),
      },
    };
    const createResp = await shopifyService.requestAdminGraphql(
      shopDomain,
      accessToken,
      createMutation,
      createVars
    );
    const createPayload = createResp?.data?.discountAutomaticAppCreate;
    const createErrors = Array.isArray(createPayload?.userErrors) ? createPayload.userErrors : [];
    const createErrorDetails = createErrors.map(err => ({
      field: Array.isArray(err?.field) ? err.field.join('.') : err?.field || null,
      message: err?.message || null,
      code: err?.code || null,
    }));
    if (createErrors.length === 0 && createPayload?.automaticAppDiscount?.discountId) {
      const createdId = String(createPayload.automaticAppDiscount.discountId || '').trim();
      const latestDiscounts = await fetchAutomaticAppDiscountsViaAdmin(shopDomain, accessToken);
      const listMatched = latestDiscounts.filter(
        d => String(d?.discountId || '').trim() === createdId
      );
      return res.json({
        success: true,
        created: true,
        discount: createPayload.automaticAppDiscount,
        function: {
          id: chosenFunction.id,
          title: chosenFunction.title || null,
          apiType: chosenFunction.apiType || null,
        },
        listCheck: {
          inList: listMatched.length > 0,
          matchedCount: listMatched.length,
          matchedDiscounts: listMatched,
        },
        troubleshooting: buildDiscountEnsureTroubleshooting({
          shopDomain,
          chosenFunction,
          attemptedTitles,
        }),
      });
    }

    const titleTaken = createErrors.some(err =>
      String(err?.message || '')
        .toLowerCase()
        .includes('title')
    );
    if (!titleTaken) {
      return sendError(
        res,
        400,
        createErrors[0]?.message || 'Could not create automatic app discount.',
        {
          function: {
            id: chosenFunction.id,
            title: chosenFunction.title || null,
            apiType: chosenFunction.apiType || null,
          },
          shopifyUserErrors: createErrorDetails,
          troubleshooting: buildDiscountEnsureTroubleshooting({
            shopDomain,
            chosenFunction,
            attemptedTitles,
          }),
        }
      );
    }

    const existingDiscounts = await fetchAutomaticAppDiscountsViaAdmin(shopDomain, accessToken);
    const existing = existingDiscounts.find(
      d => d && String(d.title || '').toLowerCase() === discountTitle.toLowerCase()
    );
    if (existing?.discountId) {
      return res.json({
        success: true,
        created: false,
        discount: existing,
        function: {
          id: chosenFunction.id,
          title: chosenFunction.title || null,
          apiType: chosenFunction.apiType || null,
        },
        troubleshooting: buildDiscountEnsureTroubleshooting({
          shopDomain,
          chosenFunction,
          attemptedTitles,
        }),
        listCheck: {
          inList: true,
          matchedCount: 1,
          matchedDiscounts: [existing],
        },
      });
    }

    // Title may be considered in conflict but the existing item may not be searchable yet.
    // Retry once with a deterministic alternate title to reduce "invisible conflict" failures.
    const fallbackTitle = `${discountTitle} (${shopDomain})`;
    if (!attemptedTitles.includes(fallbackTitle)) {
      attemptedTitles.push(fallbackTitle);
    }
    const retryVars = {
      automaticAppDiscount: {
        title: fallbackTitle,
        functionId: chosenFunction.id,
        discountClasses,
        startsAt: new Date().toISOString(),
      },
    };
    const retryResp = await shopifyService.requestAdminGraphql(
      shopDomain,
      accessToken,
      createMutation,
      retryVars
    );
    const retryPayload = retryResp?.data?.discountAutomaticAppCreate;
    const retryErrors = Array.isArray(retryPayload?.userErrors) ? retryPayload.userErrors : [];
    if (retryErrors.length === 0 && retryPayload?.automaticAppDiscount?.discountId) {
      const createdId = String(retryPayload.automaticAppDiscount.discountId || '').trim();
      const latestDiscounts = await fetchAutomaticAppDiscountsViaAdmin(shopDomain, accessToken);
      const listMatched = latestDiscounts.filter(
        d => String(d?.discountId || '').trim() === createdId
      );
      return res.json({
        success: true,
        created: true,
        titleAdjusted: true,
        discount: retryPayload.automaticAppDiscount,
        function: {
          id: chosenFunction.id,
          title: chosenFunction.title || null,
          apiType: chosenFunction.apiType || null,
        },
        troubleshooting: buildDiscountEnsureTroubleshooting({
          shopDomain,
          chosenFunction,
          attemptedTitles,
        }),
        listCheck: {
          inList: listMatched.length > 0,
          matchedCount: listMatched.length,
          matchedDiscounts: listMatched,
        },
      });
    }

    return sendError(
      res,
      400,
      createErrors[0]?.message ||
        'Automatic app discount may already exist, but could not be verified.',
      {
        function: {
          id: chosenFunction.id,
          title: chosenFunction.title || null,
          apiType: chosenFunction.apiType || null,
        },
        shopifyUserErrors: createErrorDetails,
        retryUserErrors: retryErrors.map(err => ({
          field: Array.isArray(err?.field) ? err.field.join('.') : err?.field || null,
          message: err?.message || null,
          code: err?.code || null,
        })),
        troubleshooting: buildDiscountEnsureTroubleshooting({
          shopDomain,
          chosenFunction,
          attemptedTitles,
        }),
      }
    );
  })
);

/**
 * GET /api/settings/checkout-price-discount/status
 * Verify if RipX checkout discount appears in Shopify automatic discount list.
 */
router.get(
  '/checkout-price-discount/status',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendError(
        res,
        400,
        'Missing Shopify access token for this shop. Re-open RipX from Shopify Admin and try again.'
      );
    }

    const requestedTitle = String(req.query?.title || req.query?.discount_title || '').trim();
    const requestedId = String(req.query?.discount_id || req.query?.discountId || '').trim();
    const targetTitle = requestedTitle || RIPX_DEFAULT_AUTOMATIC_DISCOUNT_TITLE;

    const automaticDiscounts = await fetchAutomaticAppDiscountsViaAdmin(shopDomain, accessToken);
    const matched = automaticDiscounts.filter(discount => {
      const id = String(discount?.discountId || '').trim();
      const title = String(discount?.title || '')
        .trim()
        .toLowerCase();
      if (requestedId && id === requestedId) {
        return true;
      }
      if (title === targetTitle.toLowerCase()) {
        return true;
      }
      return !requestedTitle && title.includes('ripx');
    });

    return res.json({
      success: true,
      inList: matched.length > 0,
      matchedCount: matched.length,
      matchedDiscounts: matched,
      inspectedCount: automaticDiscounts.length,
      targetTitle,
      targetDiscountId: requestedId || null,
    });
  })
);

/**
 * POST /api/settings/cart-transform/ensure
 * Ensures the RipX cart transform is installed on the shop.
 */
router.post(
  '/cart-transform/ensure',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendError(
        res,
        400,
        'Missing Shopify access token for this shop. Re-open RipX from Shopify Admin and try again.'
      );
    }

    const functionNodes = await fetchShopifyFunctions(shopDomain, accessToken);
    const chosenFunction = pickCartTransformFunction(functionNodes);
    if (!chosenFunction?.id) {
      return sendError(
        res,
        404,
        'No cart transform function found for this app on the shop. Deploy ripx-cart-transform and try again.'
      );
    }

    const existingTransforms = await fetchCartTransformsViaAdmin(shopDomain, accessToken);
    const chosenFunctionId = String(chosenFunction.id || '').trim();
    const alreadyInstalled = existingTransforms.find(
      node => String(node?.functionId || '').trim() === chosenFunctionId
    );
    if (alreadyInstalled) {
      return res.json({
        success: true,
        created: false,
        cartTransform: alreadyInstalled,
        function: {
          id: chosenFunction.id,
          title: chosenFunction.title || null,
          apiType: chosenFunction.apiType || null,
        },
      });
    }

    if (existingTransforms.length > 0) {
      return sendError(
        res,
        409,
        'A different cart transform is already installed on this shop. Shopify allows only one cart transform per store.',
        {
          existingCartTransforms: existingTransforms,
          function: {
            id: chosenFunction.id,
            title: chosenFunction.title || null,
            apiType: chosenFunction.apiType || null,
          },
        }
      );
    }

    const createMutation = `
      mutation ripxCreateCartTransform($functionId: String!) {
        cartTransformCreate(functionId: $functionId) {
          cartTransform {
            id
            functionId
            blockOnFailure
          }
          userErrors {
            field
            message
          }
        }
      }
    `;
    const createResp = await shopifyService.requestAdminGraphql(
      shopDomain,
      accessToken,
      createMutation,
      { functionId: chosenFunction.id }
    );
    const payload = createResp?.data?.cartTransformCreate;
    const userErrors = Array.isArray(payload?.userErrors) ? payload.userErrors : [];
    if (userErrors.length > 0 || !payload?.cartTransform?.id) {
      return sendError(res, 400, userErrors[0]?.message || 'Could not install cart transform.', {
        function: {
          id: chosenFunction.id,
          title: chosenFunction.title || null,
          apiType: chosenFunction.apiType || null,
        },
        shopifyUserErrors: userErrors.map(err => ({
          field: Array.isArray(err?.field) ? err.field.join('.') : err?.field || null,
          message: err?.message || null,
        })),
      });
    }

    return res.json({
      success: true,
      created: true,
      cartTransform: payload.cartTransform,
      function: {
        id: chosenFunction.id,
        title: chosenFunction.title || null,
        apiType: chosenFunction.apiType || null,
      },
    });
  })
);

/**
 * GET /api/settings/cart-transform/status
 * Lists installed cartTransforms and whether this app's cart transform function is installed.
 */
router.get(
  '/cart-transform/status',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const fallbackSession = await getShopSession(shopDomain);
    const accessToken = req.shopifyAccessToken || fallbackSession?.access_token || '';
    if (!accessToken) {
      return sendError(
        res,
        400,
        'Missing Shopify access token for this shop. Re-open RipX from Shopify Admin and try again.'
      );
    }

    const functionNodes = await fetchShopifyFunctions(shopDomain, accessToken);
    const chosenFunction = pickCartTransformFunction(functionNodes);
    const existingTransforms = await fetchCartTransformsViaAdmin(shopDomain, accessToken);
    const chosenFunctionId = String(chosenFunction?.id || '').trim();
    const matchedTransforms = existingTransforms.filter(
      node => String(node?.functionId || '').trim() === chosenFunctionId
    );

    return res.json({
      success: true,
      function: chosenFunction
        ? {
            id: chosenFunction.id,
            title: chosenFunction.title || null,
            apiType: chosenFunction.apiType || null,
          }
        : null,
      installedCount: existingTransforms.length,
      installedTransforms: existingTransforms,
      matchedCount: matchedTransforms.length,
      matchedTransforms,
      installedForRipxFunction: matchedTransforms.length > 0,
    });
  })
);

/**
 * GET /api/settings/integrations
 * Status and config of GA4 and BigQuery (from DB or env)
 * Returns masked secrets for display; never exposes full secrets.
 */
router.get(
  '/integrations',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const dbConfig = await integrationConfig.getIntegrationConfig(shopDomain);
    const ga4Configured = await integrationConfig.isGA4Configured(shopDomain);
    const bqConfigured = await integrationConfig.isBigQueryConfigured(shopDomain);

    const bqConfig = await integrationConfig.getBigQueryConfig(shopDomain);
    let lastExportAt = null;
    if (bqConfigured && bqConfig) {
      const ts = await getLastExportTime();
      lastExportAt = ts ? ts.toISOString() : null;
    }

    res.json({
      success: true,
      integrations: {
        ga4: {
          configured: ga4Configured,
          measurementId: dbConfig?.ga4MeasurementId
            ? `${dbConfig.ga4MeasurementId.substring(0, 4)}***`
            : null,
          hint: ga4Configured
            ? 'Events are forwarded to GA4'
            : 'Configure below or set GA4_MEASUREMENT_ID and GA4_API_SECRET in .env',
        },
        bigquery: {
          configured: bqConfigured,
          projectId: bqConfig?.projectId || null,
          dataset: bqConfig?.dataset || 'ripx_analytics',
          lastExportAt,
          hasCredentials: !!(
            dbConfig?.bigqueryCredentials || process.env.GOOGLE_APPLICATION_CREDENTIALS
          ),
          hint: bqConfigured
            ? `Export to ${bqConfig?.projectId}.${bqConfig?.dataset}`
            : 'Configure below or set GCP_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS in .env',
        },
      },
      config: {
        ga4MeasurementId: dbConfig?.ga4MeasurementId || '',
        ga4ApiSecret: dbConfig?.ga4ApiSecret ? '••••••••' : '',
        bigqueryProjectId: dbConfig?.bigqueryProjectId || '',
        bigqueryDataset: dbConfig?.bigqueryDataset || 'ripx_analytics',
        bigqueryCredentials: dbConfig?.bigqueryCredentials ? '[configured]' : '',
      },
    });
  })
);

/**
 * PUT /api/settings/integrations
 * Save GA4 and BigQuery config from UI
 */
router.put(
  '/integrations',
  asyncHandler(async (req, res) => {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain required');
    }

    const {
      ga4MeasurementId,
      ga4ApiSecret,
      bigqueryProjectId,
      bigqueryDataset,
      bigqueryCredentials,
    } = req.body;

    const config = {};
    if (ga4MeasurementId !== undefined) {
      config.ga4MeasurementId = ga4MeasurementId;
    }
    if (ga4ApiSecret !== undefined) {
      config.ga4ApiSecret = ga4ApiSecret;
    }
    if (bigqueryProjectId !== undefined) {
      config.bigqueryProjectId = bigqueryProjectId;
    }
    if (bigqueryDataset !== undefined) {
      config.bigqueryDataset = bigqueryDataset;
    }
    if (bigqueryCredentials !== undefined) {
      config.bigqueryCredentials = bigqueryCredentials;
    }

    const dbConfig = await integrationConfig.getIntegrationConfig(shopDomain);
    const PLACEHOLDER = '••••••••';
    const mergeSecret = (val, existing) => {
      if (val === undefined) {
        return existing || '';
      }
      if (val === '' || val === PLACEHOLDER) {
        return existing || '';
      }
      return val;
    };
    const merged = {
      ga4MeasurementId:
        (config.ga4MeasurementId !== undefined
          ? config.ga4MeasurementId
          : dbConfig?.ga4MeasurementId) || '',
      ga4ApiSecret: mergeSecret(config.ga4ApiSecret, dbConfig?.ga4ApiSecret),
      bigqueryProjectId:
        (config.bigqueryProjectId !== undefined
          ? config.bigqueryProjectId
          : dbConfig?.bigqueryProjectId) || '',
      bigqueryDataset:
        (config.bigqueryDataset !== undefined
          ? config.bigqueryDataset
          : dbConfig?.bigqueryDataset) || 'ripx_analytics',
      bigqueryCredentials:
        config.bigqueryCredentials === '[configured]' || config.bigqueryCredentials === PLACEHOLDER
          ? dbConfig?.bigqueryCredentials || ''
          : (config.bigqueryCredentials !== undefined
              ? config.bigqueryCredentials
              : dbConfig?.bigqueryCredentials) || '',
    };

    await integrationConfig.saveIntegrationConfig(shopDomain, merged);
    const updated = await integrationConfig.getIntegrationConfig(shopDomain);

    res.json({
      success: true,
      integrations: {
        ga4: { configured: !!(updated?.ga4MeasurementId && updated?.ga4ApiSecret) },
        bigquery: { configured: !!updated?.bigqueryProjectId },
      },
    });
  })
);

module.exports = router;
