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
  const uniqueKeys = Array.from(new Set((Array.isArray(keys) ? keys : []).filter(Boolean)));
  if (!uniqueKeys.length) {
    return [];
  }
  const result = await query(
    'SELECT key, value, updated_at FROM key_value_store WHERE key = ANY($1::text[])',
    [uniqueKeys]
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
  const domain = String(options.domain || options.shopDomain || '')
    .trim()
    .toLowerCase();
  const domainKeys = domain ? normalized.map(key => `${key}.${domain}`) : [];
  const rows = await getStoredFlagRows([...domainKeys, ...normalized]);
  const rowByKey = new Map(rows.map(row => [row.key, row]));
  const results = normalized.map(key => {
    const domainKey = domain ? `${key}.${domain}` : '';
    const domainRow = domainKey ? rowByKey.get(domainKey) : null;
    const globalRow = rowByKey.get(key);
    const sourceRow = domainRow || globalRow;
    return {
      key,
      domain: domain || null,
      enabled: parseFlagValue(sourceRow?.value, Boolean(options.defaultValue)),
      source: domainRow ? 'domain' : globalRow ? 'global' : 'default',
      updatedAt: sourceRow?.updated_at || null,
    };
  });
  return Object.fromEntries(results.map(result => [result.key, result]));
}

module.exports = {
  FLAG_PREFIX,
  evaluateFlag,
  evaluateFlags,
  normalizeFlagKey,
  parseFlagValue,
};
