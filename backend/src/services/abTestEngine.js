/**
 * AB Test Engine
 *
 * Core engine for managing AB tests. Handles:
 * - Variant selection and assignment
 * - Traffic allocation
 * - Test validation
 * - Session persistence
 */

const crypto = require('crypto');
const { getTestAssignment, saveTestAssignment } = require('../models/testAssignment');
const { getTestById } = require('../models/test');

class ABTestEngine {
  /**
   * Get or assign a variant for a user
   *
   * @param {string} testId - The test ID
   * @param {string} userId - User identifier (cookie, session, etc.)
   * @param {string} shopDomain - Shopify shop domain
   * @returns {Promise<Object>} Variant assignment
   */
  async getVariant(testId, userId, shopDomain) {
    try {
      // Check if user already has an assignment
      const existingAssignment = await getTestAssignment(testId, userId, shopDomain);

      if (existingAssignment) {
        return {
          variantId: existingAssignment.variant_id,
          variantName: existingAssignment.variant_name,
          isNewAssignment: false
        };
      }

      // Get test details
      const test = await getTestById(testId, shopDomain);

      if (!test || test.status !== 'running') {
        return null;
      }

      // Select variant based on traffic allocation
      const variant = this.selectVariant(test.variants, userId);

      // Save assignment
      await saveTestAssignment({
        test_id: testId,
        user_id: userId,
        shop_domain: shopDomain,
        variant_id: variant.id,
        variant_name: variant.name,
        assigned_at: new Date()
      });

      return {
        variantId: variant.id,
        variantName: variant.name,
        isNewAssignment: true
      };
    } catch (error) {
      console.error('Error in getVariant:', error);
      throw error;
    }
  }

  /**
   * Select a variant based on traffic allocation
   * Uses consistent hashing to ensure even distribution
   *
   * @param {Array} variants - Array of test variants
   * @param {string} userId - User identifier
   * @returns {Object} Selected variant
   */
  selectVariant(variants, userId) {
    // Create a hash from userId
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);

    // Calculate cumulative allocation percentages
    let cumulative = 0;
    const random = (hashInt % 100) / 100; // Convert to 0-1 range

    for (const variant of variants) {
      cumulative += variant.allocation / 100;
      if (random < cumulative) {
        return variant;
      }
    }

    // Fallback to last variant
    return variants[variants.length - 1];
  }

  /**
   * Validate test configuration
   *
   * @param {Object} testConfig - Test configuration
   * @returns {Object} Validation result
   */
  validateTest(testConfig) {
    const errors = [];

    // Check test name
    if (!testConfig.name || testConfig.name.trim().length === 0) {
      errors.push('Test name is required');
    }

    // Check test type
    const validTypes = ['price', 'content', 'shipping', 'offer', 'theme'];
    if (!validTypes.includes(testConfig.type)) {
      errors.push(`Test type must be one of: ${validTypes.join(', ')}`);
    }

    // Check variants
    if (!testConfig.variants || testConfig.variants.length < 2) {
      errors.push('At least 2 variants are required');
    }

    // Check allocation percentages
    if (testConfig.variants) {
      const totalAllocation = testConfig.variants.reduce(
        (sum, v) => sum + (v.allocation || 0),
        0
      );

      if (Math.abs(totalAllocation - 100) > 0.01) {
        errors.push('Variant allocations must sum to 100%');
      }

      // Check each variant has required fields
      testConfig.variants.forEach((variant, index) => {
        if (!variant.name) {
          errors.push(`Variant ${index + 1} must have a name`);
        }
        // Config is optional, but ensure it exists (can be empty object)
        if (variant.config === undefined) {
          variant.config = {};
        }
      });
    }

    // Check goal configuration
    if (!testConfig.goal || !testConfig.goal.type) {
      errors.push('Test goal is required');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if test has reached statistical significance
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} Significance result
   */
  async checkStatisticalSignificance(testId, shopDomain) {
    // Get analytics and calculate significance
    const analyticsService = require('./analytics');
    const analytics = await analyticsService.getTestAnalytics(testId, shopDomain);
    return analytics.significance || {
      significant: false,
      pValue: 1,
      confidence: 0,
      message: 'Insufficient data'
    };
  }

  /**
   * Start a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} Updated test
   */
  async startTest(testId, shopDomain) {
    const { updateTestStatus } = require('../models/test');
    return updateTestStatus(testId, shopDomain, 'running');
  }

  /**
   * Stop a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} Updated test
   */
  async stopTest(testId, shopDomain) {
    const { updateTestStatus } = require('../models/test');
    return updateTestStatus(testId, shopDomain, 'stopped');
  }
}

module.exports = new ABTestEngine();

