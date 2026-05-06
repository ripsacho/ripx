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
  getHeatmapCollectionStats,
  getHeatmapSegmentOptions,
  getHeatmapRollupSummary,
  getClickHeatmapForOverlay,
  getHeatmapScreenshotUrl,
  normalizeHeatmapPageKey,
  setHeatmapScreenshotUrl,
} = require('../models/heatmap');
const {
  getFunnelMetrics,
  getEventsList,
  getEventTypesForTest,
  getAssignmentCohorts,
  getSegmentBreakdownOptions,
  getBatchVariantMetrics,
  getTestAnalytics,
} = require('../models/analytics');
const { getTestById, getTestsByShop } = require('../models/test');
const exportRoutes = require('./exportRoutes');
const { PAGINATION } = require('../constants');
const { getExperimentDecisionOverview } = require('../services/experimentDecisionService');
const { parseGoalConfig } = require('../utils/goalConfig');
const { normalizeDomain } = require('../models/tenant');
const { buildAnalyticsPortfolioOverview } = require('../services/analyticsOverviewService');
const testHealthService = require('../services/testHealthService');

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizedQueryString(value) {
  const raw = firstQueryValue(value);
  return typeof raw === 'string' ? raw.trim() : '';
}

function isAllQueryValue(value) {
  const normalized = normalizedQueryString(value).toLowerCase();
  return !normalized || normalized === 'all';
}

function appendSegmentFilters(target, query) {
  const device = normalizedQueryString(query.device);
  const country = normalizedQueryString(query.country);
  if (device && device.toLowerCase() !== 'all') {
    target.device = device;
  }
  if (country && country.toLowerCase() !== 'all') {
    target.country = country;
  }
  return target;
}

function appendDateRangeFilters(target, query) {
  const startDate = normalizedQueryString(query.start_date);
  const endDate = normalizedQueryString(query.end_date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    target.start_date = startDate;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    target.end_date = endDate;
  }
  return target;
}

function getPrimaryVariantName(test) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  const first = variants[0];
  return first?.name || first?.id || null;
}

function buildChartAnnotations(test, analytics) {
  const annotations = [];
  const startedAt = test?.started_at || test?.created_at;
  if (startedAt) {
    const date = new Date(startedAt);
    if (!Number.isNaN(date.getTime())) {
      annotations.push({
        date: date.toISOString().split('T')[0],
        type: 'test_start',
        label: 'Test started',
      });
    }
  }
  if (test?.stopped_at || test?.ended_at) {
    const date = new Date(test.stopped_at || test.ended_at);
    if (!Number.isNaN(date.getTime())) {
      annotations.push({
        date: date.toISOString().split('T')[0],
        type: 'test_end',
        label: 'Test ended',
      });
    }
  }
  if (analytics?.srm?.detected) {
    annotations.push({
      date: new Date().toISOString().split('T')[0],
      type: 'data_quality',
      label: 'SRM detected',
    });
  }
  if (analytics?.winner) {
    annotations.push({
      date: new Date().toISOString().split('T')[0],
      type: 'decision',
      label: `Winner: ${analytics.winner.name || analytics.winner.variantName || 'variant'}`,
    });
  }
  return annotations;
}

function summarizeSegmentAnalytics(dimension, value, analytics) {
  const summary = analytics?.summary || {};
  const variants = Array.isArray(analytics?.variants) ? analytics.variants : [];
  const control = variants[0] || null;
  return {
    dimension,
    value,
    label: value,
    totalVisitors: Number(summary.totalVisitors) || 0,
    totalConversions: Number(summary.totalConversions) || 0,
    conversionRate: Number(summary.conversionRate) || 0,
    revenue: Number(summary.totalRevenue) || Number(summary.revenue) || 0,
    srm: analytics?.srm || null,
    variants: variants.map(variant => {
      const visitors = Number(variant.visitors) || 0;
      const conversions = Number(variant.conversions) || 0;
      const conversionRate = visitors > 0 ? (conversions / visitors) * 100 : 0;
      const controlRate =
        control && Number(control.visitors) > 0
          ? ((Number(control.conversions) || 0) / Number(control.visitors)) * 100
          : 0;
      return {
        id: variant.id,
        name: variant.name,
        visitors,
        conversions,
        conversionRate,
        revenue: Number(variant.revenue) || 0,
        liftVsControl: controlRate > 0 ? ((conversionRate - controlRate) / controlRate) * 100 : 0,
      };
    }),
  };
}

function mergeOverviewVariantMetrics(variants = [], metrics = []) {
  const byId = new Map();
  const byName = new Map();
  metrics.forEach(metric => {
    const id =
      metric.variant_id !== null && metric.variant_id !== undefined
        ? String(metric.variant_id)
        : null;
    const name =
      metric.variant_name !== null && metric.variant_name !== undefined
        ? String(metric.variant_name)
        : null;
    if (id) {
      byId.set(id, metric);
    }
    if (name) {
      byName.set(name, metric);
    }
  });
  return variants.map(variant => {
    const id =
      variant?.id !== null && variant?.id !== undefined
        ? String(variant.id)
        : variant?.variant_id !== null && variant?.variant_id !== undefined
          ? String(variant.variant_id)
          : null;
    const name =
      variant?.name !== null && variant?.name !== undefined ? String(variant.name) : null;
    const metric =
      (id && (byId.get(id) || byName.get(id))) || (name && (byName.get(name) || byId.get(name)));
    return metric
      ? {
          ...variant,
          visitors: Number(metric.visitors) || 0,
          conversions: Number(metric.conversions) || 0,
          revenue: Number(metric.revenue) || 0,
        }
      : { ...variant, visitors: 0, conversions: 0, revenue: 0 };
  });
}

router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const rawShopDomain = String(req.shopDomain || '').trim();
    const shopDomain = normalizeDomain(rawShopDomain) || rawShopDomain;
    let tests = await getTestsByShop(shopDomain);
    if (tests.length === 0 && rawShopDomain && rawShopDomain !== shopDomain) {
      tests = await getTestsByShop(rawShopDomain);
    }
    const testIds = tests.map(test => test.id);
    let metricMap = new Map();
    if (testIds.length > 0) {
      const metricsShopDomain = String(tests[0]?.shop_domain || shopDomain)
        .trim()
        .toLowerCase();
      metricMap = await getBatchVariantMetrics(testIds, metricsShopDomain || shopDomain);
    }
    const enrichedTests = await Promise.all(
      tests.map(async test => {
        let metrics = metricMap.get(test.id) || [];
        if (!metrics || metrics.length === 0) {
          const testShopDomain =
            normalizeDomain(test.shop_domain) || test.shop_domain || shopDomain;
          try {
            metrics = await getTestAnalytics(test.id, testShopDomain);
            if (
              (!Array.isArray(metrics) || metrics.length === 0) &&
              testShopDomain !== shopDomain
            ) {
              metrics = await getTestAnalytics(test.id, shopDomain);
            }
          } catch {
            metrics = [];
          }
        }
        const variants = mergeOverviewVariantMetrics(test.variants || [], metrics || []);
        const health = testHealthService.calculateHealthScore({
          ...test,
          variants,
        });
        return {
          ...test,
          variants,
          health,
          quality_score: health.score,
        };
      })
    );
    return res.json({
      success: true,
      overview: buildAnalyticsPortfolioOverview(enrichedTests),
    });
  })
);

function parsePagination(query) {
  const limitValue = Number.parseInt(normalizedQueryString(query.limit), 10);
  const offsetValue = Number.parseInt(normalizedQueryString(query.offset), 10);
  return {
    limit:
      Number.isFinite(limitValue) && limitValue > 0
        ? Math.min(limitValue, PAGINATION.ANALYTICS_MAX_LIMIT)
        : PAGINATION.ANALYTICS_DEFAULT_LIMIT,
    offset: Number.isFinite(offsetValue) && offsetValue > 0 ? offsetValue : 0,
  };
}

/**
 * GET /api/analytics/tests/:id
 * Get analytics for a specific test
 * Query: device, country, start_date, end_date - filter by segment/date scope
 */
router.get(
  '/tests/:id',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const segmentOptions = appendDateRangeFilters(appendSegmentFilters({}, req.query), req.query);

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

router.get(
  '/tests/:id/breakdown',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const dimension = normalizedQueryString(req.query.dimension).toLowerCase() || 'device';
    if (!['device', 'country'].includes(dimension)) {
      return res.status(400).json({
        success: false,
        error: 'dimension must be one of: device, country',
      });
    }

    const baseOptions = appendDateRangeFilters({}, req.query);
    const segments = await getSegmentBreakdownOptions(id, shopDomain);
    const values = (dimension === 'device' ? segments.devices : segments.countries)
      .map(item => String(item?.value || '').trim())
      .filter(Boolean)
      .slice(0, 12);

    const rows = await Promise.all(
      values.map(async value => {
        const analytics = await analyticsService.getTestAnalytics(id, shopDomain, {
          ...baseOptions,
          [dimension]: value,
        });
        return summarizeSegmentAnalytics(dimension, value, analytics);
      })
    );

    res.json({
      success: true,
      dimension,
      rows,
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
    const options = appendDateRangeFilters(appendSegmentFilters({}, req.query), req.query);
    try {
      const test = await getTestById(id, shopDomain);
      options.controlVariantName = getPrimaryVariantName(test);
      const goal = parseGoalConfig(test?.goal);
      if (goal?.conversion_window_days) {
        options.conversionWindowDays = goal.conversion_window_days;
      }
      if (goal?.conversion_url) {
        options.conversionUrl = goal.conversion_url;
      }
    } catch {
      // Keep chart available even if goal metadata cannot be loaded.
    }

    const [timeSeriesData, analytics, test] = await Promise.all([
      timeSeriesService.getChartData(id, shopDomain, options),
      analyticsService.getTestAnalytics(id, shopDomain, options).catch(() => null),
      getTestById(id, shopDomain).catch(() => null),
    ]);

    res.json({
      success: true,
      timeSeries: timeSeriesData,
      annotations: buildChartAnnotations(test, analytics),
    });
  })
);

router.get(
  '/tests/:id/cohorts',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const granularity =
      normalizedQueryString(req.query.granularity).toLowerCase() === 'day' ? 'day' : 'week';
    const options = appendDateRangeFilters(
      appendSegmentFilters({ granularity }, req.query),
      req.query
    );
    const cohorts = await getAssignmentCohorts(id, shopDomain, options);
    res.json({
      success: true,
      granularity,
      cohorts,
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
    const funnelMode = normalizedQueryString(req.query.funnel_mode).toLowerCase();
    const segmentOptions = appendDateRangeFilters(appendSegmentFilters({}, req.query), req.query);
    if (['ordered', 'sequence'].includes(funnelMode)) {
      segmentOptions.funnel_mode = 'ordered';
    }

    try {
      const test = await getTestById(id, shopDomain);
      const goal = parseGoalConfig(test?.goal);
      if (goal?.funnel_steps && Array.isArray(goal.funnel_steps) && goal.funnel_steps.length > 0) {
        segmentOptions.funnel_steps = goal.funnel_steps;
      }
      if (goal?.conversion_window_days) {
        segmentOptions.conversionWindowDays = goal.conversion_window_days;
      }
      if (goal?.conversion_url) {
        segmentOptions.conversionUrl = goal.conversion_url;
      }
      if (
        !segmentOptions.funnel_mode &&
        ['ordered', 'sequence'].includes(String(goal?.funnel_mode || '').toLowerCase())
      ) {
        segmentOptions.funnel_mode = 'ordered';
      }
    } catch {
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
    const options = appendDateRangeFilters(appendSegmentFilters({}, req.query), req.query);
    const decision = await getExperimentDecisionOverview(id, shopDomain, options);
    res.json({ success: true, decision });
  })
);

/**
 * GET /api/analytics/tests/:id/events
 * List events with pagination and filters
 * Query: limit, offset, event_type, event_name, variant_id, start_date, end_date, device, country
 */
router.get(
  '/tests/:id/events',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const eventType = normalizedQueryString(req.query.event_type);
    const eventName = normalizedQueryString(req.query.event_name);
    const variantId = normalizedQueryString(req.query.variant_id);
    const options = {
      ...parsePagination(req.query),
    };
    if (!isAllQueryValue(eventType)) {
      options.event_type = eventType;
    }
    if (!isAllQueryValue(eventName)) {
      options.event_name = eventName;
    }
    if (!isAllQueryValue(variantId)) {
      options.variant_id = variantId;
    }
    appendDateRangeFilters(appendSegmentFilters(options, req.query), req.query);

    const [eventsData, eventTypes] = await Promise.all([
      getEventsList(id, shopDomain, options),
      getEventTypesForTest(id, shopDomain, options),
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
 * Query: page_key, page_url, variant_id, since (ISO date), device, country
 */
router.get(
  '/tests/:id/heatmap',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { page_key, page_url, variant_id, since, device, country } = req.query;
    const pageUrl = normalizedQueryString(page_url) || null;
    const pageKey = page_key ? normalizeHeatmapPageKey(normalizedQueryString(page_key)) : null;
    const sinceDate = normalizedQueryString(since);
    const opts = {
      variantId: isAllQueryValue(variant_id) ? null : normalizedQueryString(variant_id),
      since: /^\d{4}-\d{2}-\d{2}$/.test(sinceDate) ? sinceDate : null,
      pageKey,
      device: isAllQueryValue(device) ? null : normalizedQueryString(device),
      country: isAllQueryValue(country) ? null : normalizedQueryString(country),
    };

    const pageStats = await getHeatmapPages(id, shopDomain, opts);
    const representativePageUrl =
      pageUrl || pageStats.find(page => page.page_key === pageKey)?.page_url || pageKey;
    const [
      collectionStats,
      segmentOptions,
      rollupSummary,
      clicks,
      scrolls,
      overlay,
      screenshotUrl,
    ] = await Promise.all([
      getHeatmapCollectionStats(id, shopDomain, opts),
      getHeatmapSegmentOptions(id, shopDomain, {
        variantId: opts.variantId,
        since: opts.since,
        pageKey: opts.pageKey,
      }),
      getHeatmapRollupSummary(id, shopDomain, opts),
      getClickHeatmap(id, shopDomain, pageUrl, opts),
      getScrollHeatmap(id, shopDomain, pageUrl, opts),
      pageKey || pageUrl
        ? getClickHeatmapForOverlay(id, shopDomain, pageUrl, opts)
        : Promise.resolve(null),
      pageKey || pageUrl
        ? getHeatmapScreenshotUrl(shopDomain, representativePageUrl)
        : Promise.resolve(null),
    ]);

    const heatmap = {
      pages: pageStats.map(page => page.page_key || page.page_url),
      pageStats,
      collectionStats,
      segmentOptions,
      rollupSummary,
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

router.get(
  '/tests/:id/heatmap/segments',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { page_key, variant_id, since } = req.query;
    const sinceDate = normalizedQueryString(since);
    const segmentOptions = await getHeatmapSegmentOptions(id, shopDomain, {
      variantId: isAllQueryValue(variant_id) ? null : normalizedQueryString(variant_id),
      since: /^\d{4}-\d{2}-\d{2}$/.test(sinceDate) ? sinceDate : null,
      pageKey: page_key ? normalizeHeatmapPageKey(normalizedQueryString(page_key)) : null,
    });

    return res.json({
      success: true,
      segmentOptions,
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
    if (
      screenshotUrl &&
      !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(screenshotUrl) &&
      !screenshotUrl.startsWith('/')
    ) {
      return res.status(400).json({
        success: false,
        error: 'screenshot_url must be a valid URL or app-relative path',
      });
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
