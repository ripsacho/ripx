/**
 * Integration Config Service
 *
 * Loads GA4 and BigQuery config from shop_settings (UI-configured) or env vars.
 * DB config takes precedence over env when both exist.
 */

const { query } = require('../utils/database');

/**
 * Get integration config for a shop from DB
 * @param {string} shopDomain
 * @returns {Promise<Object|null>}
 */
async function getIntegrationConfig(shopDomain) {
  if (!shopDomain || !shopDomain.trim()) {return null;}
  try {
    const result = await query(
      `SELECT ga4_measurement_id, ga4_api_secret, bigquery_project_id, bigquery_dataset, bigquery_credentials
       FROM shop_settings WHERE shop_domain = $1`,
      [shopDomain]
    );
    const row = result.rows[0];
    if (!row) {return null;}
    return {
      ga4MeasurementId: row.ga4_measurement_id?.trim() || null,
      ga4ApiSecret: row.ga4_api_secret?.trim() || null,
      bigqueryProjectId: row.bigquery_project_id?.trim() || null,
      bigqueryDataset: (row.bigquery_dataset?.trim() || 'ripx_analytics'),
      bigqueryCredentials: row.bigquery_credentials?.trim() || null,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Get GA4 config - DB first, then env
 * @param {string} [shopDomain]
 */
async function getGA4Config(shopDomain) {
  if (shopDomain) {
    const db = await getIntegrationConfig(shopDomain);
    if (db?.ga4MeasurementId && db?.ga4ApiSecret) {
      return { measurementId: db.ga4MeasurementId, apiSecret: db.ga4ApiSecret };
    }
  }
  const id = process.env.GA4_MEASUREMENT_ID?.trim();
  const secret = process.env.GA4_API_SECRET?.trim();
  if (id && secret) {return { measurementId: id, apiSecret: secret };}
  return null;
}

/**
 * Check if GA4 is configured (any shop or env)
 * @param {string} [shopDomain] - if provided, check for this shop only
 */
async function isGA4Configured(shopDomain) {
  const config = await getGA4Config(shopDomain);
  return !!(config?.measurementId && config?.apiSecret);
}

/**
 * Get BigQuery config - DB first (for shop), then env
 * @param {string} [shopDomain]
 */
async function getBigQueryConfig(shopDomain) {
  if (shopDomain) {
    const db = await getIntegrationConfig(shopDomain);
    if (db?.bigqueryProjectId) {
      let credentials = null;
      if (db.bigqueryCredentials) {
        try {
          credentials = JSON.parse(db.bigqueryCredentials);
        } catch {
          // invalid JSON
        }
      }
      return {
        projectId: db.bigqueryProjectId,
        dataset: db.bigqueryDataset,
        credentials,
      };
    }
  }
  const projectId = process.env.GCP_PROJECT_ID?.trim();
  const dataset = process.env.GCP_DATASET?.trim() || 'ripx_analytics';
  if (projectId) {
    return {
      projectId,
      dataset,
      credentials: null, // use GOOGLE_APPLICATION_CREDENTIALS file
    };
  }
  return null;
}

/**
 * Check if BigQuery is configured
 * @param {string} [shopDomain]
 */
async function isBigQueryConfigured(shopDomain) {
  const config = await getBigQueryConfig(shopDomain);
  return !!(config?.projectId);
}

/**
 * Save integration config for a shop
 * @param {string} shopDomain
 * @param {Object} config - { ga4MeasurementId, ga4ApiSecret, bigqueryProjectId, bigqueryDataset, bigqueryCredentials }
 */
async function saveIntegrationConfig(shopDomain, config) {
  if (!shopDomain?.trim()) {throw new Error('Shop domain required');}

  const ga4Id = (config.ga4MeasurementId || '').trim() || null;
  const ga4Secret = (config.ga4ApiSecret || '').trim() || null;
  const bqProject = (config.bigqueryProjectId || '').trim() || null;
  const bqDataset = (config.bigqueryDataset || 'ripx_analytics').trim() || 'ripx_analytics';
  const bqCreds = (config.bigqueryCredentials || '').trim() || null;

  // Validate BigQuery credentials JSON if provided
  if (bqCreds) {
    try {
      JSON.parse(bqCreds);
    } catch {
      throw new Error('BigQuery credentials must be valid JSON (service account key)');
    }
  }

  await query(
    `INSERT INTO shop_settings (shop_domain, ga4_measurement_id, ga4_api_secret, bigquery_project_id, bigquery_dataset, bigquery_credentials, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (shop_domain)
     DO UPDATE SET
       ga4_measurement_id = $2,
       ga4_api_secret = $3,
       bigquery_project_id = $4,
       bigquery_dataset = $5,
       bigquery_credentials = $6,
       updated_at = NOW()`,
    [shopDomain, ga4Id, ga4Secret, bqProject, bqDataset, bqCreds]
  );
}

module.exports = {
  getIntegrationConfig,
  getGA4Config,
  getBigQueryConfig,
  isGA4Configured,
  isBigQueryConfigured,
  saveIntegrationConfig,
};
