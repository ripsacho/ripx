/**
 * Promo Link Service
 *
 * Generates and manages promo links for offer testing without promo codes.
 * Similar to Intelligems' Promo Links feature.
 */

const crypto = require('crypto');
const { query } = require('../utils/database');

class PromoLinkService {
  /**
   * Generate a unique promo link
   *
   * @param {Object} linkData - Promo link configuration
   * @returns {Promise<Object>} Generated promo link
   */
  async generatePromoLink(linkData) {
    const {
      test_id,
      variant_id,
      shop_domain,
      discount_type, // 'percentage' or 'fixed'
      discount_value,
      target_type, // 'product', 'collection', 'cart'
      target_id,
      expires_at,
      max_uses,
      name,
    } = linkData;

    // Generate unique token
    const token = this.generateToken();

    // Create promo link
    const sql = `
      INSERT INTO promo_links (
        test_id, variant_id, shop_domain, token, name,
        discount_type, discount_value, target_type, target_id,
        expires_at, max_uses, uses_count, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, NOW())
      RETURNING *
    `;

    const result = await query(sql, [
      test_id,
      variant_id,
      shop_domain,
      token,
      name,
      discount_type,
      discount_value,
      target_type,
      target_id,
      expires_at,
      max_uses,
    ]);

    // Generate full URL
    const promoUrl = this.buildPromoUrl(shop_domain, token);

    return {
      ...result.rows[0],
      url: promoUrl,
    };
  }

  /**
   * Validate and apply promo link
   *
   * @param {string} token - Promo link token
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object|null>} Promo link data or null if invalid
   */
  async validatePromoLink(token, shopDomain) {
    const sql = `
      SELECT * FROM promo_links
      WHERE token = $1 AND shop_domain = $2
    `;

    const result = await query(sql, [token, shopDomain]);

    if (result.rows.length === 0) {
      return null;
    }

    const link = result.rows[0];

    // Check expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return null;
    }

    // Check max uses
    if (link.max_uses && link.uses_count >= link.max_uses) {
      return null;
    }

    // Increment use count
    await this.incrementUseCount(link.id);

    return link;
  }

  /**
   * Increment use count for a promo link
   *
   * @param {string} linkId - Promo link ID
   * @returns {Promise<void>}
   */
  async incrementUseCount(linkId) {
    const sql = `
      UPDATE promo_links
      SET uses_count = uses_count + 1,
          last_used_at = NOW()
      WHERE id = $1
    `;

    await query(sql, [linkId]);
  }

  /**
   * Get promo links for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Array>} List of promo links
   */
  async getPromoLinksByTest(testId, shopDomain) {
    const sql = `
      SELECT *, 
        CONCAT($3, '/promo/', token) as url
      FROM promo_links
      WHERE test_id = $1 AND shop_domain = $2
      ORDER BY created_at DESC
    `;

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const result = await query(sql, [testId, shopDomain, appUrl]);
    return result.rows;
  }

  /**
   * Generate unique token
   *
   * @returns {string} Unique token
   */
  generateToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Build promo URL
   *
   * @param {string} shopDomain - Shop domain
   * @param {string} token - Token
   * @returns {string} Full promo URL
   */
  buildPromoUrl(shopDomain, token) {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    return `${baseUrl}/promo/${token}?shop=${shopDomain}`;
  }

  /**
   * Apply discount to cart/checkout
   *
   * @param {Object} link - Promo link data
   * @param {number} cartTotal - Cart total
   * @returns {number} Discount amount
   */
  calculateDiscount(link, cartTotal) {
    if (link.discount_type === 'percentage') {
      return (cartTotal * link.discount_value) / 100;
    } else if (link.discount_type === 'fixed') {
      return Math.min(link.discount_value, cartTotal);
    }
    return 0;
  }
}

module.exports = new PromoLinkService();
