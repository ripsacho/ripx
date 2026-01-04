/**
 * Traffic Allocator
 *
 * Handles visitor distribution across test variants.
 * Uses consistent hashing to ensure users see the same variant.
 */

const crypto = require('crypto');

class TrafficAllocator {
  /**
   * Generate a consistent user ID from various identifiers
   *
   * @param {Object} identifiers - User identifiers
   * @returns {string} Consistent user ID
   */
  generateUserId(identifiers) {
    // Priority: cookie > session > IP + User-Agent
    if (identifiers.cookie) {
      return identifiers.cookie;
    }

    if (identifiers.session) {
      return identifiers.session;
    }

    // Fallback: hash IP + User-Agent
    const combined = `${identifiers.ip || ''}_${identifiers.userAgent || ''}`;
    return crypto.createHash('md5').update(combined).digest('hex');
  }

  /**
   * Allocate traffic to variants based on percentages
   *
   * @param {Array} variants - Array of variants with allocation percentages
   * @param {string} userId - User identifier
   * @returns {Object} Selected variant
   */
  allocate(variants, userId) {
    if (!variants || variants.length === 0) {
      throw new Error('No variants provided');
    }

    // Validate allocations sum to 100
    const totalAllocation = variants.reduce(
      (sum, v) => sum + (v.allocation || 0),
      0
    );

    if (Math.abs(totalAllocation - 100) > 0.01) {
      throw new Error('Variant allocations must sum to 100%');
    }

    // Use consistent hashing
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const random = (hashInt % 10000) / 10000; // 0-1 range with more precision

    // Calculate cumulative allocation
    let cumulative = 0;
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
   * Validate traffic allocation configuration
   *
   * @param {Array} variants - Variants with allocations
   * @returns {Object} Validation result
   */
  validateAllocation(variants) {
    const errors = [];

    if (!variants || variants.length < 2) {
      errors.push('At least 2 variants required');
      return { isValid: false, errors };
    }

    const totalAllocation = variants.reduce(
      (sum, v) => sum + (v.allocation || 0),
      0
    );

    if (Math.abs(totalAllocation - 100) > 0.01) {
      errors.push(`Allocations sum to ${totalAllocation}%, must be 100%`);
    }

    variants.forEach((variant, index) => {
      if (variant.allocation < 0 || variant.allocation > 100) {
        errors.push(`Variant ${index + 1} allocation must be between 0-100%`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Get recommended allocation for number of variants
   *
   * @param {number} variantCount - Number of variants
   * @returns {Array} Recommended allocations
   */
  getRecommendedAllocation(variantCount) {
    if (variantCount < 2) {
      return [100];
    }

    const allocation = 100 / variantCount;
    return Array(variantCount).fill(allocation);
  }
}

module.exports = new TrafficAllocator();

