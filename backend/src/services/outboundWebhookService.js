/**
 * Outbound Webhook Service
 *
 * Notifies configured URLs when tests complete or reach significance
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

async function getWebhookConfig(shopDomain) {
  const sql = `
    SELECT outbound_webhook_url, outbound_webhook_events
    FROM shop_settings WHERE shop_domain = $1
  `;
  const result = await query(sql, [shopDomain]);
  const row = result.rows[0];
  if (!row?.outbound_webhook_url) {return null;}
  const events = row.outbound_webhook_events;
  const eventsList = Array.isArray(events) ? events : ['test_complete', 'significance'];
  return { url: row.outbound_webhook_url, events: eventsList };
}

async function fireWebhook(shopDomain, event, payload) {
  const config = await getWebhookConfig(shopDomain);
  if (!config || !config.events.includes(event)) {return;}

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
