/**
 * Tenant Model
 *
 * Multi-platform tenant management: Shopify shops and standalone sites.
 * Uses domain as tenant identifier for data isolation (shop_domain column).
 */

const crypto = require('crypto');
const { query } = require('../utils/database');
const logger = require('../utils/logger');

const API_KEY_PREFIX = 'sk_';

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function timingSafeHashEquals(expectedHash, candidateHash) {
  const a = String(expectedHash || '');
  const b = String(candidateHash || '');
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Normalize domain for storage (lowercase, trim)
 */
function normalizeDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    return null;
  }
  return domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0];
}

/**
 * Check if domain is a valid Shopify shop
 */
function isShopifyDomain(domain) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(domain);
}

/**
 * Upsert Shopify tenant (called from OAuth callback)
 */
async function upsertShopifyTenant(shopDomain) {
  const domain = normalizeDomain(shopDomain);
  if (!domain || !isShopifyDomain(domain)) {
    throw new Error('Invalid Shopify domain');
  }

  const sql = `
    INSERT INTO tenants (platform, domain, updated_at)
    VALUES ('shopify', $1, NOW())
    ON CONFLICT (domain)
    DO UPDATE SET
      platform = 'shopify',
      updated_at = NOW()
  `;
  await query(sql, [domain]);
  return { domain, platform: 'shopify' };
}

/**
 * Create standalone tenant and return API key (single use)
 * Uses account model for multi-store support.
 */
async function createStandaloneTenant(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    throw new Error('Invalid domain');
  }

  // Prevent Shopify domains from being registered as standalone
  if (isShopifyDomain(normalized)) {
    throw new Error('Use Shopify OAuth for Shopify stores');
  }

  const existing = await getTenantByDomain(normalized);
  if (existing) {
    throw new Error('Domain already registered');
  }

  const { createAccount, addStoreToAccount } = require('./account');

  const { account, apiKey } = await createAccount('My Account');
  const tenant = await addStoreToAccount(account.id, normalized, 'standalone');

  logger.info('Standalone tenant created', {
    domain: normalized,
    tenantId: tenant.id,
    accountId: account.id,
  });

  return {
    tenant: {
      id: tenant.id,
      domain: tenant.domain,
      platform: tenant.platform,
      accountId: account.id,
    },
    apiKey,
  };
}

/**
 * Get tenant by domain
 */
async function getTenantByDomain(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return null;
  }

  const sql = 'SELECT * FROM tenants WHERE domain = $1';
  const result = await query(sql, [normalized]);
  return result.rows[0] || null;
}

/**
 * Get tenant by API key (returns tenant if key valid)
 */
async function getTenantByApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith(API_KEY_PREFIX)) {
    return null;
  }

  const prefix = apiKey.substring(0, 12);
  const hash = hashApiKey(apiKey);

  const sql = `
    SELECT * FROM tenants
    WHERE api_key_prefix = $1
  `;
  const result = await query(sql, [prefix]);
  if (!Array.isArray(result.rows) || result.rows.length === 0) {
    return null;
  }
  for (const row of result.rows) {
    if (timingSafeHashEquals(hash, row.api_key_hash)) {
      return row;
    }
  }
  return null;
}

/**
 * Verify tenant exists (for track validation)
 */
async function tenantExists(domain) {
  const tenant = await getTenantByDomain(domain);
  if (tenant) {
    return true;
  }

  // Backward compat: Shopify shops in shop_sessions but not yet in tenants
  if (isShopifyDomain(domain)) {
    const { getShopSession } = require('./shopSession');
    const session = await getShopSession(domain);
    return !!session;
  }

  return false;
}

/**
 * Set tenant status (active | suspended | blocked). Used by admin.
 */
async function setTenantStatus(domain, status) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return false;
  }

  const sql = `
    UPDATE tenants SET status = $1, updated_at = NOW()
    WHERE domain = $2
    RETURNING id
  `;
  try {
    const result = await query(sql, [status, normalized]);
    return result.rows.length > 0;
  } catch (e) {
    if (e.message && e.message.includes('column "status" does not exist')) {
      return false;
    }
    throw e;
  }
}

/**
 * List all tenants (for admin)
 */
async function listTenants() {
  const sql = `
    SELECT id, domain, platform, status, created_at, updated_at, account_id
    FROM tenants
    ORDER BY updated_at DESC
  `;
  const result = await query(sql);
  return result.rows;
}

/**
 * Set domain_verified_at for a tenant (when storefront script pings on load).
 * Idempotent; safe to call multiple times.
 *
 * @param {string} domain - Normalized domain
 * @returns {Promise<boolean>} True if tenant was updated
 */
async function setDomainVerifiedAt(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return false;
  }
  const sql = `
    UPDATE tenants
    SET domain_verified_at = COALESCE(domain_verified_at, NOW()), updated_at = NOW()
    WHERE domain = $1
    RETURNING id
  `;
  const result = await query(sql, [normalized]);
  return result.rows.length > 0;
}

module.exports = {
  normalizeDomain,
  isShopifyDomain,
  upsertShopifyTenant,
  createStandaloneTenant,
  getTenantByDomain,
  getTenantByApiKey,
  tenantExists,
  setTenantStatus,
  listTenants,
  setDomainVerifiedAt,
  hashApiKey,
};
