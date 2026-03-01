/**
 * Audit Log Service
 *
 * Records who changed what for compliance and debugging.
 * For tenant-scoped rows (shop_domain not __admin__/__auth__), resolves and stores tenant_id for consistent filtering.
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');
const { getTenantByDomain } = require('../models/tenant');

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
    if (shopDomain && shopDomain !== '__admin__' && shopDomain !== '__auth__') {
      try {
        const tenant = await getTenantByDomain(shopDomain);
        if (tenant && tenant.id) {
          columns.push('tenant_id');
          values.push(tenant.id);
        }
      } catch (e) {
        logger.warn('Audit log: could not resolve tenant_id', { shopDomain, error: e.message });
      }
    }
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

/**
 * Log auth-related events (registration, confirm, login, accept/reject user)
 */
function logAuthAction(reqOrIp, { action, actorId, entityId, changes }) {
  const ip =
    typeof reqOrIp === 'string' ? reqOrIp : reqOrIp?.ip || reqOrIp?.connection?.remoteAddress;
  return log('__auth__', {
    entityType: 'auth',
    entityId: entityId || null,
    action: action || 'unknown',
    userId: actorId || null,
    changes: changes || null,
    actorType: 'system',
    actorId: actorId || 'anonymous',
    ipAddress: ip,
  });
}

module.exports = { log, logAdminAction, logAuthAction };
