/**
 * Shop Session Model
 *
 * Stores Shopify access tokens per shop for API usage.
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

async function upsertShopSession({ shopDomain, accessToken, scope }) {
  const sql = `
    INSERT INTO shop_sessions (shop_domain, access_token, scope, installed_at, updated_at)
    VALUES ($1, $2, $3, NOW(), NOW())
    ON CONFLICT (shop_domain)
    DO UPDATE SET
      access_token = EXCLUDED.access_token,
      scope = EXCLUDED.scope,
      updated_at = NOW()
    RETURNING *
  `;

  try {
    const result = await query(sql, [shopDomain, accessToken, scope || null]);
    return result.rows[0];
  } catch (error) {
    logger.error('Error upserting shop session', { error: error.message, shopDomain });
    throw error;
  }
}

async function getShopSession(shopDomain) {
  const sql = `
    SELECT * FROM shop_sessions
    WHERE shop_domain = $1
  `;

  const result = await query(sql, [shopDomain]);
  return result.rows[0] || null;
}

async function deleteShopSession(shopDomain) {
  const sql = `
    DELETE FROM shop_sessions
    WHERE shop_domain = $1
  `;
  const result = await query(sql, [shopDomain]);
  return result.rowCount > 0;
}

module.exports = {
  upsertShopSession,
  getShopSession,
  deleteShopSession,
};
