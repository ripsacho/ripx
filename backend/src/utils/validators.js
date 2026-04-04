/**
 * Validation Utilities
 *
 * Common validation functions for the application
 */

const { MAX_TEST_NAME_LENGTH } = require('../constants');

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
   * Validate standalone website domain (e.g. example.com, www.example.com).
   * Hostname rules: labels 1–63 chars, [a-z0-9] and hyphen, no leading/trailing hyphen per label, TLD 2+ letters.
   *
   * @param {string} domain - Domain to validate
   * @returns {boolean} Is valid
   */
  isValidDomain(domain) {
    const result = this.validateDomainForInput(domain);
    return result.valid;
  }

  /**
   * Validate domain and return normalized value and user-facing error message.
   *
   * @param {string} domain - Raw domain input
   * @returns {{ valid: boolean, normalized?: string, error?: string }}
   */
  validateDomainForInput(domain) {
    if (!domain || typeof domain !== 'string') {
      return { valid: false, error: 'Domain is required' };
    }
    const trimmed = domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .replace(/\s/g, '');
    if (!trimmed) {
      return { valid: false, error: 'Enter a valid domain (e.g. example.com or www.example.com)' };
    }
    if (trimmed.length > 253) {
      return { valid: false, error: 'Domain is too long' };
    }
    // Must have at least one dot and a TLD of 2+ letters
    if (!/\./.test(trimmed)) {
      return { valid: false, error: 'Domain must include a TLD (e.g. example.com)' };
    }
    const labels = trimmed.split('.');
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label.length === 0) {
        return { valid: false, error: 'Domain cannot have empty parts' };
      }
      if (label.length > 63) {
        return { valid: false, error: 'Domain part is too long' };
      }
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label) && label.length !== 1) {
        return {
          valid: false,
          error:
            'Domain can only contain letters, numbers, and hyphens; hyphens cannot start or end a part',
        };
      }
      if (label.length === 1 && !/^[a-z0-9]$/.test(label)) {
        return { valid: false, error: 'Invalid domain format' };
      }
    }
    const tld = labels[labels.length - 1];
    if (!/^[a-z]{2,}$/.test(tld)) {
      return { valid: false, error: 'Domain must end with a valid TLD (e.g. .com, .io)' };
    }
    if (trimmed === 'localhost' || trimmed.endsWith('.localhost')) {
      return { valid: false, error: 'Use your real domain (e.g. example.com), not localhost' };
    }
    if (trimmed.endsWith('.local')) {
      return {
        valid: false,
        error: 'Use your public domain (e.g. example.com), not .local addresses',
      };
    }
    return { valid: true, normalized: trimmed };
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
    const normalizePriceApplicationMethod = value => {
      const raw = String(value || '')
        .trim()
        .toLowerCase();
      if (raw === 'discounted_checkout_price') {
        return 'discounted_checkout_price';
      }
      if (raw === 'native_variant_price') {
        return 'native_variant_price';
      }
      if (raw === 'direct_price_override') {
        return 'direct_price_override';
      }
      return 'auto';
    };
    const hasNativeVariantMapping = cfg =>
      !!(
        cfg &&
        cfg.nativeVariantId !== null &&
        cfg.nativeVariantId !== undefined &&
        String(cfg.nativeVariantId).trim() !== ''
      );
    const priceConfigImpliesIncrease = cfg => {
      if (!cfg || typeof cfg !== 'object') {
        return false;
      }
      const mode = String(cfg.priceMode || 'fixed').toLowerCase();
      if (mode === 'amount') {
        const n = Number(cfg.priceDelta);
        return !Number.isNaN(n) && n > 0;
      }
      if (mode === 'percent') {
        const n = Number(cfg.pricePercent);
        return !Number.isNaN(n) && n < 0;
      }
      return false;
    };
    if (!config.name || config.name.trim().length === 0) {
      errors.push('Test name is required');
    }

    if (config.name && config.name.length > MAX_TEST_NAME_LENGTH) {
      errors.push(`Test name must be at most ${MAX_TEST_NAME_LENGTH} characters`);
    }

    // Align with abTestEngine and constants: accept all types used by frontend and API
    const validTypes = [
      'price',
      'pricing',
      'content',
      'shipping',
      'offer',
      'theme',
      'checkout',
      'combination',
      'template',
      'split-url',
      'onsite-edit',
    ];
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

      // Price test: at least one non-control variant must have a price/discount configured
      const isPriceType =
        (config.type || '').toLowerCase() === 'price' ||
        (config.type || '').toLowerCase() === 'pricing';
      if (isPriceType && config.variants.length > 1) {
        let hasNonControlWithPrice = false;
        config.variants.forEach((v, i) => {
          const cfg = v?.config || {};
          const mode = (cfg.priceMode || 'fixed').toLowerCase();
          const applicationMethod = normalizePriceApplicationMethod(cfg.priceApplicationMethod);
          const isControl =
            i === 0 ||
            (mode === 'fixed' &&
              (cfg.price === null || cfg.price === undefined || String(cfg.price).trim() === ''));
          const hasPrice =
            (mode === 'fixed' &&
              cfg.price !== null &&
              cfg.price !== undefined &&
              String(cfg.price).trim() !== '') ||
            (mode === 'amount' &&
              cfg.priceDelta !== null &&
              cfg.priceDelta !== undefined &&
              String(cfg.priceDelta).trim() !== '') ||
            (mode === 'percent' &&
              cfg.pricePercent !== null &&
              cfg.pricePercent !== undefined &&
              String(cfg.pricePercent).trim() !== '');
          if (!isControl && hasPrice) {
            hasNonControlWithPrice = true;
          }
          if (applicationMethod === 'native_variant_price' && !hasNativeVariantMapping(cfg)) {
            errors.push(
              `Variant ${i + 1}: Native Variant Price requires a mapped Shopify variant ID.`
            );
          }
          if (
            applicationMethod === 'discounted_checkout_price' &&
            priceConfigImpliesIncrease(cfg)
          ) {
            errors.push(
              `Variant ${i + 1}: Discounted Checkout Price only supports lower prices. Use Auto or Native Variant Price for price increases.`
            );
          }
        });
        if (!hasNonControlWithPrice) {
          errors.push(
            'Price test: at least one test variant (non-control) must have a price or discount configured.'
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

module.exports = new Validators();
