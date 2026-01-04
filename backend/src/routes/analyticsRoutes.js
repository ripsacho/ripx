/**
 * Analytics Routes
 *
 * API endpoints for test analytics
 */

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics');
const timeSeriesService = require('../services/timeSeriesService');
const exportRoutes = require('./exportRoutes');

/**
 * GET /api/analytics/tests/:id
 * Get analytics for a specific test
 */
router.get('/tests/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const analytics = await analyticsService.getTestAnalytics(id, shopDomain);

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/tests/:id/timeseries
 * Get time-series analytics for a test
 */
router.get('/tests/:id/timeseries', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const startDate = req.query.start_date || null;
    const endDate = req.query.end_date || null;

    const timeSeriesData = await timeSeriesService.getChartData(id, shopDomain);

    res.json({
      success: true,
      timeSeries: timeSeriesData
    });
  } catch (error) {
    next(error);
  }
});

// Export routes
router.use('/', exportRoutes);

module.exports = router;

