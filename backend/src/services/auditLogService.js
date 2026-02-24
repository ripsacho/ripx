/**
 * Audit Log Service
 *
 * Records who changed what for compliance and debugging
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

async function log(
  shopDomain,
  { entityType, entityId, action, userId, changes, actorType, actorId, ipAddress }
) {
  try {
    const hasActor =
      (actorType !== null && actorType !== undefined) ||
      (actorId !== null && actorId !== undefined) ||
      (ipAddress !== null && ipAddress !== undefined);
    const columns = ['shop_domain', 'entity_type', 'entity_id', 'action', 'user_id', 'changes'];
    const values = [
      shopDomain,
      entityType || 'unknown',
      entityId || null,
      action || 'unknown',
      userId || null,
      changes ? JSON.stringify(changes) : null,
    ];
    if (hasActor) {
      if (actorType !== null && actorType !== undefined) {
        columns.push('actor_type');
        values.push(actorType);
      }
      if (actorId !== null && actorId !== undefined) {
        columns.push('actor_id');
        values.push(actorId);
      }
      if (ipAddress !== null && ipAddress !== undefined) {
        columns.push('ip_address');
        values.push(ipAddress);
      }
    }
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO audit_log (${columns.join(', ')}) VALUES (${placeholders})`;
    await query(sql, values);
  } catch (err) {
    logger.error('Audit log failed', { shopDomain, entityType, error: err.message });
  }
}

/**
 * Log an admin action (shop_domain = __admin__, actor = admin identity)
 */
function logAdminAction(req, { entityType, entityId, action, changes }) {
  const actorId = req.adminId || req.shopDomain || 'unknown';
  return log('__admin__', {
    entityType: entityType || 'admin',
    entityId,
    action,
    userId: actorId,
    changes,
    actorType: 'admin',
    actorId,
    ipAddress: req.ip || req.connection?.remoteAddress,
  });
}

module.exports = { log, logAdminAction };
