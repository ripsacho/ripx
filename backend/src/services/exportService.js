/**
 * Export Service
 *
 * Handles exporting test results to CSV, PDF, etc.
 */

const analyticsService = require('./analytics');
const { getFunnelMetrics } = require('../models/analytics');
const { getHeatmapRollupSummary } = require('../models/heatmap');
const { getExperimentDecisionOverview } = require('./experimentDecisionService');
const { parseGoalConfig } = require('../utils/goalConfig');
const { LIGHTWEIGHT_EXPORT_SCHEMA_VERSION } = require('./warehouseExportSchemaService');
const logger = require('../utils/logger');

const EXPORT_SCHEMA_VERSION = LIGHTWEIGHT_EXPORT_SCHEMA_VERSION;

function csvCell(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvRow(values) {
  return `${values.map(csvCell).join(',')}\n`;
}

class ExportService {
  /**
   * Export test results to CSV
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {Object} [dateRange] - Optional { start_date, end_date } for funnel
   * @returns {Promise<string>} CSV content
   */
  async exportToCSV(testId, shopDomain, dateRange = null) {
    const { getTestById } = require('../models/test');
    const test = await getTestById(testId, shopDomain);
    if (!test) {
      const err = new Error('Test not found');
      err.status = 404;
      throw err;
    }

    const goal = parseGoalConfig(test?.goal);
    const analyticsOptions = {
      device: dateRange?.device,
      country: dateRange?.country,
      start_date: dateRange?.start_date,
      end_date: dateRange?.end_date,
    };
    Object.keys(analyticsOptions).forEach(key => {
      if (!analyticsOptions[key] || analyticsOptions[key] === 'all') {
        delete analyticsOptions[key];
      }
    });
    const exportWarnings = [];
    const analytics = await analyticsService.getTestAnalytics(testId, shopDomain, analyticsOptions);
    const [decision, heatmapSummary] = await Promise.all([
      getExperimentDecisionOverview(testId, shopDomain, analyticsOptions).catch(error => {
        logger.error('CSV export decision overview failed', error);
        exportWarnings.push({
          code: 'decision_unavailable',
          message: 'Decision readiness could not be included in this export.',
        });
        return null;
      }),
      getHeatmapRollupSummary(testId, shopDomain, {
        since: dateRange?.start_date || null,
        device: analyticsOptions.device,
        country: analyticsOptions.country,
      }).catch(error => {
        logger.error('CSV export heatmap summary failed', error);
        exportWarnings.push({
          code: 'heatmap_summary_unavailable',
          message: 'Heatmap summary could not be included in this export.',
        });
        return null;
      }),
    ]);

    // Build CSV content
    let csv = csvRow(['Test', test.name]);
    csv += csvRow(['Type', test.type]);
    csv += csvRow(['Status', test.status]);
    csv += csvRow(['Created', test.created_at]);
    csv += '\n';
    csv += csvRow(['Schema Version', EXPORT_SCHEMA_VERSION]);
    csv += csvRow(['Segment Device', analyticsOptions.device || 'all']);
    csv += csvRow(['Segment Country', analyticsOptions.country || 'all']);
    csv += '\n';

    // Variant data
    csv += csvRow([
      'Variant',
      'Visitors',
      'Conversions',
      'Conversion Rate',
      'Revenue',
      'Avg Order Value',
    ]);

    analytics.variants.forEach(variant => {
      csv += csvRow([
        variant.name,
        variant.visitors,
        variant.conversions,
        `${variant.conversionRate.toFixed(2)}%`,
        `$${variant.revenue.toFixed(2)}`,
        `$${variant.avgOrderValue.toFixed(2)}`,
      ]);
    });

    // Significance data
    if (analytics.significance) {
      csv += '\nStatistical Significance\n';
      csv += csvRow(['P-Value', analytics.significance.pValue]);
      csv += csvRow(['Confidence', `${analytics.significance.confidence}%`]);
      if (analytics.significance.winner) {
        csv += csvRow(['Winner', analytics.significance.winner]);
      }
      if (analytics.significance.lift) {
        csv += csvRow(['Lift', `${analytics.significance.lift}%`]);
      }
    }

    // Revenue impact
    if (analytics.revenueImpact) {
      csv += '\nRevenue Impact\n';
      csv += csvRow(['Control Revenue', `$${analytics.revenueImpact.controlRevenue.toFixed(2)}`]);
      csv += csvRow(['Test Revenue', `$${analytics.revenueImpact.testRevenue.toFixed(2)}`]);
      csv += csvRow(['Impact', `$${analytics.revenueImpact.impact.toFixed(2)}`]);
      csv += csvRow(['Impact %', `${analytics.revenueImpact.impactPercent.toFixed(2)}%`]);
    }

    if (decision) {
      csv += '\nDecision Readiness\n';
      csv += csvRow(['Status', decision.promotionReadiness?.status || 'unknown']);
      csv += csvRow(['Can Promote', decision.promotionReadiness?.canPromote ? 'yes' : 'no']);
      csv += csvRow(['Blockers', decision.promotionReadiness?.blockers?.length || 0]);
      csv += csvRow(['Warnings', decision.promotionReadiness?.warnings?.length || 0]);
    }

    if (analytics.secondaryEventStats && Object.keys(analytics.secondaryEventStats).length > 0) {
      csv += '\nEvent Collection Health\n';
      csv += csvRow(['Event Name', 'Total Events', 'Unique Users', 'First Seen', 'Last Seen']);
      Object.entries(analytics.secondaryEventStats).forEach(([eventName, stats]) => {
        csv += csvRow([
          eventName,
          stats.totalEvents || 0,
          stats.uniqueUsers || 0,
          stats.firstSeen || '',
          stats.lastSeen || '',
        ]);
      });
    }

    if (heatmapSummary?.available) {
      csv += '\nHeatmap Summary\n';
      csv += csvRow(['Total Events', heatmapSummary.totalEvents]);
      csv += csvRow(['Click Events', heatmapSummary.clickEvents]);
      csv += csvRow(['Scroll Events', heatmapSummary.scrollEvents]);
      csv += csvRow(['Pages', heatmapSummary.pageCount]);
      csv += csvRow(['Last Seen', heatmapSummary.lastSeenAt || '']);
    }

    const funnelOptions = {
      ...(dateRange || {}),
      funnel_steps: goal?.funnel_steps,
      funnel_mode: goal?.funnel_mode,
      conversionWindowDays: goal?.conversion_window_days,
      conversionUrl: goal?.conversion_url,
    };

    // Funnel
    try {
      const funnel = await getFunnelMetrics(testId, shopDomain, funnelOptions);
      if (funnel?.byVariant && Object.keys(funnel.byVariant).length > 0) {
        csv += '\nConversion Funnel\n';
        const steps = Array.isArray(funnel.steps) && funnel.steps.length ? funnel.steps : [];
        const visitorStep =
          steps.find(step => step.type === 'visitors' || step.id === 'visitors') || steps[0];
        const lastStep = steps[steps.length - 1];
        csv += csvRow(['Mode', funnel.mode || 'step_reach']);
        csv += csvRow(['Denominator', visitorStep?.label || visitorStep?.id || 'First step']);
        csv += csvRow([
          'Variant',
          ...steps.map(step => step.label || step.id),
          'Visitor-to-Final Rate %',
        ]);
        Object.entries(funnel.byVariant).forEach(([vid, data]) => {
          const name = funnel.variantNames?.[vid] || vid;
          const firstCount = Number(data[visitorStep?.id]) || 0;
          const lastCount = Number(data[lastStep?.id]) || 0;
          const overallRate = firstCount > 0 ? ((lastCount / firstCount) * 100).toFixed(2) : '0';
          csv += csvRow([name, ...steps.map(step => Number(data[step.id]) || 0), overallRate]);
        });
      }
    } catch (error) {
      logger.error('CSV export funnel metrics failed', error);
      exportWarnings.push({
        code: 'funnel_unavailable',
        message: 'Funnel metrics could not be included in this export.',
      });
    }
    if (exportWarnings.length > 0) {
      csv += '\nExport Warnings\n';
      exportWarnings.forEach(warning => {
        csv += csvRow([warning.code, warning.message]);
      });
    }

    return csv;
  }

  /**
   * Export test results to JSON
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} JSON data
   */
  async exportToJSON(testId, shopDomain, dateRange = null) {
    const { getTestById } = require('../models/test');
    const test = await getTestById(testId, shopDomain);
    if (!test) {
      const err = new Error('Test not found');
      err.status = 404;
      throw err;
    }

    const goal = parseGoalConfig(test?.goal);
    const analyticsOptions = {
      device: dateRange?.device,
      country: dateRange?.country,
      start_date: dateRange?.start_date,
      end_date: dateRange?.end_date,
    };
    Object.keys(analyticsOptions).forEach(key => {
      if (!analyticsOptions[key] || analyticsOptions[key] === 'all') {
        delete analyticsOptions[key];
      }
    });
    const opts = {
      ...(dateRange || {}),
      funnel_steps: goal?.funnel_steps,
      funnel_mode: goal?.funnel_mode,
      conversionWindowDays: goal?.conversion_window_days,
      conversionUrl: goal?.conversion_url,
    };
    const exportWarnings = [];
    const [analytics, funnel, decision, heatmapSummary] = await Promise.all([
      analyticsService.getTestAnalytics(testId, shopDomain, analyticsOptions),
      getFunnelMetrics(testId, shopDomain, opts).catch(error => {
        logger.error('JSON export funnel metrics failed', error);
        exportWarnings.push({
          code: 'funnel_unavailable',
          message: 'Funnel metrics could not be included in this export.',
        });
        return null;
      }),
      getExperimentDecisionOverview(testId, shopDomain, analyticsOptions).catch(error => {
        logger.error('JSON export decision overview failed', error);
        exportWarnings.push({
          code: 'decision_unavailable',
          message: 'Decision readiness could not be included in this export.',
        });
        return null;
      }),
      getHeatmapRollupSummary(testId, shopDomain, {
        since: dateRange?.start_date || null,
        device: analyticsOptions.device,
        country: analyticsOptions.country,
      }).catch(error => {
        logger.error('JSON export heatmap summary failed', error);
        exportWarnings.push({
          code: 'heatmap_summary_unavailable',
          message: 'Heatmap summary could not be included in this export.',
        });
        return null;
      }),
    ]);

    const result = {
      schema_version: EXPORT_SCHEMA_VERSION,
      test: {
        id: test.id,
        name: test.name,
        type: test.type,
        status: test.status,
        created_at: test.created_at,
        started_at: test.started_at,
        stopped_at: test.stopped_at,
      },
      segment_scope: {
        device: analyticsOptions.device || 'all',
        country: analyticsOptions.country || 'all',
        start_date: dateRange?.start_date || null,
        end_date: dateRange?.end_date || null,
      },
      analytics,
      decision,
      heatmap_summary: heatmapSummary?.available ? heatmapSummary : null,
      export_warnings: exportWarnings,
      exported_at: new Date().toISOString(),
    };
    if (funnel?.byVariant && Object.keys(funnel.byVariant).length > 0) {
      result.funnel = funnel;
    }
    return result;
  }

  /**
   * Generate export filename
   *
   * @param {string} testId - Test ID
   * @param {string} testName - Test name
   * @param {string} format - Export format (csv, json)
   * @returns {string} Filename
   */
  generateFilename(testId, testName, format) {
    const sanitizedName = testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = new Date().toISOString().split('T')[0];
    return `ab_test_${sanitizedName}_${timestamp}.${format}`;
  }
}

module.exports = new ExportService();
module.exports.csvCell = csvCell;
module.exports.csvRow = csvRow;
