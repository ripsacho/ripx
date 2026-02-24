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
        : 100;
    const baseConf =
      row !== null &&
      row !== undefined &&
      row.confidence_level !== null &&
      row.confidence_level !== undefined
        ? Number(row.confidence_level)
        : 0.95;
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
      minSampleSize: Math.max(10, Math.min(10000, minSampleSize)) || 100,
      confidenceLevel: Math.max(0.8, Math.min(1, confidenceLevel)) || 0.95,
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
      minSampleSize = 100,
      confidenceLevel = 0.95,
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

    const minSample = Math.max(10, Math.min(10000, parseInt(minSampleSize, 10) || 100));
    const confidence = Math.max(0.8, Math.min(1, parseFloat(confidenceLevel) || 0.95));
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
 * Installation snippets and script URLs for Shopify or standalone
 */
router.get('/installation', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    if (!shopDomain) {
      return sendError(res, 401, 'Shop domain or tenant required');
    }

    const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const isShopify = /\.myshopify\.com$/.test(shopDomain);

    let scriptUrl;
    let snippetHtml;
    let platform;
    let instructions;

    if (isShopify) {
      platform = 'shopify';
      // App Proxy URL (recommended) or direct API URL
      scriptUrl = `https://${shopDomain}/apps/ripx/script.js?v=1`;
      const directUrl = `${appUrl}/api/track/script.js?shop=${shopDomain}`;
      snippetHtml = `<!-- RipX A/B Testing - Shopify (App Proxy recommended) -->
<script src="${scriptUrl}"></script>
<!-- Or direct: <script src="${directUrl}"></script> -->`;
      instructions = {
        method: 'App Proxy + App Embed (recommended)',
        steps: [
          'Configure App Proxy in Partner Dashboard: subpath prefix "apps", subpath "ripx", proxy to your app',
          'Enable RipX App Embed in theme editor',
          'Script loads automatically at /apps/ripx/script.js',
        ],
        altMethod: 'Direct script',
        altSnippet: `<script src="${directUrl}"></script>`,
      };
    } else {
      platform = 'standalone';
      scriptUrl = `${appUrl}/api/track/script.js?site=${encodeURIComponent(shopDomain)}`;
      snippetHtml = `<!-- RipX A/B Testing - Standalone -->
<script src="${scriptUrl}"></script>`;
      instructions = {
        method: 'Add to your site',
        steps: [
          "Add the script tag to your site's <head> or before </body>",
          `Ensure your domain "${shopDomain}" is registered (POST /api/tenants/standalone)`,
          'Use the same domain visitors see (no www vs non-www mismatch)',
        ],
      };
    }

    res.json({
      success: true,
      installation: {
        platform,
        domain: shopDomain,
        appUrl,
        scriptUrl,
        snippetHtml,
        instructions,
      },
    });
  } catch (error) {
    next(error);
  }
});

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
