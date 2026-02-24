/**
 * Dashboard Routes
 *
 * Dedicated endpoints for dashboard overview stats.
 * Uses direct DB aggregation to ensure correct counts regardless of enrichment flow.
 */

const express = require('express');
const router = express.Router();
const { query } = require('../utils/database');
const { normalizeDomain } = require('../models/tenant');
const { sendSuccess } = require('../utils/response');
const { HTTP_STATUS } = require('../constants');
const { asyncHandler } = require('../middleware/asyncHandler');

/**
 * GET /api/dashboard/stats
 * Returns aggregated dashboard stats (totalTests, activeTests, totalVisitors, totalRevenue)
 * Uses direct DB queries - bypasses test enrichment for reliability
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const rawShop = req.shopDomain;
    const shopDomain = normalizeDomain(rawShop) || (rawShop || '').toString().toLowerCase().trim();

    if (!shopDomain) {
      return res.status(400).json({ success: false, error: 'Shop domain required' });
    }

    const testsSql = `
      SELECT 
        COUNT(*)::int as total_tests,
        COUNT(*) FILTER (WHERE LOWER(TRIM(status)) = 'running')::int as active_tests
      FROM tests
      WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
    `;
    const visitorsSql = `
      SELECT COALESCE(SUM(cnt), 0)::bigint as total_visitors
      FROM (
        SELECT COUNT(DISTINCT user_id) as cnt
        FROM test_assignments
        WHERE LOWER(TRIM(shop_domain)) = LOWER(TRIM($1))
        GROUP BY test_id, variant_id
      ) sub
    `;
    const revenueSql = `
      SELECT 
        COALESCE(COUNT(DISTINCT e.user_id), 0)::bigint as total_conversions,
        COALESCE(SUM(e.event_value), 0)::float as total_revenue
      FROM events e
      INNER JOIN test_assignments ta
        ON ta.test_id = e.test_id AND ta.user_id = e.user_id
        AND LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM(e.shop_domain))
        AND ta.variant_id = e.variant_id
      WHERE LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($1))
        AND e.event_type = 'conversion'
    `;

    const [testsRes, visitorsRes, revenueRes] = await Promise.all([
      query(testsSql, [shopDomain]),
      query(visitorsSql, [shopDomain]),
      query(revenueSql, [shopDomain]),
    ]);

    const totalTests = parseInt(testsRes.rows[0]?.total_tests, 10) || 0;
    const activeTests = parseInt(testsRes.rows[0]?.active_tests, 10) || 0;
    const totalVisitors = parseInt(visitorsRes.rows[0]?.total_visitors, 10) || 0;
    const totalConversions = parseInt(revenueRes.rows[0]?.total_conversions, 10) || 0;
    const totalRevenue = parseFloat(revenueRes.rows[0]?.total_revenue) || 0;

    const avgConversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;

    return sendSuccess(res, HTTP_STATUS.OK, {
      totalTests,
      activeTests,
      totalVisitors,
      totalConversions,
      totalRevenue,
      avgConversionRate,
    });
  })
);

module.exports = router;
