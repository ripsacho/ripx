/**
 * Account Model
 *
 * Multi-store: one account can have multiple stores (tenants).
 * API key is stored at account level for standalone multi-site.
 */

const crypto = require('crypto');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

const API_KEY_PREFIX = 'sk_';
const API_KEY_LENGTH = 32;

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function generateApiKey() {
  const randomPart = crypto.randomBytes(API_KEY_LENGTH).toString('hex');
  return `${API_KEY_PREFIX}${randomPart}`;
}

/**
 * Create account and return API key
 */
async function createAccount(name = 'My Account') {
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  const apiKeyPrefix = apiKey.substring(0, 12);

  const sql = `
    INSERT INTO accounts (name, api_key_hash, api_key_prefix)
    VALUES ($1, $2, $3)
    RETURNING id, name, created_at
  `;
  const result = await query(sql, [name, apiKeyHash, apiKeyPrefix]);
  const account = result.rows[0];

  logger.info('Account created', { accountId: account.id });

  return { account, apiKey };
}

/**
 * Get account by API key
 */
async function getAccountByApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const prefix = apiKey.substring(0, 12);
  const hash = hashApiKey(apiKey);

  const sql = `
    SELECT * FROM accounts
    WHERE api_key_prefix = $1 AND api_key_hash = $2
  `;
  const result = await query(sql, [prefix, hash]);
  return result.rows[0] || null;
}

/**
 * Get all stores (tenants) for an account
 */
async function getStoresForAccount(accountId) {
  if (!accountId) {
    return [];
  }

  const sql = `
    SELECT id, domain, platform, created_at
    FROM tenants
    WHERE account_id = $1
    ORDER BY created_at ASC
  `;
  const result = await query(sql, [accountId]);
  return result.rows;
}

/**
 * Add store (tenant) to account
 */
const MAX_DOMAIN_LENGTH = 253;

async function addStoreToAccount(accountId, domain, platform = 'standalone') {
  const normalized = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0];

  if (!normalized) {
    throw new Error('Invalid domain');
  }
  if (normalized.length > MAX_DOMAIN_LENGTH) {
    throw new Error('Domain is too long');
  }

  // Check domain not already registered
  const existingSql = 'SELECT id FROM tenants WHERE domain = $1';
  const existing = await query(existingSql, [normalized]);
  if (existing.rows.length > 0) {
    throw new Error('Domain already registered');
  }

  const sql = `
    INSERT INTO tenants (account_id, platform, domain)
    VALUES ($1, $2, $3)
    RETURNING id, domain, platform, created_at
  `;
  const result = await query(sql, [accountId, platform, normalized]);
  const tenant = result.rows[0];

  logger.info('Store added to account', { accountId, domain: normalized, tenantId: tenant.id });

  return tenant;
}

/**
 * Get tenant by account + domain (for account-level API key with X-RipX-Store)
 */
async function getTenantByAccountAndDomain(accountId, domain) {
  if (!accountId || !domain) {
    return null;
  }

  const normalized = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0];

  const sql = `
    SELECT * FROM tenants
    WHERE account_id = $1 AND domain = $2
  `;
  const result = await query(sql, [accountId, normalized]);
  return result.rows[0] || null;
}

/**
 * Get first tenant for account (default store when X-RipX-Store not provided)
 */
async function getFirstTenantForAccount(accountId) {
  if (!accountId) {
    return null;
  }

  const sql = `
    SELECT * FROM tenants
    WHERE account_id = $1
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const result = await query(sql, [accountId]);
  return result.rows[0] || null;
}

/**
 * List all accounts with domain count (for admin)
 */
async function listAccounts(limit = 100, offset = 0) {
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const sql = `
    SELECT a.id, a.name, a.api_key_prefix, a.created_at, a.updated_at,
           COUNT(t.id)::int AS domain_count
    FROM accounts a
    LEFT JOIN tenants t ON t.account_id = a.id
    GROUP BY a.id, a.name, a.api_key_prefix, a.created_at, a.updated_at
    ORDER BY a.created_at DESC
    LIMIT $1 OFFSET $2
  `;
  const result = await query(sql, [limitNum, offsetNum]);
  const countResult = await query('SELECT COUNT(*)::int AS total FROM accounts');
  const total = countResult.rows[0]?.total || 0;
  return {
    accounts: result.rows.map(r => ({
      id: r.id,
      name: r.name,
      apiKeyPrefix: r.api_key_prefix,
      domainCount: r.domain_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    total,
    limit: limitNum,
    offset: offsetNum,
  };
}

/**
 * Get account by id (for admin detail)
 */
async function getAccountById(accountId) {
  if (!accountId) {
    return null;
  }
  const sql = 'SELECT id, name, api_key_prefix, created_at, updated_at FROM accounts WHERE id = $1';
  const result = await query(sql, [accountId]);
  const row = result.rows[0];
  if (!row) {return null;}
  const stores = await getStoresForAccount(row.id);
  return {
    id: row.id,
    name: row.name,
    apiKeyPrefix: row.api_key_prefix,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    domains: stores.map(s => ({
      id: s.id,
      domain: s.domain,
      platform: s.platform,
      createdAt: s.created_at,
    })),
  };
}

module.exports = {
  hashApiKey,
  generateApiKey,
  createAccount,
  getAccountByApiKey,
  getStoresForAccount,
  addStoreToAccount,
  getTenantByAccountAndDomain,
  getFirstTenantForAccount,
  listAccounts,
  getAccountById,
};
