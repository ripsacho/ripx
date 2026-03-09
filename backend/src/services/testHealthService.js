const analyticsService = require('./analytics');
const { TEST_HEALTH } = require('../constants');

/**
 * Test Health Score Service
 *
 * Calculates health score for AB tests based on various factors.
 * Includes Sample Ratio Mismatch (SRM) detection for data quality.
 */

class TestHealthService {
  /**
   * Calculate health score for a test
   *
   * @param {Object} test - Test object with analytics
   * @returns {Object} Health score and details
   */
  calculateHealthScore(test) {
    // Handle missing or invalid test data gracefully
    if (!test) {
      return {
        score: 0,
        healthLevel: 'poor',
        healthColor: 'critical',
        issues: ['Test data is missing'],
        recommendations: ['Please check test configuration'],
        totalVisitors: 0,
        daysRunning: 0,
      };
    }

    let score = 100;
    const issues = [];
    const recommendations = [];

    // Ensure variants is an array
    const variants = Array.isArray(test.variants) ? test.variants : [];

    // Sample size check
    const totalVisitors = variants.reduce((sum, v) => {
      // Handle both config variants (from DB) and analytics variants (with visitors)
      return sum + (v.visitors || 0);
    }, 0);
    if (totalVisitors < 100) {
      score -= 30;
      issues.push('Insufficient sample size (< 100 visitors)');
      recommendations.push('Wait for more visitors before making decisions');
    } else if (totalVisitors < 500) {
      score -= 15;
      issues.push('Low sample size (< 500 visitors)');
      recommendations.push('Consider waiting for more data');
    }

    // Duration check
    if (test.status === 'running' && test.started_at) {
      const daysRunning = (Date.now() - new Date(test.started_at)) / (1000 * 60 * 60 * 24);
      if (daysRunning < 7) {
        score -= 20;
        issues.push('Test running for less than 7 days');
        recommendations.push('Run tests for at least 1-2 weeks to account for weekly patterns');
      } else if (daysRunning > 90) {
        score -= 10;
        issues.push('Test running for over 90 days');
        recommendations.push('Consider stopping and analyzing results');
      }
    }

    // Traffic distribution check
    if (variants && variants.length > 0) {
      const allocationSum = variants.reduce((sum, v) => sum + (v.allocation || 0), 0);
      if (Math.abs(allocationSum - 100) > 1) {
        score -= 25;
        issues.push(`Traffic allocation doesn't sum to 100% (${allocationSum}%)`);
        recommendations.push('Adjust traffic allocation to total 100%');
      }

      // Check for balanced allocation
      const isBalanced = variants.every(v => Math.abs(v.allocation - 100 / variants.length) < 5);
      if (!isBalanced && test.variants.length === 2) {
        // Not a critical issue, just a note
        recommendations.push('Consider 50/50 split for most reliable results');
      }
    }

    // Statistical significance check (uses shop confidence level; significance.significant reflects that)
    if (test.significance) {
      if (!test.significance.significant) {
        score -= 10;
        issues.push('Not statistically significant yet');
        recommendations.push(
          'Wait for more data to reach significance (threshold uses your Settings confidence level)'
        );
      }
    } else if (test.status === 'running') {
      recommendations.push('Test is running - waiting for statistical significance');
    }

    // Conversion rate check
    if (variants && variants.length > 0) {
      const hasZeroConversions = variants.some(
        v => (v.conversions || 0) === 0 && (v.visitors || 0) > TEST_HEALTH.MIN_VISITORS_PER_VARIANT
      );
      if (hasZeroConversions) {
        score -= 15;
        issues.push('Some variants have zero conversions');
        recommendations.push('Check if test is properly tracking conversions');
      }
    }

    // Sample Ratio Mismatch (SRM) - data quality check
    if (variants && variants.length >= 2 && totalVisitors >= 100) {
      const variantsWithAllocation = variants.map(v => ({
        ...v,
        allocation: v.allocation ?? 100 / variants.length,
      }));
      const srm = analyticsService.detectSampleRatioMismatch(variantsWithAllocation, totalVisitors);
      if (srm.detected) {
        score -= 20;
        issues.push('Sample ratio mismatch detected');
        recommendations.push(
          srm.message ||
            'Traffic split deviates from expected—verify tracking and check for bot traffic'
        );
      }
    }

    // Status check
    if (test.status === 'draft') {
      score = Math.min(score, 70);
      recommendations.push('Test is in draft - start it to begin collecting data');
    }

    // Determine health level
    let healthLevel = 'excellent';
    let healthColor = 'success';

    if (score < 50) {
      healthLevel = 'poor';
      healthColor = 'critical';
    } else if (score < 70) {
      healthLevel = 'fair';
      healthColor = 'warning';
    } else if (score < 85) {
      healthLevel = 'good';
      healthColor = 'attention';
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      healthLevel,
      healthColor,
      issues,
      recommendations,
      totalVisitors,
      daysRunning: test.started_at
        ? Math.floor((Date.now() - new Date(test.started_at)) / (1000 * 60 * 60 * 24))
        : 0,
    };
  }

  /**
   * Get health score for multiple tests
   *
   * @param {Array} tests - Array of test objects
   * @returns {Array} Tests with health scores
   */
  calculateHealthScores(tests) {
    return tests.map(test => ({
      ...test,
      health: this.calculateHealthScore(test),
    }));
  }
}

module.exports = new TestHealthService();
