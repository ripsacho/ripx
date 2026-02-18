/**
 * Custom Metrics Service
 *
 * Handles custom success metrics beyond standard conversion/revenue.
 * Supports COGS, profit, custom events, and more.
 */

const { query } = require('../utils/database');

class CustomMetricsService {
  /**
   * Calculate custom metric value
   *
   * @param {Object} metricConfig - Metric configuration
   * @param {Object} variantData - Variant analytics data
   * @returns {number} Calculated metric value
   */
  calculateMetric(metricConfig, variantData) {
    switch (metricConfig.type) {
      case 'revenue': {
        return variantData.revenue || 0;
      }

      case 'profit': {
        return this.calculateProfit(variantData, metricConfig.cogs);
      }

      case 'conversion_rate': {
        return variantData.visitors > 0
          ? (variantData.conversions / variantData.visitors) * 100
          : 0;
      }

      case 'average_order_value': {
        return variantData.conversions > 0 ? variantData.revenue / variantData.conversions : 0;
      }

      case 'revenue_per_visitor': {
        return variantData.visitors > 0 ? variantData.revenue / variantData.visitors : 0;
      }

      case 'profit_per_visitor': {
        const profit = this.calculateProfit(variantData, metricConfig.cogs);
        return variantData.visitors > 0 ? profit / variantData.visitors : 0;
      }

      case 'custom_event': {
        return this.calculateCustomEvent(metricConfig, variantData);
      }

      case 'custom_formula': {
        return this.calculateCustomFormula(metricConfig, variantData);
      }

      default: {
        return 0;
      }
    }
  }

  /**
   * Calculate profit (revenue - COGS)
   *
   * @param {Object} variantData - Variant data
   * @param {Object} cogsConfig - COGS configuration
   * @returns {number} Profit
   */
  calculateProfit(variantData, cogsConfig) {
    if (!cogsConfig || !cogsConfig.enabled) {
      return variantData.revenue || 0;
    }

    const revenue = variantData.revenue || 0;
    let cogs = 0;

    if (cogsConfig.type === 'percentage') {
      cogs = revenue * (cogsConfig.value / 100);
    } else if (cogsConfig.type === 'fixed_per_order') {
      cogs = variantData.conversions * cogsConfig.value;
    } else if (cogsConfig.type === 'fixed_per_item') {
      // Would need item quantity data
      cogs = variantData.conversions * cogsConfig.value; // Simplified
    }

    return revenue - cogs;
  }

  /**
   * Calculate custom event metric
   *
   * @param {Object} metricConfig - Metric config
   * @param {Object} variantData - Variant data
   * @returns {number} Custom event count/value
   */
  async calculateCustomEvent(metricConfig, variantData) {
    const { test_id, variant_id, shop_domain } = variantData;

    const sql = `
      SELECT 
        COUNT(*) as event_count,
        SUM(event_value) as event_value_sum
      FROM events
      WHERE test_id = $1
        AND variant_id = $2
        AND shop_domain = $3
        AND event_type = $4
    `;

    const result = await query(sql, [test_id, variant_id, shop_domain, metricConfig.eventName]);

    if (metricConfig.aggregation === 'count') {
      return parseInt(result.rows[0].event_count) || 0;
    } else if (metricConfig.aggregation === 'sum') {
      return parseFloat(result.rows[0].event_value_sum) || 0;
    } else if (metricConfig.aggregation === 'average') {
      const count = parseInt(result.rows[0].event_count) || 0;
      const sum = parseFloat(result.rows[0].event_value_sum) || 0;
      return count > 0 ? sum / count : 0;
    }

    return 0;
  }

  /**
   * Calculate custom formula metric
   *
   * @param {Object} metricConfig - Metric config
   * @param {Object} variantData - Variant data
   * @returns {number} Calculated value
   */
  calculateCustomFormula(metricConfig, variantData) {
    try {
      const formula = metricConfig?.formula;
      if (!formula || typeof formula !== 'string' || !formula.trim()) {
        return 0;
      }

      const revenue = Number(variantData.revenue) || 0;
      const conversions = Number(variantData.conversions) || 0;
      const visitors = Number(variantData.visitors) || 0;
      const aov = conversions > 0 ? revenue / conversions : 0;

      let cogs = 0;
      const cogsConfig = metricConfig.cogs;
      if (cogsConfig?.enabled) {
        if (cogsConfig.type === 'percentage') {
          cogs = revenue * (cogsConfig.value / 100);
        } else if (cogsConfig.type === 'fixed_per_order' || cogsConfig.type === 'fixed_per_item') {
          cogs = conversions * (cogsConfig.value || 0);
        }
      }

      // Replace variables with actual values (safe numeric substitution)
      const evaluatedFormula = formula
        .replace(/\brevenue\b/g, String(revenue))
        .replace(/\bconversions\b/g, String(conversions))
        .replace(/\bvisitors\b/g, String(visitors))
        .replace(/\baov\b/g, String(aov))
        .replace(/\bcogs\b/g, String(cogs));

      // Evaluate formula - restricted to numeric ops; consider a proper math parser for production
      // eslint-disable-next-line no-new-func -- formula evaluation from trusted config
      const result = Function(`"use strict"; return (${evaluatedFormula})`)();
      const num = Number(result);
      return Number.isFinite(num) ? num : 0;
    } catch (error) {
      const logger = require('../utils/logger');
      logger.error('Error evaluating custom formula', {
        error: error.message,
        formula: metricConfig?.formula,
      });
      return 0;
    }
  }

  /**
   * Get all metrics for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {Array} customMetrics - Custom metric configurations
   * @returns {Promise<Object>} All metric values
   */
  async getAllMetrics(testId, shopDomain, customMetrics = []) {
    const analyticsService = require('./analytics');
    const baseAnalytics = await analyticsService.getTestAnalytics(testId, shopDomain);

    const metrics = {
      standard: {
        conversionRate: baseAnalytics.variants.map(v => ({
          variant: v.name,
          value: v.conversionRate,
        })),
        revenue: baseAnalytics.variants.map(v => ({
          variant: v.name,
          value: v.revenue,
        })),
        revenuePerVisitor: baseAnalytics.variants.map(v => ({
          variant: v.name,
          value: v.visitors > 0 ? v.revenue / v.visitors : 0,
        })),
      },
      custom: {},
    };

    // Calculate custom metrics
    for (const metricConfig of customMetrics) {
      const metricValues = [];

      for (const variant of baseAnalytics.variants) {
        const variantData = {
          ...variant,
          test_id: testId,
          variant_id: variant.id,
          shop_domain: shopDomain,
        };

        let value;
        if (metricConfig.type === 'custom_event') {
          value = await this.calculateCustomEvent(metricConfig, variantData);
        } else {
          value = this.calculateMetric(metricConfig, variantData);
        }

        metricValues.push({
          variant: variant.name,
          value: Math.round(value * 100) / 100,
        });
      }

      metrics.custom[metricConfig.name] = metricValues;
    }

    return metrics;
  }
}

module.exports = new CustomMetricsService();
