/**
 * Outbound Webhook Service
 *
 * Notifies configured URLs when tests complete or reach significance
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

async function getWebhookConfig(shopDomain) {
  const sql = `
    SELECT outbound_webhook_url, outbound_webhook_events,
           overridden_by_admin_webhook_url, overridden_by_admin_webhook_events
    FROM shop_settings WHERE shop_domain = $1
  `;
  const result = await query(sql, [shopDomain]);
  const row = result.rows[0];
  const url =
    row?.overridden_by_admin_webhook_url !== undefined &&
    row?.overridden_by_admin_webhook_url !== null
      ? String(row.overridden_by_admin_webhook_url)
      : row?.outbound_webhook_url;
  if (!url || url === '') {
    return null;
  }
  let events =
    row?.overridden_by_admin_webhook_events !== null &&
    row?.overridden_by_admin_webhook_events !== undefined
      ? row.overridden_by_admin_webhook_events
      : row?.outbound_webhook_events;
  if (typeof events === 'string') {
    try {
      events = JSON.parse(events);
    } catch {
      events = ['test_complete', 'significance'];
    }
  }
  const eventsList = Array.isArray(events) ? events : ['test_complete', 'significance'];
  return { url, events: eventsList };
}

async function fireWebhook(shopDomain, event, payload) {
  const config = await getWebhookConfig(shopDomain);
  if (!config || !config.events.includes(event)) {
    return;
  }

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        ...payload,
      }),
    });

    if (!response.ok) {
      logger.warn('Outbound webhook failed', {
        shopDomain,
        event,
        status: response.status,
        url: config.url,
      });
    }
  } catch (err) {
    logger.error('Outbound webhook error', { shopDomain, event, error: err.message });
  }
}

module.exports = {
  getWebhookConfig,
  fireWebhook,
};
