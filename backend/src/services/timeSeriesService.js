/**
 * Time-Series Analytics Service
 *
 * Handles daily aggregation and time-series analytics
 */

const { query } = require('../utils/database');

class TimeSeriesService {
  /**
   * Get time-series data for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {Date} startDate - Start date (optional)
   * @param {Date} endDate - End date (optional)
   * @returns {Promise<Array>} Time-series data
   */
  async getTimeSeriesData(testId, shopDomain, startDate = null, endDate = null) {
    let sql = `
      SELECT 
        ad.date,
        ad.variant_id,
        ad.variant_name,
        ad.visitors,
        ad.conversions,
        ad.revenue,
        CASE 
          WHEN ad.visitors > 0 THEN (ad.conversions::DECIMAL / ad.visitors * 100)
          ELSE 0
        END as conversion_rate
      FROM analytics_daily ad
      INNER JOIN tests t ON t.id = ad.test_id
      WHERE ad.test_id = $1 AND t.shop_domain = $2
    `;

    const params = [testId, shopDomain];

    if (startDate) {
      sql += ' AND ad.date >= $3';
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND ad.date <= $${params.length + 1}`;
      params.push(endDate);
    }

    sql += ' ORDER BY ad.date ASC, ad.variant_name ASC';

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Aggregate daily analytics (should be run daily via cron)
   *
   * @param {Date} date - Date to aggregate (defaults to yesterday)
   * @returns {Promise<void>}
   */
  async aggregateDailyAnalytics(date = null) {
    const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateStr = targetDate.toISOString().split('T')[0];

    // Get all active tests with their variants
    const testsSql = `
      SELECT t.id as test_id, t.shop_domain, t.variants
      FROM tests t
      WHERE t.status = 'running'
    `;

    const testsResult = await query(testsSql);

    for (const test of testsResult.rows) {
      // Parse variants to get all variant_id and variant_name (include holdout if present)
      let variants = [];
      try {
        const v =
          typeof test.variants === 'string' ? JSON.parse(test.variants) : test.variants || [];
        variants = Array.isArray(v) ? v : [];
      } catch {
        variants = [];
      }
      const variantList = variants
        .filter(v => v && (v.id || v.variant_id) && v.name)
        .map(v => ({ id: v.id || v.variant_id, name: v.name }));

      if (variantList.length === 0) {
        continue;
      }

      for (const variant of variantList) {
        const variantId = String(variant.id);
        const variantName = String(variant.name);

        // Get visitors assigned on this date for this variant
        const visitorsSql = `
          SELECT COUNT(DISTINCT user_id) as visitors
          FROM test_assignments
          WHERE test_id = $1 AND variant_id = $2 AND DATE(assigned_at) = $3
        `;
        const visitorsResult = await query(visitorsSql, [test.test_id, variantId, dateStr]);
        const visitors = parseInt(visitorsResult.rows[0]?.visitors || 0);

        // Get conversions for this variant and date (JOIN ensures only assigned users)
        const conversionsSql = `
          SELECT 
            COUNT(DISTINCT e.user_id) as conversions,
            COALESCE(SUM(e.event_value), 0) as revenue
          FROM events e
          INNER JOIN test_assignments ta ON ta.test_id = e.test_id AND ta.user_id = e.user_id AND ta.shop_domain = e.shop_domain AND ta.variant_id = e.variant_id
          WHERE e.test_id = $1
            AND e.variant_id = $2
            AND e.event_type = 'conversion'
            AND DATE(e.created_at) = $3
        `;

        const conversionsResult = await query(conversionsSql, [test.test_id, variantId, dateStr]);

        const conversions = parseInt(conversionsResult.rows[0]?.conversions || 0);
        const revenue = parseFloat(conversionsResult.rows[0]?.revenue || 0);

        // Insert or update daily analytics (ensures row exists even when visitors=0)
        const upsertSql = `
          INSERT INTO analytics_daily (
            test_id, variant_id, variant_name, date, 
            visitors, conversions, revenue
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (test_id, variant_id, date)
          DO UPDATE SET
            visitors = EXCLUDED.visitors,
            conversions = EXCLUDED.conversions,
            revenue = EXCLUDED.revenue,
            updated_at = NOW()
        `;

        await query(upsertSql, [
          test.test_id,
          variantId,
          variantName,
          dateStr,
          visitors,
          conversions,
          revenue,
        ]);
      }
    }
  }

  /**
   * Get aggregated time-series data formatted for charts
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Array>} Chart-ready data
   */
  async getChartData(testId, shopDomain) {
    const rawData = await this.getTimeSeriesData(testId, shopDomain);

    // Group by date and format for charts
    const dateMap = {};

    rawData.forEach(row => {
      const dateKey = row.date.toISOString().split('T')[0];

      if (!dateMap[dateKey]) {
        dateMap[dateKey] = {
          date: dateKey,
          name: new Date(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        };
      }

      dateMap[dateKey][row.variant_name] = {
        visitors: row.visitors,
        conversions: row.conversions,
        revenue: parseFloat(row.revenue),
        conversionRate: parseFloat(row.conversion_rate),
      };
    });

    return Object.values(dateMap);
  }
}

module.exports = new TimeSeriesService();
