/**
 * Export Service
 *
 * Handles exporting test results to CSV, PDF, etc.
 */

const analyticsService = require('./analytics');
const { getFunnelMetrics } = require('../models/analytics');

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

    const analytics = await analyticsService.getTestAnalytics(testId, shopDomain);

    // Build CSV content
    let csv = `Test: ${test.name}\n`;
    csv += `Type: ${test.type}\n`;
    csv += `Status: ${test.status}\n`;
    csv += `Created: ${test.created_at}\n\n`;

    // Variant data
    csv += 'Variant,Visitors,Conversions,Conversion Rate,Revenue,Avg Order Value\n';

    analytics.variants.forEach(variant => {
      csv += `"${variant.name}",${variant.visitors},${variant.conversions},`;
      csv += `${variant.conversionRate.toFixed(2)}%,$${variant.revenue.toFixed(2)},`;
      csv += `$${variant.avgOrderValue.toFixed(2)}\n`;
    });

    // Significance data
    if (analytics.significance) {
      csv += '\nStatistical Significance\n';
      csv += `P-Value,${analytics.significance.pValue}\n`;
      csv += `Confidence,${analytics.significance.confidence}%\n`;
      if (analytics.significance.winner) {
        csv += `Winner,${analytics.significance.winner}\n`;
      }
      if (analytics.significance.lift) {
        csv += `Lift,${analytics.significance.lift}%\n`;
      }
    }

    // Revenue impact
    if (analytics.revenueImpact) {
      csv += '\nRevenue Impact\n';
      csv += `Control Revenue,$${analytics.revenueImpact.controlRevenue.toFixed(2)}\n`;
      csv += `Test Revenue,$${analytics.revenueImpact.testRevenue.toFixed(2)}\n`;
      csv += `Impact,$${analytics.revenueImpact.impact.toFixed(2)}\n`;
      csv += `Impact %,${analytics.revenueImpact.impactPercent.toFixed(2)}%\n`;
    }

    // Funnel
    try {
      const funnel = await getFunnelMetrics(testId, shopDomain, dateRange || {});
      if (funnel?.byVariant && Object.keys(funnel.byVariant).length > 0) {
        csv += '\nConversion Funnel\n';
        csv += 'Variant,Visitors,Add to Cart,Purchase,Cart Rate %,Purchase Rate %\n';
        Object.entries(funnel.byVariant).forEach(([vid, data]) => {
          const name = funnel.variantNames?.[vid] || vid;
          const v = data.visitors || 0;
          const c = data.add_to_cart || 0;
          const p = data.conversion || 0;
          const cartRate = v > 0 ? ((c / v) * 100).toFixed(2) : '0';
          const purchaseRate = v > 0 ? ((p / v) * 100).toFixed(2) : '0';
          csv += `"${name}",${v},${c},${p},${cartRate},${purchaseRate}\n`;
        });
      }
    } catch {
      // Funnel optional
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

    const opts = dateRange || {};
    const [analytics, funnel] = await Promise.all([
      analyticsService.getTestAnalytics(testId, shopDomain),
      getFunnelMetrics(testId, shopDomain, opts).catch(() => null),
    ]);

    const result = {
      test: {
        id: test.id,
        name: test.name,
        type: test.type,
        status: test.status,
        created_at: test.created_at,
        started_at: test.started_at,
        stopped_at: test.stopped_at,
      },
      analytics,
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
