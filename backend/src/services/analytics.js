/**
 * Analytics Service
 *
 * Handles analytics calculations for AB tests:
 * - Conversion rates
 * - Statistical significance
 * - Revenue impact
 * - Confidence intervals
 */

const { getTestAnalytics } = require('../models/analytics');

class AnalyticsService {
  /**
   * Calculate conversion rate
   *
   * @param {number} conversions - Number of conversions
   * @param {number} visitors - Number of visitors
   * @returns {number} Conversion rate as percentage
   */
  calculateConversionRate(conversions, visitors) {
    if (visitors === 0) {return 0;}
    return (conversions / visitors) * 100;
  }

  /**
   * Calculate statistical significance using Z-test
   *
   * @param {Object} variantA - Control variant data
   * @param {Object} variantB - Test variant data
   * @returns {Object} Significance results
   */
  calculateSignificance(variantA, variantB) {
    const n1 = variantA.visitors;
    const n2 = variantB.visitors;
    const x1 = variantA.conversions;
    const x2 = variantB.conversions;

    if (n1 === 0 || n2 === 0) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        message: 'Insufficient data'
      };
    }

    // Calculate proportions
    const p1 = x1 / n1;
    const p2 = x2 / n2;

    // Pooled proportion
    const p = (x1 + x2) / (n1 + n2);
    const q = 1 - p;

    // Standard error
    const se = Math.sqrt(p * q * (1 / n1 + 1 / n2));

    if (se === 0) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        message: 'Cannot calculate significance'
      };
    }

    // Z-score
    const z = (p1 - p2) / se;

    // Calculate p-value (two-tailed test)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    // Confidence level
    const confidence = (1 - pValue) * 100;

    // Determine if significant (typically p < 0.05)
    const significant = pValue < 0.05;

    // Calculate lift
    const lift = p1 > 0 ? ((p2 - p1) / p1) * 100 : 0;

    // Determine winner
    let winner = null;
    if (significant) {
      winner = p2 > p1 ? 'variantB' : 'variantA';
    }

    return {
      significant,
      pValue: Math.round(pValue * 10000) / 10000,
      confidence: Math.round(confidence * 100) / 100,
      lift: Math.round(lift * 100) / 100,
      winner,
      zScore: Math.round(z * 100) / 100
    };
  }

  /**
   * Normal cumulative distribution function approximation
   *
   * @param {number} z - Z-score
   * @returns {number} Cumulative probability
   */
  normalCDF(z) {
    // Approximation using error function
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  /**
   * Error function approximation
   *
   * @param {number} x - Input value
   * @returns {number} Error function value
   */
  erf(x) {
    // Abramowitz and Stegun approximation
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Calculate revenue impact
   *
   * @param {Object} variantA - Control variant
   * @param {Object} variantB - Test variant
   * @returns {Object} Revenue impact
   */
  calculateRevenueImpact(variantA, variantB) {
    const revenueA = variantA.revenue || 0;
    const revenueB = variantB.revenue || 0;
    const visitorsA = variantA.visitors || 0;
    const visitorsB = variantB.visitors || 0;

    const rpvA = visitorsA > 0 ? revenueA / visitorsA : 0;
    const rpvB = visitorsB > 0 ? revenueB / visitorsB : 0;

    const impact = revenueB - revenueA;
    const impactPercent = revenueA > 0 ? (impact / revenueA) * 100 : 0;

    return {
      controlRevenue: revenueA,
      testRevenue: revenueB,
      impact: Math.round(impact * 100) / 100,
      impactPercent: Math.round(impactPercent * 100) / 100,
      revenuePerVisitor: {
        control: Math.round(rpvA * 100) / 100,
        test: Math.round(rpvB * 100) / 100
      }
    };
  }

  /**
   * Get comprehensive analytics for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} Complete analytics
   */
  async getTestAnalytics(testId, shopDomain) {
    const rawData = await getTestAnalytics(testId, shopDomain);

    if (!rawData || rawData.length < 2) {
      return {
        error: 'Insufficient data for analysis',
        variants: rawData || []
      };
    }

    // Calculate metrics for each variant
    const variants = rawData.map(variant => ({
      id: variant.variant_id,
      name: variant.variant_name,
      visitors: variant.visitors || 0,
      conversions: variant.conversions || 0,
      conversionRate: this.calculateConversionRate(
        variant.conversions || 0,
        variant.visitors || 0
      ),
      revenue: variant.revenue || 0,
      avgOrderValue: variant.conversions > 0
        ? (variant.revenue || 0) / variant.conversions
        : 0
    }));

    // Calculate significance between first two variants
    const significance = this.calculateSignificance(variants[0], variants[1]);

    // Calculate revenue impact
    const revenueImpact = this.calculateRevenueImpact(variants[0], variants[1]);

    return {
      testId,
      variants,
      significance,
      revenueImpact,
      summary: {
        totalVisitors: variants.reduce((sum, v) => sum + v.visitors, 0),
        totalConversions: variants.reduce((sum, v) => sum + v.conversions, 0),
        totalRevenue: variants.reduce((sum, v) => sum + v.revenue, 0)
      }
    };
  }
}

module.exports = new AnalyticsService();

