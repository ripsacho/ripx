/**
 * Analytics Routes
 *
 * API endpoints for test analytics
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
const validators = require('../utils/validators');
const analyticsService = require('../services/analytics');

/** Validate :id param is a valid UUID */
const validateTestId = (req, res, next) => {
  const id = req.params?.id;
  if (!id || !validators.isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID format' });
  }
  next();
};
const timeSeriesService = require('../services/timeSeriesService');
const {
  getClickHeatmap,
  getScrollHeatmap,
  getHeatmapPages,
  getClickHeatmapForOverlay,
  getHeatmapScreenshotUrl,
  setHeatmapScreenshotUrl,
} = require('../models/heatmap');
const { getFunnelMetrics, getEventsList, getEventTypesForTest } = require('../models/analytics');
const { getTestById } = require('../models/test');
const exportRoutes = require('./exportRoutes');
const { PAGINATION } = require('../constants');
const { getExperimentDecisionOverview } = require('../services/experimentDecisionService');

/**
 * GET /api/analytics/tests/:id
 * Get analytics for a specific test
 * Query: device, country - filter by segment
 */
router.get(
  '/tests/:id',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { device, country } = req.query;
    const segmentOptions = {};
    if (device) {
      segmentOptions.device = device;
    }
    if (country) {
      segmentOptions.country = country;
    }

    const analytics = await analyticsService.getTestAnalytics(id, shopDomain, segmentOptions);

    res.json({
      success: true,
      analytics,
      segmentFilter: Object.keys(segmentOptions).length > 0 ? segmentOptions : null,
    });
  })
);

/**
 * GET /api/analytics/tests/:id/segments
 * Get available segment values for breakdown (device, country)
 */
router.get(
  '/tests/:id/segments',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { getSegmentBreakdownOptions } = require('../models/analytics');
    const segments = await getSegmentBreakdownOptions(id, shopDomain);

    res.json({
      success: true,
      segments,
    });
  })
);

/**
 * GET /api/analytics/tests/:id/timeseries
 * Get time-series analytics for a test
 */
router.get(
  '/tests/:id/timeseries',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const timeSeriesData = await timeSeriesService.getChartData(id, shopDomain);

    res.json({
      success: true,
      timeSeries: timeSeriesData,
    });
  })
);

/**
 * GET /api/analytics/tests/:id/funnel
 * Get funnel metrics (visitors → add_to_cart → conversion) per variant.
 * Supports custom funnel steps from test goal.funnel_steps when configured.
 */
router.get(
  '/tests/:id/funnel',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { device, country, start_date, end_date } = req.query;
    const segmentOptions = {};
    if (device && device !== 'all') {
      segmentOptions.device = device;
    }
    if (country && country !== 'all') {
      segmentOptions.country = country;
    }
    if (start_date) {
      segmentOptions.start_date = start_date;
    }
    if (end_date) {
      segmentOptions.end_date = end_date;
    }

    try {
      const { getTestById } = require('../models/test');
      const test = await getTestById(id, shopDomain);
      if (
        test?.goal?.funnel_steps &&
        Array.isArray(test.goal.funnel_steps) &&
        test.goal.funnel_steps.length > 0
      ) {
        segmentOptions.funnel_steps = test.goal.funnel_steps;
      }
    } catch (_) {
      // Ignore - use default funnel steps
    }

    const funnel = await getFunnelMetrics(id, shopDomain, segmentOptions);

    res.json({
      success: true,
      funnel,
    });
  })
);

/**
 * GET /api/analytics/tests/:id/decision
 * Advanced decision overview: statistics readiness, guardrails, and funnel scaffold.
 */
router.get(
  '/tests/:id/decision',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { device, country } = req.query;
    const options = {};
    if (device && device !== 'all') {
      options.device = device;
    }
    if (country && country !== 'all') {
      options.country = country;
    }
    const decision = await getExperimentDecisionOverview(id, shopDomain, options);
    res.json({ success: true, decision });
  })
);

/**
 * GET /api/analytics/tests/:id/events
 * List events with pagination and filters
 * Query: limit, offset, event_type, event_name, variant_id, start_date, end_date
 */
router.get(
  '/tests/:id/events',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { limit, offset, event_type, event_name, variant_id, start_date, end_date } = req.query;
    const options = {};
    if (limit) {
      options.limit = Math.min(
        parseInt(limit, 10) || PAGINATION.ANALYTICS_DEFAULT_LIMIT,
        PAGINATION.ANALYTICS_MAX_LIMIT
      );
    }
    if (offset) {
      options.offset = Math.max(0, parseInt(offset, 10));
    }
    if (event_type && event_type !== 'all') {
      options.event_type = event_type;
    }
    if (event_name && event_name !== 'all') {
      options.event_name = event_name;
    }
    if (variant_id && variant_id !== 'all') {
      options.variant_id = variant_id;
    }
    if (start_date) {
      options.start_date = start_date;
    }
    if (end_date) {
      options.end_date = end_date;
    }

    const [eventsData, eventTypes] = await Promise.all([
      getEventsList(id, shopDomain, options),
      getEventTypesForTest(id, shopDomain),
    ]);

    res.json({
      success: true,
      events: eventsData.events,
      total: eventsData.total,
      eventTypes: eventTypes.types,
      eventNames: eventTypes.names,
    });
  })
);

/**
 * GET /api/analytics/tests/:id/heatmap
 * Get heatmap data (clicks, scroll) for a test.
 * When page_url is set, also returns overlay (normalized points for screenshot) and screenshotUrl if stored.
 * Query: page_url, variant_id, since (ISO date)
 */
router.get(
  '/tests/:id/heatmap',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { page_url, variant_id, since } = req.query;
    const pageUrl = page_url || null;
    const opts = { variantId: variant_id || null, since: since || null };

    const [pages, clicks, scrolls, overlay, screenshotUrl] = await Promise.all([
      getHeatmapPages(id, shopDomain),
      getClickHeatmap(id, shopDomain, pageUrl, opts),
      getScrollHeatmap(id, shopDomain, pageUrl, opts),
      pageUrl ? getClickHeatmapForOverlay(id, shopDomain, pageUrl, opts) : Promise.resolve(null),
      pageUrl ? getHeatmapScreenshotUrl(shopDomain, pageUrl) : Promise.resolve(null),
    ]);

    const heatmap = {
      pages,
      clicks,
      scrolls,
    };
    if (overlay) {
      heatmap.overlay = overlay;
    }
    if (screenshotUrl) {
      heatmap.screenshotUrl = screenshotUrl;
    }

    res.json({
      success: true,
      heatmap,
    });
  })
);

/**
 * PUT /api/analytics/tests/:id/heatmap/screenshot
 * Save screenshot URL for a specific heatmap page URL.
 * Body: { page_url, screenshot_url }
 */
router.put(
  '/tests/:id/heatmap/screenshot',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const pageUrl = String(req.body?.page_url || '').trim();
    const screenshotUrl = String(req.body?.screenshot_url || '').trim();

    if (!pageUrl) {
      return res.status(400).json({ success: false, error: 'page_url is required' });
    }
    if (screenshotUrl && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(screenshotUrl)) {
      return res.status(400).json({ success: false, error: 'screenshot_url must be a valid URL' });
    }

    const test = await getTestById(id, shopDomain);
    if (!test) {
      return res.status(404).json({ success: false, error: 'Test not found' });
    }

    const result = await setHeatmapScreenshotUrl(shopDomain, pageUrl, screenshotUrl);
    if (!result.ok) {
      return res.status(400).json({ success: false, error: 'Could not save screenshot URL' });
    }

    return res.json({
      success: true,
      page_url: pageUrl,
      screenshot_url: screenshotUrl || null,
      deleted: !!result.deleted,
    });
  })
);

// Export routes
router.use('/', exportRoutes);

module.exports = router;
