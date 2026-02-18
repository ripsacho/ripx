/**
 * Audit Log Service
 *
 * Records who changed what for compliance and debugging
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

async function log(shopDomain, { entityType, entityId, action, userId, changes }) {
  try {
    const sql = `
      INSERT INTO audit_log (shop_domain, entity_type, entity_id, action, user_id, changes)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    await query(sql, [
      shopDomain,
      entityType || 'unknown',
      entityId || null,
      action || 'unknown',
      userId || null,
      changes ? JSON.stringify(changes) : null,
    ]);
  } catch (err) {
    logger.error('Audit log failed', { shopDomain, entityType, error: err.message });
  }
}

module.exports = { log };
