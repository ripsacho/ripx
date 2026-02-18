/**
 * Validation Utilities
 *
 * Common validation functions for the application
 */

class Validators {
  /**
   * Validate email address
   *
   * @param {string} email - Email to validate
   * @returns {boolean} Is valid
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL
   *
   * @param {string} url - URL to validate
   * @returns {boolean} Is valid
   */
  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate standalone website domain (e.g. example.com, www.example.com)
   *
   * @param {string} domain - Domain to validate
   * @returns {boolean} Is valid
   */
  isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') {
      return false;
    }
    const trimmed = domain.trim().replace(/^https?:\/\//, '').split('/')[0];
    if (!trimmed || trimmed.length > 253) {
      return false;
    }
    return /^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(trimmed);
  }

  /**
   * Validate Shopify shop domain
   *
   * @param {string} shopDomain - Shop domain
   * @returns {boolean} Is valid
   */
  isValidShopDomain(shopDomain) {
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    return shopRegex.test(shopDomain);
  }

  /**
   * Validate price
   *
   * @param {number} price - Price to validate
   * @returns {boolean} Is valid
   */
  isValidPrice(price) {
    return typeof price === 'number' && price >= 0 && isFinite(price);
  }

  /**
   * Validate percentage
   *
   * @param {number} percentage - Percentage to validate
   * @returns {boolean} Is valid
   */
  isValidPercentage(percentage) {
    const n = Number(percentage);
    return Number.isFinite(n) && n >= 0 && n <= 100;
  }

  /**
   * Validate UUID
   *
   * @param {string} uuid - UUID to validate
   * @returns {boolean} Is valid
   */
  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Sanitize string input
   *
   * @param {string} input - Input to sanitize
   * @returns {string} Sanitized string
   */
  sanitizeString(input) {
    if (typeof input !== 'string') {
      return '';
    }
    return input.trim().replace(/[<>]/g, '');
  }

  /**
   * Validate test configuration
   *
   * @param {Object} config - Test configuration
   * @returns {Object} Validation result
   */
  validateTestConfig(config) {
    const errors = [];

    if (!config.name || config.name.trim().length === 0) {
      errors.push('Test name is required');
    }

    if (config.name && config.name.length > 255) {
      errors.push('Test name must be less than 255 characters');
    }

    const validTypes = ['price', 'content', 'shipping', 'offer', 'theme', 'combination'];
    if (!validTypes.includes(config.type)) {
      errors.push(`Test type must be one of: ${validTypes.join(', ')}`);
    }

    if (!config.variants || !Array.isArray(config.variants) || config.variants.length < 2) {
      errors.push('At least 2 variants are required');
    }

    if (config.variants) {
      const totalAllocation = config.variants.reduce(
        (sum, v) => sum + (Number(v.allocation) || 0),
        0
      );
      if (Math.abs(totalAllocation - 100) > 0.01) {
        errors.push('Variant allocations must sum to 100%');
      }

      config.variants.forEach((variant, index) => {
        if (!variant.name || String(variant.name).trim().length === 0) {
          errors.push(`Variant ${index + 1} must have a name`);
        }
        if (!this.isValidPercentage(variant.allocation)) {
          errors.push(`Variant ${index + 1} allocation must be between 0-100%`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new Validators();
