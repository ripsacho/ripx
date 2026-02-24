/**
 * Maintenance mode and block list helpers
 * - config.maintenance_mode: "global" or specific domain
 * - block_list.<domain>: optional message; if key exists, domain is blocked (403)
 */

const { query } = require('./database');

const MAINTENANCE_KEY = 'config.maintenance_mode';
const BLOCK_LIST_PREFIX = 'block_list.';

/**
 * Get current maintenance mode value (or null if off)
 * @returns {Promise<string|null>}
 */
async function getMaintenanceMode() {
  try {
    const result = await query('SELECT value FROM key_value_store WHERE key = $1', [
      MAINTENANCE_KEY,
    ]);
    const value = result.rows[0]?.value;
    return value !== null && value !== undefined && String(value).trim() !== ''
      ? String(value).trim()
      : null;
  } catch (_) {
    return null;
  }
}

/**
 * Check if request should be blocked by maintenance (for track/script).
 * @param {string|null} domain - Resolved tenant/shop domain for this request
 * @param {string|null} maintenanceValue - Value from getMaintenanceMode()
 * @returns {boolean}
 */
function isMaintenanceActiveForDomain(domain, maintenanceValue) {
  if (!maintenanceValue) {
    return false;
  }
  const value = String(maintenanceValue).trim().toLowerCase();
  if (value === 'global') {
    return true;
  }
  if (domain === null || domain === undefined || domain === '') {
    return false;
  }
  return value === String(domain).trim().toLowerCase();
}

/**
 * Normalize domain for block list key lookup (strip protocol, host only).
 * Matches tenant normalizeDomain so block list works whether client sends host or URL.
 */
function normalizeDomainForBlockList(domain) {
  if (!domain || typeof domain !== 'string') {
    return null;
  }
  const s = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
  return s || null;
}

/**
 * Get block list message for a domain (key block_list.<normalized_domain>).
 * @param {string} domain - Domain or URL (e.g. shop.myshopify.com or https://shop.myshopify.com)
 * @returns {Promise<string|null>} Message to return in 403, or null if not blocked
 */
async function getBlockListMessage(domain) {
  const normalized = normalizeDomainForBlockList(domain);
  if (!normalized) {
    return null;
  }
  try {
    const key = BLOCK_LIST_PREFIX + normalized;
    const result = await query('SELECT value FROM key_value_store WHERE key = $1', [key]);
    if (result.rows.length === 0) {
      return null;
    }
    const value = result.rows[0].value;
    return value !== null && value !== undefined ? String(value).trim() : '';
  } catch (_) {
    return null;
  }
}

module.exports = {
  getMaintenanceMode,
  isMaintenanceActiveForDomain,
  getBlockListMessage,
  normalizeDomainForBlockList,
  MAINTENANCE_KEY,
  BLOCK_LIST_PREFIX,
};
