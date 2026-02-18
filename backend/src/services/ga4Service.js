/**
 * GA4 Integration Service
 *
 * Forwards RipX events to Google Analytics 4 via Measurement Protocol.
 * When GA4_MEASUREMENT_ID and GA4_API_SECRET are set, conversion and custom
 * events are sent to GA4 for unified analytics.
 *
 * Setup:
 * 1. In GA4: Admin > Data Streams > Web stream > Measurement Protocol API secrets
 * 2. Create API secret, copy the secret value
 * 3. Set GA4_MEASUREMENT_ID (e.g. G-XXXXXXXXXX) and GA4_API_SECRET in .env
 */

const logger = require('../utils/logger');
const integrationConfig = require('./integrationConfigService');

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

function isConfigured() {
  const id = process.env.GA4_MEASUREMENT_ID;
  const secret = process.env.GA4_API_SECRET;
  return !!(id && id.trim() && secret && secret.trim());
}

/**
 * Map RipX event to GA4 event format
 * @param {Object} event - { event_type, event_name, event_value, user_id, test_id, variant_id, shop_domain, metadata }
 * @returns {Object|null} GA4 event or null
 */
function mapToGA4Event(event) {
  if (!event) {
    return null;
  }
  const { event_type, event_name, event_value, user_id: _user_id, test_id, variant_id, shop_domain, metadata = {} } = event;

  let name;
  const meta = typeof metadata === 'object' && metadata !== null ? metadata : {};
  const safeMeta = Object.fromEntries(
    Object.entries(meta).filter(
      ([, v]) => v !== undefined && v !== null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    )
  );
  const params = {
    test_id: test_id || '',
    variant_id: variant_id || '',
    shop_domain: shop_domain || '',
    ...safeMeta,
  };

  if (event_type === 'conversion') {
    name = 'purchase';
    params.value = parseFloat(event_value) || 0;
    params.currency = (meta?.currency && typeof meta.currency === 'string')
      ? String(meta.currency).substring(0, 10)
      : 'USD';
  } else if (event_name) {
    name = event_name.replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 40);
    if (event_value !== null && event_value !== undefined && event_value !== '') {
      params.value = parseFloat(event_value) || 0;
    }
  } else {
    name = event_type === 'click' ? 'click' : event_type === 'view' ? 'page_view' : 'ripx_event';
  }

  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .slice(0, 25); // GA4 limit: 25 params per event

  const truncated = filtered.map(([k, v]) => {
    const key = String(k).substring(0, 40);
    let val = v;
    if (typeof val === 'boolean') {val = String(val);}
    else if (typeof val === 'string' && val.length > 100) {val = val.substring(0, 100);}
    else if (typeof val === 'number' && !Number.isFinite(val)) {val = 0;}
    return [key, val];
  });

  return {
    name: name.substring(0, 40),
    params: Object.fromEntries(truncated),
  };
}

/**
 * Send events to GA4 Measurement Protocol (fire-and-forget)
 * @param {Object} event - RipX event
 * @param {string} clientId - GA4 client_id (use user_id or generate)
 * @param {string} [shopDomain] - shop domain for DB config lookup
 */
async function sendToGA4(event, clientId, shopDomain) {
  const config = shopDomain
    ? await integrationConfig.getGA4Config(shopDomain)
    : (isConfigured() ? { measurementId: process.env.GA4_MEASUREMENT_ID.trim(), apiSecret: process.env.GA4_API_SECRET.trim() } : null);
  if (!config?.measurementId || !config?.apiSecret) {
    return;
  }

  const measurementId = config.measurementId;
  const apiSecret = config.apiSecret;
  const ga4Event = mapToGA4Event(event);
  if (!ga4Event) {
    return;
  }

  const url = `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const clientIdVal = clientId || event.user_id || `ripx_${Date.now()}`;

  // User properties for GA4 segmentation (ab_test_id, ab_variant_id)
  const userProperties = {};
  if (event.test_id) {
    userProperties.ab_test_id = { value: String(event.test_id) };
  }
  if (event.variant_id) {
    userProperties.ab_variant_id = { value: String(event.variant_id) };
  }
  if (event.shop_domain) {
    userProperties.ab_shop = { value: String(event.shop_domain) };
  }

  const body = {
    client_id: clientIdVal,
    user_properties: Object.keys(userProperties).length > 0 ? userProperties : undefined,
    events: [ga4Event],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn('GA4 Measurement Protocol request failed', {
        status: res.status,
        eventName: ga4Event.name,
      });
    }
  } catch (err) {
    logger.warn('GA4 forward failed', { error: err.message });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire-and-forget GA4 forward (non-blocking)
 * @param {Object} event - RipX event (must include shop_domain for DB config)
 * @param {string} clientId - GA4 client_id
 */
function forwardToGA4(event, clientId) {
  const shopDomain = event?.shop_domain;
  setImmediate(() => {
    sendToGA4(event, clientId, shopDomain).catch(() => {});
  });
}

module.exports = {
  isConfigured,
  forwardToGA4,
  sendToGA4,
  mapToGA4Event,
};
