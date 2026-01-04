/**
 * Combination Test Service
 *
 * Handles combination testing (e.g., price + shipping together).
 * Tests interactions between multiple variables.
 */

class CombinationTestService {
  /**
   * Create a combination test
   * Tests multiple variables together (e.g., price + shipping)
   *
   * @param {Object} testConfig - Combination test configuration
   * @returns {Promise<Object>} Created test
   */
  async createCombinationTest(testConfig) {
    const {
      variables, // [{ type: 'price', variants: [...] }, { type: 'shipping', variants: [...] }]
      combinations // All combinations to test
    } = testConfig;

    // Generate all possible combinations if not provided
    if (!combinations || combinations.length === 0) {
      const combinations = this.generateCombinations(variables);
      testConfig.combinations = combinations;
    }

    // Validate combinations
    const validation = this.validateCombinations(testConfig);
    if (!validation.isValid) {
      throw new Error(`Invalid combinations: ${validation.errors.join(', ')}`);
    }

    // Create test with type 'combination'
    const testData = {
      ...testConfig,
      type: 'combination',
      variants: testConfig.combinations.map((combo, index) => ({
        name: `Combination ${index + 1}`,
        allocation: 100 / testConfig.combinations.length,
        config: combo
      }))
    };

    // Use AB test engine to create the test
    const { createTest } = require('../models/test');
    return createTest(testData);
  }

  /**
   * Generate all possible combinations from variables
   *
   * @param {Array} variables - Array of variable configurations
   * @returns {Array} All combinations
   */
  generateCombinations(variables) {
    if (!variables || variables.length === 0) {
      return [];
    }

    // Generate cartesian product of all variable variants
    const combinations = [];

    function generateRecursive(currentCombo, remainingVars, index) {
      if (remainingVars.length === 0) {
        combinations.push({ ...currentCombo });
        return;
      }

      const currentVar = remainingVars[0];
      const remaining = remainingVars.slice(1);

      currentVar.variants.forEach(variant => {
        generateRecursive(
          {
            ...currentCombo,
            [currentVar.type]: variant
          },
          remaining,
          index + 1
        );
      });
    }

    generateRecursive({}, variables, 0);
    return combinations;
  }

  /**
   * Validate combination test configuration
   *
   * @param {Object} testConfig - Test configuration
   * @returns {Object} Validation result
   */
  validateCombinations(testConfig) {
    const errors = [];

    if (!testConfig.variables || testConfig.variables.length < 2) {
      errors.push('Combination tests require at least 2 variables');
    }

    if (!testConfig.combinations || testConfig.combinations.length < 2) {
      errors.push('At least 2 combinations required');
    }

    // Check allocation sums to 100
    const totalAllocation = testConfig.combinations.reduce(
      (sum, combo) => sum + (combo.allocation || 0),
      0
    );

    if (Math.abs(totalAllocation - 100) > 0.01) {
      errors.push('Combination allocations must sum to 100%');
    }

    // Validate each combination has all required variables
    testConfig.combinations.forEach((combo, index) => {
      testConfig.variables.forEach(variable => {
        if (!combo[variable.type]) {
          errors.push(`Combination ${index + 1} missing variable: ${variable.type}`);
        }
      });
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get combination test results
   * Analyzes which combination performs best
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} Combination analysis
   */
  async getCombinationResults(testId, shopDomain) {
    const analyticsService = require('./analytics');
    const baseAnalytics = await analyticsService.getTestAnalytics(testId, shopDomain);

    // Analyze which variable combinations work best
    const variableAnalysis = this.analyzeVariableImpact(baseAnalytics);

    return {
      ...baseAnalytics,
      variableAnalysis,
      bestCombination: this.findBestCombination(baseAnalytics),
      interactionEffects: this.calculateInteractionEffects(baseAnalytics)
    };
  }

  /**
   * Analyze impact of individual variables
   *
   * @param {Object} analytics - Test analytics
   * @returns {Object} Variable impact analysis
   */
  analyzeVariableImpact(analytics) {
    // Group variants by variable type and analyze
    // This helps identify which variable (price vs shipping) has more impact
    const analysis = {};

    analytics.variants.forEach(variant => {
      const config = variant.config || {};

      Object.keys(config).forEach(variableType => {
        if (!analysis[variableType]) {
          analysis[variableType] = {};
        }

        const value = config[variableType];
        if (!analysis[variableType][value]) {
          analysis[variableType][value] = {
            value,
            variants: [],
            totalVisitors: 0,
            totalConversions: 0,
            totalRevenue: 0
          };
        }

        analysis[variableType][value].variants.push(variant);
        analysis[variableType][value].totalVisitors += variant.visitors;
        analysis[variableType][value].totalConversions += variant.conversions;
        analysis[variableType][value].totalRevenue += variant.revenue;
      });
    });

    // Calculate metrics for each variable value
    Object.keys(analysis).forEach(variableType => {
      Object.keys(analysis[variableType]).forEach(value => {
        const data = analysis[variableType][value];
        data.conversionRate = data.totalVisitors > 0
          ? (data.totalConversions / data.totalVisitors) * 100
          : 0;
        data.revenuePerVisitor = data.totalVisitors > 0
          ? data.totalRevenue / data.totalVisitors
          : 0;
      });
    });

    return analysis;
  }

  /**
   * Find best performing combination
   *
   * @param {Object} analytics - Test analytics
   * @returns {Object} Best combination
   */
  findBestCombination(analytics) {
    if (!analytics.variants || analytics.variants.length === 0) {
      return null;
    }

    // Sort by conversion rate, then by revenue
    const sorted = [...analytics.variants].sort((a, b) => {
      if (b.conversionRate !== a.conversionRate) {
        return b.conversionRate - a.conversionRate;
      }
      return b.revenue - a.revenue;
    });

    return sorted[0];
  }

  /**
   * Calculate interaction effects between variables
   *
   * @param {Object} analytics - Test analytics
   * @returns {Object} Interaction effects
   */
  calculateInteractionEffects(_analytics) {
    // This would calculate if variables interact (e.g., does price affect shipping conversion?)
    // Simplified version - full implementation would use ANOVA or similar
    return {
      hasInteraction: false,
      interactionStrength: 0,
      message: 'Interaction analysis requires more data'
    };
  }
}

module.exports = new CombinationTestService();

