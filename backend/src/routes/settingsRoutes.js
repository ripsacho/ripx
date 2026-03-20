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
const { buildCheckoutPriceDiagnostics } = require('../services/priceCheckoutDiagnostics');
const { SCRIPT_VERSION } = require('../utils/storefrontScriptRuntime');

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
      snippetHtml = `<!-- RipX A/B Testing - Shopify. Place in <head> for earliest execution. -->
${resourceHints}<script src="${scriptUrl}" defer crossorigin="anonymous" fetchpriority="low"></script>
<!-- Alternative (direct API): <script src="${directUrl}" defer crossorigin="anonymous" fetchpriority="low"></script> -->`;
      instructions = {
        method: 'App Proxy + App Embed (recommended)',
        steps: [
          'Configure App Proxy in Partner Dashboard: subpath prefix "apps", subpath "ripx", proxy to your app',
          'Enable RipX App Embed in theme editor',
          'Script loads automatically at /apps/ripx/script.js',
        ],
        altMethod: 'Direct script',
        altSnippet: `<script src="${directUrl}" defer crossorigin="anonymous" fetchpriority="low"></script>`,
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
          "Add the script tag to your site's <head> (recommended) or before </body>",
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
         AND type = $2`,
      [shopDomain, 'price']
    );
    const runningPriceTests = countRes.rows[0]?.c ?? 0;

    const body = buildCheckoutPriceDiagnostics({
      shopDomain,
      tenantRegistered: true,
      runningPriceTests,
    });

    res.set('Cache-Control', 'no-store');
    return res.json(body);
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
