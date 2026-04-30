const { query } = require('../utils/database');

const FLAG_PREFIX = 'flag.';

function parseFlagValue(rawValue, fallback = false) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }
  if (typeof rawValue === 'boolean') {
    return rawValue;
  }
  const value = String(rawValue).trim().toLowerCase();
  if (['true', '1', 'yes', 'on', 'enabled'].includes(value)) {
    return true;
  }
  if (['false', '0', 'no', 'off', 'disabled'].includes(value)) {
    return false;
  }
  try {
    const parsed = JSON.parse(String(rawValue));
    if (typeof parsed === 'boolean') {
      return parsed;
    }
    if (parsed && typeof parsed === 'object' && typeof parsed.enabled === 'boolean') {
      return parsed.enabled;
    }
  } catch (_) {
    // Fall through to fallback.
  }
  return fallback;
}

function normalizeFlagKey(rawKey) {
  const key = String(rawKey || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '');
  if (!key) {
    return '';
  }
  return key.startsWith(FLAG_PREFIX) ? key : `${FLAG_PREFIX}${key}`;
}

async function getStoredFlagRows(keys = []) {
  if (!keys.length) {
    return [];
  }
  const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
  const result = await query(
    `SELECT key, value, updated_at FROM key_value_store WHERE key IN (${placeholders})`,
    keys
  ).catch(() => ({ rows: [] }));
  return result.rows || [];
}

async function evaluateFlag(rawKey, options = {}) {
  const key = normalizeFlagKey(rawKey);
  if (!key) {
    return { key: '', enabled: Boolean(options.defaultValue), source: 'default' };
  }
  const domain = String(options.domain || options.shopDomain || '')
    .trim()
    .toLowerCase();
  const domainKey = domain ? `${key}.${domain}` : '';
  const rows = await getStoredFlagRows([domainKey, key].filter(Boolean));
  const domainRow = domainKey ? rows.find(row => row.key === domainKey) : null;
  const globalRow = rows.find(row => row.key === key);
  const sourceRow = domainRow || globalRow;
  return {
    key,
    domain: domain || null,
    enabled: parseFlagValue(sourceRow?.value, Boolean(options.defaultValue)),
    source: domainRow ? 'domain' : globalRow ? 'global' : 'default',
    updatedAt: sourceRow?.updated_at || null,
  };
}

async function evaluateFlags(keys = [], options = {}) {
  const normalized = Array.from(
    new Set((Array.isArray(keys) ? keys : []).map(normalizeFlagKey).filter(Boolean))
  );
  const results = await Promise.all(normalized.map(key => evaluateFlag(key, options)));
  return Object.fromEntries(results.map(result => [result.key, result]));
}

module.exports = {
  FLAG_PREFIX,
  evaluateFlag,
  evaluateFlags,
  normalizeFlagKey,
  parseFlagValue,
};
