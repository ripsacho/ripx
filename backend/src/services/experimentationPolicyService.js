const { query } = require('../utils/database');
const { normalizeDomain } = require('../models/tenant');

const GLOBAL_HOLDOUT_KEY = 'config.experimentation.global_holdout_percent';
const GLOBAL_HOLDOUT_DOMAIN_PREFIX = 'config.experimentation.global_holdout_percent.';
const CACHE_TTL_MS = parseInt(process.env.EXPERIMENTATION_SETTINGS_CACHE_TTL_MS, 10) || 30_000;

const cache = new Map();

function getCache(key) {
  const row = cache.get(key);
  if (!row) {
    return null;
  }
  if (row.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return row.value;
}

function setCache(key, value) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function clearCacheKey(key) {
  cache.delete(key);
}

function normalizeGlobalHoldoutPercent(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 50) {
    throw new Error('global_holdout_percent must be a number between 0 and 50');
  }
  return Math.round(parsed * 100) / 100;
}

async function readHoldoutByKey(key) {
  const cached = getCache(key);
  if (cached !== null) {
    return cached;
  }
  const result = await query('SELECT value FROM key_value_store WHERE key = $1', [key]);
  if (!result.rows.length) {
    setCache(key, null);
    return null;
  }
  const value = normalizeGlobalHoldoutPercent(result.rows[0]?.value);
  setCache(key, value);
  return value;
}

async function getGlobalHoldoutPercent(shopDomain = null) {
  const normalizedDomain = normalizeDomain(shopDomain || '');
  if (normalizedDomain) {
    const domainKey = GLOBAL_HOLDOUT_DOMAIN_PREFIX + normalizedDomain;
    const domainValue = await readHoldoutByKey(domainKey);
    if (domainValue !== null) {
      return domainValue;
    }
  }
  const globalValue = await readHoldoutByKey(GLOBAL_HOLDOUT_KEY);
  return globalValue !== null ? globalValue : 0;
}

async function setGlobalHoldoutPercent(value, shopDomain = null) {
  const normalized = normalizeGlobalHoldoutPercent(value);
  const normalizedDomain = normalizeDomain(shopDomain || '');
  const key = normalizedDomain
    ? GLOBAL_HOLDOUT_DOMAIN_PREFIX + normalizedDomain
    : GLOBAL_HOLDOUT_KEY;
  await query(
    `INSERT INTO key_value_store (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, String(normalized)]
  );
  clearCacheKey(key);
  return normalized;
}

module.exports = {
  GLOBAL_HOLDOUT_KEY,
  GLOBAL_HOLDOUT_DOMAIN_PREFIX,
  normalizeGlobalHoldoutPercent,
  getGlobalHoldoutPercent,
  setGlobalHoldoutPercent,
};
