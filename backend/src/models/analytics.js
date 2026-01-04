/**
 * Analytics Model
 *
 * Database operations for test analytics
 */

const { query } = require('../utils/database');

class AnalyticsModel {
  /**
   * Track a conversion event
   *
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} Saved event
   */
  async trackEvent(eventData) {
    const {
      test_id,
      variant_id,
      user_id,
      shop_domain,
      event_type,
      event_value,
      metadata
    } = eventData;

    const sql = `
      INSERT INTO events (
        test_id, variant_id, user_id, shop_domain,
        event_type, event_value, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *
    `;

    const result = await query(sql, [
      test_id,
      variant_id,
      user_id,
      shop_domain,
      event_type,
      event_value,
      JSON.stringify(metadata || {})
    ]);

    return result.rows[0];
  }

  /**
   * Get analytics for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Array>} Analytics by variant
   */
  async getTestAnalytics(testId, shopDomain) {
    // Get unique visitors per variant
    const visitorsSql = `
      SELECT 
        ta.variant_id,
        ta.variant_name,
        COUNT(DISTINCT ta.user_id) as visitors
      FROM test_assignments ta
      WHERE ta.test_id = $1 AND ta.shop_domain = $2
      GROUP BY ta.variant_id, ta.variant_name
    `;

    // Get conversions per variant
    const conversionsSql = `
      SELECT 
        e.variant_id,
        COUNT(*) as conversions,
        SUM(e.event_value) as revenue
      FROM events e
      WHERE e.test_id = $1 
        AND e.shop_domain = $2
        AND e.event_type = 'conversion'
      GROUP BY e.variant_id
    `;

    const [visitorsResult, conversionsResult] = await Promise.all([
      query(visitorsSql, [testId, shopDomain]),
      query(conversionsSql, [testId, shopDomain])
    ]);

    // Combine results
    const variantMap = {};

    visitorsResult.rows.forEach(row => {
      variantMap[row.variant_id] = {
        variant_id: row.variant_id,
        variant_name: row.variant_name,
        visitors: parseInt(row.visitors) || 0,
        conversions: 0,
        revenue: 0
      };
    });

    conversionsResult.rows.forEach(row => {
      if (variantMap[row.variant_id]) {
        variantMap[row.variant_id].conversions = parseInt(row.conversions) || 0;
        variantMap[row.variant_id].revenue = parseFloat(row.revenue) || 0;
      }
    });

    return Object.values(variantMap);
  }

  /**
   * Get event count by type
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {string} eventType - Event type
   * @returns {Promise<number>} Event count
   */
  async getEventCount(testId, shopDomain, eventType) {
    const sql = `
      SELECT COUNT(*) as count
      FROM events
      WHERE test_id = $1 
        AND shop_domain = $2
        AND event_type = $3
    `;

    const result = await query(sql, [testId, shopDomain, eventType]);
    return parseInt(result.rows[0].count) || 0;
  }
}

const model = new AnalyticsModel();

module.exports = {
  trackEvent: (data) => model.trackEvent(data),
  getTestAnalytics: (testId, shop) => model.getTestAnalytics(testId, shop),
  getEventCount: (testId, shop, type) => model.getEventCount(testId, shop, type)
};

